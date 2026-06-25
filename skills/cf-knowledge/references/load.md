# Load Knowledge Entries

Load knowledge entries into the current context. Token-aware: adjusts volume based on level.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--level=<lvl>` | No | Loading level: minimal, balanced (default), comprehensive |
| `--context=<tags>` | No | Comma-separated context tags for relevance filtering |
| `--workpackage=<id>` | No | Load only entries linked to this workpackage |

## Execution

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/load-cli.js" --level="$LEVEL" --clear-dir=./.clear
```

Append optional flags as provided (e.g., `--context=caching,redis --workpackage=WP-04 --session=157`).

> **Note on type filtering:** the load-cli entry point does NOT accept a
> type filter. Use `--context=<tag>` for type/topic-relevance filtering
> instead.

## Loading Levels

| Level | Behavior |
|-------|----------|
| minimal | IDs, titles, and status only |
| balanced | Titles, summaries, and tags (default) |
| comprehensive | Full entry content including descriptions |

## Error Handling

- Exit code 1 if an invalid level is specified.
- Exit code 5 if validation of filters fails.
