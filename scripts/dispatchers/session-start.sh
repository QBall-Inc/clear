#!/bin/bash
# session-start.sh - Smart Context Reload Dispatcher
#
# Implements source-aware reload logic per P2.1 Feature Brief Section 7.
# Reads 'source' field from stdin JSON to decide whether to reload context.
#
# Source values:
#   - startup: Normal session start - always reload
#   - resume: /resume command - skip if same session active
#   - clear: After /clear - context wiped, must reload
#   - compact: After compaction - context compressed, must reload
#
# Input: JSON via stdin with session_id, source, cwd, transcript_path
# Output: Aggregated JSON with additionalContext from all scripts

export SCRIPT_NAME="session-start"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

# Read input once
INPUT=$(cat)

# Extract fields from input JSON
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')

# Redirect logs to project directory
use_project_logs "$CWD"

# Log entry for traceability
HOOKS_LOG_FILE="${LOG_DIR}/hooks.log"
echo "[$(date -Iseconds)] SessionStart: source=${SOURCE}, session_id=${SESSION_ID}" >> "$HOOKS_LOG_FILE"

# ==============================================================================
# ACCUMULATOR CLEANUP (R2 B1)
# ==============================================================================
# Delete stale changed-files.json on startup/resume/clear (cache, not source of truth).
# Preserve on compact (mid-session, accumulator is current).
ACCUMULATOR_FILE="${CWD}/.clear/state/changed-files.json"
case "$SOURCE" in
  "startup"|"resume"|"clear")
    if [ -f "$ACCUMULATOR_FILE" ]; then
      # Validate JSON; delete if malformed (it's a cache)
      if ! jq -e '.' "$ACCUMULATOR_FILE" >/dev/null 2>&1; then
        log "Malformed accumulator — deleting"
      fi
      rm -f "$ACCUMULATOR_FILE"
    fi
    ;;
  "compact")
    # Preserve — accumulator is current mid-session
    ;;
esac

# ==============================================================================
# LOG ROTATION (R2 B1)
# ==============================================================================
# Truncate hooks.log if over 100KB to prevent unbounded growth.
HOOKS_LOG_FILE="${CWD}/.clear/audit/hooks.log"
MAX_LOG_SIZE=102400
if [ -f "$HOOKS_LOG_FILE" ]; then
  LOG_SIZE=$(stat -c%s "$HOOKS_LOG_FILE" 2>/dev/null || echo 0)
  if [ "$LOG_SIZE" -gt "$MAX_LOG_SIZE" ]; then
    # Keep last 50 lines, discard the rest
    tail -50 "$HOOKS_LOG_FILE" > "${HOOKS_LOG_FILE}.tmp" && mv "${HOOKS_LOG_FILE}.tmp" "$HOOKS_LOG_FILE"
  fi
fi

# ==============================================================================
# MARKER FILE CHECK (R2 B1 — inlined from WP-R2.3)
# ==============================================================================
MARKER_FILE="${CWD}/.clear/initialized"
if [ -d "${CWD}/.clear" ] && [ ! -f "$MARKER_FILE" ]; then
  touch "$MARKER_FILE"
fi

# State file location
STATE_FILE="${CWD}/.clear/state/session.json"

# Read previous session state if exists
PREV_SESSION_ID=""
PREV_STATUS=""

if [ -f "$STATE_FILE" ]; then
  PREV_SESSION_ID=$(jq -r '.sessionId // ""' "$STATE_FILE" 2>>"$HOOK_ERROR_LOG" || echo "")
  PREV_STATUS=$(jq -r '.status // ""' "$STATE_FILE" 2>>"$HOOK_ERROR_LOG" || echo "")
fi

# ==============================================================================
# SMART RELOAD DECISION LOGIC (Section 7.3)
# ==============================================================================

RELOAD_CONTEXT=true
UPDATE_INIT_SESSION=false

case "$SOURCE" in
  "startup")
    # New session - always reload
    RELOAD_CONTEXT=true
    ;;
  "resume")
    # Resume - skip reload if same session still active
    if [ "$PREV_SESSION_ID" = "$SESSION_ID" ] && [ "$PREV_STATUS" = "active" ]; then
      RELOAD_CONTEXT=false
    fi
    ;;
  "clear")
    # After /clear - context wiped, must reload
    RELOAD_CONTEXT=true
    ;;
  "compact")
    # After compaction - context compressed, must reload
    RELOAD_CONTEXT=true
    ;;
  *)
    # Unknown source - default to reload
    RELOAD_CONTEXT=true
    ;;
