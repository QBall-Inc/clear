# `/cf-status`

Show the current state of the CLEAR session: session identity, token usage against
the lifecycle thresholds, the active workpackage and phase, and a context health
check. This is the read-only "where do I stand" command.

For how status fits the session lifecycle, see
[Session management](../guides/session-management.md).

---

## What it does

`/cf-status` reads CLEAR's state files and prints a formatted summary. It does not
change anything; it is purely a view. It reports four things:

- **Session** — the session number, ID, start time, and number of prompts so far.
- **Token usage** — tokens consumed, the percentage of budget used, the tracking
  method, and the three lifecycle thresholds.
- **Active work** — the active workpackage and the active plan phase, when there is
  one.
- **Context health** — a check that flags missing context (no master plan, no
  workpackages directory, no knowledge linked to the active workpackage).

When token usage is past the warning threshold, the output also includes a guidance
message telling you whether to wrap up, begin a handoff, or stop new work entirely.

---

## When to use it

| Situation | Why |
|-----------|-----|
| You want to know where the session stands | Session number, token usage, active work. |
| You are deciding whether to hand off | The token percentage and threshold guidance tell you. |
| You suspect context did not load fully | The context health check flags missing pieces. |

Do **not** use `/cf-status` to initialize CLEAR (use `/cf-init`), to reload context
(use [`/cf-reload`](./cf-reload.md)), or to debug plugin internals (use `/cf-debug`).

---

## Usage

```
/cf-status
```

No arguments. The command reads state from the `.clear/` directory in your current
project, so run it from your project root.

---

## What the output looks like

The summary is grouped into sections. A typical run shows:

```
CLEAR Status
============

Session
  Number:     12
  ID:         <session-id>
  Started:    <timestamp>
  Prompts:    34

Token Usage
  Tokens:     128,000 (51%)
  Method:     <tracking-method>
  Thresholds: 60% warning | 75% critical | 85% emergency

Active Work
  Workpackage: <id> - <title>
  Phase:       <active-phase>

Context Check: All required context successfully loaded
```

The **Active Work** block appears only when a workpackage is active. The **Context
Check** line reports either that all required context loaded, or a list of missing
items.

---

## Token thresholds

CLEAR tracks token consumption against three thresholds. The status output names them
and, when you cross one, appends matching guidance:

| Threshold | Default | Guidance when crossed |
|-----------|---------|-----------------------|
| Warning | 60% | Consider wrapping up the current task. |
| Critical | 75% | Begin handoff preparation. |
| Emergency | 85% | Stop new work, finalize the handoff immediately. |

Below the warning threshold, no extra message is shown. These defaults are
configurable per project in `.clear/config/session-management.yaml`.

---

## The context health check

The check looks for the pieces a healthy session should have and flags any that are
missing:

- the master plan file is present;
- the workpackages directory exists when a workpackage is active;
- at least one knowledge entry is linked to the active workpackage.

If everything is in place, you see `Context Check: All required context successfully
loaded`. Otherwise you get a short list of what is missing, which usually points at a
project that was not fully initialized or context that drifted, in which case
[`/cf-reload`](./cf-reload.md) is the next step.

---

## Example

```
/cf-status
```

Run it when token usage is climbing and you want to decide whether to keep going or
hand off. If the output shows you at 78% with `Critical: Begin handoff preparation`,
that is the signal to finish the task in flight and run
[`/cf-handoff`](./cf-handoff.md).

---

## Related

- [Session management](../guides/session-management.md) — the lifecycle this command
  reports on.
- [`/cf-handoff`](./cf-handoff.md) — what to run when status says it is time to hand
  off.
- [`/cf-reload`](./cf-reload.md) — what to run when the context check flags missing
  pieces.
- [Architecture](../architecture.md) — how session and sync state are tracked.
- [`CKS.md`](../../CKS.md) — the knowledge specification.
