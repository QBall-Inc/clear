#!/bin/bash
# session-end.sh - Dispatcher for SessionEnd event
#
# Delegates to session-finalize.sh for session cleanup.
# SessionEnd replaces Stop as the finalization trigger (R2 B1).
#
# Input: JSON via stdin with session_id, cwd
# Output: Text/JSON to stdout (additionalContext for Claude's context)

export SCRIPT_NAME="session-end"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

# Read input
INPUT=$(cat)

# --- Kill switches (global + per-hook) ---
if [ "${CLEAR_HOOKS_ENABLED:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi
if [ "${CLEAR_SESSIONEND_ENABLED:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi

# Redirect logs to project directory
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
use_project_logs "$CWD"

# Delegate to session-finalize (capture output for logging, don't pollute stdout)
FINALIZE_STATUS="skipped"
SCRIPT="${SCRIPTS_DIR}/session/session-finalize.sh"
if [ -x "$SCRIPT" ]; then
  FINALIZE_RESULT=$(echo "$INPUT" | "$SCRIPT" 2>>"$HOOK_ERROR_LOG" || echo '{"status":"error"}')
  FINALIZE_STATUS=$(echo "$FINALIZE_RESULT" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
  echo "[$(date -Iseconds)] SessionEnd finalize: $FINALIZE_STATUS" >> "${LOG_DIR}/hooks.log"
else
  FINALIZE_STATUS="not-executable"
  echo "[$(date -Iseconds)] SessionEnd: session-finalize.sh not executable" >> "${LOG_DIR}/hooks.log"
fi

# --- Smoke test banner (R2 B1 gate) ---
# Output visible text to stdout — Claude Code captures this as additionalContext.
# This proves the SessionEnd → additionalContext injection mechanism works.
echo "═══════════════════════════════════════════════════════════════"
echo "  CLEAR SESSION END - HOOK ACTIVE"
echo "  Finalization status: ${FINALIZE_STATUS}"
echo "═══════════════════════════════════════════════════════════════"

exit 0
