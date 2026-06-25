#!/bin/bash
# session-monitor.sh - Monitor token usage and trigger warnings
#
# Triggered by: UserPromptSubmit hook (via user-prompt dispatcher)
# Input: JSON via stdin with session_id, cwd, prompt, transcript_path (optional)
# Output: JSON with additionalContext (only when thresholds crossed)
#
# Token Tracking Strategy:
#   Primary: Deterministic - Read actual usage from Claude Code transcript
#   Fallback: Weighted heuristic - After 3 consecutive transcript failures
#
# Updates:
#   .clear/state/session.json - Token usage (deterministic or fallback)

export SCRIPT_NAME="session-monitor"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

SCRIPT_NAME="$(basename "$0" .sh)"

# Constants
MAX_CONSECUTIVE_FAILURES=3  # Threshold before switching to fallback

# Context window priority chain (R3.4):
#   1. Env override (CLEAR_CONTEXT_WINDOW) — highest priority
#   2. session.json contextWindow.size (written by statusline bridge)
#   3. Observed-max heuristic (applied after transcript read)
#   4. Default 200K
CONTEXT_WINDOW=200000

# Weighted fallback percentages (based on prompt length)
WEIGHT_LIGHT=0.015   # < 500 chars: simple questions
WEIGHT_MEDIUM=0.025  # 500-2000 chars: typical coding questions
WEIGHT_HEAVY=0.035   # > 2000 chars: code reviews, file contents

# Read input JSON
INPUT=$(cat)

# Extract fields from input
# shellcheck disable=SC2034  # Extracted from input for log context
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
CWD=$(canonicalize_cwd "$(echo "$INPUT" | jq -r '.cwd // "."')")
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""')

# Redirect HOOK_ERROR_LOG to the project's .clear/audit/ (and create it). This
# script runs as a subprocess of user-prompt.sh, which re-sources common.sh —
# resetting HOOK_ERROR_LOG to the plugin-root default ${PLUGIN_ROOT}/logs/, a
# directory that does NOT exist in a consumer plugin install. Without this, the
# `2>>"$HOOK_ERROR_LOG"` redirect on the update-session call below fails to open
# its target, which aborts that command BEFORE it runs — silently skipping the
# session.json tokensUsed refresh. Routing to .clear/audit/ (mkdir'd by
# use_project_logs) makes the redirect target exist so update-session executes.
use_project_logs "$CWD"

# Define paths
CLEAR_DIR="${CWD}/.clear"
STATE_DIR="${CLEAR_DIR}/state"
STATE_FILE="${STATE_DIR}/session.json"

# Check if session is initialized
if [ ! -f "$STATE_FILE" ]; then
  # Session not initialized - return silently
  echo '{"status": "no_session"}'
  exit 0
fi

# Read current state
CURRENT_STATE=$(cat "$STATE_FILE")

# Apply context window priority chain (R3.4)
if [ -n "${CLEAR_CONTEXT_WINDOW:-}" ] && [[ "${CLEAR_CONTEXT_WINDOW}" =~ ^[0-9]+$ ]] && [ "${CLEAR_CONTEXT_WINDOW}" -gt 0 ]; then
  CONTEXT_WINDOW="$CLEAR_CONTEXT_WINDOW"
else
  CW_FROM_STATE=$(echo "$CURRENT_STATE" | jq -r '.contextWindow.size // 0' 2>/dev/null) || CW_FROM_STATE=0
  if [[ "$CW_FROM_STATE" =~ ^[0-9]+$ ]] && [ "$CW_FROM_STATE" -gt 0 ]; then
    CONTEXT_WINDOW="$CW_FROM_STATE"
  fi
fi

# Extract current values
PROMPT_COUNT=$(echo "$CURRENT_STATE" | jq -r '.tokenUsage.promptCount // 0')
CONSECUTIVE_FAILURES=$(echo "$CURRENT_STATE" | jq -r '.tokenUsage.consecutiveFailures // 0')
TRACKING_METHOD=$(echo "$CURRENT_STATE" | jq -r '.tokenUsage.method // "deterministic"')
WARNING_SHOWN=$(echo "$CURRENT_STATE" | jq -r '.tokenUsage.warningShown // false')
CRITICAL_SHOWN=$(echo "$CURRENT_STATE" | jq -r '.tokenUsage.criticalShown // false')
EMERGENCY_SHOWN=$(echo "$CURRENT_STATE" | jq -r '.tokenUsage.emergencyShown // false')
HANDOFF_PREPARED=$(echo "$CURRENT_STATE" | jq -r '.handoff.prepared // false')

