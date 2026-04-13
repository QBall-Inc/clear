---
name: workpackage-management
description: "Use when performing workpackage actions: start, pause, complete, delete, defer, reorder, update progress, or check dependencies. Not for reading WP history or definitions."
user-invocable: false
allowed-tools: Read, Bash, Glob
version: 2.0.0
author: Ashay Kubal @ Qball Inc.
tags: workpackage, lifecycle, progress, dependencies
---

> **CLI Usage:** When unsure about a CLI's interface or flags, run it with `--help` first. Do NOT attempt to discover functionality by reading plugin source code — doing so leads to incorrect execution from assumptions made without context of the holistic flow.

# Workpackage Management Skill

This skill manages workpackage lifecycle operations in the CLEAR framework. All `.clear/` mutations
are routed through CLI scripts — **never use Write or Edit on `.clear/` paths directly**.

## When to Use

### TAKE ACTION (run CLI commands) when user says:
- "start workpackage P1.3" / "begin working on P1.3"
- "pause this workpackage"
- "complete this workpackage" / "mark P1.2 as done"
- "delete workpackage P1.3"
- "defer P1.3" / "defer this workpackage"
- "reorder P1.3 to position 2"
- "update progress on this workpackage" / "set progress to 75"
- "check dependencies for P1.4"

### JUST READ FILES (no CLI) when user asks:
- "what workpackages exist?" → Read `.clear/workpackages/registry.yaml`
- "what's in workpackage P1.2?" → Read `.clear/workpackages/P1.2.yaml`
- "what's the status of all workpackages?" → Read registry
- "what did we complete in P1.1?" → Read the workpackage file

## DO NOT Use For

- Questions about workpackage history or reading raw workpackage documents — just read the file directly.
- Plan-level operations (creating plans, checking blockers, milestone updates) — use the `plan-management` skill.

---

## CLI Reference

All lifecycle operations use `lifecycle-cli.js`. All progress operations use `progress-cli.js`.

**Common flags** (passed automatically by the `/cf-workpackage` command):
- `--cwd=<project-dir>` — project root
- `--session-id=<id>` — current session ID
- `--session-number=<num>` — current session number

**CLI base path**:
```
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/lifecycle-cli.js"
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/progress-cli.js"
```

---

## Lifecycle Operations

### Start a Workpackage

**User says**: "start workpackage P1.3", "begin P1.3"

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/lifecycle-cli.js" \
  start <id> [--force] \
  --cwd="$PROJECT_DIR" --session-id="$SESSION_ID" --session-number="$SESSION_NUMBER"
```

- `<id>` — workpackage display ID (e.g., `P1.3`) or system ID
- `--force` — start even if dependencies are not satisfied
- The CLI validates dependencies, updates registry status, and sets the active workpackage

**Present to user**: Confirmation of start, list of deliverables and acceptance criteria.

### Pause a Workpackage

**User says**: "pause this workpackage", "pause current work"

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/lifecycle-cli.js" \
  pause \
  --cwd="$PROJECT_DIR" --session-id="$SESSION_ID" --session-number="$SESSION_NUMBER"
```

- Pauses the currently active workpackage (no ID needed)

**Present to user**: Confirmation of pause.

### Complete a Workpackage

**User says**: "complete this workpackage", "mark P1.2 as done"

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/lifecycle-cli.js" \
  complete [--force] \
  --cwd="$PROJECT_DIR" --session-id="$SESSION_ID" --session-number="$SESSION_NUMBER"
```

- Completes the currently active workpackage
- `--force` — complete even if not all deliverables are marked done
- The CLI verifies deliverables, updates status in registry, and identifies newly unblocked WPs

**Present to user**: Completion confirmation, list of unblocked workpackages.

### Delete a Workpackage

**User says**: "delete workpackage P1.3", "remove P1.3"

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/lifecycle-cli.js" \
  delete <id> --confirm \
  --cwd="$PROJECT_DIR" --session-id="$SESSION_ID" --session-number="$SESSION_NUMBER"
```

- `<id>` — workpackage display ID or system ID
- `--confirm` (or `-y`) — required to confirm deletion
- Without `--confirm`, the CLI returns a warning and does not delete

**Present to user**: Deletion confirmation or warning if `--confirm` was omitted.

### Defer a Workpackage