esac

# Handle init session (Session 0) upgrade
if [[ "$PREV_SESSION_ID" == init-* ]] && [ "$PREV_STATUS" = "initializing" ]; then
  # First real SessionStart after /cf-init
  # Update Session 0 with real session ID
  UPDATE_INIT_SESSION=true
  RELOAD_CONTEXT=true
fi

# ==============================================================================
# CLEAR_PLUGIN_ROOT PERSISTENCE (R7.1)
# ==============================================================================
# CLAUDE_PLUGIN_ROOT is set by the harness per-plugin, but NOT exported to
# Claude's Bash environment. Persist as CLEAR_PLUGIN_ROOT in project
# settings.json so it's available in all Bash calls.
# Runs unconditionally (idempotent — skips if already correct).
SETTINGS_FILE="${CWD}/.claude/settings.json"
# Guard: both paths must be absolute to prevent traversal
if [ -n "$PLUGIN_ROOT" ] && [ -d "${CWD}/.claude" ] && [[ "$CWD" == /* ]] && [[ "$PLUGIN_ROOT" == /* ]]; then
  CURRENT_VALUE=""
  if [ -f "$SETTINGS_FILE" ]; then
    CURRENT_VALUE=$(jq -r '.env.CLEAR_PLUGIN_ROOT // ""' "$SETTINGS_FILE" 2>/dev/null || echo "")
  fi
  if [ "$CURRENT_VALUE" != "$PLUGIN_ROOT" ]; then
    if [ -f "$SETTINGS_FILE" ]; then
      jq --arg root "$PLUGIN_ROOT" '.env.CLEAR_PLUGIN_ROOT = $root' \
        "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
    else
      # Use jq --arg to avoid shell interpolation injection
      jq -n --arg root "$PLUGIN_ROOT" '{"env":{"CLEAR_PLUGIN_ROOT":$root}}' > "$SETTINGS_FILE"
    fi
    echo "[$(date -Iseconds)] CLEAR_PLUGIN_ROOT persisted: ${PLUGIN_ROOT}" >> "$HOOKS_LOG_FILE"
  fi
fi

# ==============================================================================
# EXECUTE BASED ON DECISION
# ==============================================================================

if [ "$RELOAD_CONTEXT" = "true" ]; then
  # Initialize results array
  declare -a RESULTS=()

  # Update init session if needed
  if [ "$UPDATE_INIT_SESSION" = "true" ] && [ -f "$STATE_FILE" ]; then
    # Upgrade Session 0: update sessionId and status
    jq --arg sid "$SESSION_ID" --arg ts "$(date -Iseconds)" \
       '.sessionId = $sid | .status = "active" | .lastActivity = $ts' \
       "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
  fi

  # --- Sync-bridge: load sync-state as primary context source ---
  SYNC_BRIDGE="${SCRIPTS_DIR}/sync/sync-bridge.sh"
  if [ -x "$SYNC_BRIDGE" ]; then
    "$SYNC_BRIDGE" --op=load --clear-dir="$CWD" >/dev/null 2>>"$HOOK_ERROR_LOG" || true
  fi

  # Call scripts in sequence
  for script in \
    "${SCRIPTS_DIR}/session/session-init.sh" \
    "${SCRIPTS_DIR}/knowledge/knowledge-load.sh" \
    "${SCRIPTS_DIR}/workpackage/workpackage-load.sh" \
    "${SCRIPTS_DIR}/plan/plan-load.sh"
  do
    if [ -x "$script" ]; then
      RESULT=$(echo "$INPUT" | "$script" 2>>"$HOOK_ERROR_LOG" || echo '{"status":"error"}')
      RESULTS+=("$RESULT")
    fi
  done

  # --- Sync-bridge: reconciliation (knowledge links + plan/WP state drift) ---
  if [ -x "$SYNC_BRIDGE" ]; then
    "$SYNC_BRIDGE" --op=reconcile --clear-dir="$CWD" >/dev/null 2>>"$HOOK_ERROR_LOG" || true
    "$SYNC_BRIDGE" --op=reconcile-plan --clear-dir="$CWD" >/dev/null 2>>"$HOOK_ERROR_LOG" || true
  fi

  # --- Deprecation warnings: surface deprecatedReferences from sync-state ---
  SYNC_STATE_FILE="${CWD}/.clear/state/sync-state.json"
  DEPRECATION_WARNING=""
  if [ -f "$SYNC_STATE_FILE" ]; then
    DEPRECATED_REFS=$(jq -r '.knowledge.deprecatedReferences // [] | if length > 0 then .[] else empty end' "$SYNC_STATE_FILE" 2>/dev/null)
    if [ -n "$DEPRECATED_REFS" ]; then
      DEPRECATION_WARNING="**Deprecation Warning:** The following knowledge entries have stale references and may need review:"
      while IFS= read -r ref_id; do
        DEPRECATION_WARNING="${DEPRECATION_WARNING}
  - ${ref_id}"
      done <<< "$DEPRECATED_REFS"
      DEPRECATION_WARNING="${DEPRECATION_WARNING}
Run \`/cf-knowledge show <id>\` to inspect, or \`/cf-knowledge supersede\` to update."
    fi
  fi

  # Output banner as raw text (Bulwark pattern — raw stdout is displayed to user)
  PROJECT_NAME=$(basename "$CWD")
  SESSION_NUM=""
  if [ -f "$STATE_FILE" ]; then
    SESSION_NUM=$(jq -r '.clearSessionNumber // ""' "$STATE_FILE" 2>/dev/null || echo "")
  fi
  SESSION_LABEL=""
  if [ -n "$SESSION_NUM" ]; then
    SESSION_LABEL=" | Session: ${SESSION_NUM}"
  fi

  # --- Collect session context from scripts ---
  SESSION_CONTEXT=""
  for result in "${RESULTS[@]}"; do
    SCRIPT_CONTEXT=$(echo "$result" | jq -r '.additionalContext // empty' 2>>"$HOOK_ERROR_LOG")
    if [ -n "$SCRIPT_CONTEXT" ]; then
      if [ -n "$SESSION_CONTEXT" ]; then
        SESSION_CONTEXT="${SESSION_CONTEXT}
${SCRIPT_CONTEXT}"
      else
        SESSION_CONTEXT="$SCRIPT_CONTEXT"
      fi
    fi
  done

  # --- DISPLAY DIRECTIVE (Bulwark pattern) ---
  echo "**DISPLAY TO USER**: When you receive this context, IMMEDIATELY output EVERYTHING between the START and END markers below exactly as shown, before doing ANYTHING else. This is NOT optional. Do NOT silently consume this. Do NOT search files first. Display it, then respond to the user."
  echo ""
  echo "--- START DISPLAY ---"
  echo ""
  echo '```'
  echo "═══════════════════════════════════════════════════════════════"
  echo "  CLEAR FRAMEWORK - CONTEXT LOADED"
  echo "  Project: ${PROJECT_NAME}${SESSION_LABEL}"
  echo "═══════════════════════════════════════════════════════════════"
  echo '```'
  echo ""
  if [ -n "$SESSION_CONTEXT" ]; then
    echo "$SESSION_CONTEXT"
    echo ""
  fi
  if [ -n "$DEPRECATION_WARNING" ]; then
    echo "$DEPRECATION_WARNING"
    echo ""
  fi
  echo "--- END DISPLAY ---"
  echo ""
  echo "## Session Operating Instructions"
  echo ""
  echo "- All CLEAR session state has been loaded above. Do NOT run /cf-reload."
  echo "- Do NOT search the codebase or read files to determine what to work on — the active workpackage and plan state above tell you everything."
  echo "- If an active workpackage is shown above, read its YAML file at .clear/workpackages/<WP-ID>.yaml for acceptance criteria and deliverables, then begin work."
  echo "- If a workpackage shows 100% progress, offer to mark it complete and advance to the next workpackage."
  echo "- If the user asks 'where did we leave off' or 'what are we working on', answer from the context above — do not search."
  echo "- All CLEAR CLIs support \`--help\` for usage and flag reference. Run \`--help\` before guessing CLI interfaces from source code."
else
  # Skip reload - just update activity timestamp
  if [ -f "$STATE_FILE" ]; then
    jq --arg ts "$(date -Iseconds)" '.lastActivity = $ts' \
       "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
  fi

  # Output minimal context as raw text
  echo "[CLEAR] Session resumed (context preserved)"
fi
