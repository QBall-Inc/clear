# Subcommand: pause

Pauses the currently active workpackage.

---

## Arguments

None.

---

## Valid State Transition

- `in_progress` -> `paused`

---

## Execution

```bash
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/lifecycle-cli.js" pause --clear-dir=.clear 2>/dev/null)
CONTEXT=$(echo "$RESULT" | jq -r '.additionalContext // .error // "No active workpackage to pause"')
echo "$CONTEXT"
```

---

## Expected Output

- Workpackage ID and display name
- New status: `paused`
- Duration active before pause

---

## Error Handling

- If no workpackage is currently active, display "No active workpackage to pause".
- If the active workpackage is not in `in_progress` state, exit with code 3.
