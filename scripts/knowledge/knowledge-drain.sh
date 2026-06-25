#!/bin/bash
# knowledge-drain.sh - Drain pending knowledge index updates + surfacing log
#
# Shared script callable from both SessionStart (knowledge-load.sh)
# and PreCompact (session-precompact.sh) hooks.
#
# Responsibilities:
# 1. Drain pending index rebuild (index-pending.json marker)
# 2. Aggregate surfacing-log.jsonl into SQLite surfaced_count
# 3. Periodic full reindex if last rebuild was >5 sessions ago
#
# Usage: source this script, then call: drain_pending_index "$CLEAR_DIR"
# Requires: PLUGIN_ROOT to be set (via common.sh or caller)

# Resolve index-cli path (shared by all drain functions)
# Sets INDEX_CLI variable. Returns 1 if not found.
_resolve_index_cli() {
  local plugin_root="${PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
  local index_cli_js="${plugin_root}/build/infrastructure/knowledge/cli/index-cli.js"
  local index_cli_ts="${plugin_root}/src/infrastructure/knowledge/cli/index-cli.ts"

  if [ -f "$index_cli_js" ]; then
    INDEX_CLI="$index_cli_js"
    INDEX_CLI_USE_NODE=true
  elif [ -f "$index_cli_ts" ]; then
    INDEX_CLI="$index_cli_ts"
    INDEX_CLI_USE_NODE=false
  else
    return 1
  fi
  return 0
}

# Run index-cli with given arguments
_run_index_cli() {
  if [ "$INDEX_CLI_USE_NODE" = true ]; then
    node "$INDEX_CLI" "$@"
  else
    npx ts-node "$INDEX_CLI" "$@"
  fi
}

# Drain pending SQLite index rebuild.
# Args: $1 = CLEAR_DIR path (e.g., /path/to/project/.clear)
# Returns: 0 on success or no-op, 1 on index-cli failure (marker retained)
drain_pending_index() {
  local clear_dir="$1"
  local pending_marker="${clear_dir}/state/index-pending.json"

  _resolve_index_cli || return 1

  # 1. Drain pending index rebuild marker
  if [ -f "$pending_marker" ]; then
    _run_index_cli --clear-dir="$clear_dir" --mode=incremental >/dev/null 2>&1 \
      && rm -f "$pending_marker"
  fi

  # 2. Aggregate surfacing-log.jsonl into SQLite surfaced_count
  local surfacing_log="${clear_dir}/state/surfacing-log.jsonl"
  if [ -f "$surfacing_log" ] && [ -s "$surfacing_log" ]; then
    _run_index_cli --clear-dir="$clear_dir" --update-counts="$surfacing_log" >/dev/null 2>&1 \
      && : > "$surfacing_log"
  fi

  # 3. Periodic full reindex if last rebuild was >5 sessions ago
  local session_file="${clear_dir}/state/session.json"
  local db_path="${clear_dir}/knowledge/index.db"
  if [ -f "$session_file" ] && [ -f "$db_path" ]; then
    local current_session
    current_session=$(jq -r '.clearSessionNumber // 0' "$session_file" 2>/dev/null)
    if [ -n "$current_session" ] && [ "$current_session" != "null" ] && [ "$current_session" -gt 0 ]; then
      local check_result
      check_result=$(_run_index_cli --clear-dir="$clear_dir" --check-thresholds --session="$current_session" 2>/dev/null)
      local should_rebuild
      should_rebuild=$(echo "$check_result" | jq -r '.shouldRebuild // false' 2>/dev/null)
      if [ "$should_rebuild" = "true" ]; then
        _run_index_cli --clear-dir="$clear_dir" --mode=full --session="$current_session" >/dev/null 2>&1 || true
      fi
    fi
  fi

  return 0
}
