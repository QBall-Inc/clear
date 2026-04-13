#!/bin/bash
# session-finalize.sh - Finalize session state on Stop event
#
# Triggered by: Stop hook (via session-stop dispatcher)
# Input: JSON via stdin with session_id, cwd
# Output: JSON (no additionalContext - Stop event cannot add context)
#
# Updates:
#   .clear/state/session.json - Final status
#   .clear/state/session-history.json - Session end record
#
# Note: Per Claude Code platform limitation, Stop event hooks cannot
# add additionalContext to the conversation. This script runs silently.

export SCRIPT_NAME="session-finalize"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

SCRIPT_NAME="$(basename "$0" .sh)"

# Read input JSON
INPUT=$(cat)

# Extract fields from input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')

# Define paths
CLEAR_DIR="${CWD}/.clear"
STATE_DIR="${CLEAR_DIR}/state"
STATE_FILE="${STATE_DIR}/session.json"
HISTORY_FILE="${STATE_DIR}/session-history.json"

# Check if session is initialized
if [ ! -f "$STATE_FILE" ]; then
  echo '{"status": "no_session"}'
  exit 0
fi

# Read current state
CURRENT_STATE=$(cat "$STATE_FILE")

# Extract session info
SESSION_NUMBER=$(echo "$CURRENT_STATE" | jq -r '.clearSessionNumber // 0')
# shellcheck disable=SC2034  # Extracted from state for potential use
START_TIME=$(echo "$CURRENT_STATE" | jq -r '.startTime // ""')
PROMPT_COUNT=$(echo "$CURRENT_STATE" | jq -r '.tokenUsage.promptCount // 0')
TOKEN_ESTIMATE=$(echo "$CURRENT_STATE" | jq -r '.tokenUsage.estimate // 0')
HANDOFF_PREPARED=$(echo "$CURRENT_STATE" | jq -r '.handoff.prepared // false')
# shellcheck disable=SC2034  # Extracted from state for potential use
HANDOFF_PATH=$(echo "$CURRENT_STATE" | jq -r '.handoff.documentPath // null')

# Get current timestamp
TIMESTAMP=$(date -Iseconds)

# Calculate token percentage
TOKEN_PERCENT=$(awk "BEGIN { printf \"%.0f\", $TOKEN_ESTIMATE * 100 }")

# Update session state to completed
jq --arg ts "$TIMESTAMP" \
   '.status = "completed" |
    .endTime = $ts' \
   "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"

# Update session history
if [ -f "$HISTORY_FILE" ]; then
  jq --arg sid "$SESSION_ID" \
     --arg ts "$TIMESTAMP" \
     --argjson prompts "$PROMPT_COUNT" \
     --arg tokens "${TOKEN_PERCENT}%" \
     --argjson handoff "$HANDOFF_PREPARED" \
     '(.sessions[] | select(.sessionId == $sid)) |= . + {
        "endTime": $ts,
        "status": "completed",
        "prompts": $prompts,
        "tokenUsage": $tokens,
        "handoffPrepared": $handoff
      }' \
     "$HISTORY_FILE" > "${HISTORY_FILE}.tmp" && mv "${HISTORY_FILE}.tmp" "$HISTORY_FILE"
fi

# If handoff wasn't prepared and we have significant work, generate one
if [ "$HANDOFF_PREPARED" = "false" ] && [ "$PROMPT_COUNT" -gt 5 ]; then
  SCRIPT_DIR="$(dirname "$0")"
  if [ -x "${SCRIPT_DIR}/session-handoff.sh" ]; then
    # Generate handoff document silently
    echo "$INPUT" | "${SCRIPT_DIR}/session-handoff.sh" > /dev/null 2>&1 || true
  fi
fi

# Return JSON response (no additionalContext for Stop event)
jq -n \
  --argjson sessionNumber "$SESSION_NUMBER" \
  --argjson prompts "$PROMPT_COUNT" \
  --arg tokens "${TOKEN_PERCENT}%" \
  --argjson handoff "$HANDOFF_PREPARED" \
  '{
    "clearSessionNumber": $sessionNumber,
    "prompts": $prompts,
    "tokenUsage": $tokens,
    "handoffPrepared": $handoff,
    "status": "finalized"
  }'

exit 0
