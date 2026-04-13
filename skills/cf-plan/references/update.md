# Plan Update

Programmatic plan state updates: change active phase, mark milestones complete, or trigger plan rollup.

---

## Subcommands

### Set Active Phase

```bash
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/update-cli.js" \
  --cwd=. --clear-dir=.clear \
  --active-phase="$PHASE_ID" \
  --session-id="$CLAUDE_SESSION_ID" \
  --session-number="$CLEAR_SESSION_NUMBER" 2>/dev/null)

STATUS=$(echo "$RESULT" | jq -r '.status')
if [ "$STATUS" = "success" ]; then
  echo "$RESULT" | jq -r '.additionalContext'
else
  echo "Error: $(echo "$RESULT" | jq -r '.error')"
fi
```

Where `$PHASE_ID` is either a display ID (e.g., `Phase-2`) or a system ID (e.g., `ph-a1b2c3d4`).

### Mark Milestone Complete

```bash
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/update-cli.js" \
  --cwd=. --clear-dir=.clear \
  --milestone="$MILESTONE_ID" --status=complete \
  --session-id="$CLAUDE_SESSION_ID" \
  --session-number="$CLEAR_SESSION_NUMBER" 2>/dev/null)

STATUS=$(echo "$RESULT" | jq -r '.status')
if [ "$STATUS" = "success" ]; then
  echo "$RESULT" | jq -r '.additionalContext'
else
  echo "Error: $(echo "$RESULT" | jq -r '.error')"
fi
```

### Trigger Plan Rollup

Recalculates phase progress from workpackage completion status and writes results back to master-plan.yaml.

```bash
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/update-cli.js" \
  --cwd=. --clear-dir=.clear \
  --rollup \
  --session-id="$CLAUDE_SESSION_ID" \
  --session-number="$CLEAR_SESSION_NUMBER" 2>/dev/null)

STATUS=$(echo "$RESULT" | jq -r '.status')
if [ "$STATUS" = "success" ]; then
  echo "$RESULT" | jq -r '.additionalContext'
else
  echo "Error: $(echo "$RESULT" | jq -r '.error')"
fi
```

---

## Notes

- `--active-phase` accepts both display IDs and system IDs
- `--milestone` currently only supports `--status=complete`
- `--rollup` writes updated progress and derived phase status back to master-plan.yaml (with backup)
- All operations update plan.json state and output JSON to stdout
