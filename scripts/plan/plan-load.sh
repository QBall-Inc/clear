#!/bin/bash
# plan-load.sh - Load plan context at session start
#
# Triggered by: SessionStart hook (via session-start dispatcher)
# Input: JSON via stdin with cwd, session_id
# Output: JSON with additionalContext for Claude
#
# Uses tiered progressive disclosure for token efficiency.

export SCRIPT_NAME="plan-load"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

SCRIPT_NAME="$(basename "$0" .sh)"
SCRIPT_DIR="$(dirname "$0")"

# Determine project root (for finding CLI tool)
# Navigate up from scripts/plan/ to project root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Read input JSON
INPUT=$(cat)

# Extract fields from input (with defaults)
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')

# Define paths
CLEAR_DIR="${CWD}/.clear"
CLI_TOOL_TS="${PROJECT_ROOT}/src/infrastructure/plan/cli/load-cli.ts"
CLI_TOOL_JS="${PROJECT_ROOT}/build/infrastructure/plan/cli/load-cli.js"

# Check if plans directory exists
if [ ! -d "${CLEAR_DIR}/plans" ]; then
  # No plans yet - return empty response
  jq -n \
    --arg script "$SCRIPT_NAME" \
    '{
      "additionalContext": "[Plan] No development plan found. Use /cf-init to create one.",
      "status": "no_plan",
      "script": $script,
      "planId": null,
      "progress": 0
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

# Build CLI arguments
CLI_ARGS="--clear-dir=${CLEAR_DIR}"

if [ -n "$SESSION_ID" ]; then
  CLI_ARGS="${CLI_ARGS} --session-id=${SESSION_ID}"
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
