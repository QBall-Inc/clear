#!/bin/bash
# bench-pretooluse-dualindex.sh — WSL2 perf benchmark for PreToolUse dual-index lookup
#
# WP-K3.4 AC4 SHIP-BLOCKING:
#   "PreToolUse hook completes in <10ms on WSL2 on the no-match path with
#    dual-index lookup active — benchmark required before shipping this WP"
#
# Procedure:
#   1. Build temp workspace with .clear/ containing both file-knowledge-index.json
#      AND owner-index.json (forces the dual-index slurp path in pre-tool.sh)
#   2. Run pre-tool.sh N times with stdin JSON for a file path NOT in either
#      index (the no-match path — most common runtime case, slowest jq path
#      because both exact AND prefix matches must be exhausted)
#   3. Report mean, p50, p95, max latency in milliseconds
#   4. Compare p95 against 10ms threshold; exit 0 if pass, 1 if fail

set -euo pipefail

readonly N_RUNS="${1:-100}"
readonly THRESHOLD_MS=10

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PRE_TOOL="$PROJECT_ROOT/scripts/dispatchers/pre-tool.sh"

if [ ! -x "$PRE_TOOL" ]; then
  echo "ERROR: pre-tool.sh not found or not executable: $PRE_TOOL" >&2
  exit 2
fi

# Set up temp workspace
WORK=$(mktemp -d)
trap "rm -rf '$WORK'" EXIT

mkdir -p "$WORK/.clear/state" "$WORK/.clear/knowledge/entries"

# File-knowledge-index with one entry mapping
cat > "$WORK/.clear/state/file-knowledge-index.json" <<'EOF'
{
  "version": "1.0",
  "lastBuilt": "2026-05-09T00:00:00Z",
  "entryCount": 1,
  "index": {
    "src/payments/": ["TD-001"]
  }
}
EOF

# Owner-index with SH entry for src/payments/
cat > "$WORK/.clear/state/owner-index.json" <<'EOF'
{
  "version": "1.0",
  "lastBuilt": "2026-05-09T00:00:00Z",
  "entryCount": 1,
  "index": {
    "src/payments/": ["SH-001"]
  }
}
EOF

# SH-001 entry markdown (so the pre-tool surface lookup can read it if needed)
cat > "$WORK/.clear/knowledge/entries/SH-001.md" <<'EOF'
---
id: SH-001
title: "Payments Team"
type: stakeholder
status: active
tags: [team]
created: "2026-05-09T00:00:00Z"
created_session: 1
schema_version: 8
entity_type: team
role: "Platform ownership"
owns:
  - src/payments/
contact: "#payments-oncall"
description: "Bench fixture"
---

# Payments Team

Bench fixture body.
EOF

# No-match path: tests/some-file-not-in-index.ts — neither index has this prefix
NO_MATCH_PATH="tests/some-file-not-in-index.ts"

# Build stdin JSON once
STDIN_JSON=$(jq -n \
  --arg cwd "$WORK" \
  --arg fp "$NO_MATCH_PATH" \
  '{
    "hook_event_name": "PreToolUse",
    "tool_name": "Edit",
    "tool_input": {"file_path": $fp},
    "cwd": $cwd
  }')

# Warm up (3 runs — JIT, jq cache, etc.)
for _ in 1 2 3; do
  echo "$STDIN_JSON" | "$PRE_TOOL" >/dev/null 2>&1 || true
done

# Benchmark: collect N latency samples in nanoseconds
TIMINGS_FILE=$(mktemp)
trap "rm -rf '$WORK' '$TIMINGS_FILE'" EXIT

echo "Running $N_RUNS samples on no-match path with dual-index active..." >&2

for ((i=1; i<=N_RUNS; i++)); do
  START=$(date +%s%N)
  echo "$STDIN_JSON" | "$PRE_TOOL" >/dev/null 2>&1 || true
  END=$(date +%s%N)
  echo "$((END - START))" >> "$TIMINGS_FILE"
done

# Compute stats: convert ns → ms with awk; p50 + p95 via sorted access
SORTED_FILE=$(mktemp)
trap "rm -rf '$WORK' '$TIMINGS_FILE' '$SORTED_FILE'" EXIT
sort -n "$TIMINGS_FILE" > "$SORTED_FILE"

MIN_NS=$(head -1 "$SORTED_FILE")
MAX_NS=$(tail -1 "$SORTED_FILE")
MEAN_NS=$(awk '{s+=$1} END{printf "%.0f", s/NR}' "$TIMINGS_FILE")
P50_LINE=$(( N_RUNS / 2 ))
P95_LINE=$(( (N_RUNS * 95 + 99) / 100 ))    # ceil
P50_NS=$(sed -n "${P50_LINE}p" "$SORTED_FILE")
P95_NS=$(sed -n "${P95_LINE}p" "$SORTED_FILE")

# ns → ms (3 decimals)
ns_to_ms() { awk -v n="$1" 'BEGIN{printf "%.3f", n/1000000}'; }

MIN_MS=$(ns_to_ms "$MIN_NS")
MAX_MS=$(ns_to_ms "$MAX_NS")
MEAN_MS=$(ns_to_ms "$MEAN_NS")
P50_MS=$(ns_to_ms "$P50_NS")
P95_MS=$(ns_to_ms "$P95_NS")

cat <<EOF
=== PreToolUse dual-index perf benchmark (S155 / WP-K3.4 AC4) ===
Samples:           $N_RUNS
Path:              $NO_MATCH_PATH (no-match)
Indexes active:    file-knowledge-index.json + owner-index.json (dual)

Latency (ms):
  min:    $MIN_MS
  mean:   $MEAN_MS
  p50:    $P50_MS
  p95:    $P95_MS
  max:    $MAX_MS

AC4 threshold: p95 < ${THRESHOLD_MS}ms
EOF

# Verdict
P95_OK=$(awk -v p="$P95_MS" -v t="$THRESHOLD_MS" 'BEGIN{print (p < t) ? 1 : 0}')

if [ "$P95_OK" = "1" ]; then
  echo "VERDICT: PASS (p95 ${P95_MS}ms < ${THRESHOLD_MS}ms)"
  exit 0
else
  echo "VERDICT: FAIL (p95 ${P95_MS}ms >= ${THRESHOLD_MS}ms)" >&2
  exit 1
fi
