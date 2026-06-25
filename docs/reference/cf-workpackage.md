# `/cf-workpackage` — command reference

`/cf-workpackage` manages workpackages. With it you view status, list and inspect
workpackages, create new ones, move them through their lifecycle (start, pause, defer,
complete, delete, reorder), track progress, check dependencies, and validate completion
readiness.

This is the operational reference. For the model behind these commands (what a
workpackage is, how progress is derived, how the lifecycle works), read the
[Workpackage management guide](../guides/workpackage-management.md).

---

## Using the command

Invoke `/cf-workpackage` with a subcommand and let it route, or describe what you want in
plain language and it will ask before doing anything that changes state. A workpackage's
records live under your project's `.clear/workpackages/` directory; CLEAR must be
initialized (`/cf-init`) before these commands work.

The subcommands fall into a few groups:

| Group | Subcommands |
|-------|-------------|
| Inspect (read-only) | `list`, `show`, `progress`, `validate`, `deps`, `help`, default status |
| Lifecycle (changes state) | `start`, `pause`, `complete`, `defer`, `reorder`, `delete` |
| Author (changes content) | `create`, `update` |

Read-only subcommands run immediately. State-changing and content-changing subcommands
are confirmed first when you ask for them in natural language, and destructive ones
(`delete`, `complete`) always name their target before proceeding.

---

## The `--clear-dir` and `--cwd` defaults

The workpackage operations are backed by small command-line tools. Two location flags
appear across them:

- `--clear-dir=<path>` points at the `.clear` directory. The read and lifecycle
  operations default it to `.clear` in the current directory. The status listing
  requires it explicitly.
- `--cwd=<path>` points at the project root (from which `.clear` is derived) and
  defaults to the current directory. The authoring operations (create, update) use this
  form.

In normal use you run these from your project root and the defaults are correct. The
examples below show the flag where the underlying tool requires it.

---

## Inspect

### Active workpackage status

Show the workpackage you are currently working on, with its status and progress.

```
/cf-workpackage
```

### `list` — list workpackages

```
/cf-workpackage list [--all | -a] [--phase | -p] [--status | -s]
```

| Flag | Effect |
|------|--------|
| `--all`, `-a` | Include completed (and otherwise hidden) workpackages. By default the list omits them. |
| `--phase`, `-p` | Group the listing by phase. |
| `--status`, `-s` | Group the listing by status. |

Examples:

```
/cf-workpackage list
/cf-workpackage list --all --phase
/cf-workpackage list --status
```

### `show` — workpackage details

```
/cf-workpackage show <id>
```

Shows everything about one workpackage: its description, acceptance criteria,
deliverables (with their weights and statuses), dependencies, scope, and progress. The
`<id>` is the display identifier (for example `P1.3`) or the stable internal identifier;
either is accepted.

### `progress` — view or set progress

```
/cf-workpackage progress
/cf-workpackage progress --set 100
```

With no argument, this **views** the active workpackage's progress and its deliverables.

Progress is **derived** from deliverable states, not declared, so it cannot be set to an
arbitrary value. The one meaningful set value is **100** (`--set 100`), which sweeps every
deliverable to complete in a single move. Use it when the work is genuinely finished. Any
other set value is rejected with guidance pointing you back to the deliverables: to raise
progress, finish (or mark) the deliverables rather than overwrite the number.

### `validate` — completion readiness

```
/cf-workpackage validate
```

Checks whether the active workpackage is ready to complete, against three mechanical
gates: all deliverables complete, derived progress at 100, and all hard dependencies
complete. It reports either "ready for completion" with a checklist, or the specific
issues blocking completion and how to fix each. This gate verifies *mechanical*
readiness; confirming the acceptance criteria are genuinely satisfied is your judgment.

### `deps` — dependencies and blockers

```
/cf-workpackage deps --workpackage=<id> [--check-deliverables]
```

| Flag | Effect |
|------|--------|
| `--workpackage=<id>` | The workpackage to check (required). |
| `--check-deliverables` | Also validate the specific deliverables a dependency needs, not just whether the upstream workpackage is complete. |

Reports whether the workpackage is **ready** to start, **blocked** (with the blocking
dependencies and any unblocked alternatives you could pick up instead), or part of a
**circular** dependency (with the cycle path). Soft dependencies are surfaced as
warnings, not blockers; a completed or archived upstream counts as satisfied.

### `help`

```
/cf-workpackage help
```

Shows usage for the command and its subcommands.

---

## Lifecycle

