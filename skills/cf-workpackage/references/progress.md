# Subcommand: progress

Views or updates progress on the active workpackage.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<N>` | No | Set progress to N percent (0-100). Shorthand for `--set <N>`. |
| `--set <N>` | No | Set progress to N percent (0-100) |

If neither `<N>` nor `--set` is provided, displays current progress. Both `progress 100` and `progress --set 100` are equivalent.

---

## Execution

```bash
SET_VALUE=""
if [[ "$*" == *"--set"* ]]; then
  SET_VALUE=$(echo "$*" | sed -n 's/.*--set[= ]\([0-9]*\).*/\1/p')
fi
if [ -n "$SET_VALUE" ]; then
  RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/progress-cli.js" progress --set="$SET_VALUE" --clear-dir=.clear 2>/dev/null)
else
  RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/progress-cli.js" progress --clear-dir=.clear 2>/dev/null)
fi
CONTEXT=$(echo "$RESULT" | jq -r '.additionalContext // "No active workpackage"')
echo "$CONTEXT"
```

---

## Expected Output

**View mode:** Current progress percentage, deliverables status, blockers if any.

**Set mode:** Updated progress percentage confirmation.

---

## Deliverable Completion

To mark individual deliverables as complete (updates progress automatically):

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/progress-cli.js" \
  --clear-dir=.clear --deliverable="$DELIVERABLE_ID" --complete
```

| Argument | Required | Description |
|----------|----------|-------------|
| `--deliverable=<id>` | Yes | Deliverable ID (e.g., `deliverable-1`) |
| `--complete` | Yes | Mark the deliverable as complete |
| `--file=<path>` | No | File path for scope check + auto-match to deliverable |

Deliverable IDs are zero-indexed: `deliverable-0`, `deliverable-1`, etc., matching the order in the WP YAML.

### Typical completion sequence

1. Mark each deliverable complete: `progress-cli --deliverable=deliverable-0 --complete`
2. Set progress to 100: `lifecycle-cli progress --set 100`
3. Complete the WP: `lifecycle-cli complete`

---

## Error Handling

- If no workpackage is active, display "No active workpackage".
- If `--set` value is not a valid number (0-100), exit with code 1.
