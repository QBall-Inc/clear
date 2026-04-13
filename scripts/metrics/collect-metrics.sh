#!/bin/bash
# collect-metrics.sh - Extract metrics from session handoff YAML frontmatter
#
# Reads the latest session handoff document and extracts metrics from the
# YAML frontmatter block. Computes derived metrics and appends to CSV.
#
# Usage:
#   ./collect-metrics.sh [--session N] [--output path/to/metrics.csv]
#
# The script expects handoff documents to have a YAML frontmatter block
# between --- markers at the top of the file.

export SCRIPT_NAME="collect-metrics"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

# Default paths
CLEAR_DIR=".clear"
SESSIONS_DIR="${CLEAR_DIR}/sessions"
METRICS_FILE="${CLEAR_DIR}/metrics/metrics.csv"

# Parse arguments
SESSION_NUM=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --session)
      SESSION_NUM="$2"
      shift 2
      ;;
    --output)
      METRICS_FILE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ==============================================================================
# FIND HANDOFF FILE
# ==============================================================================

find_latest_handoff() {
  ls -1 "${SESSIONS_DIR}"/session_*.md 2>/dev/null | \
    sort -t_ -k2 -n | \
    tail -1
}

find_session_handoff() {
  local session=$1
  ls -1 "${SESSIONS_DIR}"/session_${session}_*.md 2>/dev/null | head -1
}

if [ -n "$SESSION_NUM" ]; then
  HANDOFF_FILE=$(find_session_handoff "$SESSION_NUM")
else
  HANDOFF_FILE=$(find_latest_handoff)
fi

if [ -z "$HANDOFF_FILE" ] || [ ! -f "$HANDOFF_FILE" ]; then
  echo "Error: No handoff file found"
  exit 1
fi

echo "Reading: $(basename "$HANDOFF_FILE")"

# ==============================================================================
# EXTRACT YAML FRONTMATTER
# ==============================================================================

# Extract content between first two --- markers
extract_frontmatter() {
  local file=$1
  sed -n '/^---$/,/^---$/p' "$file" | sed '1d;$d'
}

FRONTMATTER=$(extract_frontmatter "$HANDOFF_FILE")

# Helper to extract YAML value
yaml_value() {
  local key=$1
  echo "$FRONTMATTER" | grep "^${key}:" | sed "s/^${key}:[[:space:]]*//" | sed 's/^"//' | sed 's/"$//'
}

# ==============================================================================
# EXTRACT METRICS
# ==============================================================================

# Session Identity
SESSION=$(yaml_value "session")
DATE=$(yaml_value "date")
WORKPACKAGE=$(yaml_value "workpackage")
# shellcheck disable=SC2034  # Extracted for future CSV columns
BRANCH=$(yaml_value "branch")
STATUS=$(yaml_value "status")

# Token Metrics
TOKENS_PCT=$(yaml_value "tokens_pct")
TOKENS_COUNT=$(yaml_value "tokens_count")
PROMPTS=$(yaml_value "prompts")

# Code Files
PROD_FILES_CREATED=$(yaml_value "prod_files_created")
PROD_FILES_MODIFIED=$(yaml_value "prod_files_modified")
TEST_FILES_CREATED=$(yaml_value "test_files_created")
TEST_FILES_MODIFIED=$(yaml_value "test_files_modified")

# Lines of Code
LINES_PROD=$(yaml_value "lines_prod")
LINES_TEST=$(yaml_value "lines_test")
LINES_DOCS=$(yaml_value "lines_docs")

# Documentation Files
DOCS_CREATED=$(yaml_value "docs_created")
DOCS_MODIFIED=$(yaml_value "docs_modified")

# Test Results
TESTS_PASSED=$(yaml_value "tests_passed")
# shellcheck disable=SC2034  # Extracted for future CSV columns
TESTS_FAILED=$(yaml_value "tests_failed")
TESTS_TOTAL=$(yaml_value "tests_total")

# Session Metadata
COMPLEXITY=$(yaml_value "complexity")
DECISIONS_COUNT=$(yaml_value "decisions_count")
ACTUAL_HOURS=$(yaml_value "actual_hours")

# ==============================================================================
# COMPUTE DERIVED METRICS
# ==============================================================================

# Session Type Classification
# - planning: >70% docs
# - implementation: >40% prod
# - testing: >50% test and <500 total lines
# - mixed: everything else
compute_session_type() {
  local prod=${LINES_PROD:-0}
  local test=${LINES_TEST:-0}
  local docs=${LINES_DOCS:-0}
  local total=$((prod + test + docs))

  if [ "$total" -eq 0 ]; then
    echo "mixed"
    return
  fi

  # Calculate percentages (multiply by 100 for integer math)
  local doc_pct=$((docs * 100 / total))
  local prod_pct=$((prod * 100 / total))
  local test_pct=$((test * 100 / total))

  if [ "$doc_pct" -gt 70 ]; then
    echo "planning"
  elif [ "$prod_pct" -gt 40 ]; then
    echo "implementation"
  elif [ "$test_pct" -gt 50 ] && [ "$total" -lt 500 ]; then
    echo "testing"
  else
    echo "mixed"
  fi
}

