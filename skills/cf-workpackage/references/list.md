# Subcommand: list

Lists all workpackages with optional filters.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--all` | No | Include archived workpackages |
| `--phase <id>` | No | Filter by phase ID |
| `--status <status>` | No | Filter by status |

---

## Execution

```bash
FLAGS=""
if [[ "$*" == *"--all"* ]]; then FLAGS="$FLAGS --all"; fi

PHASE_ID=$(echo "$*" | sed -n 's/.*--phase[= ]\([^ ]*\).*/\1/p')
if [ -n "$PHASE_ID" ]; then FLAGS="$FLAGS --phase=$PHASE_ID"; fi

STATUS_FILTER=$(echo "$*" | sed -n 's/.*--status[= ]\([^ ]*\).*/\1/p')
if [ -n "$STATUS_FILTER" ]; then FLAGS="$FLAGS --status=$STATUS_FILTER"; fi

RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/status-cli.js" list $FLAGS --clear-dir=.clear 2>/dev/null)
CONTEXT=$(echo "$RESULT" | jq -r '.additionalContext // "No workpackages found"')
echo "$CONTEXT"
```

---

## Expected Output

Table with columns:
- ID (display ID)
- Name
- Status
- Progress (percentage)
- Dependencies

---

## Error Handling

- If no workpackages exist, display "No workpackages found".
