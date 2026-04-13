#!/bin/bash
# post-tool.sh - Dispatcher for PostToolUse event
#
# Fires after every Write/Edit operation. Responsibilities:
# 1. Append file to changed-files accumulator (with dedup)
# 2. Call workpackage-progress.sh with transformed input
# 3. Look up file in reverse knowledge index
# 4. Return hookSpecificOutput.additionalContext if entries found
#
# Input: JSON via stdin (tool_name, tool_input, tool_response, cwd)
# Output: JSON with hookSpecificOutput.additionalContext (or {})
#
# Exits 0 for normal paths. Exit 2 for corrupt index (informational — tool already ran).
# PostToolUse exit 2 surfaces stderr to Claude but does NOT undo the Write/Edit.

export SCRIPT_NAME="post-tool"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

# Read input once
INPUT=$(cat)

# Extract CWD early for logging
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
use_project_logs "$CWD"

# --- Kill switches (global + per-hook) ---
if [ "${CLEAR_HOOKS_ENABLED:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi
if [ "${CLEAR_POSTTOOL_ENABLED:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi

# --- Check tool_response.success (Architect gap fix) ---
SUCCESS=$(echo "$INPUT" | jq -r 'if .tool_response.success == false then "false" else "true" end')
if [ "$SUCCESS" = "false" ]; then
  echo '{}'
  exit 0
fi

# --- Extract file path from tool_input ---
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
if [ -z "$FILE_PATH" ]; then
  echo '{}'
  exit 0
fi

# --- Exclusion check (hardcoded for v1.0, configurable post-v1.0) ---
# Normalize: strip CWD prefix if present to get relative path
REL_PATH="$FILE_PATH"
if [[ "$REL_PATH" == "$CWD/"* ]]; then
  REL_PATH="${REL_PATH#"$CWD/"}"
fi

case "$REL_PATH" in
  .clear/state/*|.clear/audit/*|logs/*|tmp/*|sessions/*|node_modules/*|.claude/*|.git/*|build/*|docs/*|research/*|briefs/*)
    echo '{}'
    exit 0
    ;;
esac

# --- State directory check ---
CLEAR_DIR="${CWD}/.clear"
STATE_DIR="${CLEAR_DIR}/state"
if [ ! -d "$CLEAR_DIR" ]; then
  echo '{}'
  exit 0
fi
mkdir -p "$STATE_DIR"

# --- Accumulator: append with dedup ---
ACCUMULATOR="${STATE_DIR}/changed-files.json"
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TIMESTAMP=$(date -Iseconds)

if [ -f "$ACCUMULATOR" ]; then
  # Validate existing JSON; recover if malformed
  if ! jq -e '.' "$ACCUMULATOR" >/dev/null 2>&1; then
    rm -f "$ACCUMULATOR"
  fi
fi

if [ ! -f "$ACCUMULATOR" ]; then
  # Create new accumulator
  jq -n --arg p "$REL_PATH" --arg t "$TOOL_NAME" --arg ts "$TIMESTAMP" \
    '{version: "1.0", files: [{path: $p, tool: $t, time: $ts}]}' > "$ACCUMULATOR"
else
  # Dedup: only append if path not already present
  EXISTING=$(jq -r --arg p "$REL_PATH" '.files[] | select(.path == $p) | .path' "$ACCUMULATOR" 2>/dev/null)
  if [ -z "$EXISTING" ]; then
    jq --arg p "$REL_PATH" --arg t "$TOOL_NAME" --arg ts "$TIMESTAMP" \
      '.files += [{path: $p, tool: $t, time: $ts}]' "$ACCUMULATOR" > "${ACCUMULATOR}.tmp" \
      && mv "${ACCUMULATOR}.tmp" "$ACCUMULATOR"
  fi
fi

# --- Call workpackage-progress.sh (transform input: add .file field) ---
WP_SCRIPT="${SCRIPTS_DIR}/workpackage/workpackage-progress.sh"
if [ -x "$WP_SCRIPT" ]; then
  WP_INPUT=$(echo "$INPUT" | jq --arg fp "$REL_PATH" '. + {file: $fp}')
  WP_OUTPUT=$(echo "$WP_INPUT" | "$WP_SCRIPT" 2>>"$HOOK_ERROR_LOG") || true

  # --- Sync-bridge: update workpackage summary in sync-state ---
  SYNC_BRIDGE="${SCRIPTS_DIR}/sync/sync-bridge.sh"
  if [ -x "$SYNC_BRIDGE" ] && [ -n "$WP_OUTPUT" ]; then
    WP_DATA=$(echo "$WP_OUTPUT" | jq -c '{displayId: .displayId, title: .title, progress: .progress}' 2>/dev/null) || true
    if [ -n "$WP_DATA" ] && [ "$WP_DATA" != "null" ]; then
      "$SYNC_BRIDGE" --op=update-workpackage --clear-dir="$CWD" --data="$WP_DATA" >/dev/null 2>>"$HOOK_ERROR_LOG" || true
    fi
  fi
fi

# --- Reverse index lookup for impact warning ---
INDEX_FILE="${STATE_DIR}/file-knowledge-index.json"
if [ -f "$INDEX_FILE" ]; then
  # Validate index JSON — corrupt index surfaces remediation via exit 2
  # PostToolUse exit 2 is informational (tool already ran, stderr shown to Claude)
  if ! jq -e '.' "$INDEX_FILE" >/dev/null 2>&1; then
    echo '[CLEAR] Knowledge index is corrupt. Run: /cf-knowledge rebuild-index' >&2
    echo '{}'
    exit 2
  fi

  # Look up exact match first
  ENTRIES=$(jq -r --arg fp "$REL_PATH" '
    (.index[$fp] // []) | if length > 0 then .[] else empty end
  ' "$INDEX_FILE" 2>/dev/null || true)

  # If no exact match, try directory prefix
  if [ -z "$ENTRIES" ]; then
    ENTRIES=$(jq -r --arg fp "$REL_PATH" '
      .index | to_entries | map(select(.key | endswith("/"))) | map(select(.key as $k | $fp | startswith($k))) | [.[].value[]] | unique | if length > 0 then .[] else empty end
    ' "$INDEX_FILE" 2>/dev/null || true)
  fi

  if [ -n "$ENTRIES" ]; then
    # Format entry IDs into a comma-separated list
    ENTRY_LIST=$(echo "$ENTRIES" | jq -Rs 'split("\n") | map(select(length > 0)) | join(", ")')

    jq -n --arg ctx "[CLEAR] File '$REL_PATH' is linked to knowledge entries: ${ENTRY_LIST}. These entries may need review after this change." \
      '{
        "hookSpecificOutput": {
          "hookEventName": "PostToolUse",
          "additionalContext": $ctx
        }
      }'
    exit 0
  fi
fi

# No impact found
echo '{}'
exit 0
