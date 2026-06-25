---
name: cf-debug
version: 1.0.0
author: Ashay Kubal @ Qball Inc.
description: Run diagnostics on CLEAR state and optionally repair issues. Use when CLEAR state seems inconsistent or after manual edits to .clear/ files.
user-invocable: true
argument-hint: [domain] [--repair] [--check-ids]
allowed-tools:
  - Bash
---

> **CLI Usage:** When unsure about a CLI's interface or flags, run it with `--help` first. Do NOT attempt to discover functionality by reading plugin source code — doing so leads to incorrect execution from assumptions made without context of the holistic flow.

# CLEAR Debug & Diagnostics

Validate CLEAR framework state across all domains (sync, workpackage, plan, knowledge, session) and optionally auto-repair fixable issues. Routes to the debug CLI tool for execution.

## Plugin Root Resolution

CLI commands in this skill reference `$CLEAR_PLUGIN_ROOT` — a `.claude/settings.json` env var the shell expands. The SessionStart hook persists it, but settings env vars load at session **launch**, so on a brand-new consumer's **first session** (before its next restart) the variable is empty and `node "$CLEAR_PLUGIN_ROOT/build/..."` fails with `MODULE_NOT_FOUND`.

**First-session bootstrap** — if `$CLEAR_PLUGIN_ROOT` is empty, set it inline in the *same* Bash call as the CLI (each Bash call is a fresh shell, so a separate `export` would not carry over):

```bash
export CLEAR_PLUGIN_ROOT="${CLEAR_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}"
```

Prepend it to the CLI in one shell line: `export CLEAR_PLUGIN_ROOT="${CLEAR_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}"; <node "$CLEAR_PLUGIN_ROOT/build/..." command>`. `${CLAUDE_PLUGIN_ROOT}` resolves in this SKILL.md body to the actually-loaded plugin path; once the consumer restarts, `$CLEAR_PLUGIN_ROOT` is populated and the assignment is a harmless no-op.

---

## When to Use This Skill

**Load this skill when the user request matches ANY of these patterns:**

| Trigger Pattern | Example User Request |
|-----------------|---------------------|
| Diagnose or debug CLEAR state | "Run CLEAR diagnostics" |
| Check for state inconsistencies | "Something seems wrong with my CLEAR state" |
| Repair CLEAR issues | "Fix my CLEAR configuration issues" |
| Validate domain integrity | "Check if my workpackages are valid" |
| Health check before session | "Verify CLEAR is healthy before we start" |

**DO NOT use for:**
- Initializing CLEAR for the first time (use `/cf-init` instead)
- Viewing current CLEAR status or session info (use `/cf-status` instead)
- Reloading CLEAR context (use `/cf-reload` instead)

---

## Command Reference

Debug CLI at `$CLEAR_PLUGIN_ROOT/build/infrastructure/sync/cli/`.

| Action | CLI Command |
|--------|-------------|
| Full diagnostic (all domains) | `debug-cli` |
| Domain-specific diagnostic | `debug-cli <domain>` (sync, workpackage, plan, knowledge, session, install) |
| Auto-repair fixable issues | `debug-cli --repair` |
| Dual-ID integrity check | `debug-cli --check-ids` |
| Combined (domain + repair) | `debug-cli <domain> --repair` |

---

## Usage

```
/cf-debug                        # Full diagnostic across all domains
/cf-debug workpackage            # Focus on a specific domain
/cf-debug install                # Verify Claude Code install wiring (run after restart)
/cf-debug --check-ids            # Include dual-ID integrity validation
/cf-debug --repair               # Attempt auto-repair of fixable issues
/cf-debug sync --repair          # Domain-specific diagnostic with repair
```

**Arguments:**
- `[domain]`: Optional. One of `sync`, `workpackage`, `plan`, `knowledge`, `session`, `install`
- `--repair`: Attempt auto-repair of fixable issues
- `--check-ids`: Include dual-ID integrity validation

---

## Instructions

### Step 1: Pre-flight Check

Verify CLEAR is initialized:

```bash
if [ -d ".clear" ]; then
  echo "CLEAR_EXISTS"
else
  echo "NO_CLEAR"
fi
```

If `NO_CLEAR`: tell the user "CLEAR directory not found. Run `/cf-init` to initialize CLEAR." and stop.

### Step 2: Parse Arguments and Execute

Build the CLI command from the provided arguments and run the debug tool:

```bash
ARGS=""

for arg in $ARGUMENTS; do
  case "$arg" in
    sync|workpackage|plan|knowledge|session|install)
      ARGS="$ARGS $arg"
      ;;
    --repair)
      ARGS="$ARGS --repair"
      ;;
    --check-ids)
      ARGS="$ARGS --check-ids"
      ;;
  esac
done

cd "$(pwd)" && node "$CLEAR_PLUGIN_ROOT/build/infrastructure/sync/cli/debug-cli.js" $ARGS
```

### Step 3: Interpret Results

The CLI checks the following by domain:

| Domain | Checks |
|--------|--------|
| **sync** | sync-state.json validity, stale timestamps (>24h), SystemId formats |
| **workpackage** | Registry exists, no duplicate systemIds, all entries have systemIds |
| **plan** | Plans directory exists, master-plan.yaml validity, no duplicate phase IDs, no position gaps |
| **knowledge** | Knowledge directory exists, index.db exists |
| **install** | Claude Code install wiring: `.claude/settings.json` statusLine points at the CLEAR statusline script (present + executable) and the CLEAR environment variables are set. Run after restarting Claude Code to confirm the statusline is wired. |
| **cross-domain** | Active workpackage/phase references exist, knowledge links valid |
| **dual-ID** (--check-ids) | Knowledge links use systemId format, workpackageId/phaseId formats correct |

### Step 4: Report Auto-Repair Results (if --repair)

When `--repair` is specified, the following issues can be auto-repaired:

| Issue | Repair Action |
|-------|---------------|
| sync-state.json not found | Create default sync state |
| sync-state.json has invalid structure | Recreate sync state |
| Plans directory not found | Create `.clear/plans/` |
| Knowledge directory not found | Create `.clear/knowledge/` |
| Position gap detected | Renumber positions sequentially |

Issues that **cannot** be auto-repaired (inform the user):
- Invalid systemId formats (requires manual correction)
- Duplicate systemIds (requires manual resolution)
- Missing workpackage/plan files (requires recreation)
- Cross-domain reference mismatches (requires investigation)

### Step 5: Present Summary

Present the diagnostic report to the user. Highlight any errors or warnings that need attention, and confirm any repairs that were applied.

---

## Completion Checklist

Before returning to the user, verify:

- [ ] CLEAR directory existence was confirmed before running diagnostics
- [ ] Debug CLI executed successfully with the correct arguments
- [ ] Diagnostic output was presented to the user with clear next steps for any issues found
