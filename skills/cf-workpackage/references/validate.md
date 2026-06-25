# Subcommand: validate

Checks whether the active workpackage meets completion criteria.

---

## Arguments

None.

---

## Execution

```bash
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/progress-cli.js" validate --clear-dir=./.clear 2>/dev/null)
CONTEXT=$(echo "$RESULT" | jq -r '.message // "No active workpackage"')
echo "$CONTEXT"
```

---

## Expected Output

Validation report including:
- All deliverables completed (yes/no with details)
- Acceptance criteria met
- Blocking issues or unresolved items
- Readiness verdict: PASS or FAIL with reasons

---

## Error Handling

- If no workpackage is active, display "No active workpackage".
- If validation fails, exit with code 5 and list failing criteria.
