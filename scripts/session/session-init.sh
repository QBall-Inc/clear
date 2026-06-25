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

# Read input JSON
INPUT=$(cat)

# Extract fields from input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
CWD=$(canonicalize_cwd "$(echo "$INPUT" | jq -r '.cwd // "."')")
# shellcheck disable=SC2034  # Extracted from input for potential use
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "SessionStart"')

# Redirect HOOK_ERROR_LOG to the project's .clear/audit/ (and create it). This
# script runs as a subprocess of session-start.sh, which re-sources common.sh —
# resetting HOOK_ERROR_LOG to the plugin-root default ${PLUGIN_ROOT}/logs/, a
# directory that does NOT exist in a consumer plugin install. Without this, the
# `2>>"$HOOK_ERROR_LOG"` redirect on the update-session call below fails to open
# its target, which aborts that command BEFORE it runs — silently skipping the
# sync-state.session refresh on cold start. Routing to .clear/audit/ (mkdir'd by
# use_project_logs) makes the redirect target exist so update-session executes.
use_project_logs "$CWD"

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

# Get current timestamp
TIMESTAMP=$(date -Iseconds)
DATE_STAMP=$(date +%Y%m%d)

# Read the harness 'source' signal and the prior session's UUID (if any).
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"')
PREV_SESSION_ID=""
if [ -f "$STATE_FILE" ]; then
  PREV_SESSION_ID=$(jq -r '.sessionId // ""' "$STATE_FILE" 2>/dev/null || echo "")
fi

# Decide CONTINUATION (preserve number, no history append) vs COLD start
# (advance the number, append a row).
#   - Primary signal: the harness 'source'. resume/compact reuse the Claude
#     session UUID, so they continue the session. Any other value — startup,
#     clear, or an unknown future source via the wildcard default — is cold.
#   - Corroborating fallback: the prior session.json carries the SAME UUID. A
#     resume always reuses the UUID, so a matching prior UUID is a continuation
#     regardless of source. This keeps the logical counter 1:1 with the
#     UUID-keyed surfaces (a reused UUID never advances) and continues correctly
#     even after the previous session was finalized (status is not consulted).
# startup/clear mint a NEW UUID, so neither signal fires and the counter advances.
RESUMING="false"
case "$SOURCE" in
  resume|compact) RESUMING="true" ;;
esac
if [ "$RESUMING" = "false" ] && [ -n "$PREV_SESSION_ID" ] && [ "$PREV_SESSION_ID" = "$SESSION_ID" ]; then
  RESUMING="true"
fi

RESUME_INFO=""
if [ "$RESUMING" = "true" ] && [ -f "$STATE_FILE" ]; then
  # Continuation — preserve the existing session's number (same UUID). Coerce to
  # a number so the downstream --argjson sites cannot abort on a non-numeric
  # (tampered) state file.
  CLEAR_SESSION_NUMBER=$(jq -r '(.clearSessionNumber // 1) | if type == "number" then . else 1 end' "$STATE_FILE" 2>/dev/null || echo "1")
  PREV_PROMPT_COUNT=$(jq -r '.tokenUsage.promptCount // 0' "$STATE_FILE" 2>/dev/null || echo "0")
  RESUME_INFO=" (resuming, ${PREV_PROMPT_COUNT} prompts so far)"
else
  # Cold start (startup/clear/unknown, or a resume whose prior state is gone —
  # e.g. a deleted session.json — which necessarily starts fresh). Advance from
  # the last recorded session number.
  RESUMING="false"
  CLEAR_SESSION_NUMBER=1
  if [ -f "$HISTORY_FILE" ]; then
    LAST_NUMBER=$(jq -r '.lastSessionNumber // 0' "$HISTORY_FILE" 2>/dev/null || echo "0")
    CLEAR_SESSION_NUMBER=$((LAST_NUMBER + 1))
  fi
fi

# Create session state
if [ "$RESUMING" = "true" ]; then
  # Continuation — refresh activity timestamp and re-activate. The re-activation
  # matters when the previous session was finalized (status=completed) before the
  # resume: without it, the update-session call below would propagate "completed"
  # into sync-state.session for a session that is in fact active again.
  jq --arg ts "$TIMESTAMP" \
     '.status = "active" | .lastActivity = $ts' \
     "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
