#!/bin/bash
# pre-tool.sh - Dispatcher for PreToolUse event
#
# Fires before every Read/Write/Edit/Glob/Grep operation.
# Looks up the target file in the reverse knowledge index and injects
# relevant knowledge entry context via hookSpecificOutput.additionalContext.
#
# Read-only dispatcher — no file writes, no subprocess calls (pure jq).
# Designed for <10ms on the common (no-match) path.
#
# Input: JSON via stdin (tool_name, tool_input, cwd)
# Output: JSON with hookSpecificOutput.additionalContext (or {})
#
# Exits 0 for normal paths. Exit 2 for corrupt index (blocks tool until fixed).
# Corrupt index is extremely rare (system crash, user error) — blocking is appropriate.

export SCRIPT_NAME="pre-tool"
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
if [ "${CLEAR_PRETOOL_ENABLED:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi

# --- Per-tool file path extraction ---
# Read/Write/Edit: tool_input.file_path (always present)
# Glob/Grep: tool_input.path (optional — may be absent)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

case "$TOOL_NAME" in
  Read|Write|Edit)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
    ;;
  Glob|Grep)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // ""')
    ;;
  *)
    # Unknown tool — no meaningful file path to look up
    echo '{}'
    exit 0
    ;;
esac

# Empty file path — no meaningful lookup (Glob/Grep without path)
if [ -z "$FILE_PATH" ]; then
  echo '{}'
  exit 0
fi

# --- Normalize to relative path ---
REL_PATH="$FILE_PATH"
if [[ "$REL_PATH" == "$CWD/"* ]]; then
  REL_PATH="${REL_PATH#"$CWD/"}"
fi

# --- .clear/ write guard (POST-19) ---
# Block ALL Write/Edit on .clear/ paths. Legitimate mutations go through CLIs
# (fs.writeFileSync, invisible to PreToolUse). No allowlist needed.
case "$TOOL_NAME" in
  Write|Edit)
    case "$REL_PATH" in
      .clear/*)
        echo "[CLEAR] Direct edits to .clear/ files are not allowed. Use CLEAR skills (/cf-workpackage, /cf-plan, /cf-knowledge) which route through validated CLIs." >&2
        echo '{}'
        exit 2
        ;;
    esac
    ;;
esac

# --- Exclusion check (hardcoded for v1.0) ---
case "$REL_PATH" in
  .clear/state/*|.clear/audit/*|logs/*|tmp/*|sessions/*|node_modules/*|.claude/*|.git/*|build/*|docs/*|research/*|briefs/*)
    echo '{}'
    exit 0
    ;;
esac

# --- Reverse index lookup (jq only — no Node.js spawn) ---
CLEAR_DIR="${CWD}/.clear"
INDEX_FILE="${CLEAR_DIR}/state/file-knowledge-index.json"

if [ ! -f "$INDEX_FILE" ]; then
  echo '{}'
  exit 0
fi

# Validate index JSON — corrupt index blocks tool until rebuilt (exit 2)
if ! jq -e '.' "$INDEX_FILE" >/dev/null 2>&1; then
  echo '[CLEAR] Knowledge index is corrupt. Run: /cf-knowledge rebuild-index' >&2
  echo '{}'
  exit 2
fi

# Exact match first
EXACT_ENTRIES=$(jq -r --arg fp "$REL_PATH" '
  (.index[$fp] // []) | if length > 0 then .[] else empty end
' "$INDEX_FILE" 2>/dev/null || true)

# Directory prefix match (only if no exact match)
PREFIX_ENTRIES=""
if [ -z "$EXACT_ENTRIES" ]; then
  PREFIX_ENTRIES=$(jq -r --arg fp "$REL_PATH" '
    .index | to_entries | map(select(.key | endswith("/"))) | map(select(.key as $k | $fp | startswith($k))) | [.[].value[]] | unique | if length > 0 then .[] else empty end
  ' "$INDEX_FILE" 2>/dev/null || true)
fi

# Combine: exact first, then prefix (preserving order for truncation)
ALL_ENTRIES=""
if [ -n "$EXACT_ENTRIES" ] && [ -n "$PREFIX_ENTRIES" ]; then
  ALL_ENTRIES=$(printf '%s\n%s' "$EXACT_ENTRIES" "$PREFIX_ENTRIES" | sort -u)
elif [ -n "$EXACT_ENTRIES" ]; then
  ALL_ENTRIES="$EXACT_ENTRIES"
elif [ -n "$PREFIX_ENTRIES" ]; then
  ALL_ENTRIES="$PREFIX_ENTRIES"
fi

# No entries found
if [ -z "$ALL_ENTRIES" ]; then
  echo '{}'
  exit 0
fi

# --- Format output with token budget (~200 tokens) ---
TOTAL_COUNT=$(echo "$ALL_ENTRIES" | wc -l)
MAX_DISPLAY=5

if [ "$TOTAL_COUNT" -le "$MAX_DISPLAY" ]; then
  ENTRY_LIST=$(echo "$ALL_ENTRIES" | paste -sd ", " -)
  CONTEXT="[CLEAR] File '${REL_PATH}' is linked to knowledge entries: ${ENTRY_LIST}. Review these for context before proceeding."
else
  # Truncate to top 5
  DISPLAYED=$(echo "$ALL_ENTRIES" | head -n "$MAX_DISPLAY" | paste -sd ", " -)
  REMAINING=$((TOTAL_COUNT - MAX_DISPLAY))
  CONTEXT="[CLEAR] File '${REL_PATH}' is linked to knowledge entries: ${DISPLAYED}... and ${REMAINING} more. Review these for context before proceeding."
fi

jq -n --arg ctx "$CONTEXT" '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": $ctx
  }
}'
exit 0
