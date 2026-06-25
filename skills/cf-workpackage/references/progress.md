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
  RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/progress-cli.js" progress --set="$SET_VALUE" --clear-dir=./.clear 2>/dev/null)
else
  RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/progress-cli.js" progress --clear-dir=./.clear 2>/dev/null)
fi
CONTEXT=$(echo "$RESULT" | jq -r '.message // "No active workpackage"')
echo "$CONTEXT"
```

---

## Expected Output

**View mode:** Current progress percentage, deliverables status, blockers if any.

**Set mode:** Updated progress percentage confirmation.

---

## Deliverable Completion

Deliverables transition through three states: `not_started → in_progress → complete`. Two automatic triggers and one explicit verb keep the state machine in sync with the file system.

### Automatic transitions (PostToolUse hook)

- **First write to a matching file** auto-marks the deliverable as `in_progress`. Match is by explicit glob pattern OR by file path extracted from the deliverable description (e.g., a description starting with `src/foo/bar.ts —` matches `src/foo/bar.ts`).
- **Continued writes when the description-extracted file exists on disk** auto-promote the deliverable from `in_progress` to `complete`. Pattern-based deliverables (with an explicit glob) require explicit `--complete` since glob "all files exist" semantics are out of scope.

### Explicit `--set 100`

`progress 100` (or `progress --set 100`) sweeps **all** deliverables of the active workpackage to `complete`, with `completedAt` timestamps. Use this when finishing a WP after the file-presence sweep has already brought most deliverables to `complete` — it closes any remaining gaps.

### Stub-then-iterate caveat

If a stub file is written early in development (placeholder import, empty function, etc.), the file-presence sweep WILL auto-promote that deliverable to `complete`. To revert premature promotion when iterating on the stub:

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/update-cli.js" \
  --clear-dir=./.clear deliverable "$DELIVERABLE_ID" --status=in_progress
```

This restores the deliverable to `in_progress` so the file-presence sweep can re-evaluate on the next write.

### Manual single-deliverable completion (legacy / explicit)

To explicitly mark one deliverable complete (e.g., for pattern-based deliverables that don't auto-promote):

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/progress-cli.js" \
  --clear-dir=./.clear --deliverable="$DELIVERABLE_ID" --complete
```

| Argument | Required | Description |
|----------|----------|-------------|
| `--deliverable=<id>` | Yes | Deliverable ID (e.g., `deliverable-1`) |
| `--complete` | Yes | Mark the deliverable as complete |
| `--file=<path>` | No | File path for scope check + auto-match to deliverable |

Deliverable IDs are zero-indexed: `deliverable-0`, `deliverable-1`, etc., matching the order in the WP YAML.

### Typical completion sequence

1. Write code as usual — PostToolUse auto-marks `in_progress`, then `complete` when files exist.
2. (Optional) For any pattern-based deliverable not yet auto-promoted: `progress-cli --deliverable=deliverable-N --complete`.
3. Sweep any remaining gaps: `progress 100`.
4. Complete the WP: `lifecycle-cli complete`.

---

## Error Handling

- If no workpackage is active, display "No active workpackage".
- If `--set` value is not a valid number (0-100), exit with code 1.
