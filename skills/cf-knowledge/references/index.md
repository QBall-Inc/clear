# Rebuild Knowledge Index

Rebuild the knowledge base search index.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--mode=<mode>` | No | Index mode: `full` or `incremental` (default) |
| `--force` | No | Force rebuild even if thresholds not met |
| `--session=<number>` | No | Session number for audit logging |
| `--check-thresholds` | No | Only check if rebuild is needed, don't rebuild |

## Execution

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/index-cli.js" --clear-dir=.clear
```

Append `--mode=full` for full rebuild, or `--force` to bypass threshold checks.

## Behavior

- **Default (incremental):** Only indexes new or modified entries since the last index run.
- **Full rebuild:** Re-indexes all entries from scratch. Use when the index appears corrupted or after bulk operations.

## Error Handling

- Exit code 0 on successful rebuild.
- Reports count of entries indexed and time elapsed.
