#!/bin/bash
# bench-comparison.sh — measure where the WSL2 PreToolUse latency is spent.
# Compare: (a) bare-bones script invocation, (b) single-index pre-tool.sh,
# (c) dual-index pre-tool.sh — same fixture, same no-match path.

set -euo pipefail

readonly N_RUNS="${1:-100}"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PRE_TOOL="$PROJECT_ROOT/scripts/dispatchers/pre-tool.sh"

WORK_DUAL=$(mktemp -d)
WORK_SINGLE=$(mktemp -d)
trap "rm -rf '$WORK_DUAL' '$WORK_SINGLE'" EXIT

# Both workspaces have file-knowledge-index; only WORK_DUAL has owner-index
mkdir -p "$WORK_DUAL/.clear/state" "$WORK_DUAL/.clear/knowledge/entries"
mkdir -p "$WORK_SINGLE/.clear/state" "$WORK_SINGLE/.clear/knowledge/entries"

for d in "$WORK_DUAL" "$WORK_SINGLE"; do
cat > "$d/.clear/state/file-knowledge-index.json" <<'EOF'
{
  "version": "1.0",
  "lastBuilt": "2026-05-09T00:00:00Z",
  "entryCount": 1,
  "index": {
    "src/payments/": ["TD-001"]
  }
}
EOF
done

cat > "$WORK_DUAL/.clear/state/owner-index.json" <<'EOF'
{
  "version": "1.0",
  "lastBuilt": "2026-05-09T00:00:00Z",
  "entryCount": 1,
  "index": {
    "src/payments/": ["SH-001"]
  }
}
EOF

NO_MATCH_PATH="tests/some-file-not-in-index.ts"

build_stdin() {
  jq -n \
    --arg cwd "$1" \
    --arg fp "$NO_MATCH_PATH" \
    '{
      "hook_event_name": "PreToolUse",
      "tool_name": "Edit",
      "tool_input": {"file_path": $fp},
      "cwd": $cwd
    }'
}

STDIN_DUAL=$(build_stdin "$WORK_DUAL")
STDIN_SINGLE=$(build_stdin "$WORK_SINGLE")

# Baseline: just bash startup + jq stdin parse + immediate exit
BARE_SCRIPT=$(mktemp)
trap "rm -rf '$WORK_DUAL' '$WORK_SINGLE' '$BARE_SCRIPT'" EXIT
cat > "$BARE_SCRIPT" <<'EOF'
#!/bin/bash
INPUT=$(cat)
exit 0
EOF
chmod +x "$BARE_SCRIPT"

# Helper: run N times, return p95 ms
run_bench() {
  local label="$1"
  local script="$2"
  local stdin_data="$3"
  local timings_file
  timings_file=$(mktemp)

  # Warm up
  for _ in 1 2 3; do
    echo "$stdin_data" | "$script" >/dev/null 2>&1 || true
  done

  for ((i=1; i<=N_RUNS; i++)); do
    START=$(date +%s%N)
    echo "$stdin_data" | "$script" >/dev/null 2>&1 || true
    END=$(date +%s%N)
    echo "$((END - START))" >> "$timings_file"
  done

  local sorted_file
  sorted_file=$(mktemp)
  sort -n "$timings_file" > "$sorted_file"
  local p50_line=$(( N_RUNS / 2 ))
  local p95_line=$(( (N_RUNS * 95 + 99) / 100 ))
  local mean_ns p50_ns p95_ns
  mean_ns=$(awk '{s+=$1} END{printf "%.0f", s/NR}' "$timings_file")
  p50_ns=$(sed -n "${p50_line}p" "$sorted_file")
  p95_ns=$(sed -n "${p95_line}p" "$sorted_file")
  local mean_ms p50_ms p95_ms
  mean_ms=$(awk -v n="$mean_ns" 'BEGIN{printf "%.3f", n/1000000}')
  p50_ms=$(awk -v n="$p50_ns" 'BEGIN{printf "%.3f", n/1000000}')
  p95_ms=$(awk -v n="$p95_ns" 'BEGIN{printf "%.3f", n/1000000}')
  printf "%-25s mean=%8.3fms  p50=%8.3fms  p95=%8.3fms\n" "$label" "$mean_ms" "$p50_ms" "$p95_ms"
  rm -f "$timings_file" "$sorted_file"
}

echo "=== WSL2 PreToolUse latency decomposition (S155 / WP-K3.4 AC4) ==="
echo "Samples per scenario: $N_RUNS"
echo ""

run_bench "Bare bash + cat stdin"     "$BARE_SCRIPT" "$STDIN_DUAL"
run_bench "pre-tool.sh single-index"  "$PRE_TOOL"    "$STDIN_SINGLE"
run_bench "pre-tool.sh dual-index"    "$PRE_TOOL"    "$STDIN_DUAL"

echo ""
echo "Interpretation:"
echo "  Bare bash p95   = WSL2 baseline process-startup cost"
echo "  Single-index Δ  = pre-tool.sh logic with file-knowledge-index only"
echo "  Dual-index Δ    = K3.4 dual-index slurp addition on top of single-index"
