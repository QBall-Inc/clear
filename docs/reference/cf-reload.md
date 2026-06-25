# `/cf-reload`

Reload all CLEAR context (knowledge, workpackage, and plan) into the current
session, without reinitializing the project. Use it when the context CLEAR loaded at
startup has gone stale during the session.

For where reloading sits in the session lifecycle, see
[Session management](../guides/session-management.md).

---

## What it does

`/cf-reload` re-runs the same context load that happens automatically at the start of
a session. It refreshes:

- **Knowledge** — the relevant concepts for where you are working;
- **Workpackage** — the active unit of work and its state;
- **Plan** — the active phase and progress;
- **Session and sync state** — the supporting state files, reconciled.

Knowledge, workpackage, and plan are the surfaces you see; they are what gets
injected back into the session's context. Session and sync state are reloaded as
supporting infrastructure. The project is not reinitialized: nothing is created or
reset, and the current state is re-read from disk and re-surfaced.

---

## When to use it

| Situation | Why |
|-----------|-----|
| You edited a `.clear/` file by hand | The in-session view is now behind the file. |
| Context looks stale or incomplete | Force a fresh load from disk. |
| Recovering from a context disruption | Re-surface everything cleanly. |
| You changed plan or workpackage files outside CLEAR commands | Bring the session back in sync. |

Do **not** use `/cf-reload` to initialize or repair a project (use `/cf-init` or
`/cf-init --force`) or to inspect internals (use `/cf-debug`).

You do **not** need `/cf-reload` at the start of a normal session; startup already
loaded everything. It is a recovery tool, not a routine one.

---

## Usage

```
/cf-reload
```

No arguments. It reloads all domain context in place, operating on the `.clear/`
directory in your current project. Run it from your project root.

---

## What happens when you run it

CLEAR re-runs the startup context reload against your project's current `.clear/`
files and confirms the refresh. After it completes, the active knowledge,
workpackage, and plan context reflect what is on disk right now. If anything went
wrong during the reload, the command reports the error so you can address it.

---

## Example

You manually edited a workpackage file in `.clear/workpackages/` to correct a detail,
and you want the session to reflect the change without restarting Claude Code:

```
/cf-reload
```

CLEAR re-reads the workpackage, plan, and knowledge, reconciles the supporting state,
and confirms the context is refreshed. The session now sees your edit.

---

## Related

- [Session management](../guides/session-management.md) — the lifecycle and the
  startup load this command repeats.
- [`/cf-status`](./cf-status.md) — confirm the context is healthy after a reload.
- [`/cf-handoff`](./cf-handoff.md) — the session-end protocol.
- [Architecture](../architecture.md) — how context is loaded under the hood.
- [`CKS.md`](../../CKS.md) — the knowledge specification.