else
  # Create new session state.
  # SEC-S189-002 (S189 stop-hook CR): SESSION_ID comes from untrusted hook input
  # (jq -r on the hook JSON). Heredoc interpolation lacks JSON-escaping, so a
  # malformed session_id could produce invalid session.json or inject fields
  # (e.g., "status":"hijacked") that subvert RESUMING logic on the next session.
  # Use jq --arg for proper escaping. The token-usage / threshold / context-window
  # blocks remain numeric/static, so we construct them as JSON literals.
  jq -n \
    --arg sessionId "$SESSION_ID" \
    --argjson clearSessionNumber "$CLEAR_SESSION_NUMBER" \
    --arg startTime "$TIMESTAMP" \
    --argjson warningThreshold "$WARNING_THRESHOLD" \
    --argjson criticalThreshold "$CRITICAL_THRESHOLD" \
    --argjson emergencyThreshold "$EMERGENCY_THRESHOLD" \
    '{
      sessionId: $sessionId,
      clearSessionNumber: $clearSessionNumber,
      startTime: $startTime,
      lastActivity: $startTime,
      status: "active",
      tokenUsage: {
        estimate: 0,
        promptCount: 0,
        method: "deterministic",
        consecutiveFailures: 0,
        cacheReadTokens: 0,
        warningShown: false,
        criticalShown: false,
        emergencyShown: false
      },
      handoff: {
        prepared: false,
        documentPath: null
      },
      thresholds: {
        warning: $warningThreshold,
        critical: $criticalThreshold,
        emergency: $emergencyThreshold
      },
      contextWindow: {
        size: 200000,
        source: "default",
        detectedModel: null,
        lastUpdated: null
      }
    }' > "$STATE_FILE"
fi

