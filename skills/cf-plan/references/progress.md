# Plan Progress by Phase

Shows progress breakdown by phase using the progress CLI.

---

## Steps

### 1. Run Progress CLI

```bash
echo "Plan Progress by Phase"
echo "======================"
echo ""

RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/progress-cli.js" --clear-dir=.clear 2>/dev/null)
```

### 2. Display Formatted Progress

```bash
CONTEXT=$(echo "$RESULT" | jq -r '.additionalContext // empty')
if [ -n "$CONTEXT" ]; then
  echo "$CONTEXT"
else
  PROGRESS=$(echo "$RESULT" | jq -r '.progress // 0')
  PROGRESS_PCT=$(echo "$PROGRESS" | awk '{printf "%.0f", $1 * 100}')
  echo "Current phase: $PROGRESS_PCT% complete"
fi
```

### 3. Display Output

Present the progress context to the user. The CLI provides phase-by-phase breakdown when available; otherwise a single progress percentage for the current phase is shown.

---

## Related Subcommands

- `status` -- detailed plan status with multi-signal breakdown
- `blockers` -- issues blocking progress