WARNING_THRESHOLD=$(echo "$CURRENT_STATE" | jq -r '.thresholds.warning // 0.60')
CRITICAL_THRESHOLD=$(echo "$CURRENT_STATE" | jq -r '.thresholds.critical // 0.75')
EMERGENCY_THRESHOLD=$(echo "$CURRENT_STATE" | jq -r '.thresholds.emergency // 0.85')

SESSION_NUMBER=$(echo "$CURRENT_STATE" | jq -r '.clearSessionNumber // 0')

# Increment prompt count (always tracked for fallback)
NEW_PROMPT_COUNT=$((PROMPT_COUNT + 1))

# ============================================
# Token Usage Calculation
# ============================================

# Function: Try to read deterministic token usage from transcript
read_transcript_usage() {
  local transcript="$1"

  # Check if transcript file exists and is readable
  if [ -z "$transcript" ] || [ ! -f "$transcript" ] || [ ! -r "$transcript" ]; then
    return 1
  fi

  # Get last assistant message's usage (read last 100 lines for efficiency)
  local usage
  usage=$(tail -100 "$transcript" 2>/dev/null | \
    jq -c 'select(.type == "assistant") | .message.usage' 2>/dev/null | \
    tail -1)

  if [ -z "$usage" ] || [ "$usage" = "null" ]; then
    return 1
  fi

  # Extract cache_read_input_tokens
  local cache_read
  cache_read=$(echo "$usage" | jq -r '.cache_read_input_tokens // empty' 2>/dev/null)

  if [ -z "$cache_read" ] || [ "$cache_read" = "null" ]; then
    return 1
  fi

  # Return the token count
  echo "$cache_read"
  return 0
}

# Function: Calculate weighted fallback estimate
calculate_weighted_fallback() {
  local prompt="$1"
  local current_estimate="$2"

  # Determine weight based on prompt length
  local prompt_length=${#prompt}
  local weight

  if [ "$prompt_length" -lt 500 ]; then
    weight="$WEIGHT_LIGHT"
  elif [ "$prompt_length" -lt 2000 ]; then
    weight="$WEIGHT_MEDIUM"
  else
    weight="$WEIGHT_HEAVY"
  fi

  # Add weight to current estimate
  local new_estimate
  new_estimate=$(calc "$current_estimate + $weight")

  echo "$new_estimate"
}

# Initialize tracking variables
TOKEN_ESTIMATE=""
CACHE_READ_TOKENS=""
NEW_CONSECUTIVE_FAILURES="$CONSECUTIVE_FAILURES"
NEW_TRACKING_METHOD="$TRACKING_METHOD"

# Try deterministic tracking first (unless already in permanent fallback)
if [ "$TRACKING_METHOD" != "fallback_permanent" ]; then
  # Use || true to prevent set -e from exiting on function failure
  CACHE_READ_TOKENS=$(read_transcript_usage "$TRANSCRIPT_PATH" || echo "")

  # SEC-1: numeric guard before CACHE_READ_TOKENS enters awk arithmetic via calc().
  # Mirrors the CW_FROM_STATE numeric guard at the contextWindow loader above.
  # If the transcript field is ever non-numeric (e.g. malformed token-count
  # serialization), drop it rather than letting it interpolate into the awk
  # program string.
  if [ -n "$CACHE_READ_TOKENS" ] && ! [[ "$CACHE_READ_TOKENS" =~ ^[0-9]+$ ]]; then
    CACHE_READ_TOKENS=""
  fi

  if [ -n "$CACHE_READ_TOKENS" ] && [ "$CACHE_READ_TOKENS" != "" ]; then
    # Observed-max heuristic (R3.4): if cache_read exceeds current window, bump to 1M
    if [ "$CACHE_READ_TOKENS" -gt "$CONTEXT_WINDOW" ] 2>/dev/null; then
      CONTEXT_WINDOW=1000000
      # Update session.json with observed source
      jq --argjson size 1000000 --arg ts "$(date -Iseconds)" \
        '.contextWindow = {size: $size, source: "observed", detectedModel: (.contextWindow.detectedModel // null), lastUpdated: $ts}' \
        "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && mv "${STATE_FILE}.tmp" "$STATE_FILE" || true
    fi
    # Success! Calculate percentage from actual tokens
    TOKEN_ESTIMATE=$(calc "$CACHE_READ_TOKENS / $CONTEXT_WINDOW")
    NEW_CONSECUTIVE_FAILURES=0
    NEW_TRACKING_METHOD="deterministic"
  else
    # Failed to read transcript
    NEW_CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))

    if [ "$NEW_CONSECUTIVE_FAILURES" -ge "$MAX_CONSECUTIVE_FAILURES" ]; then
      # Switch to permanent fallback mode
      NEW_TRACKING_METHOD="fallback_permanent"
    else
      NEW_TRACKING_METHOD="fallback_temporary"
    fi
  fi
