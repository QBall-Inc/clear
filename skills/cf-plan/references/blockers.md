# Blocker Analysis

Checks for blocking issues and provides suggestions for resolution.

---

## Steps

### 1. Run Blockers CLI

```bash
echo "Blocker Analysis"
echo "================"
echo ""

RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/blockers-cli.js" --clear-dir=.clear 2>/dev/null)
```

### 2. Display Blockers

```bash
CONTEXT=$(echo "$RESULT" | jq -r '.additionalContext // "Unable to analyze blockers"')
echo "$CONTEXT"
```

### 3. Display Suggestions

```bash
SUGGESTIONS=$(echo "$RESULT" | jq -r '.suggestions[]? // empty')
if [ -n "$SUGGESTIONS" ]; then
  echo ""
  echo "Suggestions:"
  echo "$RESULT" | jq -r '.suggestions[]' | while read -r suggestion; do
    echo "  - $suggestion"
  done
fi
```

### 4. Display Output

Present blocker analysis and any suggestions to the user. If no blockers are found, the CLI context will indicate a clean state.

---

## Related Subcommands

- `next` -- suggests next workpackage considering blockers
- `progress` -- current progress that may be affected by blockers