**User says**: "defer P1.3", "defer this workpackage", "postpone P1.3"

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/lifecycle-cli.js" \
  defer <id> [--reason=<reason>] \
  --cwd="$PROJECT_DIR" --session-id="$SESSION_ID" --session-number="$SESSION_NUMBER"
```

- `<id>` — workpackage display ID or system ID
- `--reason=<reason>` — optional reason for deferral
- The CLI updates the WP status to deferred and propagates changes to master-plan.yaml

**Present to user**: Deferral confirmation with reason (if provided).

### Reorder a Workpackage

**User says**: "reorder P1.3 to position 2", "move P1.3 to slot 1"

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/lifecycle-cli.js" \
  reorder <id> --position=<N> \
  --cwd="$PROJECT_DIR" --session-id="$SESSION_ID" --session-number="$SESSION_NUMBER"
```

- `<id>` — workpackage display ID or system ID
- `--position=<N>` — required, 1-based target position within the phase
- The CLI resolves display IDs, reorders within the phase, and propagates display ID changes to master-plan.yaml

**Present to user**: Reorder confirmation with old and new positions.

---

## Progress Operations

### Update Progress

**User says**: "update progress", "set progress to 75"

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/progress-cli.js" \
  progress [--set <N>] \
  --cwd="$PROJECT_DIR"
```

- Without `--set`: reports current progress percentage and remaining deliverables
- `--set <N>`: sets progress to N% for the active workpackage

**Present to user**: New progress percentage and remaining deliverables.

### Validate Workpackage

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/progress-cli.js" \
  validate \
  --cwd="$PROJECT_DIR"
```

- Validates the active workpackage structure and state

---

## Read-Only Operations

These operations do NOT require CLIs — just read files directly.

### Check Dependencies

**User says**: "check dependencies for P1.4", "what blocks P1.4"

1. Read `.clear/workpackages/<id>.yaml` for the target WP
2. Read `.clear/workpackages/registry.yaml` for dependency status
3. Check each upstream dependency's status
4. For hard dependencies, verify deliverables exist

**Present to user**: List of dependencies with status, whether the WP is ready to start.

### List Workpackages

**User says**: "what workpackages exist?", "show all WPs"

Read `.clear/workpackages/registry.yaml` and present the status table.

### View Workpackage Details

**User says**: "what's in P1.2?", "show workpackage P1.2"

Read `.clear/workpackages/<id>.yaml` and present contents.

---

## Workpackage Structure

Location: `.clear/workpackages/<id>.yaml`

```yaml
id: P1.3
title: Knowledge Automation
status: Not Started

scope:
  in_scope:
    - scripts/knowledge/**
  out_of_scope:
    - scripts/session/**

dependencies:
  upstream:
    - id: P1.2
      type: hard
  downstream:
    - id: P1.4
    - id: P1.5

deliverables:
  - id: knowledge_load
    description: "knowledge-load.sh implementation"
    weight: 25
    status: not_started

acceptance_criteria:
  - All 4 knowledge scripts implemented
  - Unit tests passing
  - Integration tests passing
```

## Registry Structure

Location: `.clear/workpackages/registry.yaml`

```yaml
workpackages:
  - id: P1.1
    title: Plugin Structure
    status: Complete
  - id: P1.2
    title: Session Automation
    status: In Progress
  - id: P1.3
    title: Knowledge Automation
    status: Not Started
    blocked_by: [P1.2]
```

## Progress Calculation

Progress is calculated from deliverables:

```
progress = Σ(deliverable.weight × deliverable.completion) / 100
```

---

## Automatic Hook Integrations

| Script | Triggered By | What It Does |
|--------|--------------|--------------|
| `workpackage-load.sh` | SessionStart hook | Loads active workpackage, validates dependencies |
| `workpackage-progress.sh` | UserPromptSubmit hook | Tracks deliverable completion |
| `workpackage-deps.sh` | On demand | Validates dependency graph |

---

## Important Rules

1. **Never use Write or Edit on `.clear/` paths.** The PreToolUse guard blocks these. All mutations go through CLIs which use `fs.writeFileSync` (invisible to the guard).
2. **Parse CLI JSON output** to confirm `"status": "success"` before reporting to the user.
3. **Display IDs** (e.g., `P1.3`) are user-facing; **system IDs** are internal. The CLIs accept both — display ID resolution happens inside the CLI.
