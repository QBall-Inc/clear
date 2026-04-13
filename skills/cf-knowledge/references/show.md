# Show Knowledge Entry

Display full details for a single knowledge entry.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<id>` | Yes | Entry ID (e.g., TD-015, PAT-003) |

## Execution

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/show-cli.js" --id="$ID" --clear-dir=.clear
```

## Output Includes

- Type (TD/PAT/BR/LES)
- Status (active/deprecated/superseded)
- Created date and session
- Full description
- Tags
- Linked workpackages
- Supersession chain (if applicable)

## Error Handling

- Exit code 1 if `<id>` is missing.
- Exit code 2 if the entry is not found.
