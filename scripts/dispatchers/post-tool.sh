#!/bin/bash
# post-tool.sh - Dispatcher for PostToolUse event
#
# Fires after every Write/Edit operation. Responsibilities:
# 1. Append file to changed-files accumulator (with dedup)
# 2. Call workpackage-progress.sh with transformed input
# 3. Look up file in reverse knowledge index
# 4. Return hookSpecificOutput.additionalContext if entries found
#
# Input: JSON via stdin (tool_name, tool_input, tool_response, cwd)
# Output: JSON with hookSpecificOutput.additionalContext (or {})
#
# INVARIANT: Hooks NEVER load or inject markdown body content.
# Rationale: Hook output goes into Claude's context window. Injecting full
# markdown bodies would consume tokens with raw content that Claude already
# has access to via Read. Hooks surface entry IDs only — Claude reads bodies
# on demand via the knowledge CLI or direct file access.
#
# Exits 0 for normal paths. Exit 2 for corrupt index (informational — tool already ran).
# PostToolUse exit 2 surfaces stderr to Claude but does NOT undo the Write/Edit.

export SCRIPT_NAME="post-tool"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"
source "$(cd "$(dirname "$0")" && pwd)/lib/hook-formatters.sh"

# Read input once
INPUT=$(cat)

# Extract CWD early for logging (canonicalized for symlink-resolution consistency
# with the other dispatchers per WP-CI1 cross-role review finding).
CWD=$(canonicalize_cwd "$(echo "$INPUT" | jq -r '.cwd // "."')")

# WP-CI1: skip on uninitialized projects.
require_clear_initialized "$CWD" || { echo '{}'; exit 0; }

use_project_logs "$CWD"

