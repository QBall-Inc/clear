# Link Knowledge to Workpackage

Create a link between a knowledge entry and a workpackage.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<id>` | Yes | Knowledge entry ID (e.g., TD-012) |
| `--to <wp>` | Yes | Target workpackage ID (e.g., WP-04) |

## Execution

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/link-cli.js" link "$ID" --to="$WP" --clear-dir=.clear
```

## Validation Rules

- The knowledge entry must exist.
- The entry must be active or superseded (not deprecated).
- The workpackage must exist and not be archived.
- Duplicate links are idempotent (re-linking produces no error).

## Error Handling

- Exit code 1 if `<id>` or `--to` is missing.
- Exit code 2 if the entry or workpackage is not found.
- Exit code 5 if validation fails (e.g., entry deprecated, WP archived).
