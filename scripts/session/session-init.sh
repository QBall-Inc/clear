#!/bin/bash
# session-init.sh - Initialize CLEAR session tracking
#
# Triggered by: SessionStart hook (via session-start dispatcher)
# Input: JSON via stdin with session_id, cwd, hook_event_name
# Output: JSON with additionalContext for Claude
#
# Creates:
#   .clear/state/session.json - Current session state
#   .clear/state/session-history.json - Session history (if not exists)

export SCRIPT_NAME="session-init"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

SCRIPT_NAME="$(basename "$0" .sh)"

# Read input JSON
INPUT=$(cat)

# Extract fields from input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
# shellcheck disable=SC2034  # Extracted from input for potential use
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "SessionStart"')

# Define paths
CLEAR_DIR="${CWD}/.clear"
STATE_DIR="${CLEAR_DIR}/state"
CONFIG_DIR="${CLEAR_DIR}/config"
SESSIONS_DIR="${CLEAR_DIR}/sessions"

STATE_FILE="${STATE_DIR}/session.json"
HISTORY_FILE="${STATE_DIR}/session-history.json"
CONFIG_FILE="${CONFIG_DIR}/session-management.yaml"

# Load configuration (with defaults)
WARNING_THRESHOLD=0.60
CRITICAL_THRESHOLD=0.75
EMERGENCY_THRESHOLD=0.85

if [ -f "$CONFIG_FILE" ]; then
  # Try to read thresholds from config (basic yaml parsing)
  WARN=$(grep -E "^\s+warning:" "$CONFIG_FILE" 2>/dev/null | awk '{print $2}' | head -1)
  CRIT=$(grep -E "^\s+critical:" "$CONFIG_FILE" 2>/dev/null | awk '{print $2}' | head -1)
  EMERG=$(grep -E "^\s+emergency:" "$CONFIG_FILE" 2>/dev/null | awk '{print $2}' | head -1)

  [ -n "$WARN" ] && WARNING_THRESHOLD="$WARN"
  [ -n "$CRIT" ] && CRITICAL_THRESHOLD="$CRIT"
  [ -n "$EMERG" ] && EMERGENCY_THRESHOLD="$EMERG"
fi

# Ensure directories exist
mkdir -p "$STATE_DIR"
mkdir -p "$SESSIONS_DIR"

# Determine session number
CLEAR_SESSION_NUMBER=1
if [ -f "$HISTORY_FILE" ]; then
  LAST_NUMBER=$(jq -r '.lastSessionNumber // 0' "$HISTORY_FILE" 2>/dev/null || echo "0")
  CLEAR_SESSION_NUMBER=$((LAST_NUMBER + 1))
fi

# Get current timestamp
TIMESTAMP=$(date -Iseconds)
DATE_STAMP=$(date +%Y%m%d)

# Check if resuming an existing session
RESUMING="false"
RESUME_INFO=""
if [ -f "$STATE_FILE" ]; then
  PREV_SESSION_ID=$(jq -r '.sessionId // ""' "$STATE_FILE" 2>/dev/null)
  PREV_STATUS=$(jq -r '.status // ""' "$STATE_FILE" 2>/dev/null)

  if [ "$PREV_SESSION_ID" = "$SESSION_ID" ] && [ "$PREV_STATUS" = "active" ]; then
    RESUMING="true"
    PREV_PROMPT_COUNT=$(jq -r '.tokenUsage.promptCount // 0' "$STATE_FILE" 2>/dev/null)
    RESUME_INFO=" (resuming, ${PREV_PROMPT_COUNT} prompts so far)"
  else
    # Previous session wasn't properly closed - archive it
    if [ -n "$PREV_SESSION_ID" ]; then
      # shellcheck disable=SC2034
      PREV_NUMBER=$(jq -r '.clearSessionNumber // 0' "$STATE_FILE" 2>/dev/null)
      # Keep the session number from the interrupted session
    fi
  fi
fi

# Create session state
if [ "$RESUMING" = "true" ]; then
  # Update existing session with new activity timestamp
  jq --arg ts "$TIMESTAMP" \
     '.lastActivity = $ts' \
     "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
