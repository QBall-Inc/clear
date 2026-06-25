#!/bin/bash
# plan-import.sh - Import a Bulwark plan into CLEAR format
#
# Triggered by: /cf-plan import command
# Input: JSON via stdin with cwd, plan_path, force, session_id, session_number
# Output: JSON with additionalContext for Claude

export SCRIPT_NAME="plan-import"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

SCRIPT_NAME="$(basename "$0" .sh)"
SCRIPT_DIR="$(dirname "$0")"

# Determine project root (navigate up from scripts/plan/ to project root)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Read input JSON
INPUT=$(cat)

# Extract fields from input (with defaults)
CWD=$(canonicalize_cwd "$(echo "$INPUT" | jq -r '.cwd // "."')")
PLAN_PATH=$(echo "$INPUT" | jq -r '.plan_path // ""')
FORCE=$(echo "$INPUT" | jq -r '.force // "false"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
SESSION_NUMBER=$(echo "$INPUT" | jq -r '.session_number // "0"')

# Validate plan_path provided
if [ -z "$PLAN_PATH" ]; then
  jq -n '{
    "status": "error",
    "error": "No plan path provided",
    "additionalContext": "Usage: /cf-plan import <path-to-bulwark-plan> [--force]"
  }'
  exit 0
fi

# Build CLI arguments
CLI_ARGS="--cwd=${CWD} --plan-path=${PLAN_PATH} --session-id=${SESSION_ID} --session-number=${SESSION_NUMBER}"

if [ "$FORCE" = "true" ]; then
  CLI_ARGS="${CLI_ARGS} --force"
fi

# Prefer compiled JS, fall back to ts-node
CLI_TOOL_JS="${PROJECT_ROOT}/build/infrastructure/plan/cli/import-cli.js"
CLI_TOOL_TS="${PROJECT_ROOT}/src/infrastructure/plan/cli/import-cli.ts"

if [ -f "$CLI_TOOL_JS" ]; then
  # shellcheck disable=SC2086
  node "$CLI_TOOL_JS" $CLI_ARGS
elif [ -f "$CLI_TOOL_TS" ]; then
  # shellcheck disable=SC2086
  npx ts-node --transpile-only "$CLI_TOOL_TS" $CLI_ARGS
else
  jq -n '{
    "status": "error",
    "error": "Import CLI not found",
    "additionalContext": "Neither build/infrastructure/plan/cli/import-cli.js nor src equivalent found."
  }'
fi
