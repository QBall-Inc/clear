#!/bin/bash
# knowledge-load.sh - Load relevant knowledge entries at session start
#
# Triggered by: SessionStart hook (via session-start dispatcher)
# Input: JSON via stdin with cwd, optional level, context tags
# Output: JSON with additionalContext for Claude
#
# Token Levels:
#   minimal - 3 entries max, summarize if >1
#   balanced - 5 entries max, summarize if >3
#   comprehensive - 10 entries max, summarize if >5

export SCRIPT_NAME="knowledge-load"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

SCRIPT_NAME="$(basename "$0" .sh)"
SCRIPT_DIR="$(dirname "$0")"

# Determine project root (for finding CLI tool)
# Navigate up from scripts/knowledge/ to project root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Read input JSON
INPUT=$(cat)

# Extract fields from input (with defaults)
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
LEVEL=$(echo "$INPUT" | jq -r '.level // ""')
CONTEXT_TAGS=$(echo "$INPUT" | jq -r '.context_tags // [] | join(",")')
WORKPACKAGE=$(echo "$INPUT" | jq -r '.workpackage // ""')

# Define paths
CLEAR_DIR="${CWD}/.clear"
CLI_TOOL_TS="${PROJECT_ROOT}/src/infrastructure/knowledge/cli/load-cli.ts"
CLI_TOOL_JS="${PROJECT_ROOT}/build/infrastructure/knowledge/cli/load-cli.js"

# Check if knowledge directory exists
if [ ! -d "${CLEAR_DIR}/knowledge" ]; then
  # No knowledge base yet - return empty response
  jq -n \
    --arg script "$SCRIPT_NAME" \
    '{
      "additionalContext": "[CLEAR Knowledge] No knowledge base initialized.",
      "status": "no_knowledge_base",
      "script": $script,
      "entriesLoaded": 0,
      "level": "balanced"
    }'
  exit 0
fi

# Determine which CLI tool to use (prefer compiled JS for speed)
if [ -f "$CLI_TOOL_JS" ]; then
  CLI_TOOL="$CLI_TOOL_JS"
  USE_NODE=true
elif [ -f "$CLI_TOOL_TS" ]; then
  CLI_TOOL="$CLI_TOOL_TS"
  USE_NODE=false
else
  jq -n \
    --arg script "$SCRIPT_NAME" \
    '{
      "success": false,
      "script": $script,
      "error": "CLI tool not found"
    }'
  exit 0
fi

# Build CLI arguments as a bash array. CROSS-K3.4-01 (S155): array form prevents
# shell word-split on values from jq -r output (workpackage / context_tags /
# level / session may contain whitespace or shell metacharacters); the prior
# concatenated-string form expanded unquoted into the CLI invocation.
CLI_ARGS_ARR=("--clear-dir=${CLEAR_DIR}")

if [ -n "$LEVEL" ]; then
  CLI_ARGS_ARR+=("--level=${LEVEL}")
fi

if [ -n "$CONTEXT_TAGS" ]; then
  CLI_ARGS_ARR+=("--context=${CONTEXT_TAGS}")
fi

if [ -n "$WORKPACKAGE" ]; then
  CLI_ARGS_ARR+=("--workpackage=${WORKPACKAGE}")
fi

# Read current session number from session state for grace period boost
SESSION_FILE="${CLEAR_DIR}/state/session.json"
if [ -f "$SESSION_FILE" ]; then
  SESSION_NUM=$(jq -r '.clearSessionNumber // ""' "$SESSION_FILE" 2>/dev/null)
  if [ -n "$SESSION_NUM" ] && [ "$SESSION_NUM" != "null" ]; then
    CLI_ARGS_ARR+=("--session=${SESSION_NUM}")
  fi
fi

# Run the CLI tool
cd "$PROJECT_ROOT" || exit
if [ "$USE_NODE" = true ]; then
  CLI_OUTPUT=$(node "$CLI_TOOL" "${CLI_ARGS_ARR[@]}" 2>&1)
else
  CLI_OUTPUT=$(npx ts-node "$CLI_TOOL" "${CLI_ARGS_ARR[@]}" 2>&1)
fi

# Check if result is valid JSON
if echo "$CLI_OUTPUT" | jq . >/dev/null 2>&1; then
  # Add script metadata to result
  echo "$CLI_OUTPUT" | jq --arg script "$SCRIPT_NAME" '. + {script: $script}'
else
  # Return error with raw output
  jq -n \
    --arg script "$SCRIPT_NAME" \
    --arg error "$CLI_OUTPUT" \
    '{
      "success": false,
      "script": $script,
      "error": $error
    }'
fi

# Rebuild file-knowledge reverse index (non-blocking, best-effort)
FILE_INDEX_JS="${PROJECT_ROOT}/build/infrastructure/knowledge/cli/file-index-cli.js"
FILE_INDEX_TS="${PROJECT_ROOT}/src/infrastructure/knowledge/cli/file-index-cli.ts"
if [ -f "$FILE_INDEX_JS" ]; then
  node "$FILE_INDEX_JS" --clear-dir="${CLEAR_DIR}" --rebuild >/dev/null 2>&1 || true
elif [ -f "$FILE_INDEX_TS" ]; then
  npx ts-node "$FILE_INDEX_TS" --clear-dir="${CLEAR_DIR}" --rebuild >/dev/null 2>&1 || true
fi

# K3.4 (S154) FR22: rebuild owner-index ONLY if it already exists (lazy
# invariant preserved). First-build of owner-index happens at first SH entry
# create in capture-cli.ts; session-start refresh keeps it consistent with
# any out-of-band entry edits or filesystem changes between sessions. If
# absent, do nothing — pre-tool.sh falls back to single-index logic.
OWNER_INDEX_FILE="${CLEAR_DIR}/state/owner-index.json"
if [ -f "$OWNER_INDEX_FILE" ]; then
  FILE_INDEX_CLI_JS="${PROJECT_ROOT}/build/infrastructure/knowledge/cli/file-index-cli.js"
  FILE_INDEX_CLI_TS="${PROJECT_ROOT}/src/infrastructure/knowledge/cli/file-index-cli.ts"
  if [ -f "$FILE_INDEX_CLI_JS" ]; then
    node "$FILE_INDEX_CLI_JS" --clear-dir="${CLEAR_DIR}" --rebuild-owner-index >/dev/null 2>&1 || true
  elif [ -f "$FILE_INDEX_CLI_TS" ]; then
    npx ts-node "$FILE_INDEX_CLI_TS" --clear-dir="${CLEAR_DIR}" --rebuild-owner-index >/dev/null 2>&1 || true
  fi
fi

# Drain pending SQLite index rebuild (POST-32: session-start index recovery)
source "${SCRIPT_DIR}/knowledge-drain.sh"
drain_pending_index "${CLEAR_DIR}" || true

exit 0
