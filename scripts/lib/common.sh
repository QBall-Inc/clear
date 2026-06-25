#!/bin/bash
# common.sh - Shared CLEAR script library
#
# Provides: strict mode, cleanup trap, logging, CLI resolution, input reading, jq check
# Usage: source "$(dirname "$0")/../lib/common.sh" (adjust relative path per script location)

set -euo pipefail

# Resolve the directory of the sourcing script
SCRIPT_NAME="${SCRIPT_NAME:-$(basename "${BASH_SOURCE[1]}" .sh)}"
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)}"

# Plugin root resolution (WP-SS5): layered precedence, env-and-git-independent.
#   1. ${CLAUDE_PLUGIN_ROOT} — harness truth, set in hook context (authoritative).
#   2. BASH_SOURCE[0] self-anchor — common.sh's OWN location at the fixed
#      scripts/lib/ depth (dir/../.. = plugin root). Independent of env + git, so
#      a sourcing script always resolves the plugin build it physically belongs
#      to; a --plugin-dir relaunch self-corrects (no sticky-pin contamination).
#      Precedent: scripts/knowledge/knowledge-drain.sh:18.
#   3. ${CLEAR_PLUGIN_ROOT} — lowest-priority explicit override, consulted only
#      if the self-anchor resolution yields empty. No longer first (its CLEAR-first
#      position was the sticky-pin root cause).
# The git rev-parse --show-toplevel fallback is REMOVED: a plugin co-located
# inside an unrelated git repo returned a real-but-wrong root. CLEAR_PLUGIN_ROOT
# remains the settings.json env-var bridge for reference-file `$CLEAR_PLUGIN_ROOT`
# commands — that shell-expansion path is unaffected by this resolver.
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)}"
PLUGIN_ROOT="${PLUGIN_ROOT:-$CLEAR_PLUGIN_ROOT}"
export SCRIPTS_DIR="${PLUGIN_ROOT}/scripts"

# Log directory — defaults to plugin root, redirected by use_project_logs()
LOG_DIR="${PLUGIN_ROOT}/logs"
HOOK_ERROR_LOG="${LOG_DIR}/hook-errors.log"

# Manifest file that defines a CLEAR-initialized project (relative to .clear/).
# Matches src/infrastructure/init/manifest.ts:32 MANIFEST_RELATIVE_PATH.
CLEAR_MANIFEST_RELATIVE='config/clear-manifest.yaml'

# Returns 0 (success) when the project at $1 is CLEAR-initialized — i.e.,
# `.clear/config/clear-manifest.yaml` exists. Returns 1 otherwise.
# Single canonical helper per WP-CI1 AC6: every dispatcher + use_project_logs
# call this; no ad-hoc duplicated manifest checks anywhere else.
is_clear_initialized() {
  local project_cwd="$1"
  [ -f "${project_cwd}/.clear/${CLEAR_MANIFEST_RELATIVE}" ]
}

# Emit a one-time advisory when CLEAR is not initialized in the project at $1.
# Case (a) NO `.clear/` — emit to stderr (no persistent marker possible).
# Case (b) `.clear/` exists but no manifest — gate by `.clear/.uninitialized-warned`
# marker so the advisory fires at most ONCE per project, not once per hook fire.
# Per WP-CI1 AC4 + AC7.
emit_uninit_advisory() {
  local project_cwd="$1"
  local marker="${project_cwd}/.clear/.uninitialized-warned"
  if [ -d "${project_cwd}/.clear" ]; then
    if [ ! -f "$marker" ]; then
      echo "[CLEAR] .clear/ directory present but no manifest — run /cf-init to initialize" >&2
      touch "$marker" 2>/dev/null || true
    fi
  else
    echo "[CLEAR] Project is not CLEAR-initialized — run /cf-init to enable hook integration" >&2
  fi
}

# Guard wrapper for dispatcher entry. Calls is_clear_initialized; on false,
# emits the appropriate advisory and signals the caller to early-exit.
# Usage: require_clear_initialized "$CWD" || exit 0
require_clear_initialized() {
  local project_cwd="$1"
  if is_clear_initialized "$project_cwd"; then
    return 0
  fi
  emit_uninit_advisory "$project_cwd"
  return 1
}