else
  # Create new session state
  cat > "$STATE_FILE" << EOF
{
  "sessionId": "${SESSION_ID}",
  "clearSessionNumber": ${CLEAR_SESSION_NUMBER},
  "startTime": "${TIMESTAMP}",
  "lastActivity": "${TIMESTAMP}",
  "status": "active",
  "tokenUsage": {
    "estimate": 0,
    "promptCount": 0,
    "method": "deterministic",
    "consecutiveFailures": 0,
    "cacheReadTokens": 0,
    "warningShown": false,
    "criticalShown": false,
    "emergencyShown": false
  },
  "handoff": {
    "prepared": false,
    "documentPath": null
  },
  "thresholds": {
    "warning": ${WARNING_THRESHOLD},
    "critical": ${CRITICAL_THRESHOLD},
    "emergency": ${EMERGENCY_THRESHOLD}
  },
  "contextWindow": {
    "size": 200000,
    "source": "default",
    "detectedModel": null,
    "lastUpdated": null
  }
}
EOF
fi

# Update session history
if [ ! -f "$HISTORY_FILE" ]; then
  cat > "$HISTORY_FILE" << EOF
{
  "lastSessionNumber": ${CLEAR_SESSION_NUMBER},
  "sessions": []
}
EOF
fi

# Add new session to history (keep last 10)
if [ "$RESUMING" = "false" ]; then
  jq --arg sid "$SESSION_ID" \
     --argjson num "$CLEAR_SESSION_NUMBER" \
     --arg ts "$TIMESTAMP" \
     --arg date "$DATE_STAMP" \
     '.lastSessionNumber = $num |
      .sessions = ([{
        "sessionId": $sid,
        "clearSessionNumber": $num,
        "startTime": $ts,
        "date": $date,
        "status": "active"
      }] + .sessions) | .sessions = .sessions[:10]' \
     "$HISTORY_FILE" > "${HISTORY_FILE}.tmp" && mv "${HISTORY_FILE}.tmp" "$HISTORY_FILE"
fi

# ==============================================================================
# LOAD PREVIOUS SESSION HANDOFF (P6-BUG-010)
# ==============================================================================
# On new sessions, find the most recent handoff and include in context.
# Skip on resume (Claude already has the context from the current session).
HANDOFF_CONTENT=""
if [ "$RESUMING" = "false" ] && [ -d "$SESSIONS_DIR" ]; then
  # Find most recent .md file by modification time (find-based, safe for spaces in paths)
  LATEST_HANDOFF=$(find "$SESSIONS_DIR" -maxdepth 1 -name '*.md' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
  if [ -n "$LATEST_HANDOFF" ] && [ -s "$LATEST_HANDOFF" ]; then
    HANDOFF_FILENAME=$(basename "$LATEST_HANDOFF")
    # Truncate to first 150 lines to avoid context bloat
    HANDOFF_BODY=$(head -150 "$LATEST_HANDOFF")
    LINE_COUNT=$(wc -l < "$LATEST_HANDOFF")
    TRUNCATION_NOTE=""
    if [ "$LINE_COUNT" -gt 150 ]; then
      TRUNCATION_NOTE="
[Truncated — full handoff at .clear/sessions/${HANDOFF_FILENAME}]"
    fi
    HANDOFF_CONTENT="
## Previous Session Handoff
Source: .clear/sessions/${HANDOFF_FILENAME}

${HANDOFF_BODY}${TRUNCATION_NOTE}"
  fi
fi

# Prepare output context — format thresholds as percentages
WARN_PCT=$(echo "$WARNING_THRESHOLD" | awk '{printf "%d%%", $1 * 100}')
CRIT_PCT=$(echo "$CRITICAL_THRESHOLD" | awk '{printf "%d%%", $1 * 100}')
THRESHOLD_INFO="warning: ${WARN_PCT}, critical: ${CRIT_PCT}"

if [ "$RESUMING" = "true" ]; then
  CONTEXT_MSG="[CLEAR] Session ${CLEAR_SESSION_NUMBER} resumed${RESUME_INFO}
Token monitoring active (${THRESHOLD_INFO})"
else
  CONTEXT_MSG="[CLEAR] Session ${CLEAR_SESSION_NUMBER} initialized
Token monitoring active (${THRESHOLD_INFO})${HANDOFF_CONTENT}"
fi

# Return JSON response
jq -n \
  --arg context "$CONTEXT_MSG" \
  --arg sessionId "$SESSION_ID" \
  --argjson sessionNumber "$CLEAR_SESSION_NUMBER" \
  --arg status "success" \
  '{
    "additionalContext": $context,
    "sessionId": $sessionId,
    "clearSessionNumber": $sessionNumber,
    "status": $status
  }'

exit 0
