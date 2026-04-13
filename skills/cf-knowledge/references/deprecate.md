# Deprecate Knowledge Entry

Mark a knowledge entry as deprecated. Use when an entry is no longer relevant and has NO replacement. If a replacement exists, use `supersede` instead.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<id>` | Yes | Entry ID to deprecate (e.g., PAT-003) |
| `--reason <text>` | No | Reason for deprecation |
| `--force` | No | Skip confirmation prompt |

## Execution

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/deprecate-cli.js" "$ID" --reason="$REASON" --clear-dir=.clear
```

Append `--force` if the user explicitly requests skipping confirmation.

## Workflow

1. Impact analysis: identifies linked workpackages and dependent entries.
2. Reason prompt (if `--reason` not provided).
3. Confirmation prompt (unless `--force`).
4. Status updated to deprecated.
5. Audit log entry created.

## Error Handling

- Exit code 1 if `<id>` is missing.
- Exit code 2 if the entry is not found.
- Exit code 3 if the entry is already deprecated.