fi

# Use weighted fallback if deterministic failed
if [ -z "$TOKEN_ESTIMATE" ]; then
  # Get previous estimate from state
  PREVIOUS_ESTIMATE=$(echo "$CURRENT_STATE" | jq -r '.tokenUsage.estimate // 0')
  TOKEN_ESTIMATE=$(calculate_weighted_fallback "$PROMPT" "$PREVIOUS_ESTIMATE")
fi

# Ensure estimate doesn't exceed 1.0
if float_gt "$TOKEN_ESTIMATE" "1.0"; then
  TOKEN_ESTIMATE="1.0"
fi

# Get current timestamp
TIMESTAMP=$(date -Iseconds)

# Determine if we need to show a warning
CONTEXT_MSG=""
NEW_WARNING_SHOWN="$WARNING_SHOWN"
NEW_CRITICAL_SHOWN="$CRITICAL_SHOWN"
NEW_EMERGENCY_SHOWN="$EMERGENCY_SHOWN"

# Check thresholds (in order of severity)
if float_gte "$TOKEN_ESTIMATE" "$EMERGENCY_THRESHOLD" && [ "$EMERGENCY_SHOWN" = "false" ]; then
  PERCENTAGE=$(awk "BEGIN { printf \"%.0f\", $TOKEN_ESTIMATE * 100 }")
  CONTEXT_MSG="⚠️ [CLEAR] EMERGENCY: Token usage at ${PERCENTAGE}%
Stop new work immediately. Save state now.
Session ${SESSION_NUMBER} - ${NEW_PROMPT_COUNT} prompts"
  NEW_EMERGENCY_SHOWN="true"

elif float_gte "$TOKEN_ESTIMATE" "$CRITICAL_THRESHOLD" && [ "$CRITICAL_SHOWN" = "false" ]; then
  PERCENTAGE=$(awk "BEGIN { printf \"%.0f\", $TOKEN_ESTIMATE * 100 }")
  CONTEXT_MSG="⚠️ [CLEAR] TOKEN LIMIT APPROACHING (${PERCENTAGE}%)
Handoff preparation triggered. Complete current task and document progress.
Session ${SESSION_NUMBER} - ${NEW_PROMPT_COUNT} prompts"
  NEW_CRITICAL_SHOWN="true"

  # Trigger handoff preparation if not already done
  if [ "$HANDOFF_PREPARED" = "false" ]; then
    if [ -x "${SCRIPT_DIR}/session-handoff.sh" ]; then
      echo "$INPUT" | "${SCRIPT_DIR}/session-handoff.sh" > /dev/null 2>&1 &
    fi
  fi

elif float_gte "$TOKEN_ESTIMATE" "$WARNING_THRESHOLD" && [ "$WARNING_SHOWN" = "false" ]; then
  PERCENTAGE=$(awk "BEGIN { printf \"%.0f\", $TOKEN_ESTIMATE * 100 }")
  CONTEXT_MSG="📊 [CLEAR] Token usage at ${PERCENTAGE}%
