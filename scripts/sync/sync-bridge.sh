#!/bin/bash
# sync-bridge.sh - Bridge from hook dispatchers to SyncStateManager CLI
#
# Wraps a single Node.js CLI invocation to batch sync operations per hook call.
# Avoids spawning Node.js multiple times per hook event.
#
# Usage: sync-bridge.sh --op=<operation> --clear-dir=<path> [--data=<json>]
#
# Operations (R3.1 baseline):
#   update-workpackage  Update WP summary in sync-state
#   update-knowledge    Update knowledge summary after capture
#   persist             Flush sync-state to disk
#   load                Load and output sync-state as JSON
#   reconcile           Placeholder (R3.3a implements real logic)

export SCRIPT_NAME="sync-bridge"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

# Resolve the sync-bridge CLI tool
CLI_TOOL=$(resolve_cli "sync/cli/sync-bridge-cli") || {
  log "sync-bridge-cli not found"
  echo '{"success":false,"op":"unknown","error":"sync-bridge-cli not found"}'
  exit 1
}

# Pass all arguments through to the CLI
if [[ "$CLI_TOOL" == *.js ]]; then
  node "$CLI_TOOL" "$@"
else
  npx ts-node "$CLI_TOOL" "$@"
fi
