#!/bin/bash
# user-prompt.sh - Dispatcher for UserPromptSubmit event
#
# Calls domain scripts in sequence for monitoring and progress tracking.
# Input: JSON via stdin
# Output: Aggregated JSON with additionalContext from all scripts

export SCRIPT_NAME="user-prompt"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

# Read input once, pass to all scripts
INPUT=$(cat)

# Redirect logs to project directory
CWD=$(canonicalize_cwd "$(echo "$INPUT" | jq -r '.cwd // "."')")

# WP-CI1: skip on uninitialized projects.
require_clear_initialized "$CWD" || { echo '{}'; exit 0; }

use_project_logs "$CWD"

# Initialize results array
declare -a RESULTS=()

# Call scripts in sequence
# Order: session monitoring, knowledge search, knowledge capture, workpackage, plan
for script in \
  "${SCRIPTS_DIR}/session/session-monitor.sh" \
  "${SCRIPTS_DIR}/knowledge/knowledge-search.sh" \
  "${SCRIPTS_DIR}/knowledge/knowledge-capture.sh" \
  "${SCRIPTS_DIR}/workpackage/workpackage-progress.sh" \
  "${SCRIPTS_DIR}/plan/plan-progress.sh"
do
  if [ -x "$script" ]; then
    RESULT=$(echo "$INPUT" | "$script" 2>>"$HOOK_ERROR_LOG" || echo '{"status":"error"}')
    RESULTS+=("$RESULT")
  fi
done

# --- Sync-bridge: update knowledge summary if capture occurred ---
# RESULTS[2] corresponds to knowledge-capture.sh (3rd script in loop)
SYNC_BRIDGE="${SCRIPTS_DIR}/sync/sync-bridge.sh"
if [ -x "$SYNC_BRIDGE" ] && [ "${#RESULTS[@]}" -ge 3 ]; then
  CAPTURE_RESULT="${RESULTS[2]}"
  CAPTURE_ENTRY=$(echo "$CAPTURE_RESULT" | jq -r '.entryId // empty' 2>/dev/null) || true
  if [ -n "$CAPTURE_ENTRY" ]; then
    KNOWLEDGE_DATA=$(jq -n --arg eid "$CAPTURE_ENTRY" '{entryId: $eid}')
    "$SYNC_BRIDGE" --op=update-knowledge --clear-dir="$CWD" --data="$KNOWLEDGE_DATA" >/dev/null 2>>"$HOOK_ERROR_LOG" || true
  fi
fi

# Aggregate context from all scripts (only include non-empty contexts)
CONTEXT=""
for result in "${RESULTS[@]}"; do
  SCRIPT_CONTEXT=$(echo "$result" | jq -r '.additionalContext // empty' 2>>"$HOOK_ERROR_LOG")
  if [ -n "$SCRIPT_CONTEXT" ]; then
    if [ -n "$CONTEXT" ]; then
      CONTEXT="${CONTEXT}\n${SCRIPT_CONTEXT}"
    else
      CONTEXT="$SCRIPT_CONTEXT"
    fi
  fi
done

# Return aggregated response (only include additionalContext if we have content)
if [ -n "$CONTEXT" ]; then
  jq -n --arg context "$CONTEXT" '{
    "additionalContext": $context,
    "status": "success",
    "dispatcher": "user-prompt"
  }'
else
  cat << 'EOF'
{
  "status": "success",
  "dispatcher": "user-prompt"
}
EOF
fi