# Redirect logs to project's .clear/audit/ directory.
# Call after extracting CWD from stdin JSON.
# Usage: use_project_logs "$CWD"
#
# Guard tightened from `.clear/`-existence to manifest-existence per WP-CI1
# AC3: case (b) `.clear/` exists but no manifest must not create .clear/audit/.
# Defense-in-depth alongside the dispatcher-level early-exit guard (AC1/AC2);
# both layers call is_clear_initialized — no duplication per AC6.
use_project_logs() {
  local project_cwd="$1"
  if is_clear_initialized "$project_cwd"; then
    LOG_DIR="${project_cwd}/.clear/audit"
    HOOK_ERROR_LOG="${LOG_DIR}/hook-errors.log"
    mkdir -p "$LOG_DIR"
  fi
}

# Cleanup function — override in scripts that need custom cleanup
_clear_cleanup() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    mkdir -p "$LOG_DIR"
    echo "[$(date -Iseconds)] ${SCRIPT_NAME} exited with code ${exit_code}" >> "$HOOK_ERROR_LOG"
  fi
}
trap _clear_cleanup EXIT ERR INT TERM

# Log to stderr (never pollute stdout JSON)
log() {
  echo "[CLEAR:${SCRIPT_NAME}] $*" >&2
}

# Check jq dependency
command -v jq >/dev/null 2>&1 || { log "CLEAR requires jq — install with: sudo apt install jq"; exit 1; }

# Read stdin JSON once and export
read_input() {
  cat
}

# Canonicalize a cwd path via `pwd -P` to resolve symlinks (e.g., WSL
# /home/ashay/projects → /mnt/c/projects). Subshell-isolated cd preserves
# caller's PWD. Falls back to input if path is nonexistent or unreadable.
# Usage: CWD=$(canonicalize_cwd "$(echo "$INPUT" | jq -r '.cwd // ".")")
canonicalize_cwd() {
  local cwd="$1"
  (cd "$cwd" 2>/dev/null && pwd -P) || echo "$cwd"
}

# Resolve CLI tool path (prefer compiled JS, fall back to TS)
# Usage: CLI_TOOL=$(resolve_cli "knowledge/cli/load-cli")
resolve_cli() {
  local module="$1"
  local js_path="${PLUGIN_ROOT}/build/infrastructure/${module}.js"
  local ts_path="${PLUGIN_ROOT}/src/infrastructure/${module}.ts"

  if [ -f "$js_path" ]; then
    echo "$js_path"
  elif [ -f "$ts_path" ]; then
    echo "$ts_path"
  else
    log "CLI tool not found: ${module}"
    return 1
  fi
}

# Safe arithmetic without bc — uses awk for floating point
# Usage: result=$(calc "0.5 + 0.025")
calc() {
  awk "BEGIN { printf \"%.4f\", $1 }"
}

# Safe float comparison without bc
# Usage: if float_gte "$estimate" "$threshold"; then ...
float_gte() {
  awk "BEGIN { exit !($1 >= $2) }"
}

# Safe float greater-than without bc
float_gt() {
  awk "BEGIN { exit !($1 > $2) }"
}

# Sanitize untrusted text for inclusion in Claude-visible context.
# Strips ASCII control characters (0x00-0x08, 0x0B-0x1F, 0x7F) — preserves tab (0x09)
# and LF (0x0A) so multi-line context still formats. CR (0x0D) dropped to avoid
# line-termination confusion in additionalContext / decision:block reason payloads.
# Usage: SAFE=$(sanitize_for_context "$UNTRUSTED_TEXT")
sanitize_for_context() {
  printf '%s' "$1" | tr -d '\000-\010\013-\037\177'
}

# Emit a Stop-hook decision:block JSON with hooks.log observability entry.
# Centralizes the Level A/B/C emit pattern — writes timestamped audit log line
# then prints the {decision: "block", reason: ...} JSON to stdout.
# Caller is responsible for clearing the accumulator before calling this.
# Usage: emit_blocking_decision "A" "$CONTEXT" "${FILTERED_COUNT} files, linked=${LINKED_ENTRIES:-none}"
emit_blocking_decision() {
  local level="$1"
  local context="$2"
  local log_detail="$3"

  mkdir -p "$LOG_DIR"
  echo "[$(date -Iseconds)] Stop Level ${level}: ${log_detail}" >> "${LOG_DIR}/hooks.log"

  jq -n --arg ctx "$context" '{
    "decision": "block",
    "reason": $ctx
  }'
}
