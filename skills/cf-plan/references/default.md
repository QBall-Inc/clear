# Plan Overview (Default)

Shows a brief plan summary by loading the plan context via the CLI.

---

## Steps

### 1. Check Plan Exists

```bash
if [ ! -f ".clear/plans/master-plan.yaml" ]; then
  echo "NO_PLAN"
else
  echo "PLAN_EXISTS"
fi
```

If `NO_PLAN`: Display "No development plan found. Use `/cf-plan create` to create one." and stop.

### 2. Load Plan Context

```bash
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/load-cli.js" --clear-dir=.clear 2>/dev/null)
STATUS=$(echo "$RESULT" | jq -r '.status // "error"')
if [ "$STATUS" = "error" ]; then
  ERROR=$(echo "$RESULT" | jq -r '.error // "Unknown error"')
  echo "Error loading plan: $ERROR"
  exit 1
fi
CONTEXT=$(echo "$RESULT" | jq -r '.additionalContext // "No plan context available"')
echo "$CONTEXT"
```

### 3. Display Output

Present the plan context output to the user as-is. The CLI formats the summary including project name, active phase, and active workpackage.

---

## Related Subcommands

- `status` -- detailed plan information with multi-signal progress
- `progress` -- progress breakdown by phase
- `next` -- recommendation for next workpackage
