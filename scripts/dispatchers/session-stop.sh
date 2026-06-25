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
# Output: JSON with {decision: "block", reason: ...} (or {}) — Claude receives the reason
#         and continues the turn to act on it. stop_hook_active guard prevents recursion.

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
  done | sort -u | paste -sd "," - | sed 's/,/, /g'
}

# Read input
INPUT=$(cat)

# Redirect logs to project directory
CWD=$(canonicalize_cwd "$(echo "$INPUT" | jq -r '.cwd // "."')")

# WP-CI1: skip on uninitialized projects.
require_clear_initialized "$CWD" || { echo '{}'; exit 0; }

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

# --- Filter exclusions before assessment ---
# Retain full file objects (path + tool) so Level B can pass tool info to the CLI.
FILTERED_OBJS=$(jq '[.files[] | select(
  (.path | startswith(".clear/state/") | not) and
  (.path | startswith(".clear/audit/") | not) and
  (.path | startswith(".clear/sessions/") | not) and
  (.path | startswith("logs/") | not) and
  (.path | startswith("tmp/") | not) and
  (.path | startswith("sessions/") | not) and
  (.path | startswith("node_modules/") | not) and
  (.path | startswith(".claude/") | not) and
  (.path | startswith(".git/") | not) and
  (.path | startswith("build/") | not)
)]' "$ACCUMULATOR")

FILTERED_FILES=$(echo "$FILTERED_OBJS" | jq '[.[].path]')
FILTERED_TOOLS=$(echo "$FILTERED_OBJS" | jq -r '[.[].tool] | unique | join(",")')

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

  # Build file list from ALL filtered files (sanitized — file paths reach Claude)
  FILE_LIST=$(sanitize_for_context "$(echo "$FILTERED_FILES" | jq -r '.[] | "- " + .')")
  SAFE_LINKED=$(sanitize_for_context "$LINKED_ENTRIES")

  # Build linked entries section
  if [ -n "$SAFE_LINKED" ]; then
    ENTRIES_SECTION="Linked knowledge entries: ${SAFE_LINKED}"
  else
    ENTRIES_SECTION="No existing knowledge entries are linked to these files."
  fi

  # Compose blocking reason with actual newlines (Critic M1)
  CONTEXT="[CLEAR-STOP] Level A: CLEAR-managed files changed.

Changed files:
${FILE_LIST}

${ENTRIES_SECTION}

ACTION REQUIRED: Before ending this session, run /cf-knowledge capture to persist any knowledge learned during implementation. Include the files listed above as context."

  # Clear accumulator (checkpoint)
  jq -n '{version: "1.0", files: []}' > "$ACCUMULATOR"

  emit_blocking_decision "A" "$CONTEXT" "${FILTERED_COUNT} files, linked=${SAFE_LINKED:-none}"
  exit 0
fi

# --- Level B: Heuristic pattern matching (Node.js CLI) ---
# Only runs when Level A did not match and there are non-excluded changed files
PATTERNS_FILE="${PLUGIN_ROOT}/src/infrastructure/knowledge/config/knowledge-change-patterns.yaml"
CLI_TOOL=$(resolve_cli "knowledge/cli/change-pattern-cli") || true

