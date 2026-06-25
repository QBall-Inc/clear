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
CWD=$(canonicalize_cwd "$(echo "$INPUT" | jq -r '.cwd // "."')")

# WP-CI1: skip on uninitialized projects (no manifest). Halts execution before
# sub-script chain (session-init.sh, sync-bridge.sh) runs, preventing state-dir
# creation on hook fire.
require_clear_initialized "$CWD" || exit 0

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
# CLEAR_PLUGIN_ROOT PERSISTENCE (R7.1; WP-SS5 authoritative re-pin)
# ==============================================================================
# CLAUDE_PLUGIN_ROOT is set by the harness per-plugin, but NOT exported to
# Claude's Bash environment. Persist as CLEAR_PLUGIN_ROOT in project
# settings.json so it's available in all Bash calls.
# Runs unconditionally (idempotent — skips if already correct).
#
# WP-SS5 (Layer A — non-sticky pin): the comparison + persisted value use the
# per-launch harness truth ${CLAUDE_PLUGIN_ROOT} directly (NOT the common.sh
# PLUGIN_ROOT, which historically read CLEAR-first and let a stale pin poison
# its own staleness check). A --plugin-dir relaunch now ALWAYS corrects a stale
# pin: CLAUDE_PLUGIN_ROOT reflects the actually-loaded plugin, so a mismatched
# settings.json value is overwritten. Fall back to PLUGIN_ROOT (common.sh
# self-anchor, Layer B) only if CLAUDE_PLUGIN_ROOT is somehow unset.
AUTHORITATIVE_ROOT="${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT}"
SETTINGS_FILE="${CWD}/.claude/settings.json"
# Guard: both paths must be absolute to prevent traversal
if [ -n "$AUTHORITATIVE_ROOT" ] && [ -d "${CWD}/.claude" ] && [[ "$CWD" == /* ]] && [[ "$AUTHORITATIVE_ROOT" == /* ]]; then
  CURRENT_VALUE=""
  if [ -f "$SETTINGS_FILE" ]; then
    CURRENT_VALUE=$(jq -r '.env.CLEAR_PLUGIN_ROOT // ""' "$SETTINGS_FILE" 2>/dev/null || echo "")
  fi
  if [ "$CURRENT_VALUE" != "$AUTHORITATIVE_ROOT" ]; then
    if [ -f "$SETTINGS_FILE" ]; then
      jq --arg root "$AUTHORITATIVE_ROOT" '.env.CLEAR_PLUGIN_ROOT = $root' \
        "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
    else
      # Use jq --arg to avoid shell interpolation injection
      jq -n --arg root "$AUTHORITATIVE_ROOT" '{"env":{"CLEAR_PLUGIN_ROOT":$root}}' > "$SETTINGS_FILE"
    fi
    echo "[$(date -Iseconds)] CLEAR_PLUGIN_ROOT persisted: ${AUTHORITATIVE_ROOT}" >> "$HOOKS_LOG_FILE"
  fi
fi

# ==============================================================================
# KNOWLEDGE NATIVE-MODULE SELF-HEAL
# ==============================================================================
# Self-heal the plugin-level better-sqlite3 native binding on every session start.
# Runs UNCONDITIONALLY (outside the RELOAD_CONTEXT gate) because the binding lives
# in the PLUGIN tree, not the consumer's .clear/ — it is plugin-level state
# independent of whether consumer context is being reloaded. A resume that skips
# reload can still be the FIRST session after a plugin restage, a WSL2<->Windows
# ABI switch, or a Node version bump — any of which leaves the binding missing or
# wrong-ABI and silently degrades the knowledge system to file-fallback (no search,
# no tfidf) until a manual reinit. Healing here recovers existing projects
# automatically. Idempotent: a fast no-op when the binding already loads; the
# bounded download/rebuild fires only when the binding is genuinely broken.
# Targets AUTHORITATIVE_ROOT (the actually-loaded plugin tree, not a stale pin).
# Non-fatal: `|| true` ensures the heal never aborts session start.
BOOTSTRAP_CLI_JS="${PLUGIN_ROOT}/build/infrastructure/init/cli/sqlite-bootstrap-cli.js"
if [ -n "$AUTHORITATIVE_ROOT" ] && [[ "$AUTHORITATIVE_ROOT" == /* ]] && [ -f "$BOOTSTRAP_CLI_JS" ]; then
  node "$BOOTSTRAP_CLI_JS" --plugin-root="$AUTHORITATIVE_ROOT" >/dev/null 2>>"$HOOK_ERROR_LOG" || true
fi

# ==============================================================================
# EXECUTE BASED ON DECISION
# ==============================================================================

if [ "$RELOAD_CONTEXT" = "true" ]; then
  # WP-PS4 S192 SYNTH-SEC-002: enforce absolute CWD for all CLI invocations that
  # use "${CWD}/.clear" paths. canonicalize_cwd normally returns an absolute path
  # via `pwd -P`, but falls back to the input on cd failure. Without this guard,
  # a relative cwd would direct the dashboard/warnings/pending-reviews CLIs to
  # an unintended .clear directory. Same pattern as the absolute-CWD guard on the
  # CLEAR_PLUGIN_ROOT persistence block above; lifted here so it covers every
  # consumer-CLI invocation that follows.
  if [[ "$CWD" != /* ]]; then
    echo "[$(date -Iseconds)] SessionStart: skipped reload — cwd is not absolute: $CWD" >> "$HOOKS_LOG_FILE"
    echo "[CLEAR] WARNING: cwd '$CWD' is not absolute; skipping context reload." >&2
    exit 0
  fi

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

  # Call scripts in sequence.
  # WP-PS4 AC1: session-init last so its bulky handoff body doesn't crowd
  # the inline-budget headroom before the structured carry-over signals.
  for script in \
    "${SCRIPTS_DIR}/workpackage/workpackage-load.sh" \
    "${SCRIPTS_DIR}/plan/plan-load.sh" \
    "${SCRIPTS_DIR}/knowledge/knowledge-load.sh" \
    "${SCRIPTS_DIR}/session/session-init.sh"
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
    # reconcile-knowledge runs LAST: auto-heal the denormalized knowledge cache
    # (recentEntries + workpackageKnowledge links) by rebuilding it from the DB,
    # so the startup dashboard never renders a stale-empty "Recent Knowledge"
    # panel when the projection drifted (cold-start / import / unpropagated
    # capture). DB-canonical rebuild is authoritative, so it runs after the
    # in-memory reconcile passes above; idempotent no-op when already coherent.
    "$SYNC_BRIDGE" --op=reconcile-knowledge --clear-dir="$CWD" >/dev/null 2>>"$HOOK_ERROR_LOG" || true
  fi

  # --- Deprecation warnings (K2.7): surface only ACTIONABLE warnings via Node CLI ---
  # Filters out superseded, reviewed, and orphan entries (defense-in-depth after
  # eager-drain paths in supersede/delete/deprecate/dismiss CLIs).
  DEPRECATION_WARNING=""
  WARNINGS_CLI_JS="${PLUGIN_ROOT}/build/infrastructure/knowledge/cli/warnings-cli.js"
  WARNINGS_CLI_TS="${PLUGIN_ROOT}/src/infrastructure/knowledge/cli/warnings-cli.ts"
  if [ -f "$WARNINGS_CLI_JS" ]; then
    DEPRECATION_WARNING=$(node "$WARNINGS_CLI_JS" --clear-dir="${CWD}/.clear" 2>>"$HOOK_ERROR_LOG" || true)
  elif [ -f "$WARNINGS_CLI_TS" ]; then
    DEPRECATION_WARNING=$(cd "$PLUGIN_ROOT" && npx ts-node "$WARNINGS_CLI_TS" --clear-dir="${CWD}/.clear" 2>>"$HOOK_ERROR_LOG" || true)
  fi

  # --- Pending-reviews carry-over (K2.7 P5): surface unactioned PostToolUse flags ---
  # pending-reviews.json is appended by post-tool.sh on Level A/B surfaces and
  # eager-drained by dismiss/supersede/capture/delete CLIs. This CLI applies a
  # lazy file-existence filter on read.
  PENDING_REVIEWS_WARNING=""
  PENDING_CLI_JS="${PLUGIN_ROOT}/build/infrastructure/knowledge/cli/pending-reviews-cli.js"
  PENDING_CLI_TS="${PLUGIN_ROOT}/src/infrastructure/knowledge/cli/pending-reviews-cli.ts"
  if [ -f "$PENDING_CLI_JS" ]; then
    PENDING_REVIEWS_WARNING=$(node "$PENDING_CLI_JS" --clear-dir="${CWD}/.clear" 2>>"$HOOK_ERROR_LOG" || true)
  elif [ -f "$PENDING_CLI_TS" ]; then
    PENDING_REVIEWS_WARNING=$(cd "$PLUGIN_ROOT" && npx ts-node "$PENDING_CLI_TS" --clear-dir="${CWD}/.clear" 2>>"$HOOK_ERROR_LOG" || true)
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

  # --- Split sub-script outputs by zone (WP-PS4 S192 AD-01) ---
  # Two-zone architecture: Zone 1 (DISPLAY TO USER, inside START/END block) for
  # user-facing curated surfaces; Zone 2 (Claude developer reference, after END
  # DISPLAY) for implementation-perspective detail the user does not need to see.
  #
  # Routing contract — sub-scripts MUST emit a "script" field in their JSON output
  # (workpackage-load, plan-load, knowledge-load, session-init all do). The case
  # below routes each to the appropriate zone explicitly; any future sub-script
  # without a matching case lands in Zone 2 via the wildcard.
  ZONE_1_CONTEXT=""
  ZONE_2_CONTEXT=""
  for result in "${RESULTS[@]}"; do
    SCRIPT_NAME_FIELD=$(echo "$result" | jq -r '.script // ""' 2>>"$HOOK_ERROR_LOG" || true)
    SCRIPT_CONTEXT=$(echo "$result" | jq -r '.additionalContext // ""' 2>>"$HOOK_ERROR_LOG" || true)
    if [ -n "$SCRIPT_CONTEXT" ]; then
      case "$SCRIPT_NAME_FIELD" in
        knowledge-load)
          # Zone 1 — loaded knowledge entries are user-facing curated surface
          ZONE_1_CONTEXT+="${ZONE_1_CONTEXT:+$'\n'}${SCRIPT_CONTEXT}"
          ;;
        workpackage-load|plan-load|session-init|*)
          # Zone 2 — developer-perspective detail
          ZONE_2_CONTEXT+="${ZONE_2_CONTEXT:+$'\n'}${SCRIPT_CONTEXT}"
          ;;
      esac
    fi
  done

  # --- Render dashboard at dispatcher level (WP-PS4 S192 AD-01) ---
  # Moved from session-init.sh per s192_corrected_plan. Dashboard must be the
  # FIRST user-visible block after banner so Claude doesn't perceive it as
  # decorative (S191 dogfood failure mode in tracker-Claude S28).
  # Non-fatal: any failure leaves DASHBOARD_OUTPUT empty.
  DASHBOARD_OUTPUT=""
  DASHBOARD_CLI_JS="${PLUGIN_ROOT}/build/infrastructure/session/cli/dashboard-cli.js"
  DASHBOARD_CLI_TS="${PLUGIN_ROOT}/src/infrastructure/session/cli/dashboard-cli.ts"
  if [ -f "$DASHBOARD_CLI_JS" ]; then
    DASHBOARD_OUTPUT=$(node "$DASHBOARD_CLI_JS" --clear-dir="${CWD}/.clear" 2>>"$HOOK_ERROR_LOG" || true)
  elif [ -f "$DASHBOARD_CLI_TS" ]; then
    DASHBOARD_OUTPUT=$(cd "$PLUGIN_ROOT" && npx ts-node "$DASHBOARD_CLI_TS" --clear-dir="${CWD}/.clear" 2>>"$HOOK_ERROR_LOG" || true)
  fi

  # --- Parse latest handoff at dispatcher level (WP-PS4 S192 AD-01) ---
  # Moved from session-init.sh:213 awk parser per s192_corrected_plan. Extracts
  # ## Summary + ## Next Session Priorities sections from latest cf-handoff at
  # .clear/sessions/session_*.md. Section names are cf-handoff canonical per
  # scripts/session/session-handoff.sh:191,261.
  HANDOFF_CONTENT=""
  SESSIONS_DIR_LATEST="${CWD}/.clear/sessions"
  if [ -d "$SESSIONS_DIR_LATEST" ]; then
    LATEST_HANDOFF=$(find "$SESSIONS_DIR_LATEST" -maxdepth 1 -name '*.md' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
    if [ -n "$LATEST_HANDOFF" ] && [ -s "$LATEST_HANDOFF" ]; then
      HANDOFF_FILENAME=$(basename "$LATEST_HANDOFF")
      HANDOFF_BODY=$(awk '
        /^## Summary$/                 { in_section=1; print; next }
        /^## Next Session Priorities$/ { in_section=1; print; next }
        /^## /                         { in_section=0 }
        in_section                     { print }
      ' "$LATEST_HANDOFF")
      if [ -n "$HANDOFF_BODY" ]; then
        # SYNTH-SUGG-002 + SYNTH-SEC-001: sanitize user-controlled fields before
        # embedding in Claude-visible context. Strips ASCII control chars (incl
        # ANSI escapes) — defense against crafted filenames / handoff content.
        HANDOFF_FILENAME=$(sanitize_for_context "$HANDOFF_FILENAME")
        HANDOFF_BODY=$(sanitize_for_context "$HANDOFF_BODY")
        HANDOFF_CONTENT="
## Previous Session Handoff
Source: .clear/sessions/${HANDOFF_FILENAME}

${HANDOFF_BODY}

[Sections shown: Summary, Next Session Priorities. Full handoff at .clear/sessions/${HANDOFF_FILENAME}]"
      fi
    fi
  fi

  # --- DISPLAY DIRECTIVE (WP-PS4 S192: enumerated panels per tracker-Claude mitigation #2) ---
  # Explicit enumeration prevents the S191 judgment-drop failure mode where
  # Claude perceived mid-payload blocks as "duplicative decoration" and
  # silently omitted them from the streamed response.
  echo "**DISPLAY TO USER**: Output ALL of the following sections in order, exactly as shown, without paraphrasing, summarizing, or omitting any. Each section is a required panel for the user to see at session start. Required components:"
  echo "  (1) Project banner"
  echo "  (2) ASCII status dashboard (the 76-col box-drawn panel) — if rendered"
  echo "  (3) Pending knowledge reviews carry-over banner (if present)"
  echo "  (4) Deprecation warnings (if present)"
  echo "  (5) Loaded knowledge entries"
  echo "  (6) Previous session handoff summary"
  echo ""
  echo "Do NOT silently consume any of these. Do NOT skip the dashboard as 'decorative' — it is the primary status surface for the user. Display the entire block between START and END markers, then respond to the user."
  echo ""
  echo "--- START DISPLAY ---"
  echo ""
  # (1) Project banner
  echo '```'
  echo "═══════════════════════════════════════════════════════════════"
  echo "  CLEAR FRAMEWORK - CONTEXT LOADED"
  echo "  Project: ${PROJECT_NAME}${SESSION_LABEL}"
  echo "═══════════════════════════════════════════════════════════════"
  echo '```'
  echo ""
  # (2) Dashboard — first user-visible block after banner
  if [ -n "$DASHBOARD_OUTPUT" ]; then
    echo "$DASHBOARD_OUTPUT"
    echo ""
  fi
  # SYNTH-SEC-001: sanitize CLI outputs that embed user-controlled fields (entry
  # IDs, titles, file paths) before echoing into the DISPLAY TO USER zone. Strips
  # ASCII control chars (incl ANSI escapes) — defense against context injection
  # via crafted knowledge entries. DASHBOARD_OUTPUT is exempt by design (renders
  # 24-bit RGB ANSI from statusline-palette per dashboard.ts).
  # (3) Pending reviews carry-over (WP-PS4 AC2: never at risk of inline-budget loss)
  if [ -n "$PENDING_REVIEWS_WARNING" ]; then
    echo "$(sanitize_for_context "$PENDING_REVIEWS_WARNING")"
    echo ""
  fi
  # (4) Deprecation warnings
  if [ -n "$DEPRECATION_WARNING" ]; then
    echo "$(sanitize_for_context "$DEPRECATION_WARNING")"
    echo ""
  fi
  # (5) Zone 1 sub-script output: loaded knowledge entries
  if [ -n "$ZONE_1_CONTEXT" ]; then
    echo "$(sanitize_for_context "$ZONE_1_CONTEXT")"
    echo ""
  fi
  # (6) Previous session handoff — last in display block
  if [ -n "$HANDOFF_CONTENT" ]; then
    echo "$HANDOFF_CONTENT"
    echo ""
  fi
  echo "--- END DISPLAY ---"
  echo ""
  # --- Zone 2: Claude developer reference (WP-PS4 S192 AD-01) ---
  # Content below is for Claude's internal context only — NOT to be echoed to
  # the user. Provides developer-perspective detail (active WP state, plan
  # state, session init status) that Claude needs to resume implementation work
  # but the user does not need to see.
  echo "## Developer Reference (FOR CLAUDE'S USE — do not echo to user)"
  echo ""
  echo "The content below is internal context for Claude's own reference. It contains developer-perspective detail about active workpackage state, plan state, and session initialization. Do NOT echo any of it to the user — the user-facing surfaces above (banner, dashboard, warnings, knowledge entries, handoff) are sufficient for the user's view of session start."
  echo ""
  if [ -n "$ZONE_2_CONTEXT" ]; then
    echo "$ZONE_2_CONTEXT"
    echo ""
  fi
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
