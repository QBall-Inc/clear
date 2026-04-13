# Supersede Knowledge Entry

Replace one knowledge entry with another. Use when a newer entry replaces an older one. If no replacement exists, use `deprecate` instead.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<old>` | Yes | Entry ID being replaced (e.g., TD-015) |
| `<new>` | Yes | Entry ID that replaces it (e.g., TD-048) |
| `--force` | No | Skip confirmation prompt |

## Execution

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/supersede-cli.js" "$OLD" "$NEW" --clear-dir=.clear
```

Append `--force` if the user explicitly requests skipping confirmation.

## Chain Rules

- Maximum chain depth: 3 levels.
- Example chain: TD-001 -> TD-015 -> TD-048.
- The CLI shows a chain visualization when supersession completes.

## Behavior

1. Validates both entries exist.
2. Checks chain depth limit.
3. Marks old entry as superseded, pointing to new entry.
4. Confirmation prompt (unless `--force`).

## Error Handling

- Exit code 1 if either `<old>` or `<new>` is missing.
- Exit code 2 if either entry is not found.
- Exit code 3 if the old entry is already superseded.
- Exit code 4 if chain depth would exceed 3.
