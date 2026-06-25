# Subcommand: Default (Show Active Workpackage)

Displays the status of the currently active workpackage.

---

## Arguments

None.

---

## Execution

```bash
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/status-cli.js" default --clear-dir=./.clear 2>/dev/null)
STATUS=$(echo "$RESULT" | jq -r '.status // "error"')
if [ "$STATUS" = "error" ]; then
  ERROR=$(echo "$RESULT" | jq -r '.error // "Unknown error"')
  echo "Error: $ERROR"; exit 1
fi
CONTEXT=$(echo "$RESULT" | jq -r '.message // "No active workpackage"')
echo "$CONTEXT"
```

---

## Expected Output

- Active workpackage ID and display name
- Current status and progress percentage
- Phase assignment
- Started date
- Dependency status
- Deliverables summary
- Linked knowledge entries

---

## Error Handling

- If no workpackage is active, display "No active workpackage".
- If the CLI returns an error status, extract and display the error message.