# Human Hours Equivalent Calculation
# Based on rubric:
#   - prod_lines: 25 lines/hour (adjusted by complexity)
#   - test_lines: 15 lines/hour
#   - doc_lines: 40 lines/hour
#   - arch_decisions: 2 hours each
#   - debug_multiplier: 1.3x
compute_human_hours() {
  local prod=${LINES_PROD:-0}
  local test=${LINES_TEST:-0}
  local docs=${LINES_DOCS:-0}
  local decisions=${DECISIONS_COUNT:-0}
  local complexity=${COMPLEXITY:-medium}

  # Complexity multipliers
  local complexity_mult
  case $complexity in
    simple)   complexity_mult="1.0" ;;
    moderate|medium) complexity_mult="0.7" ;;
    complex)  complexity_mult="0.5" ;;
    *)        complexity_mult="0.7" ;;
  esac

  # Calculate hours using awk for floating point (no bc dependency)
  local prod_hours test_hours doc_hours decision_hours subtotal total
  prod_hours=$(calc "($prod / 25) * $complexity_mult")
  test_hours=$(calc "$test / 15")
  doc_hours=$(calc "$docs / 40")
  decision_hours=$(calc "$decisions * 2")

  subtotal=$(calc "$prod_hours + $test_hours + $doc_hours + $decision_hours")
  total=$(calc "$subtotal * 1.3")  # Debug multiplier

  echo "$total"
}

SESSION_TYPE=$(compute_session_type)
HUMAN_HOURS=$(compute_human_hours)

# Efficiency Multiplier
if [ -n "$ACTUAL_HOURS" ] && [ "$ACTUAL_HOURS" != "0" ]; then
  EFFICIENCY=$(awk "BEGIN { printf \"%.1f\", $HUMAN_HOURS / $ACTUAL_HOURS }")
else
  EFFICIENCY="0.0"
fi

# ==============================================================================
# OUTPUT
# ==============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "                 CLEAR Metrics Collection"
echo "═══════════════════════════════════════════════════════════════"
echo "Session:           ${SESSION}"
echo "Date:              ${DATE}"
echo "Workpackage:       ${WORKPACKAGE}"
echo "Status:            ${STATUS}"
echo "───────────────────────────────────────────────────────────────"
echo "Code Lines:        ${LINES_PROD:-0} prod, ${LINES_TEST:-0} test, ${LINES_DOCS:-0} docs"
echo "Code Files:        ${PROD_FILES_CREATED:-0}+${PROD_FILES_MODIFIED:-0} prod, ${TEST_FILES_CREATED:-0}+${TEST_FILES_MODIFIED:-0} test"
echo "Doc Files:         ${DOCS_CREATED:-0} created, ${DOCS_MODIFIED:-0} modified"
echo "Tests:             ${TESTS_PASSED:-0}/${TESTS_TOTAL:-0} passed"
echo "───────────────────────────────────────────────────────────────"
echo "Tokens:            ${TOKENS_COUNT:-0} (${TOKENS_PCT:-0}%)"
echo "Prompts:           ${PROMPTS:-0}"
echo "───────────────────────────────────────────────────────────────"
echo "Session Type:      ${SESSION_TYPE}"
echo "Complexity:        ${COMPLEXITY:-medium}"
echo "Decisions:         ${DECISIONS_COUNT:-0}"
echo "───────────────────────────────────────────────────────────────"
echo "Human Hours Equiv: ${HUMAN_HOURS} hours"
echo "Actual Hours:      ${ACTUAL_HOURS:-2.5} hours"
echo "Efficiency:        ${EFFICIENCY}x"
echo "═══════════════════════════════════════════════════════════════"

# ==============================================================================
# APPEND TO CSV
# ==============================================================================

# Ensure metrics directory exists
mkdir -p "$(dirname "$METRICS_FILE")"

# Create CSV header if file doesn't exist
if [ ! -f "$METRICS_FILE" ]; then
  echo "session,date,workpackage,status,session_type,lines_prod,lines_test,lines_docs,prod_files_created,prod_files_modified,test_files_created,test_files_modified,docs_created,docs_modified,tests_passed,tests_total,tokens_count,tokens_pct,prompts,complexity,decisions_count,human_hours_equiv,actual_hours,efficiency_mult" > "$METRICS_FILE"
fi

# Append row
echo "${SESSION},${DATE},\"${WORKPACKAGE}\",${STATUS},${SESSION_TYPE},${LINES_PROD:-0},${LINES_TEST:-0},${LINES_DOCS:-0},${PROD_FILES_CREATED:-0},${PROD_FILES_MODIFIED:-0},${TEST_FILES_CREATED:-0},${TEST_FILES_MODIFIED:-0},${DOCS_CREATED:-0},${DOCS_MODIFIED:-0},${TESTS_PASSED:-0},${TESTS_TOTAL:-0},${TOKENS_COUNT:-0},${TOKENS_PCT:-0},${PROMPTS:-0},${COMPLEXITY:-medium},${DECISIONS_COUNT:-0},${HUMAN_HOURS},${ACTUAL_HOURS:-2.5},${EFFICIENCY}" >> "$METRICS_FILE"

echo ""
echo "✓ Metrics appended to ${METRICS_FILE}"