# Update session history (use jq construction for consistency with the
# SEC-S189-002 pattern; avoids heredoc interpolation of integer literals).
if [ ! -f "$HISTORY_FILE" ]; then
  jq -n --argjson num "$CLEAR_SESSION_NUMBER" \
    '{"lastSessionNumber": $num, "sessions": []}' > "$HISTORY_FILE"
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
# ONE-TIME SESSION-HISTORY DEDUP (self-healing)
# ==============================================================================
# Heals histories corrupted by the prior resume-over-count defect, where a
# /resume minted a new clearSessionNumber while REUSING the Claude UUID — leaving
# multiple session-history rows sharing one sessionId. Keep ONE row per UUID:
# the lowest clearSessionNumber (the original session that minted the UUID; the
# higher numbers were the erroneous resume-increments). Rows are NOT renumbered
# (numbers are display labels; renumbering could invalidate references) and
# lastSessionNumber is preserved, so gaps are acceptable. Idempotent: a history
# with one row per UUID is left byte-unchanged (only rewritten when a dup is
# actually removed). Cold-start only; non-fatal.
if [ "$RESUMING" = "false" ] && [ -f "$HISTORY_FILE" ]; then
  DEDUP_RESULT=$(jq '
    (.sessions | length) as $before
    | .sessions = (
        .sessions
        | group_by(.sessionId)
        | map(min_by(.clearSessionNumber // 1e15))
        | sort_by(.clearSessionNumber // 1e15)
        | reverse
      )
    | if (.sessions | length) < $before then . else empty end
  ' "$HISTORY_FILE" 2>/dev/null) || true
  if [ -n "$DEDUP_RESULT" ]; then
    printf '%s\n' "$DEDUP_RESULT" > "${HISTORY_FILE}.tmp" && mv "${HISTORY_FILE}.tmp" "$HISTORY_FILE"
  fi
fi

# ==============================================================================
# SYNC-STATE SESSION BLOCK REFRESH (WP-DF3 AC5 / S167 G3 fix)
# ==============================================================================
# Prior to this wiring, sync-state.session was perpetually defaulted to
# {id:"", number:0, tokensUsed:0, status:"active"} because the sole writer
# (session-sync.ts:syncSession) was never called from any production site.
# This invocation aligns sync-state.session with the just-written session.json
# at every session start. session-monitor.sh keeps tokensUsed fresh during the
# session; this op covers id/number/status at lifecycle start.
SYNC_BRIDGE="${SCRIPTS_DIR}/sync/sync-bridge.sh"
if [ -x "$SYNC_BRIDGE" ] && [ -f "$STATE_FILE" ]; then
  SESSION_DATA=$(jq -c \
    --arg id "$SESSION_ID" \
    --argjson num "$CLEAR_SESSION_NUMBER" \
    '{
      id: $id,
      number: $num,
      tokensUsed: ((.tokenUsage.estimate // 0) * (.contextWindow.size // 200000) | floor),
      status: (.status // "active")
    }' "$STATE_FILE" 2>/dev/null) || true
  if [ -n "$SESSION_DATA" ]; then
    "$SYNC_BRIDGE" --op=update-session --clear-dir="$CWD" --data="$SESSION_DATA" \
      >/dev/null 2>>"$HOOK_ERROR_LOG" || true
  fi
fi

# Handoff extraction moved to scripts/dispatchers/session-start.sh (WP-PS4 S192 AD-02).

# Registry progress backfill (RC1D — AC11). Only runs on a fresh session-init (not RESUMING),
# since a resume should not perturb on-disk state. Failures are non-fatal: a backfill error
# logs to stderr but does not block session start.
if [ "$RESUMING" != "true" ] && [ -f "${CLEAR_DIR}/workpackages/registry.yaml" ]; then
  BACKFILL_CLI_JS="${PLUGIN_ROOT}/build/infrastructure/workpackage/cli/registry-backfill-cli.js"
  BACKFILL_CLI_TS="${PLUGIN_ROOT}/src/infrastructure/workpackage/cli/registry-backfill-cli.ts"
  if [ -f "$BACKFILL_CLI_JS" ]; then
    node "$BACKFILL_CLI_JS" \
      --clear-dir="$CLEAR_DIR" \
      --session-id="$SESSION_ID" \
      --session-number="$CLEAR_SESSION_NUMBER" >/dev/null 2>&1 || \
      echo "[session-init] registry-backfill non-fatal failure (see audit log)" >&2
  elif [ -f "$BACKFILL_CLI_TS" ]; then
    npx ts-node "$BACKFILL_CLI_TS" \
      --clear-dir="$CLEAR_DIR" \
      --session-id="$SESSION_ID" \
      --session-number="$CLEAR_SESSION_NUMBER" >/dev/null 2>&1 || \
      echo "[session-init] registry-backfill non-fatal failure (see audit log)" >&2
  fi
fi

# WP-PS7 phase_b AC16 (S189): one-time workpackage-link back-fill. Walks every
# knowledge entry that has DB workpackage_id set but no linked_workpackages in
# .md frontmatter (or missing from WP YAML knowledge[]), and back-fills the
# disk surfaces. Idempotent via per-entry skip-if-populated; safe to re-run.
# Same fresh-init guard + non-fatal pattern as registry-backfill above.
if [ "$RESUMING" != "true" ] && [ -d "${CLEAR_DIR}/knowledge/entries" ]; then
  LINK_CLI_JS="${PLUGIN_ROOT}/build/infrastructure/knowledge/cli/link-cli.js"
  LINK_CLI_TS="${PLUGIN_ROOT}/src/infrastructure/knowledge/cli/link-cli.ts"
  if [ -f "$LINK_CLI_JS" ]; then
    node "$LINK_CLI_JS" backfill \
      --clear-dir="$CLEAR_DIR" \
      --session-id="$SESSION_ID" \
      --session-number="$CLEAR_SESSION_NUMBER" >/dev/null 2>&1 || \
      echo "[session-init] wp-link backfill non-fatal failure (see audit log)" >&2
  elif [ -f "$LINK_CLI_TS" ]; then
    npx ts-node "$LINK_CLI_TS" backfill \
      --clear-dir="$CLEAR_DIR" \
      --session-id="$SESSION_ID" \
      --session-number="$CLEAR_SESSION_NUMBER" >/dev/null 2>&1 || \
      echo "[session-init] wp-link backfill non-fatal failure (see audit log)" >&2
  fi
fi

# WP-CB-D AC2: ensure the CLEAR-managed .clear/.gitignore exists (self-heal for
# consumers initialized before the managed-gitignore shipped). Gated on the file's
# ABSENCE so node spawns at most once per project (not per session). Deliberately
# NOT gated on `RESUMING != "true"` (unlike the backfill blocks above): an existing
# consumer's first post-update session may be a RESUME, and it still needs the
# backfill — the absence gate makes it safe to run on both fresh + resume. The TS
# side is idempotent; this guard just avoids the spawn once present. Non-fatal: a
# failure logs but never blocks session start.
if [ ! -f "${CLEAR_DIR}/.gitignore" ]; then
  GITIGNORE_CLI_JS="${PLUGIN_ROOT}/build/infrastructure/init/cli/init-cli.js"
  GITIGNORE_CLI_TS="${PLUGIN_ROOT}/src/infrastructure/init/cli/init-cli.ts"
  if [ -f "$GITIGNORE_CLI_JS" ]; then
    node "$GITIGNORE_CLI_JS" --ensure-gitignore --cwd="$CWD" >/dev/null 2>&1 || \
      echo "[session-init] ensure-gitignore non-fatal failure (see audit log)" >&2
  elif [ -f "$GITIGNORE_CLI_TS" ]; then
    npx ts-node "$GITIGNORE_CLI_TS" --ensure-gitignore --cwd="$CWD" >/dev/null 2>&1 || \
      echo "[session-init] ensure-gitignore non-fatal failure (see audit log)" >&2
  fi
fi

# AC5 auto collect-metrics: capture finalized handoffs from prior sessions into metrics.csv.
# Runs only on fresh session-init (not RESUMING). status: completed filter only — partial
# handoffs are skipped to preserve metric quality (Bug 3.2 mitigation: 1-session lag
# accepted, but no placeholder pollution). Non-fatal — collect-metrics failures don't
# block session startup.
if [ "$RESUMING" != "true" ] && [ -d "$SESSIONS_DIR" ]; then
  METRICS_FILE="${CLEAR_DIR}/metrics/metrics.csv"
  COLLECT_SCRIPT="${PLUGIN_ROOT}/scripts/metrics/collect-metrics.sh"
  mkdir -p "$(dirname "$METRICS_FILE")"
  [ -f "$METRICS_FILE" ] || touch "$METRICS_FILE"
  if [ -f "$COLLECT_SCRIPT" ]; then
    for HANDOFF in "$SESSIONS_DIR"/session_*.md; do
      [ -f "$HANDOFF" ] || continue
      HANDOFF_FILENAME=$(basename "$HANDOFF")
      HANDOFF_N=$(echo "$HANDOFF_FILENAME" | sed -n 's/^session_\([0-9]\+\)_.*/\1/p')
      [ -z "$HANDOFF_N" ] && continue
      # Idempotency: skip if already captured (first column is session number).
      grep -qE "^${HANDOFF_N}," "$METRICS_FILE" 2>/dev/null && continue
      # COMPLETE-status filter: only capture finalized handoffs (avoid placeholder pollution).
      # Case-insensitive to accept any of COMPLETE / completed / Complete — both
      # conventions exist in the wild (clear-framework dev uses lowercase, task-tracker uppercase).
      STATUS_LINE=$(grep -m1 -E '^status:[[:space:]]' "$HANDOFF" 2>/dev/null | tr '[:upper:]' '[:lower:]')
      case "$STATUS_LINE" in
        *complete*) ;;
        *) continue ;;
      esac
      (cd "$CWD" && bash "$COLLECT_SCRIPT" --session "$HANDOFF_N" --output "$METRICS_FILE") >/dev/null 2>&1 || \
        echo "[session-init] collect-metrics for session ${HANDOFF_N} non-fatal: see audit log" >&2
    done
  fi
fi

# Prepare output context — format thresholds as percentages
WARN_PCT=$(echo "$WARNING_THRESHOLD" | awk '{printf "%d%%", $1 * 100}')
CRIT_PCT=$(echo "$CRITICAL_THRESHOLD" | awk '{printf "%d%%", $1 * 100}')
THRESHOLD_INFO="warning: ${WARN_PCT}, critical: ${CRIT_PCT}"

# Dashboard rendering moved to scripts/dispatchers/session-start.sh (WP-PS4 S192 AD-02).
# session-init's additionalContext is now a plain status line that lands in Zone 2.
if [ "$RESUMING" = "true" ]; then
  CONTEXT_MSG="[CLEAR] Session ${CLEAR_SESSION_NUMBER} resumed${RESUME_INFO}
Token monitoring active (${THRESHOLD_INFO})"
else
  CONTEXT_MSG="[CLEAR] Session ${CLEAR_SESSION_NUMBER} initialized
Token monitoring active (${THRESHOLD_INFO})"
fi

# Return JSON response. "script": "session-init" is the zone-routing key the
# dispatcher uses to route this output to Zone 2 (Claude developer reference).
jq -n \
  --arg context "$CONTEXT_MSG" \
  --arg sessionId "$SESSION_ID" \
  --argjson sessionNumber "$CLEAR_SESSION_NUMBER" \
  --arg status "success" \
  --arg script "session-init" \
  '{
    "additionalContext": $context,
    "sessionId": $sessionId,
    "clearSessionNumber": $sessionNumber,
    "status": $status,
    "script": $script
  }'

exit 0
