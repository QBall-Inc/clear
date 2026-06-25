#!/bin/bash
# session-finalize.sh - Finalize session state on SessionEnd event
#
# Triggered by: SessionEnd hook (via scripts/dispatchers/session-end.sh)
#   Note: Originally bound to Stop hook, but WP-R2.B1 (S97) moved finalize
#   to SessionEnd because Stop fires after every Claude response turn,
#   causing repeated mid-session "completed" status writes.
# Input: JSON via stdin with session_id, cwd
# Output: JSON (no additionalContext — SessionEnd stdout is invisible to
#   Claude per CC docs + S97-D1 empirical evidence; ratified by K2.7 P5
#   pivot at commit 650e92e where the carry-over gate moved from
#   SessionEnd → SessionStart for visibility)
#
# Updates:
#   .clear/state/session.json - Final status ("completed") + endTime
#   .clear/state/session-history.json - Session end record (rollup row)
#
# Note: Per Claude Code platform limitation, SessionEnd event hooks cannot
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
# Coerce to a number: SESSION_NUMBER feeds --argjson below, which aborts (under
# set -e) on a non-numeric/empty value from a tampered state file. Default to 0.
SESSION_NUMBER=$(echo "$CURRENT_STATE" | jq -r '(.clearSessionNumber // 0) | if type == "number" then . else 0 end')
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

# Update session history. Attribute stats to exactly ONE row — the row matching
# this session's UUID AND logical number. Selecting on sessionId alone stamps the
# same end/prompts/tokens onto every history row sharing the Claude UUID (a /resume
# reuses the UUID), corrupting per-session analytics. Pairing sessionId with
# clearSessionNumber pins the update to this finalized session's single row.
if [ -f "$HISTORY_FILE" ]; then
  jq --arg sid "$SESSION_ID" \
     --argjson num "$SESSION_NUMBER" \
     --arg ts "$TIMESTAMP" \
     --argjson prompts "$PROMPT_COUNT" \
     --arg tokens "${TOKEN_PERCENT}%" \
     --argjson handoff "$HANDOFF_PREPARED" \
     '(.sessions[] | select(.sessionId == $sid and .clearSessionNumber == $num)) |= . + {
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
