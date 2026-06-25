# `/cf-handoff`

Generate or preview the session handoff document for the current CLEAR session. The
handoff is the session-end protocol: it captures what happened, what was decided, and
what comes next, so the following session can pick up where this one left off.

For how handoffs fit into session continuity, see
[Session management](../guides/session-management.md).

---

## What it does

`/cf-handoff` writes a structured markdown handoff to `.clear/sessions/`, named
`session_<N>_<YYYYMMDD>.md`. The document has a YAML frontmatter block holding all the
machine-readable metrics and a markdown body of human-readable context. After the
file is generated, CLEAR opens it so you can fill in the details, then you mark it
complete and commit it.

The handoff is the input to the *next* session's startup. When you start the next
session, CLEAR reads this document's `## Summary` and `## Next Session Priorities`
sections back into context automatically.

---

## When to use it

| Situation | Why |
|-----------|-----|
| You are ending a session | Leave a record the next session can read. |
| Token usage hit a checkpoint | Wrap up cleanly before the context window closes. |
| You want to see what a handoff would contain | Use `--preview` to inspect without writing a file. |

Do **not** use `/cf-handoff` to start a new session (use `/cf-init`) or to view status
without producing a handoff (use [`/cf-status`](./cf-status.md)).

---

## Usage

```
/cf-handoff             Generate the handoff document
/cf-handoff --preview   Preview the contents without creating a file
```

| Flag | Effect |
|------|--------|
| `--preview` | Shows the session number, current token usage, and the sections the handoff will contain — without writing anything to disk. |

The command operates on the `.clear/` directory in your current project. There is no
path argument; run it from your project root.

---

## The handoff format

The document body is organized into a fixed set of sections. These section names are
canonical — startup parses them by name, so the structure matters.

| Section | What it captures |
|---------|------------------|
| `## Summary` | One or two sentences on what the session accomplished. |
| `## Completed Items` | What got finished this session. |
| `## In Progress` | The task still underway, if any. |
| `## Technical Decisions` | Key decisions, each with decision / rationale / impact. |
| `## Patterns Established` | Patterns set or refined this session. |
| `## Learnings` | Discrete lessons discovered this session. |
| `## Patterns Observed` | Patterns noticed but not yet established as canonical. |
| `## Changes This Session` | Knowledge, plan, and workpackage changes, plus deprecations. |
| `## Code Changes` | A table of files touched, by type. |
| `## Test Results` | The test tally at session close. |
| `## Next Session Priorities` | The ordered list of what to do next. |
| `## Blockers / Unresolved` | Anything left open or stuck. |
| `## Resume` | The command to resume this exact session. |

Startup replays `## Summary` and `## Next Session Priorities` into the next session's
context, so write those two as if a fresh agent will read nothing else.

### Frontmatter fields

The YAML frontmatter is the machine-readable contract. It is grouped as follows:

| Group | Fields |
|-------|--------|
| Identity | `session`, `date`, `workpackage`, `branch`, `status` |
| Tokens | `tokens_pct`, `tokens_count`, `conversation_turns` |
| Code files | `prod_files_created`, `prod_files_modified`, `test_files_created`, `test_files_modified` |
| Lines | `lines_prod`, `lines_test`, `lines_docs` |
| Docs | `docs_created`, `docs_modified` |
| Tests | `tests_passed`, `tests_failed`, `tests_total` |
| Metadata | `complexity`, `decisions_count`, `actual_hours` |

The `status` field takes one of `PARTIAL`, `COMPLETE`, or `BLOCKED`. It is generated
as `PARTIAL`; you change it to `COMPLETE` once the session is closed out. Only handoffs
marked complete are collected into your project's metrics history, so a half-finished
handoff never pollutes the record.

The token and conversation-turn fields are filled in from live session state. The
file, line, documentation, and test fields start as placeholder zeros for you to
update before finalizing.

---

## Examples

**Generate a handoff at the end of a session:**

```
/cf-handoff
```

CLEAR writes `.clear/sessions/session_<N>_<YYYYMMDD>.md`, then opens it. You fill in
the summary, completed items, decisions, and next priorities; update the placeholder
metrics; change `status: PARTIAL` to `status: COMPLETE`; and commit the file.

**Preview what the handoff would contain, without writing it:**

```
/cf-handoff --preview
```

CLEAR shows the session number, current token usage and conversation turns, and the
list of sections the document will include. Nothing is written to disk.

---

## After you generate one

1. **Finalize the document.** Replace the placeholder metric zeros with real counts,
   fill in the body sections, and change `status: PARTIAL` to `status: COMPLETE`.
2. **Commit it.** The handoff is part of your repository history alongside the code it
   describes.
3. **Resume next session.** The next session's startup loads the summary and
   priorities automatically; no manual step is required.

Metrics capture runs at the start of the *next* session. CLEAR scans `.clear/sessions/`
for completed handoffs and appends them to your metrics history. The one-session lag is
intentional and needs no action from you.

---

## Automatic handoff preparation

CLEAR does not rely on you remembering. When token usage crosses the critical
threshold (75% by default), the session monitor prepares a handoff document
automatically in the background. This command is the manual surface for the same
generator, so both produce the same document. An auto-prepared handoff arrives with
placeholder metrics, so you still review and complete it before marking it `COMPLETE`.
The threshold is configurable per project in `.clear/config/session-management.yaml`.

---

## Related

- [Session management](../guides/session-management.md) — the lifecycle and continuity
  model this command serves.
- [`/cf-status`](./cf-status.md) — check token usage and decide when to hand off.
- [`/cf-reload`](./cf-reload.md) — reload CLEAR context mid-session.
- [Architecture](../architecture.md) — how session state is tracked under the hood.
- [`CKS.md`](../../CKS.md) — the knowledge specification the retrospective sections
  feed.
