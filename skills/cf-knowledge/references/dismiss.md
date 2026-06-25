# Dismiss Deprecation Surfacing Warning

Acknowledge a deprecation surfacing warning without superseding or deleting the entry. Use when the user has reviewed the deprecation and confirmed no replacement is needed.

**Distinct from `ack`**: `dismiss` is for the **deprecation surfacing warning** (entries in `sync-state.knowledge.deprecatedReferences`). `ack` is for the **pending-review carry-over banner** (entries in `pending-reviews.json` surfaced via PostToolUse Level A/B). Two separate surfaces; pick the right verb.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<id>` | Yes | Entry ID to dismiss (e.g., TD-015) |
| `--reason=<text>` | No | Optional reason for dismissal (audit metadata) |

## Execution

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/dismiss-cli.js" "$ID" --reason="$REASON" --clear-dir=./.clear
```

Derive `$SESSION_ID` and `$SESSION_NUMBER` from `.clear/state/session.json` if available (used for audit log entry).

## Workflow

1. Validate ID format + entry existence.
2. If entry already has `supersession_reviewed=true`, return idempotent no-op success.
3. **WP-PS2.2 AC12 Defensive Guard**: if entry is NOT in `sync-state.knowledge.deprecatedReferences`, reject with an actionable error redirecting to `/cf-knowledge ack <id>`. This prevents the corruption class where dismiss-cli on a non-deprecated entry would set `supersession_reviewed=true` on an entry that never had a deprecation to acknowledge.
4. Set `supersession_reviewed=true` in DB.
5. Update markdown frontmatter so the field round-trips through re-index.
6. Trigger incremental index update.
7. Remove entry from `sync-state.knowledge.deprecatedReferences` (eager drain).
8. Write audit log entry with `oldValue/newValue` showing the `supersession_reviewed` transition.

## Error Handling

- Exit code 0: Success OR idempotent no-op (already dismissed).
- Exit code 1: Validation error (missing `--clear-dir`) OR defensive-guard rejection (non-deprecated entry — use `ack` instead).
- Exit code 2: Entry not found.

## Examples

```bash
# Dismiss a deprecation warning after confirming no replacement is needed
/cf-knowledge dismiss TD-015 --reason="Pattern superseded by external library; no internal replacement needed"

# Dismiss without a reason (less informative audit trail)
/cf-knowledge dismiss TD-015
```

## If You See the AC12 Guard Error

If the CLI returns:
> `Error: dismiss-cli is for deprecation acknowledgments. Entry <id> has no active deprecation surfacing warning. For pending-review carry-over, use /cf-knowledge ack <id> instead.`

You picked the wrong verb. The entry you tried to dismiss is in the **pending-review carry-over banner**, not the **deprecation banner**. Re-run with `/cf-knowledge ack <id>` (or `/cf-knowledge ack --all` to clear all pending-review entries at once).
