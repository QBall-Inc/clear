# Subcommand: complete

Completes the active workpackage after validation.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--force` | No | Complete even if validation has warnings |

---

## Valid State Transition

- `in_progress` -> `complete` (requires validation pass, or `--force`)

---

## Execution

```bash
FORCE_FLAG=""
if [[ "$*" == *"--force"* ]]; then FORCE_FLAG="--force"; fi
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/lifecycle-cli.js" complete $FORCE_FLAG --clear-dir=./.clear 2>/dev/null)
CONTEXT=$(echo "$RESULT" | jq -r '.message // .error // "Unknown error"')
echo "$CONTEXT"
```

---

## Expected Output

- Workpackage ID and final status: `complete`
- Duration from start to completion
- Knowledge entries created during workpackage
- Deliverables summary
- Downstream impact (dependents now unblocked)
- Plan progress update

---

## Error Handling

- If no workpackage is active, display error.
- If validation fails (without `--force`), exit with code 5.
- If invalid state transition, exit with code 3.
