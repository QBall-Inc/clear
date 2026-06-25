# Getting started with CLEAR

This guide takes you from zero to a working CLEAR setup and through your first
development loop. It assumes you have a project you want to work on and access to
[Claude Code](https://docs.anthropic.com/en/docs/claude-code).

For *why* CLEAR works the way it does, read [How CLEAR works](./how-it-works.md).
For the knowledge model in depth, read [The knowledge system](./knowledge-system.md).

---

## What you need

- **Claude Code**, installed and working in a project directory.
- **A project under version control.** CLEAR stores its knowledge and state as
  files in your repo, so they version, diff, and review alongside your code. A git
  repo is the natural home.
- **A generous token budget.** CLEAR's hooks run on tool use, and knowledge capture
  adds some overhead per session. It runs best on plans with room to spare (Claude
  Max and Enterprise), where the continuity it buys is worth the tokens.

---

## Install

> The exact install commands are finalized at the v1.0 publish. CLEAR installs as a
> standard Claude Code plugin, via npm or the plugin marketplace.

```bash
# Option A — npm
claude /plugin install npm:@qball-inc/clear

# Option B — marketplace
claude /plugin marketplace add QBall-Inc/plugins-market
claude /plugin install clear@qball-inc
```

Restart your session after installing so the plugin's hooks load.

---

## Initialize: `/cf-init`

From inside your project, run:

```
/cf-init
```

This is the one-time setup. It creates a `.clear/` directory in your project,
generates a project manifest, starts your first session, and wires up the plugin's
hooks and status line. When it finishes, your project has everything CLEAR needs to
start building knowledge as you work.

`/cf-init` is also how you refresh configuration later or reinitialize from scratch.
Run `/cf-init --help` for those options. When you are unsure of any CLEAR command's
flags, ask it with `--help` rather than guessing.

### What lands in `.clear/`

```
.clear/
├── knowledge/      # your knowledge entries (markdown) + the search index
├── plans/          # plan state
├── workpackages/   # units of work
├── sessions/       # session handoffs
├── state/          # synchronized project state
└── config/         # CLEAR configuration
```

These are plain files. Commit them. They are the persistent memory that makes the
next session continuous with this one.

---

## Your first loop

CLEAR organizes work as **plan → schedule → act → manage**. You do not have to use
every stage on day one, but here is the shape of a first pass.

### 1. Plan

```
/cf-plan
```

Create or import a plan: the high-level intent for what you are building. A plan
holds phases and the units of work beneath them.

### 2. Schedule

```
/cf-workpackage
```

Break the plan into **workpackages**: concrete, trackable units of work, each with
acceptance criteria. The active workpackage is what CLEAR tracks as "what you are
working on right now."

### 3. Act

Just build. As you work, CLEAR captures knowledge — decisions, patterns, lessons,
business rules — and binds it to the files you touch. You can also capture
deliberately:

```
/cf-knowledge
```

Use it to record a decision or look something up. When you next touch a file that a
piece of knowledge is bound to, CLEAR surfaces it automatically.

### 4. Manage

```
/cf-status     # where things stand: active plan, workpackage, recent knowledge
/cf-handoff    # close the session with a structured summary for the next one
```

Run `/cf-handoff` before you stop. It writes a handoff that the next session reads
on startup, so you resume with full context instead of a blank slate.

---

## Starting your next session

When you start Claude Code again in the project, CLEAR's startup loads the previous
handoff and the knowledge relevant to where you left off. The active plan and
workpackage carry forward. That continuity is the whole point: the second session
knows what the first one learned.

---

## The command surface

| Command | What it does |
|---------|--------------|
| `/cf-init` | First-time setup; refresh config; reinitialize. |
| `/cf-plan` | Create or import a plan. |
| `/cf-workpackage` | Define and track units of work. |
| `/cf-knowledge` | Capture or look up knowledge. |
| `/cf-status` | Show the current project state. |
| `/cf-handoff` | Write a session handoff. |
| `/cf-help` | Guide to the commands. |
| `/cf-reload` | Reload CLEAR state in-session. |
| `/cf-debug` | Diagnostics for when something looks off. |

Run `/cf-help` any time for an overview, and `<command> --help` for the exact
options on any one of them.

---

## Where to go next

**Understand the system**

- [How CLEAR works](./how-it-works.md) — the two pillars and the loop that drives them.
- [Architecture](../architecture.md) — the layers, the shared context layer, and how
  state stays correct.

**The workflow surfaces in depth**

- [The knowledge system](./knowledge-system.md) — CKS, the seven knowledge types, and
  the lifecycle that keeps the graph fresh.
- [Plan management](./plan-management.md) · [Workpackage management](./workpackage-management.md) · [Session management](./session-management.md).

**Reference**

- [`CKS.md`](../../CKS.md) — the formal knowledge spec.
- Per-command references live in `docs/reference/` — for example
  [`/cf-plan`](../reference/cf-plan.md), [`/cf-knowledge`](../reference/cf-knowledge.md),
  and [`/cf-handoff`](../reference/cf-handoff.md).