if [ -n "$CLI_TOOL" ] && [ -f "$PATTERNS_FILE" ]; then
  # Convert filtered files to JSON string for CLI arg
  FILES_JSON=$(echo "$FILTERED_FILES" | jq -c '.')

  # Run pattern CLI — forward tools so pattern-level tool_filter constraints are honored
  if [[ "$CLI_TOOL" == *.js ]]; then
    CLI_RESULT=$(node "$CLI_TOOL" --patterns-file="$PATTERNS_FILE" --changed-files="$FILES_JSON" --tool-filter="$FILTERED_TOOLS" 2>>"$HOOK_ERROR_LOG") || true
  else
    CLI_RESULT=$(npx ts-node "$CLI_TOOL" --patterns-file="$PATTERNS_FILE" --changed-files="$FILES_JSON" --tool-filter="$FILTERED_TOOLS" 2>>"$HOOK_ERROR_LOG") || true
  fi

  # Parse CLI result
  if [ -n "$CLI_RESULT" ] && echo "$CLI_RESULT" | jq -e '.matched == true' >/dev/null 2>&1; then
    PATTERN_ID=$(echo "$CLI_RESULT" | jq -r '.pattern_id')
    PATTERN_MSG=$(echo "$CLI_RESULT" | jq -r '.message')

    # Level B also looks up reverse index for linked entries
    INDEX_FILE="${STATE_DIR}/file-knowledge-index.json"
    LINKED_ENTRIES=$(lookup_linked_entries "$INDEX_FILE" "$FILTERED_FILES")

    # Build file list from ALL filtered files (sanitized — file paths + pattern msg reach Claude)
    FILE_LIST=$(sanitize_for_context "$(echo "$FILTERED_FILES" | jq -r '.[] | "- " + .')")
    SAFE_LINKED=$(sanitize_for_context "$LINKED_ENTRIES")
    SAFE_PATTERN_ID=$(sanitize_for_context "$PATTERN_ID")
    SAFE_PATTERN_MSG=$(sanitize_for_context "$PATTERN_MSG")

    # Build linked entries section
    if [ -n "$SAFE_LINKED" ]; then
      ENTRIES_SECTION="Linked knowledge entries: ${SAFE_LINKED}"
    else
      ENTRIES_SECTION="No existing knowledge entries are linked to these files."
    fi

    # Compose blocking reason with actual newlines (Critic M1)
    CONTEXT="[CLEAR-STOP] Level B: Change pattern '${SAFE_PATTERN_ID}' detected. ${SAFE_PATTERN_MSG}

Changed files:
${FILE_LIST}

${ENTRIES_SECTION}

ACTION REQUIRED: Before ending this session, run /cf-knowledge capture to persist any knowledge learned during implementation. Include the files listed above as context."

    # Clear accumulator (checkpoint)
    jq -n '{version: "1.0", files: []}' > "$ACCUMULATOR"

    emit_blocking_decision "B" "$CONTEXT" "pattern=${SAFE_PATTERN_ID}, ${FILTERED_COUNT} files, linked=${SAFE_LINKED:-none}"
    exit 0
  fi
fi

# --- Level C: Threshold-based capture prompt ---
# Files accumulate across turns. When threshold is met, prompt for knowledge capture.
# Accumulator is NOT cleared below threshold (persists for next turn).
LEVEL_C_THRESHOLD=3

if [ "$FILTERED_COUNT" -ge "$LEVEL_C_THRESHOLD" ]; then
  # Threshold met — fire assessment prompt
  INDEX_FILE="${STATE_DIR}/file-knowledge-index.json"
  LINKED_ENTRIES=$(lookup_linked_entries "$INDEX_FILE" "$FILTERED_FILES")

  FILE_LIST=$(sanitize_for_context "$(echo "$FILTERED_FILES" | jq -r '.[] | "- " + .')")
  SAFE_LINKED=$(sanitize_for_context "$LINKED_ENTRIES")

  if [ -n "$SAFE_LINKED" ]; then
    ENTRIES_SECTION="Linked knowledge entries: ${SAFE_LINKED}"
  else
    ENTRIES_SECTION="No existing knowledge entries are linked to these files."
  fi

  CONTEXT="[CLEAR-STOP] Level C: Significant session work detected (${FILTERED_COUNT} files changed).

Changed files:
${FILE_LIST}

${ENTRIES_SECTION}

SUGGESTED: Review whether any technical decisions, architectural patterns, or lessons learned from this work should be captured as knowledge entries. Use /cf-knowledge capture if applicable."

  # Clear accumulator only when prompt fires
  jq -n '{version: "1.0", files: []}' > "$ACCUMULATOR"

  emit_blocking_decision "C" "$CONTEXT" "${FILTERED_COUNT} files, linked=${SAFE_LINKED:-none}"
  exit 0
fi

# Below threshold — keep accumulator for next turn
echo '{}'
exit 0