Consider completing current task and preparing for handoff.
Session ${SESSION_NUMBER} - ${NEW_PROMPT_COUNT} prompts"
  NEW_WARNING_SHOWN="true"
fi

# Update session state with new tracking fields
CACHE_READ_FOR_STATE="${CACHE_READ_TOKENS:-0}"
jq --arg ts "$TIMESTAMP" \
   --argjson promptCount "$NEW_PROMPT_COUNT" \
   --arg estimate "$TOKEN_ESTIMATE" \
   --arg method "$NEW_TRACKING_METHOD" \
   --argjson failures "$NEW_CONSECUTIVE_FAILURES" \
   --argjson cacheRead "$CACHE_READ_FOR_STATE" \
   --argjson warnShown "$NEW_WARNING_SHOWN" \
   --argjson critShown "$NEW_CRITICAL_SHOWN" \
   --argjson emergShown "$NEW_EMERGENCY_SHOWN" \
   '.lastActivity = $ts |
    .tokenUsage.promptCount = $promptCount |
    .tokenUsage.estimate = ($estimate | tonumber) |
    .tokenUsage.method = $method |
    .tokenUsage.consecutiveFailures = $failures |
    .tokenUsage.cacheReadTokens = $cacheRead |
    .tokenUsage.warningShown = $warnShown |
    .tokenUsage.criticalShown = $critShown |
    .tokenUsage.emergencyShown = $emergShown' \
   "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"

# WP-DF3 AC5 (S167 G3 fix): keep sync-state.session.tokensUsed fresh as token
# usage updates. session-init covers id/number/status at lifecycle start;
# this op covers the running token count for downstream consumers
# (POST-53 dashboard token budget bar, /cf-status, etc.).
SYNC_BRIDGE="${SCRIPTS_DIR}/sync/sync-bridge.sh"
if [ -x "$SYNC_BRIDGE" ]; then
  # Absolute token count = estimate × contextWindow size. Cast to integer
  # since SessionSummary.tokensUsed is `number` (no fractional tokens).
  TOKENS_USED=$(calc "$TOKEN_ESTIMATE * $CONTEXT_WINDOW" 2>/dev/null || echo "0")
  TOKENS_USED_INT="${TOKENS_USED%.*}"
  # STD-006: stricter numeric guard than the simple empty-check.
  # Any non-digit content (e.g. unexpected calc/awk output) collapses to 0
  # rather than passing through to jq --argjson where it would error.
  if ! [[ "$TOKENS_USED_INT" =~ ^[0-9]+$ ]]; then
    TOKENS_USED_INT=0
  fi
  SESSION_DATA=$(jq -nc \
    --argjson tokens "$TOKENS_USED_INT" \
    '{tokensUsed: $tokens}' 2>/dev/null) || SESSION_DATA=""
  if [ -n "$SESSION_DATA" ]; then
    "$SYNC_BRIDGE" --op=update-session --clear-dir="$CWD" --data="$SESSION_DATA" \
      >/dev/null 2>>"$HOOK_ERROR_LOG" || true
  fi
fi

# Return JSON response
if [ -n "$CONTEXT_MSG" ]; then
  jq -n \
    --arg context "$CONTEXT_MSG" \
    --arg estimate "$TOKEN_ESTIMATE" \
    --arg method "$NEW_TRACKING_METHOD" \
    --argjson promptCount "$NEW_PROMPT_COUNT" \
    '{
      "additionalContext": $context,
      "tokenEstimate": ($estimate | tonumber),
      "trackingMethod": $method,
      "promptCount": $promptCount,
      "status": "threshold_crossed"
    }'
else
  # No context message - return minimal response
  jq -n \
    --arg estimate "$TOKEN_ESTIMATE" \
    --arg method "$NEW_TRACKING_METHOD" \
    --argjson promptCount "$NEW_PROMPT_COUNT" \
    '{
      "tokenEstimate": ($estimate | tonumber),
      "trackingMethod": $method,
      "promptCount": $promptCount,
      "status": "ok"
    }'
fi

exit 0
