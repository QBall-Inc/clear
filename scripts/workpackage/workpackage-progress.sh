#!/bin/bash
# workpackage-progress.sh - Track progress within active workpackage
#
# Triggered by: PostToolUse hook (via post-tool dispatcher) on Write/Edit events.
# Input: JSON via stdin with cwd, optional file, deliverable_id
# Output: JSON with additionalContext (only if progress changed)
#
# Validates scope and tracks deliverable completion.

export SCRIPT_NAME="workpackage-progress"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

SCRIPT_NAME="$(basename "$0" .sh)"
SCRIPT_DIR="$(dirname "$0")"

# Determine project root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Read input JSON
INPUT=$(cat)

# Extract fields from input (with defaults)
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
FILE=$(echo "$INPUT" | jq -r '.file // ""')
DELIVERABLE_ID=$(echo "$INPUT" | jq -r '.deliverable_id // ""')
COMPLETE=$(echo "$INPUT" | jq -r '.complete // false')

# Define paths
CLEAR_DIR="${CWD}/.clear"
CLI_TOOL_TS="${PROJECT_ROOT}/src/infrastructure/workpackage/cli/progress-cli.ts"
CLI_TOOL_JS="${PROJECT_ROOT}/build/infrastructure/workpackage/cli/progress-cli.js"

# Check if state directory exists
if [ ! -d "${CLEAR_DIR}/state" ]; then
  # No state - silent return
  jq -n \
    --arg script "$SCRIPT_NAME" \
    '{
      "progress": 0,
      "status": "success",
      "script": $script
    }'
  exit 0
fi

# Determine which CLI tool to use
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

# Build CLI arguments as an array so each flag is one argv token. A value such as
# a filename with whitespace or shell metacharacters stays a single argument
# instead of being word-split into extra (attacker-influenced) flags.
CLI_ARGS=("--clear-dir=${CLEAR_DIR}")

if [ -n "$FILE" ]; then
  CLI_ARGS+=("--file=${FILE}")
fi

if [ -n "$DELIVERABLE_ID" ]; then
  CLI_ARGS+=("--deliverable=${DELIVERABLE_ID}")
fi

if [ "$COMPLETE" = "true" ]; then
  CLI_ARGS+=("--complete")
fi

# Run the CLI tool
cd "$PROJECT_ROOT" || exit
if [ "$USE_NODE" = true ]; then
  RESULT=$(node "$CLI_TOOL" "${CLI_ARGS[@]}" 2>&1)
else
  RESULT=$(npx ts-node "$CLI_TOOL" "${CLI_ARGS[@]}" 2>&1)
fi

# Check if result is valid JSON
if echo "$RESULT" | jq . >/dev/null 2>&1; then
  echo "$RESULT" | jq --arg script "$SCRIPT_NAME" '. + {script: $script}'
else
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
