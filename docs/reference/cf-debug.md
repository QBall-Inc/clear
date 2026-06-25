# `/cf-debug` — diagnose and repair CLEAR state

`/cf-debug` runs diagnostic validation across CLEAR's subsystems and can optionally
repair what it finds. Reach for it when CLEAR's state looks inconsistent — typically
after manual edits to `.clear/` files, an interrupted operation, or a restored backup.

For the model behind the checks, including the single source of truth and how state
is kept consistent, see [Architecture](../architecture.md).

## Usage

```
/cf-debug [domain] [--repair] [--check-ids]
```

With no domain, `/cf-debug` validates every subsystem.

## Domains

| Domain | Checks |
|--------|--------|
| `session` | Session state integrity. |
| `workpackage` | The workpackage registry and state. |
| `plan` | Plan structure and synchronization. |
| `knowledge` | The knowledge database and search index. |
| `sync` | Consistency of the aggregated state record. |
| `install` | The Claude Code wiring — status line and settings. Run after restarting Claude Code to confirm the status line is connected. |

## Options

| Option | Effect |
|--------|--------|
| `--repair` | Attempt automatic repair of detected issues. The files remain the source of truth; repair re-derives the caches and the aggregated state from them. |
| `--check-ids` | Verify identifier integrity (the stable internal identifiers and their human-readable display identifiers stay aligned). |
| `--verbose` | More detailed output. |

## Examples

```
# Validate everything
/cf-debug

# Check the knowledge subsystem only
/cf-debug knowledge

# Detect and repair sync-state issues
/cf-debug sync --repair

# Confirm Claude Code wiring after a restart
/cf-debug install
```

## Related

- [Architecture](../architecture.md) — the state model, drift detection, and repair.
- [Session management](../guides/session-management.md) — session state and continuity.
- [`/cf-status`](./cf-status.md) — a routine view of current state (not a diagnostic).