These subcommands move a workpackage through its statuses. The valid transitions are
enforced by a state machine; see the
[lifecycle section of the guide](../guides/workpackage-management.md#the-lifecycle).

### `start` — activate a workpackage

```
/cf-workpackage start <id> [--force]
```

Activates the workpackage (and resumes it if it was paused or deferred), making it the
active workpackage. If it has incomplete **hard** dependencies, the start is refused and
CLEAR names them.

| Flag | Effect |
|------|--------|
| `--force` | Start anyway, despite incomplete dependencies. Use knowingly. |

### `pause` — set the active workpackage aside

```
/cf-workpackage pause
```

Pauses the active workpackage at its current progress and leaves no workpackage active.
Resume it later with `start`.

### `complete` — finish the active workpackage

```
/cf-workpackage complete [--force]
```

Completes the active workpackage. CLEAR runs the completion-readiness check first and
refuses if the work is not mechanically ready.

| Flag | Effect |
|------|--------|
| `--force` | Complete despite a failed readiness check. A deliberate override for when you have verified the outcome by other means. |

### `defer` — postpone a workpackage

```
/cf-workpackage defer <id> [--reason="<text>"]
```

Pushes a workpackage out for later and records an optional reason. A deferred workpackage
can be reactivated later with `start`.

| Flag | Effect |
|------|--------|
| `--reason="<text>"` | Why the workpackage is being deferred. |

### `reorder` — move within its phase

```
/cf-workpackage reorder <id> --position=<N>
```

Moves the workpackage to position `N` within its phase. Because the display identifier is
derived from position, **reordering changes the display identifier** of the moved
workpackage (and shifts others); the stable internal identifier is unaffected.
`--position` must be a positive integer.

### `delete` — archive a workpackage

```
/cf-workpackage delete <id> --confirm
```

Archives (soft-deletes) the workpackage: it is hidden from default views but preserved on
disk, and it shows up again under `list --all`. An **active** workpackage cannot be
deleted directly, so pause it first. Archiving is terminal; there is no transition back out.

| Flag | Effect |
|------|--------|
| `--confirm` | Required to carry out the deletion. |

---

## Author

### `create` — create a new workpackage

```
/cf-workpackage create --phase=<phase-id> --title="<title>" [options]
```

Creates a new workpackage in the given phase.

| Flag | Effect |
|------|--------|
| `--phase=<phase-id>` | Target phase (required). |
| `--title="<title>"` | Workpackage title (required). |
| `--after=<wp-id>` | Insert it directly after this workpackage in the phase. |
| `--type=<type>` | `feature`, `bugfix`, `refactor`, `documentation`, or `infrastructure`. |
| `--priority=<priority>` | `critical`, `high`, `medium`, or `low`. |
| `--description="<text>"` | What the work is. |
| `--cwd=<path>` | Project root (defaults to the current directory). |

To create a richer workpackage in one call (with acceptance criteria, deliverables,
verification steps, notes, and scope), the create operation can read a JSON object from
standard input (`--from-stdin`) with these fields: `phaseId`, `title`, `afterId`, `type`,
`priority`, `description`, `acceptance_criteria`, `verification`, `notes`,
`deliverables_text`, `scope_in`, and `scope_out`.

### `update` — change fields or a deliverable

```
/cf-workpackage update <wp-id> [workpackage-level flags]
/cf-workpackage update <wp-id> deliverable <del-id> [per-deliverable flags]
```

**Workpackage-level flags:**

| Flag | Effect |
|------|--------|
| `--title="<text>"` / `--name="<text>"` | Rename the workpackage (max 80 characters; `--name` is an alias). |
| `--status=<s>` | `not_started`, `in_progress`, `paused`, `blocked`, `complete`, `deferred`, or `archived`. |
| `--type=<t>` | `feature`, `bugfix`, `refactor`, `documentation`, or `infrastructure`. |
| `--priority=<p>` | `critical`, `high`, `medium`, or `low`. |
| `--description="<text>"` / `--description-file=<path>` | Set the description inline or from a file. |
| `--acceptance-criteria=<json>` / `--acceptance-criteria-file=<path>` | Replace the acceptance criteria. |
| `--deliverables=<json>` / `--deliverables-file=<path>` | Replace the deliverables. |
| `--verification=<json>` / `--verification-file=<path>` | Replace the verification steps. |
| `--notes=<json>` / `--notes-file=<path>` | Replace the notes. |
| `--in-scope=<json>` / `--in-scope-file=<path>` | Replace the in-scope items. |
| `--out-of-scope=<json>` / `--out-of-scope-file=<path>` | Replace the out-of-scope items. |
| `--upstream=<json>` / `--upstream-file=<path>` | Replace the upstream dependencies. |
| `--downstream=<json>` / `--downstream-file=<path>` | Replace the downstream dependencies. |

**Per-deliverable flags** (when targeting a deliverable):

| Flag | Effect |
|------|--------|
| `--status=<s>` | `not_started`, `in_progress`, or `complete`. |
| `--description="<text>"` / `--description-file=<path>` | Set the deliverable's description. |
| `--weight=<n>` | A non-negative integer weight. Conventionally, a workpackage's weights sum to 100, so each reads as a share of the work. |
| `--pattern=<glob>` | The glob that ties the deliverable to the files that fulfill it. |

**Common flags:** `--clear-dir=<path>` (defaults to `<cwd>/.clear`), `--cwd=<path>`
(defaults to the current directory), and `--force` to allow a status transition that
would normally be rejected (for example, `complete → not_started`).

Workpackage records are rewritten with a temporary-file-then-rename to keep the write
atomic, and schema validation runs before the write, so a rejected change leaves the
record untouched.

### Revert premature promotion

Deliverables advance automatically as files appear (see
[deliverable auto-promotion](../guides/workpackage-management.md#deliverable-auto-promotion-progress-tracks-your-edits)).
If you write a stub or placeholder and the file-present check promotes a deliverable to
`complete` before the real work is done, set it back to `in_progress` explicitly, finish
the implementation, and let it re-promote:

```
/cf-workpackage update <wp-id> deliverable <del-id> --status=in_progress
```

---

## Identifiers

Workpackage commands accept two forms of identifier, and resolve a display identifier to
the internal one before any change:

- A **display identifier** (for example `P1.3`, or a plan-based form like `WP-AUTH.1`) is
  user-facing and derived from the phase plus the workpackage's position. It is what you
  see in status output. Because it is position-derived, it **changes when you reorder**.
- A **stable identifier** is an internal slug that never changes once assigned. You will
  mostly see it in error messages and logs.

Use the display identifier for everyday work; either form works at the command boundary.

---

## Where to go next

- [Workpackage management guide](../guides/workpackage-management.md) — the model and
  lifecycle in depth.
- [Plan management](../guides/plan-management.md) — the plan and phases a workpackage
  belongs to.
- [Architecture](../architecture.md) — how the workpackage surface fits the system.
- [`CKS.md`](../../CKS.md) — the formal knowledge spec.
