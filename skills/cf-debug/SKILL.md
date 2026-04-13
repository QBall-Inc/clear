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

## Usage

```
/cf-debug                        # Full diagnostic across all domains
/cf-debug workpackage            # Focus on a specific domain
/cf-debug --check-ids            # Include dual-ID integrity validation
/cf-debug --repair               # Attempt auto-repair of fixable issues
/cf-debug sync --repair          # Domain-specific diagnostic with repair
```

**Arguments:**
- `[domain]`: Optional. One of `sync`, `workpackage`, `plan`, `knowledge`, `session`
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
    sync|workpackage|plan|knowledge|session)
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
