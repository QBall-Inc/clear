# Unlink Knowledge Entry

Remove all workpackage links from a knowledge entry.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<id>` | Yes | Knowledge entry ID (e.g., BR-007) |

## Execution

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/link-cli.js" unlink "$ID" --clear-dir=./.clear
```

## Behavior

- Removes all links from the specified entry.
- If the entry has no links, the command succeeds silently (idempotent).

## Error Handling

- Exit code 1 if `<id>` is missing.
- Exit code 2 if the entry is not found.
