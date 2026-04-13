#!/bin/bash
# knowledge-search.sh - Handle knowledge search requests with P1-P3 priority
#
# Triggered by: UserPromptSubmit hook (via user-prompt dispatcher)
# Input: JSON via stdin with cwd, user_prompt
# Output: JSON with additionalContext containing search results
#
# Search Priority:
#   P1 - Tag exact match (highest priority)
#   P2 - Title keyword match
#   P3 - TF-IDF similarity (semantic match)
#
# Two modes:
#   1. Intent detection: Check if user prompt contains search intent
#   2. Search execution: Perform P1-P3 search if intent detected

export SCRIPT_NAME="knowledge-search"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

SCRIPT_NAME="$(basename "$0" .sh)"
SCRIPT_DIR="$(dirname "$0")"

# Navigate up from scripts/knowledge/ to project root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Read input JSON
INPUT=$(cat)

# Extract fields from input
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
USER_PROMPT=$(echo "$INPUT" | jq -r '.user_prompt // ""')
MAX_RESULTS=$(echo "$INPUT" | jq -r '.max_results // 10')
INCLUDE_SUPERSEDED=$(echo "$INPUT" | jq -r '.include_superseded // false')

# Define paths
CLEAR_DIR="${CWD}/.clear"
CLI_TOOL_TS="${PROJECT_ROOT}/src/infrastructure/knowledge/cli/search-cli.ts"
CLI_TOOL_JS="${PROJECT_ROOT}/build/infrastructure/knowledge/cli/search-cli.js"

# Check if knowledge directory exists
if [ ! -d "${CLEAR_DIR}/knowledge" ]; then
  # No knowledge base - but don't report anything (silent when no KB)
  jq -n \
    --arg script "$SCRIPT_NAME" \
    '{
      "status": "no_knowledge_base",
      "script": $script,
      "detected": false,
      "matchCount": 0
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

# Run CLI function with variable arguments
run_cli() {
  cd "$PROJECT_ROOT" || exit
  if [ "$USE_NODE" = true ]; then
    node "$CLI_TOOL" "$@" 2>&1
  else
    npx ts-node "$CLI_TOOL" "$@" 2>&1
  fi
}

# Step 1: Detect if user prompt contains search intent
DETECT_RESULT=$(run_cli --clear-dir="${CLEAR_DIR}" --detect-only --text="${USER_PROMPT}")

# Check if detection result is valid JSON
if ! echo "$DETECT_RESULT" | jq . >/dev/null 2>&1; then
  jq -n \
    --arg script "$SCRIPT_NAME" \
    --arg error "$DETECT_RESULT" \
    '{
      "success": false,
      "script": $script,
      "detected": false,
      "error": $error
    }'
  exit 0
fi

# Check if search intent was detected
DETECTED=$(echo "$DETECT_RESULT" | jq -r '.detected // false')

if [ "$DETECTED" != "true" ]; then
  # No search intent - return silent result
  jq -n \
    --arg script "$SCRIPT_NAME" \
    '{
      "status": "no_intent",
      "script": $script,
      "detected": false
    }'
  exit 0
fi

# Step 2: Extract query and perform search
QUERY=$(echo "$DETECT_RESULT" | jq -r '.query // ""')

if [ -z "$QUERY" ]; then
  jq -n \
    --arg script "$SCRIPT_NAME" \
    '{
      "status": "no_query",
      "script": $script,
      "detected": true,
      "matchCount": 0
    }'
  exit 0
fi

# Build search arguments array
SEARCH_ARGS=(--clear-dir="${CLEAR_DIR}" --query="${QUERY}" --max-results="${MAX_RESULTS}")

if [ "$INCLUDE_SUPERSEDED" = "true" ]; then
  SEARCH_ARGS+=(--include-superseded)
fi

# Perform the search
SEARCH_RESULT=$(run_cli "${SEARCH_ARGS[@]}")

# Check if result is valid JSON
if echo "$SEARCH_RESULT" | jq . >/dev/null 2>&1; then
  # Add script metadata and detected flag
  echo "$SEARCH_RESULT" | jq \
    --arg script "$SCRIPT_NAME" \
    '. + {script: $script, detected: true}'
else
  jq -n \
    --arg script "$SCRIPT_NAME" \
    --arg error "$SEARCH_RESULT" \
    '{
      "success": false,
      "script": $script,
      "detected": true,
      "error": $error
    }'
fi

exit 0