# --- Kill switches (global + per-hook) ---
if [ "${CLEAR_HOOKS_ENABLED:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi
if [ "${CLEAR_POSTTOOL_ENABLED:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi

# --- Check tool_response.success (Architect gap fix) ---
SUCCESS=$(echo "$INPUT" | jq -r 'if .tool_response.success == false then "false" else "true" end')
if [ "$SUCCESS" = "false" ]; then
  echo '{}'
  exit 0
fi

# --- Extract file path from tool_input ---
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
if [ -z "$FILE_PATH" ]; then
  echo '{}'
  exit 0
fi

# --- Out-of-CWD early-exit (WP-DF2 AC5 / OBS-7) ---
# Absolute paths NOT under the consumer project root bypass the relative-path
# exclusion list below (case patterns like `.claude/*` only match at position 0
# of REL_PATH). Reject them up front so paths such as
# /home/<user>/.claude/projects/.../memory/foo.md never reach the accumulator.
# Relative paths (no leading /) are treated as in-repo by convention.
#
# S165 fix-batch FX-1 (Security CRITICAL) + FX-6 (Standards M-02):
# - Resolve CWD to an absolute realpath when the jq fallback "." or a relative
#   value was provided; the prefix comparison below requires absolute paths to
#   work consistently (otherwise CWD="." rejects ALL absolute FILE_PATHs).
# - Reject FILE_PATH equal to the resolved CWD itself (no trailing /). Without
#   this, an exact-CWD match passes the `!= "$CWD/"*` test and the absolute
#   path falls through into the relative-prefix case-filter, which fails to
#   match `/abs/path` against `.clear/state/*` etc.
ABS_CWD=$(cd "$CWD" 2>/dev/null && pwd) || ABS_CWD=""
if [ -z "$ABS_CWD" ]; then
  # Cannot resolve CWD — fail safe: drop the event rather than risk a bypass.
  echo '{}'
  exit 0
fi
if [[ "$FILE_PATH" = /* ]]; then
  if [[ "$FILE_PATH" = "$ABS_CWD" ]] || [[ "$FILE_PATH" != "$ABS_CWD/"* ]]; then
    echo '{}'
    exit 0
  fi
fi
# Re-anchor CWD to the resolved absolute path for the relative-prefix
# normalization below; otherwise CWD="." causes the strip to be a no-op.
CWD="$ABS_CWD"

# --- Exclusion check (hardcoded for v1.0, configurable post-v1.0) ---
# Normalize: strip CWD prefix if present to get relative path
REL_PATH="$FILE_PATH"
if [[ "$REL_PATH" == "$CWD/"* ]]; then
  REL_PATH="${REL_PATH#"$CWD/"}"
fi

case "$REL_PATH" in
  .clear/state/*|.clear/audit/*|logs/*|tmp/*|sessions/*|node_modules/*|.claude/*|.git/*|build/*)
    echo '{}'
    exit 0
    ;;
esac

# --- State directory check ---
CLEAR_DIR="${CWD}/.clear"
STATE_DIR="${CLEAR_DIR}/state"
if [ ! -d "$CLEAR_DIR" ]; then
  echo '{}'
  exit 0
fi
mkdir -p "$STATE_DIR"

# --- Accumulator: append with dedup ---
ACCUMULATOR="${STATE_DIR}/changed-files.json"
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TIMESTAMP=$(date -Iseconds)

if [ -f "$ACCUMULATOR" ]; then
  # Validate existing JSON; recover if malformed
  if ! jq -e '.' "$ACCUMULATOR" >/dev/null 2>&1; then
    rm -f "$ACCUMULATOR"
  fi
fi

if [ ! -f "$ACCUMULATOR" ]; then
  # Create new accumulator
  jq -n --arg p "$REL_PATH" --arg t "$TOOL_NAME" --arg ts "$TIMESTAMP" \
    '{version: "1.0", files: [{path: $p, tool: $t, time: $ts}]}' > "$ACCUMULATOR"
else
  # Dedup: only append if path not already present
  EXISTING=$(jq -r --arg p "$REL_PATH" '.files[] | select(.path == $p) | .path' "$ACCUMULATOR" 2>/dev/null)
  if [ -z "$EXISTING" ]; then
    jq --arg p "$REL_PATH" --arg t "$TOOL_NAME" --arg ts "$TIMESTAMP" \
      '.files += [{path: $p, tool: $t, time: $ts}]' "$ACCUMULATOR" > "${ACCUMULATOR}.tmp" \
      && mv "${ACCUMULATOR}.tmp" "$ACCUMULATOR"
  fi
fi

# --- Call workpackage-progress.sh (transform input: add .file field) ---
WP_SCRIPT="${SCRIPTS_DIR}/workpackage/workpackage-progress.sh"
WP_ADDITIONAL_CTX=""
if [ -x "$WP_SCRIPT" ]; then
  WP_INPUT=$(echo "$INPUT" | jq --arg fp "$REL_PATH" '. + {file: $fp}')
  WP_OUTPUT=$(echo "$WP_INPUT" | "$WP_SCRIPT" 2>>"$HOOK_ERROR_LOG") || true

  # Extract the workpackage-progress additionalContext (auto-promotion / scope-warning
  # surface). Without this, progress-cli's scope warnings + promotion announcements were
  # silently discarded by the dispatcher and never reached Claude's context.
  if [ -n "$WP_OUTPUT" ]; then
    WP_ADDITIONAL_CTX=$(echo "$WP_OUTPUT" | jq -r '.additionalContext // empty' 2>/dev/null || true)
  fi

  # --- Sync-bridge: update workpackage summary in sync-state ---
  SYNC_BRIDGE="${SCRIPTS_DIR}/sync/sync-bridge.sh"
  if [ -x "$SYNC_BRIDGE" ] && [ -n "$WP_OUTPUT" ]; then
    # WP-DF3 AC2 (S167 G1+G2 fix): include systemId so sync-bridge can populate
    # WorkpackageSummary.systemId — previously only displayId/title/progress
    # flowed through, and title arrived as null because ProgressOutput lacked the field.
    WP_DATA=$(echo "$WP_OUTPUT" | jq -c '{systemId: .systemId, displayId: .displayId, title: .title, progress: .progress}' 2>/dev/null) || true
    if [ -n "$WP_DATA" ] && [ "$WP_DATA" != "null" ]; then
      "$SYNC_BRIDGE" --op=update-workpackage --clear-dir="$CWD" --data="$WP_DATA" >/dev/null 2>>"$HOOK_ERROR_LOG" || true
    fi
  fi
fi

# --- Reverse index lookup for impact warning ---
INDEX_FILE="${STATE_DIR}/file-knowledge-index.json"
if [ -f "$INDEX_FILE" ]; then
  # Validate index JSON — corrupt index surfaces remediation via exit 2
  # PostToolUse exit 2 is informational (tool already ran, stderr shown to Claude)
  if ! jq -e '.' "$INDEX_FILE" >/dev/null 2>&1; then
    echo '[CLEAR] Knowledge index is corrupt. Run: /cf-knowledge rebuild-index' >&2
    echo '{}'
    exit 2
  fi

  # Look up exact match first
  ENTRIES=$(jq -r --arg fp "$REL_PATH" '
    (.index[$fp] // []) | if length > 0 then .[] else empty end
  ' "$INDEX_FILE" 2>/dev/null || true)

  # If no exact match, try directory prefix
  if [ -z "$ENTRIES" ]; then
    ENTRIES=$(jq -r --arg fp "$REL_PATH" '
      .index | to_entries | map(select(.key | endswith("/"))) | map(select(.key as $k | $fp | startswith($k))) | [.[].value[]] | unique | if length > 0 then .[] else empty end
    ' "$INDEX_FILE" 2>/dev/null || true)
  fi

  if [ -n "$ENTRIES" ]; then
    # Format entry IDs via shared helper (symmetric with pre-tool.sh; no truncation).
    # See scripts/dispatchers/lib/hook-formatters.sh for rationale.
    ENTRY_LIST=$(echo "$ENTRIES" | format_linked_entry_list)

    # Append surfacing events to JSONL log (FR14: observability)
    SURFACING_LOG="${STATE_DIR}/surfacing-log.jsonl"
    SURF_TS=$(date -Iseconds)
    echo "$ENTRIES" | while IFS= read -r eid; do
      [ -z "$eid" ] && continue
      jq -nc --arg id "$eid" --arg trigger "PostToolUse" --arg fp "$REL_PATH" --arg ts "$SURF_TS" \
        '{entry_id: $id, trigger: $trigger, file_path: $fp, ts: $ts}' >> "$SURFACING_LOG"
    done

    # K2.7 P5: Append entry IDs to pending-reviews.json for session-start carry-over gate.
    # Atomic temp-file + mv, deduped by entry_id. Mirrors accumulator pattern (lines 91-103).
    PENDING_REVIEWS="${STATE_DIR}/pending-reviews.json"
    if [ -f "$PENDING_REVIEWS" ]; then
      if ! jq -e '.' "$PENDING_REVIEWS" >/dev/null 2>&1; then
        mkdir -p "$LOG_DIR"
        echo "[$(date -Iseconds)] post-tool: corrupt pending-reviews.json replaced" >> "${LOG_DIR}/hooks.log"
        rm -f "$PENDING_REVIEWS"
      fi
    fi
    if [ ! -f "$PENDING_REVIEWS" ]; then
      echo '{"version":"1.0","entries":[]}' > "$PENDING_REVIEWS"
    fi
    echo "$ENTRIES" | while IFS= read -r eid; do
      [ -z "$eid" ] && continue
      EXISTING=$(jq -r --arg id "$eid" '.entries[] | select(.entry_id == $id) | .entry_id' "$PENDING_REVIEWS" 2>/dev/null)
      if [ -z "$EXISTING" ]; then
        jq --arg id "$eid" --arg trigger "PostToolUse" --arg fp "$REL_PATH" --arg ts "$SURF_TS" --arg tool "$TOOL_NAME" \
          '.entries += [{entry_id: $id, trigger: $trigger, file_path: $fp, added_at: $ts, source_tool: $tool}]' \
          "$PENDING_REVIEWS" > "${PENDING_REVIEWS}.tmp" \
          && mv "${PENDING_REVIEWS}.tmp" "$PENDING_REVIEWS"
      fi
    done

    # Sanitize interpolated content — both REL_PATH and ENTRY_LIST flow into
    # Claude's additionalContext. Strip control chars to prevent newline-based
    # prompt-injection vectors if a filename or entry_id carries embedded LF/CR.
    # WP_ADDITIONAL_CTX comes from progress-cli (trusted CLI output) — sanitization
    # is still applied for symmetry / defense-in-depth.
    SAFE_REL_PATH=$(sanitize_for_context "$REL_PATH")
    SAFE_ENTRY_LIST=$(sanitize_for_context "$ENTRY_LIST")
    KNOWLEDGE_CTX="[CLEAR] File '$SAFE_REL_PATH' is linked to knowledge entries: ${SAFE_ENTRY_LIST}. These entries may need review after this change."
    if [ -n "$WP_ADDITIONAL_CTX" ]; then
      SAFE_WP_CTX=$(sanitize_for_context "$WP_ADDITIONAL_CTX")
      COMBINED_CTX="${SAFE_WP_CTX}

${KNOWLEDGE_CTX}"
    else
      COMBINED_CTX="$KNOWLEDGE_CTX"
    fi
    jq -n --arg ctx "$COMBINED_CTX" \
      '{
        "hookSpecificOutput": {
          "hookEventName": "PostToolUse",
          "additionalContext": $ctx
        }
      }'
    exit 0
  fi
fi

# No knowledge-index impact. If the workpackage-progress hook produced a user-facing
# message (auto-promotion announcement or scope warning), surface it as additionalContext
# so Claude sees the deliverable progress signal instead of the dispatcher swallowing it.
if [ -n "$WP_ADDITIONAL_CTX" ]; then
  SAFE_WP_CTX=$(sanitize_for_context "$WP_ADDITIONAL_CTX")
  jq -n --arg ctx "$SAFE_WP_CTX" \
    '{
      "hookSpecificOutput": {
        "hookEventName": "PostToolUse",
        "additionalContext": $ctx
      }
    }'
  exit 0
fi

# No impact found
echo '{}'
exit 0
