# Acknowledge Pending-Review Carry-Over

Mark a knowledge entry as reviewed in the session-start carry-over banner. Removes the entry from `.clear/state/pending-reviews.json` so it does not re-surface in the next SessionStart.

**Distinct from `dismiss`**: `ack` is for the **pending-review carry-over banner** (entries surfaced by PostToolUse Level A/B that were not actioned in a prior session). `dismiss` is for the **deprecation surfacing warning** (entries with active deprecation surfacing in sync-state.knowledge.deprecatedReferences). Two separate surfaces; pick the right verb.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<id>` | Yes (unless `--all`) | Entry ID to acknowledge (e.g., PAT-007) |
| `--all` | No | Acknowledge ALL current pending-review entries in one call |

## Execution

Single entry:
```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/pending-reviews-cli.js" --ack="$ID" --clear-dir=./.clear --session-id="$SESSION_ID" --session-number="$SESSION_NUMBER"
```

All entries:
```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/pending-reviews-cli.js" --ack-all --clear-dir=./.clear --session-id="$SESSION_ID" --session-number="$SESSION_NUMBER"
```

Derive `$SESSION_ID` and `$SESSION_NUMBER` from `.clear/state/session.json` (`.sessionId` and `.clearSessionNumber` fields). The CLI degrades gracefully if these are omitted — the drain still happens, but no audit log entry is written.

## Workflow

1. Validate ID format (rejects with actionable error on invalid input).
2. Drain entry from `.clear/state/pending-reviews.json` via `drainPendingReview` helper.
3. Write audit log entry: domain `knowledge`, action `update`, metadata `{operation: 'ack', ack_target: 'pending_review'}` — distinguishable from deprecation-ack which uses `oldValue.supersession_reviewed`.
4. Return success message.

## Corruption-Prevention Contract

`ack` MUST NOT touch:
- `supersession_reviewed` flag in DB
- `supersession_reviewed` field in markdown frontmatter
- `sync-state.knowledge.deprecatedReferences`

These belong to the deprecation-acknowledgment surface (handled by `dismiss`). Calling `ack` on any entry never modifies deprecation state.

## Error Handling

- Exit code 0: Success OR idempotent no-op (entry not in pending-reviews).
- Exit code 1: Validation error (missing `--clear-dir`, invalid ID format) OR drain failure (rare — typically I/O error).

## Examples

```bash
# Acknowledge a single carry-over entry from the SessionStart banner
/cf-knowledge ack PAT-007

# Acknowledge all carry-over entries in one call
/cf-knowledge ack --all
```
