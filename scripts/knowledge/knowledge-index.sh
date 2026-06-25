#!/bin/bash
# knowledge-index.sh - Build/rebuild the knowledge index
#
# Triggered by: On-demand, threshold checks, or after capture
# Input: JSON via stdin with mode, session info, optional flags
# Output: JSON with index operation results
#
# Modes:
#   full - Complete rebuild from all .md files
#   incremental - Only process new/modified/deleted entries
#   check - Check if rebuild thresholds are exceeded

export SCRIPT_NAME="knowledge-index"
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
MODE=$(echo "$INPUT" | jq -r '.mode // "full"')
CURRENT_SESSION=$(echo "$INPUT" | jq -r '.session // 1')
FORCE=$(echo "$INPUT" | jq -r '.force // false')
CHECK_ONLY=$(echo "$INPUT" | jq -r '.check_only // false')

# Define paths
CLEAR_DIR="${CWD}/.clear"
ENTRIES_DIR="${CLEAR_DIR}/knowledge/entries"
CLI_TOOL_TS="${PROJECT_ROOT}/src/infrastructure/knowledge/cli/index-cli.ts"
CLI_TOOL_JS="${PROJECT_ROOT}/build/infrastructure/knowledge/cli/index-cli.js"

# Ensure knowledge directory exists
if ! mkdir -p "$ENTRIES_DIR" 2>/dev/null; then
  jq -n \
    --arg script "$SCRIPT_NAME" \
    --arg dir "$ENTRIES_DIR" \
    '{
      "success": false,
      "script": $script,
      "error": "Cannot create knowledge directory",
      "path": $dir
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
  echo '{"success":false,"error":"CLI tool not found"}'
  exit 1
fi

# Build CLI arguments
CLI_ARGS="--clear-dir=${CLEAR_DIR} --session=${CURRENT_SESSION}"

if [ "$CHECK_ONLY" = "true" ]; then
  CLI_ARGS="${CLI_ARGS} --check-thresholds"
elif [ "$MODE" = "incremental" ]; then
  CLI_ARGS="${CLI_ARGS} --mode=incremental"
else
  CLI_ARGS="${CLI_ARGS} --mode=full"
fi

if [ "$FORCE" = "true" ]; then
  CLI_ARGS="${CLI_ARGS} --force"
fi

# Run the CLI tool
cd "$PROJECT_ROOT" || exit
if [ "$USE_NODE" = true ]; then
  RESULT=$(node "$CLI_TOOL" $CLI_ARGS 2>&1)
else
  RESULT=$(npx ts-node "$CLI_TOOL" $CLI_ARGS 2>&1)
fi

# Check if result is valid JSON
if echo "$RESULT" | jq . >/dev/null 2>&1; then
  # Add script metadata to result
  echo "$RESULT" | jq --arg script "$SCRIPT_NAME" '. + {script: $script}'
else
  # Return error with raw output
  jq -n \
    --arg script "$SCRIPT_NAME" \
    --arg error "$RESULT" \
    '{
      "success": false,
      "script": $script,
      "error": $error
    }'
fi

exit 0
