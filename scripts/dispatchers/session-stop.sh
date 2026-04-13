#!/bin/bash
# session-stop.sh - Dispatcher for Stop event
#
# Three-tier knowledge assessment on session stop:
#   Level A: Deterministic — changed files match .clear/knowledge/** or
#            plans/**/workpackages/** → reverse index lookup → blocking context
#   Level B: Heuristic — changed files match change-patterns.yaml rules →
#            Node.js CLI evaluation → blocking context with evaluate prompt
#   Level C: Default — no match → silent exit (no Node.js spawn)
#
# Input: JSON via stdin
# Output: JSON with stopReason (or {})

export SCRIPT_NAME="session-stop"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

# --- Shared helper: look up linked knowledge entries from reverse index ---
# Args: $1 = index file path, $2 = JSON array of file paths
# Output: comma-separated entry IDs (stdout), empty if none found
lookup_linked_entries() {
  local index_file="$1"
  local files_json="$2"
  [ ! -f "$index_file" ] && return
  echo "$files_json" | jq -r '.[]' | while read -r fpath; do
    # Exact match
    jq -r --arg fp "$fpath" '(.index[$fp] // [])[]' "$index_file" 2>/dev/null || true
    # Directory prefix match
    jq -r --arg fp "$fpath" '
      .index | to_entries | map(select(.key | endswith("/"))) |
      map(select(.key as $k | $fp | startswith($k))) | [.[].value[]] | .[]
    ' "$index_file" 2>/dev/null || true
  done | sort -u | paste -sd ", " -
}

# Read input
INPUT=$(cat)

# Redirect logs to project directory
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
use_project_logs "$CWD"

# --- Kill switches (global + per-hook) ---
if [ "${CLEAR_HOOKS_ENABLED:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi
if [ "${CLEAR_STOP_ENABLED:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi

# --- Stop guard: if SessionEnd is active, exit immediately ---
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  echo '{}'
  exit 0
fi

# --- Read accumulator ---
CLEAR_DIR="${CWD}/.clear"
STATE_DIR="${CLEAR_DIR}/state"
ACCUMULATOR="${STATE_DIR}/changed-files.json"

# Level C fast exit: no accumulator or empty files array
if [ ! -f "$ACCUMULATOR" ]; then
  echo '{}'
  exit 0
fi

# Validate accumulator JSON; if malformed, clean up and exit Level C
if ! jq -e '.' "$ACCUMULATOR" >/dev/null 2>&1; then
  rm -f "$ACCUMULATOR"
  echo '{}'
  exit 0
fi

FILE_COUNT=$(jq -r '.files | length' "$ACCUMULATOR" 2>/dev/null || echo "0")
if [ "$FILE_COUNT" = "0" ]; then
  rm -f "$ACCUMULATOR"
  echo '{}'
  exit 0
fi

# Extract file paths from accumulator
CHANGED_FILES=$(jq -r '[.files[].path]' "$ACCUMULATOR" 2>/dev/null)

# --- Filter exclusions before assessment ---
FILTERED_FILES=$(echo "$CHANGED_FILES" | jq '[.[] | select(
  (startswith(".clear/state/") | not) and
  (startswith(".clear/audit/") | not) and
  (startswith("logs/") | not) and
  (startswith("tmp/") | not) and
  (startswith("sessions/") | not) and
  (startswith("node_modules/") | not) and
  (startswith(".claude/") | not) and
  (startswith(".git/") | not) and
  (startswith("build/") | not)
)]')

FILTERED_COUNT=$(echo "$FILTERED_FILES" | jq 'length')
if [ "$FILTERED_COUNT" = "0" ]; then
  # All files excluded — Level C, clear accumulator
  jq -n '{version: "1.0", files: []}' > "$ACCUMULATOR"
  echo '{}'
  exit 0
fi

# --- Level A: Deterministic path matching ---
# Check for .clear/knowledge/** or plans/**/workpackages/** paths
LEVEL_A_FILES=$(echo "$FILTERED_FILES" | jq '[.[] | select(
  startswith(".clear/knowledge/") or
  (startswith("plans/") and contains("/workpackages/"))
)]')

LEVEL_A_COUNT=$(echo "$LEVEL_A_FILES" | jq 'length')

# --- Sync-bridge: persist sync-state before assessment clears accumulator ---
SYNC_BRIDGE="${SCRIPTS_DIR}/sync/sync-bridge.sh"
if [ -x "$SYNC_BRIDGE" ]; then
  "$SYNC_BRIDGE" --op=persist --clear-dir="$CWD" >/dev/null 2>>"$HOOK_ERROR_LOG" || true
