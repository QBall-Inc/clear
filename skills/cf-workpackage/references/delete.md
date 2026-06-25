# Subcommand: delete

Archives a workpackage, removing it from the active registry.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<id>` | Yes | Workpackage ID to delete |
| `--confirm` | No | Skip confirmation prompt |

---

## Valid State Transitions

- `not_started` -> `archived`
- `paused` -> `archived`
- `complete` -> `archived`

Note: Cannot delete a workpackage in `in_progress` state. Pause it first.

---

## Execution

```bash
WP_ID="$1"
CONFIRM_FLAG=""
if [ -z "$WP_ID" ]; then
  echo "Usage: /cf-workpackage delete <id> [--confirm]"; exit 1
fi
if [[ "$*" == *"--confirm"* ]]; then CONFIRM_FLAG="--confirm"; fi
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/lifecycle-cli.js" delete "$WP_ID" $CONFIRM_FLAG --clear-dir=./.clear 2>/dev/null)
CONTEXT=$(echo "$RESULT" | jq -r '.message // .error // "Unknown error"')
echo "$CONTEXT"
```

---

## Expected Output

- Workpackage ID archived
- Confirmation of removal from active registry
- Downstream dependents notified (if any)

---

## Error Handling

- If `<id>` is missing, display usage and exit with code 1.
- If workpackage not found, exit with code 2.
- If workpackage is `in_progress`, exit with code 3 and advise to pause first.
