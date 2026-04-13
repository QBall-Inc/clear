# Subcommand: show

Displays detailed information for a specific workpackage.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<id>` | Yes | Workpackage ID to display |

---

## Execution

```bash
WP_ID="$1"
if [ -z "$WP_ID" ]; then
  echo "Usage: /cf-workpackage show <id>"; exit 1
fi
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/status-cli.js" show "$WP_ID" --clear-dir=.clear 2>/dev/null)
CONTEXT=$(echo "$RESULT" | jq -r '.additionalContext // "Workpackage not found"')
echo "$CONTEXT"
```

---

## Expected Output

Comprehensive details including:
- Identity (system ID, display ID, title)
- Current status and progress
- Dependencies — upstream (hard and soft)
- Dependents — downstream workpackages
- Deliverables list with completion status
- Linked knowledge entries

---

## Error Handling

- If `<id>` is missing, display usage and exit with code 1.
- If workpackage not found, display "Workpackage not found" and exit with code 2.
