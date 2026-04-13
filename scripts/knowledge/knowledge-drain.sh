#!/bin/bash
# knowledge-drain.sh - Drain pending knowledge index updates
#
# Shared script callable from both SessionStart (knowledge-load.sh)
# and PreCompact (session-precompact.sh) hooks.
#
# Checks for .clear/state/index-pending.json and invokes index-cli
# --mode=incremental if present. Deletes marker only on success.
#
# Usage: source this script, then call: drain_pending_index "$CLEAR_DIR"
# Requires: PLUGIN_ROOT to be set (via common.sh or caller)

# Drain pending SQLite index rebuild.
# Args: $1 = CLEAR_DIR path (e.g., /path/to/project/.clear)
# Returns: 0 on success or no-op, 1 on index-cli failure (marker retained)
drain_pending_index() {
  local clear_dir="$1"
  local pending_marker="${clear_dir}/state/index-pending.json"

  # No marker = no-op
  if [ ! -f "$pending_marker" ]; then
    return 0
  fi

  # Resolve index-cli (prefer compiled JS)
  local plugin_root="${PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
  local index_cli_js="${plugin_root}/build/infrastructure/knowledge/cli/index-cli.js"
  local index_cli_ts="${plugin_root}/src/infrastructure/knowledge/cli/index-cli.ts"

  if [ -f "$index_cli_js" ]; then
    # Use && to delete marker only on success
    node "$index_cli_js" --clear-dir="$clear_dir" --mode=incremental >/dev/null 2>&1 \
      && rm -f "$pending_marker"
  elif [ -f "$index_cli_ts" ]; then
    npx ts-node "$index_cli_ts" --clear-dir="$clear_dir" --mode=incremental >/dev/null 2>&1 \
      && rm -f "$pending_marker"
  else
    # No index-cli available — retain marker for next attempt
    return 1
  fi
}
