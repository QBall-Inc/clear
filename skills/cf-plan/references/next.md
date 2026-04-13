# Next Workpackage Suggestion

Suggests the next workpackage to work on based on dependencies and status.

---

## Steps

### 1. Run Next CLI

```bash
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/next-cli.js" --clear-dir=.clear 2>/dev/null)
STATUS=$(echo "$RESULT" | jq -r '.status // "error"')
```

### 2. Check for Errors

```bash
if [ "$STATUS" = "error" ]; then
  ERROR=$(echo "$RESULT" | jq -r '.error // "Unknown error"')
  echo "Error: $ERROR"
  exit 1
fi
```

### 3. Display Recommendation

```bash
CONTEXT=$(echo "$RESULT" | jq -r '.additionalContext // "No recommendation available"')
echo "$CONTEXT"
```

### 4. Display Output

Present the next workpackage recommendation to the user. The CLI considers dependency ordering, completion status, and blocker state when making recommendations.

---

## Related Subcommands

- `blockers` -- analyze what might be blocking progress
- `status` -- full plan status for context
