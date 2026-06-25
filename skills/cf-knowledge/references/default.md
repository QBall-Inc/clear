# Knowledge Base Overview (Default)

Shows a summary of the entire knowledge base.

## Output Includes

- Total entry count
- Breakdown by status: active, superseded, deprecated
- Breakdown by type (7 types): TD (technical-decision), BR (business-rule), PAT (architectural-pattern), LES (lesson-learned), IW (institutional-wiki), SH (stakeholder), PROC (process)
- Recent activity
- Index status (last rebuilt, staleness)

## Execution

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/status-cli.js" --clear-dir=./.clear
```

## Expected Behavior

- Exit code 0: overview displayed successfully.
- If the knowledge base is empty, the command still succeeds and reports zero counts.

## Related

- Use `search` to find specific entries.
- Use `index` if the index status shows stale.
