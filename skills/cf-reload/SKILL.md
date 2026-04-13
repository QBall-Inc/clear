---
name: cf-reload
version: 1.0.0
author: Ashay Kubal @ Qball Inc.
description: Reloads CLEAR context (knowledge, workpackage, plan) into the current session. Use when context is stale, files were manually edited, or recovering from context issues.
user-invocable: true
allowed-tools:
  - Bash
---

> **CLI Usage:** When unsure about a CLI's interface or flags, run it with `--help` first. Do NOT attempt to discover functionality by reading plugin source code — doing so leads to incorrect execution from assumptions made without context of the holistic flow.

# Reload CLEAR Context

This skill forces a reload of all CLEAR domain context -- knowledge, workpackage, and plan -- into the current session. It re-triggers the session-start dispatcher without reinitializing the project, making it a lightweight way to refresh stale or incomplete context.

---

## When to Use This Skill

**Load this skill when the user request matches ANY of these patterns:**

| Trigger Pattern | Example User Request |
|-----------------|---------------------|
| Manual edits to `.clear/` files | "I just edited my workpackage YAML, reload context" |
| Context seems stale or incomplete | "CLEAR context looks wrong, refresh it" |
| Recovery from context issues | "Context is broken, reload everything" |
| Changes made outside CLEAR commands | "I updated plan files manually, sync them" |
| Explicit reload request | "Run cf-reload" |

**DO NOT use for:**
- Project initialization or reinitializing a corrupted project (use `/cf-init --force` instead)
- Debugging CLEAR internals or inspecting state (use `/cf-debug` instead)

---

## Usage

```
/cf-reload
```

No arguments. Reloads all domain context in place.

---

## Instructions

**Step 1: Execute the context reload**

Run the session-start dispatcher with `source: clear` to trigger a full context reload:

```bash
echo '{"source": "clear", "cwd": "'"$(pwd)"'", "session_id": "manual-reload"}' | "${CLEAR_PLUGIN_ROOT}/scripts/dispatchers/session-start.sh"
```

**Step 2: Confirm the result**

After execution, verify that:
- The dispatcher ran without errors
- CLEAR context has been refreshed (confirmation output from the script)

**Step 3: Report to the user**

Inform the user that CLEAR context (knowledge, workpackage, plan) has been reloaded. If any errors occurred during the reload, report them with the full error output.

---

## Completion Checklist

Before returning to the user, verify:

- [ ] Session-start dispatcher executed successfully with `source: clear`
- [ ] Context reload confirmation was received from the script
- [ ] No errors were produced during reload