fi

if [ "$LEVEL_A_COUNT" -gt 0 ]; then
  # Level A match — look up reverse index for ALL filtered files (Critic M2)
  INDEX_FILE="${STATE_DIR}/file-knowledge-index.json"
  LINKED_ENTRIES=$(lookup_linked_entries "$INDEX_FILE" "$FILTERED_FILES")

  # Build file list from ALL filtered files
  FILE_LIST=$(echo "$FILTERED_FILES" | jq -r '.[] | "- " + .')

  # Build linked entries section
  if [ -n "$LINKED_ENTRIES" ]; then
    ENTRIES_SECTION="Linked knowledge entries: ${LINKED_ENTRIES}"
  else
    ENTRIES_SECTION="No existing knowledge entries are linked to these files."
  fi

  # Compose blocking stopReason with actual newlines (Critic M1)
  CONTEXT="[CLEAR-STOP] Level A: CLEAR-managed files changed.

Changed files:
${FILE_LIST}

${ENTRIES_SECTION}

ACTION REQUIRED: Before ending this session, run /cf-knowledge capture to persist any knowledge learned during implementation. Include the files listed above as context."

  # Clear accumulator (checkpoint)
  jq -n '{version: "1.0", files: []}' > "$ACCUMULATOR"

  jq -n --arg ctx "$CONTEXT" '{
    "stopReason": $ctx
  }'
  exit 0
fi

# --- Level B: Heuristic pattern matching (Node.js CLI) ---
# Only runs when Level A did not match and there are non-excluded changed files
PATTERNS_FILE="${PLUGIN_ROOT}/src/infrastructure/knowledge/config/knowledge-change-patterns.yaml"
CLI_TOOL=$(resolve_cli "knowledge/cli/change-pattern-cli") || true

if [ -n "$CLI_TOOL" ] && [ -f "$PATTERNS_FILE" ]; then
  # Convert filtered files to JSON string for CLI arg
  FILES_JSON=$(echo "$FILTERED_FILES" | jq -c '.')

  # Run pattern CLI
  if [[ "$CLI_TOOL" == *.js ]]; then
    CLI_RESULT=$(node "$CLI_TOOL" --patterns-file="$PATTERNS_FILE" --changed-files="$FILES_JSON" 2>>"$HOOK_ERROR_LOG") || true
  else
    CLI_RESULT=$(npx ts-node "$CLI_TOOL" --patterns-file="$PATTERNS_FILE" --changed-files="$FILES_JSON" 2>>"$HOOK_ERROR_LOG") || true
  fi

  # Parse CLI result
  if [ -n "$CLI_RESULT" ] && echo "$CLI_RESULT" | jq -e '.matched == true' >/dev/null 2>&1; then
    PATTERN_ID=$(echo "$CLI_RESULT" | jq -r '.pattern_id')
    PATTERN_MSG=$(echo "$CLI_RESULT" | jq -r '.message')

    # Level B also looks up reverse index for linked entries
    INDEX_FILE="${STATE_DIR}/file-knowledge-index.json"
    LINKED_ENTRIES=$(lookup_linked_entries "$INDEX_FILE" "$FILTERED_FILES")

    # Build file list from ALL filtered files
    FILE_LIST=$(echo "$FILTERED_FILES" | jq -r '.[] | "- " + .')

    # Build linked entries section
    if [ -n "$LINKED_ENTRIES" ]; then
      ENTRIES_SECTION="Linked knowledge entries: ${LINKED_ENTRIES}"
    else
      ENTRIES_SECTION="No existing knowledge entries are linked to these files."
    fi

    # Compose blocking stopReason with actual newlines (Critic M1)
    CONTEXT="[CLEAR-STOP] Level B: Change pattern '${PATTERN_ID}' detected. ${PATTERN_MSG}

Changed files:
${FILE_LIST}

${ENTRIES_SECTION}

ACTION REQUIRED: Before ending this session, run /cf-knowledge capture to persist any knowledge learned during implementation. Include the files listed above as context."

    # Clear accumulator (checkpoint)
    jq -n '{version: "1.0", files: []}' > "$ACCUMULATOR"

    jq -n --arg ctx "$CONTEXT" '{
      "stopReason": $ctx
    }'
    exit 0
  fi
fi

# --- Level C: No patterns matched — silent exit ---
# Clear accumulator (checkpoint) even on Level C
jq -n '{version: "1.0", files: []}' > "$ACCUMULATOR"
echo '{}'
exit 0
