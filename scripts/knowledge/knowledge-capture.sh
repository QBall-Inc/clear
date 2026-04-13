#!/bin/bash
# knowledge-capture.sh - Handle knowledge capture with multi-turn confirmation flow
#
# Triggered by: UserPromptSubmit hook (via user-prompt dispatcher)
# Input: JSON via stdin with cwd, user_prompt
# Output: JSON with additionalContext for capture prompts
#
# Flow:
#   1. Check for pending capture state (if exists, process confirmation)
#   2. Detect capture triggers in user prompt (decisions, patterns, lessons)
#   3. Present confirmation prompt if trigger detected
#   4. Process user response in subsequent turns
#   5. Create entry when confirmed
#
# State machine:
#   [No State] → DETECT → [awaiting_confirmation] → CONFIRM → [awaiting_tag_review]
#             → CONFIRM → [awaiting_supersession] → CONFIRM → CREATE → [No State]

export SCRIPT_NAME="knowledge-capture"
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
SESSION=$(echo "$INPUT" | jq -r '.session // 0')

# Define paths
CLEAR_DIR="${CWD}/.clear"
STATE_FILE="${CLEAR_DIR}/state/pending-capture.json"
CLI_TOOL_TS="${PROJECT_ROOT}/src/infrastructure/knowledge/cli/capture-cli.ts"
CLI_TOOL_JS="${PROJECT_ROOT}/build/infrastructure/knowledge/cli/capture-cli.js"

# Ensure state directory exists
mkdir -p "${CLEAR_DIR}/state" 2>/dev/null || true

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

# Escape text for CLI argument (handle special characters)
escape_text() {
  local text="$1"
  # Replace problematic characters for shell argument
  printf '%s' "$text"
}

# Check for pending capture state
check_pending_state() {
  if [ -f "$STATE_FILE" ]; then
    # Validate JSON and check if state exists
    if jq -e '.step' "$STATE_FILE" >/dev/null 2>&1; then
      return 0  # Pending state exists
    fi
  fi
  return 1  # No pending state
}

# Get current step from pending state
get_pending_step() {
  if [ -f "$STATE_FILE" ]; then
    jq -r '.step // "unknown"' "$STATE_FILE" 2>/dev/null || echo "unknown"
  else
    echo "none"
  fi
}

# Main logic
main() {
  local result
  local step

  # Check if there's a pending capture
  if check_pending_state; then
    step=$(get_pending_step)

    case "$step" in
      awaiting_confirmation|awaiting_tag_review|awaiting_supersession)
        # Process user's response to pending capture
        result=$(run_cli \
          --clear-dir="${CLEAR_DIR}" \
          --confirm \
          --text="${USER_PROMPT}" \
          --session="${SESSION}")
        ;;

      *)
        # Unknown step - try detection instead
        result=$(run_cli \
          --clear-dir="${CLEAR_DIR}" \
          --detect \
          --text="${USER_PROMPT}")
        ;;
    esac
  else
    # No pending state - check for capture triggers
    result=$(run_cli \
      --clear-dir="${CLEAR_DIR}" \
      --detect \
      --text="${USER_PROMPT}")
  fi

  # Validate result is JSON
  if ! echo "$result" | jq . >/dev/null 2>&1; then
    jq -n \
      --arg script "$SCRIPT_NAME" \
      --arg error "$result" \
      '{
        "success": false,
        "script": $script,
        "error": $error
      }'
    exit 0
  fi

  # Check if we need to create an entry (ready_to_create status)
  local next_step
  next_step=$(echo "$result" | jq -r '.nextStep // ""')
  local status
  status=$(echo "$result" | jq -r '.status // ""')

  if [ "$next_step" = "ready_to_create" ] || [ "$status" = "ready_to_create" ]; then
    # Get capture details from state file
    if [ -f "$STATE_FILE" ]; then
      local title type tags description supersedes

      title=$(jq -r '.suggested_title // .confirmed_title // ""' "$STATE_FILE")
      type=$(jq -r '.suggested_type // "technical-decision"' "$STATE_FILE")
      tags=$(jq -r '(.confirmed_tags // .suggested_tags // []) | join(",")' "$STATE_FILE")
      description=$(jq -r '.original_text // ""' "$STATE_FILE")
      supersedes=$(jq -r '.supersedes // ""' "$STATE_FILE")

      # Build create arguments
      local create_args=(
        --clear-dir="${CLEAR_DIR}"
        --create
        --title="${title}"
        --type="${type}"
        --session="${SESSION}"
      )

      if [ -n "$tags" ]; then
        create_args+=(--tags="${tags}")
      fi

      if [ -n "$description" ]; then
        create_args+=(--description="${description}")
      fi

      if [ -n "$supersedes" ] && [ "$supersedes" != "null" ] && [ "$supersedes" != "" ]; then
        create_args+=(--supersedes="${supersedes}")
      fi

      # Create the entry
      result=$(run_cli "${create_args[@]}")

      # Auto-link to active workpackage via sync-bridge (non-fatal)
      local entry_id link_data SYNC_BRIDGE
      entry_id=$(echo "$result" | jq -r '.entryId // ""')

      if [ -n "$entry_id" ]; then
        SYNC_BRIDGE="${SCRIPTS_DIR}/sync/sync-bridge.sh"
        if [ -x "$SYNC_BRIDGE" ]; then
          link_data=$(jq -n --arg id "$entry_id" --arg t "$title" \
            '{knowledgeId: $id, knowledgeTitle: $t}')
          "$SYNC_BRIDGE" --op=link-knowledge --clear-dir="$CWD" --data="$link_data" \
            >/dev/null 2>>"$HOOK_ERROR_LOG" || true
        fi
      fi
    fi
  fi

  # Add script metadata to result
  echo "$result" | jq \
    --arg script "$SCRIPT_NAME" \
    '. + {script: $script}'
}

# Execute main
main

exit 0
