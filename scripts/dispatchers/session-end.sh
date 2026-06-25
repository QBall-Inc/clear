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

# Extract CWD (canonicalized for symlink-resolution consistency with the other
# dispatchers per WP-CI1 cross-role review finding).
CWD=$(canonicalize_cwd "$(echo "$INPUT" | jq -r '.cwd // "."')")

# WP-CI1: skip on uninitialized projects. Placed BEFORE kill switches to match
# the uniform guard-first ordering of the other 5 dispatchers (per WP-CI1
# review STD-02 + ARCH-01 — the original order had kill switches first).
require_clear_initialized "$CWD" || { echo '{}'; exit 0; }

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
use_project_logs "$CWD"

# Delegate to session-finalize (capture output for logging, don't pollute stdout)
SCRIPT="${SCRIPTS_DIR}/session/session-finalize.sh"
if [ -x "$SCRIPT" ]; then
  FINALIZE_RESULT=$(echo "$INPUT" | "$SCRIPT" 2>>"$HOOK_ERROR_LOG" || echo '{"status":"error"}')
  FINALIZE_STATUS=$(echo "$FINALIZE_RESULT" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
  echo "[$(date -Iseconds)] SessionEnd finalize: $FINALIZE_STATUS" >> "${LOG_DIR}/hooks.log"
else
  echo "[$(date -Iseconds)] SessionEnd finalize: not-executable (session-finalize.sh missing or not +x)" >> "${LOG_DIR}/hooks.log"
fi

exit 0
