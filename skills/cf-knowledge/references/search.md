# Search Knowledge Base

Search entries by term with optional filters.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--query=<term>` | Yes | Search term (matched against title, description, tags) |
| `--max-results=<n>` | No | Max results to return |
| `--include-superseded` | No | Include superseded entries in results |
| `--text=<text>` | No | Raw text for detect-only mode |
| `--detect-only` | No | Only detect if text contains knowledge triggers (no search) |

## Execution

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/search-cli.js" --query="$TERM" --clear-dir=.clear
```

Append optional flags as needed (e.g., `--max-results=5 --include-superseded`).

## Output

Each result shows:
- Entry ID and title
- Status indicator: **Active**, **Deprecated** (with warning), **Superseded** (with arrow to replacement)
- Matching context snippet

## Error Handling

- Exit code 1 if `--query` is missing (unless `--detect-only` is set).
- Exit code 0 with empty results if no matches found.
