# Plan Status

Shows detailed plan information including all phases, active workpackage, and multi-signal progress breakdown.

---

## Steps

### 1. Extract Plan Metadata

```bash
echo "Plan Status"
echo "==========="
echo ""

NAME=$(grep '^projectName:' .clear/plans/master-plan.yaml | cut -d: -f2- | xargs)
ACTIVE_PHASE=$(grep '^activePhase:' .clear/plans/master-plan.yaml | cut -d: -f2- | xargs)
ACTIVE_WP=$(grep '^activeWorkpackage:' .clear/plans/master-plan.yaml | cut -d: -f2- | xargs)

echo "Project: $NAME"
echo "Active Phase: $ACTIVE_PHASE"
echo "Active Workpackage: $ACTIVE_WP"
echo ""
```

### 2. Calculate Progress

```bash
PROGRESS_RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/progress-cli.js" --clear-dir=./.clear 2>/dev/null)
PROGRESS=$(echo "$PROGRESS_RESULT" | jq -r '.progress // 0')
PROGRESS_PCT=$(echo "$PROGRESS" | awk '{printf "%.0f", $1 * 100}')

echo "Phase Progress: $PROGRESS_PCT%"
echo ""
```

### 3. Show Multi-Signal Breakdown

```bash
WP_SIGNAL=$(echo "$PROGRESS_RESULT" | jq -r '.multiSignal.workpackages // 0')
COMMIT_SIGNAL=$(echo "$PROGRESS_RESULT" | jq -r '.multiSignal.commits // 0')
TEST_SIGNAL=$(echo "$PROGRESS_RESULT" | jq -r '.multiSignal.tests // 0')

if [ "$WP_SIGNAL" != "0" ] || [ "$COMMIT_SIGNAL" != "0" ] || [ "$TEST_SIGNAL" != "0" ]; then
  WP_PCT=$(echo "$WP_SIGNAL" | awk '{printf "%.0f", $1 * 100}')
  COMMIT_PCT=$(echo "$COMMIT_SIGNAL" | awk '{printf "%.0f", $1 * 100}')
  TEST_PCT=$(echo "$TEST_SIGNAL" | awk '{printf "%.0f", $1 * 100}')
  echo "Multi-Signal Progress:"
  echo "  Workpackages: $WP_PCT%"
  echo "  Commits: $COMMIT_PCT%"
  echo "  Tests: $TEST_PCT%"
fi
```

### 4. Display Output

Present all collected status information to the user. Include the multi-signal breakdown only when non-zero values are present.
