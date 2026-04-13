#!/bin/bash
# common.sh - Shared CLEAR script library
#
# Provides: strict mode, cleanup trap, logging, CLI resolution, input reading, jq check
# Usage: source "$(dirname "$0")/../lib/common.sh" (adjust relative path per script location)

set -euo pipefail

# Resolve the directory of the sourcing script
SCRIPT_NAME="${SCRIPT_NAME:-$(basename "${BASH_SOURCE[1]}" .sh)}"
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)}"

# Plugin root resolution: CLEAR-specific env var > harness var > git fallback
PLUGIN_ROOT="${CLEAR_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR" && cd "$(git rev-parse --show-toplevel 2>/dev/null || echo "../..")" && pwd)}}"
export SCRIPTS_DIR="${PLUGIN_ROOT}/scripts"

# Log directory — defaults to plugin root, redirected by use_project_logs()
LOG_DIR="${PLUGIN_ROOT}/logs"
HOOK_ERROR_LOG="${LOG_DIR}/hook-errors.log"

# Redirect logs to project's .clear/audit/ directory.
# Call after extracting CWD from stdin JSON.
# Usage: use_project_logs "$CWD"
use_project_logs() {
  local project_cwd="$1"
  if [ -d "${project_cwd}/.clear" ]; then
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
