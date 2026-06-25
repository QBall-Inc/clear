#!/usr/bin/env bash
# smoke-knowledge-binding.sh — Release gate for the knowledge-system native binding.
#
# Proves a fresh init produces a LOADABLE better-sqlite3 binding and the knowledge system
# works end-to-end: init -> capture -> index -> search returns matchCount>0. FAILS if the
# binding is missing or the search path is blind. This is the gate that stops a plugin from
# shipping with no loadable native binding (the knowledge system silently non-functional).
#
# Usage: ./scripts/smoke-knowledge-binding.sh [staged-plugin-root]
#   staged-plugin-root  Optional. A built plugin tree (build/ + node_modules/). When omitted,
#                       a fresh staging is built into a temp dir via build-staging.sh, so the
#                       gate exercises exactly what ships.
#
# Requires network access — the binding is fetched via prebuild-install (download-first
# bootstrap). This is a MANUAL pre-swap-promote gate, not an offline CI unit test.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/clear-smoke-binding.XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# 1. Resolve the staged plugin root (build a fresh staging when not provided).
if [ -n "${1:-}" ]; then
  PLUGIN_ROOT="$(cd "$1" && pwd)"
  echo "[smoke] Using provided plugin root: $PLUGIN_ROOT"
else
  PLUGIN_ROOT="$WORK/staging"
  echo "[smoke] Building fresh staging into $PLUGIN_ROOT ..."
  bash "$PROJECT_ROOT/scripts/build-staging.sh" "$PLUGIN_ROOT" >/dev/null
fi

# 2. Sanity: the staged plugin must ship better-sqlite3 (the bootstrap target).
if [ ! -d "$PLUGIN_ROOT/node_modules/better-sqlite3" ]; then
  echo "[smoke] FAIL: staged plugin has no node_modules/better-sqlite3 at $PLUGIN_ROOT" >&2
  exit 1
fi

PROJ="$WORK/proj"
mkdir -p "$PROJ"
CLEAR_DIR="$PROJ/.clear"
KNOW_CLI="$PLUGIN_ROOT/build/infrastructure/knowledge/cli"

# 3. Init the throwaway project against the staged plugin — triggers the sqlite bootstrap
#    (download-first), which must produce a loadable binding in the staged node_modules.
echo "[smoke] Running cf-init (triggers sqlite native-module bootstrap) ..."
node "$PLUGIN_ROOT/build/infrastructure/init/cli/init-cli.js" \
  --cwd="$PROJ" --plugin-root="$PLUGIN_ROOT" --skip-statusline </dev/null 2>&1 | tail -2 || true

# 4. The binding must now load (authoritative check: in-memory open in a fresh child).
if ! BSQ_DIR="$PLUGIN_ROOT/node_modules/better-sqlite3" node -e "const D=require(process.env.BSQ_DIR); new D(':memory:').close()" 2>/dev/null; then
  echo "[smoke] FAIL: better-sqlite3 binding does not load after init — the bootstrap did not produce a usable binding." >&2
  exit 1
fi
echo "[smoke] Binding loads OK."

# 5. Capture -> index -> search end-to-end. "smoke" is the distinctive query term.
node "$KNOW_CLI/capture-cli.js" --create \
  --clear-dir="$CLEAR_DIR" --type=lesson-learned \
  --title="Knowledge binding smoke probe" \
  --description="Native binding smoke probe sentinel for the release gate." \
  --session=1 >/dev/null

node "$KNOW_CLI/index-cli.js" --clear-dir="$CLEAR_DIR" --mode=full --force >/dev/null

SEARCH_OUT="$(node "$KNOW_CLI/search-cli.js" --query="smoke" --clear-dir="$CLEAR_DIR" 2>&1)"
MATCH_COUNT="$(printf '%s' "$SEARCH_OUT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).matchCount||0)}catch{console.log(0)}})")"

echo "[smoke] search matchCount=$MATCH_COUNT"
if [ "${MATCH_COUNT:-0}" -gt 0 ]; then
  echo "[smoke] PASS: knowledge binding + capture/index/search end-to-end OK."
  exit 0
fi

echo "[smoke] FAIL: search returned matchCount=0 — binding/index path is broken." >&2
echo "$SEARCH_OUT" >&2
exit 1
