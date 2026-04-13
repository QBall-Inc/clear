---
name: cf-init
version: 1.1.0
author: Ashay Kubal @ Qball Inc.
description: Initialize the CLEAR framework in the current project. Use when a user wants to set up CLEAR for the first time or reinitialize an existing project.
user-invocable: true
argument-hint: [--force]
allowed-tools:
  - Bash
  - Write
  - Read
  - Glob
---

> **CLI Usage:** When unsure about a CLI's interface or flags, run it with `--help` first. Do NOT attempt to discover functionality by reading plugin source code — doing so leads to incorrect execution from assumptions made without context of the holistic flow.

# Initialize CLEAR Framework

Set up CLEAR (Context Layered Engineering for Agentic Resources) in the current project. This skill runs a single CLI command that creates the `.clear/` directory structure, generates a project manifest, initializes Session 0, configures hooks, configures the statusline, and returns a structured JSON result. Claude then adds session resume instructions to CLAUDE.md.

---

## When to Use This Skill

| Trigger Pattern | Example User Request |
|-----------------|---------------------|
| First-time CLEAR setup | "Initialize CLEAR in this project" |
| Reinitialize existing project | "Reinitialize CLEAR with --force" |
| Set up framework tracking | "Set up CLEAR so my sessions are tracked" |

**DO NOT use for:**
- Checking CLEAR status after initialization (use `/cf-status` instead)
- Reloading configuration without reinitializing (use `/cf-reload` instead)

---

## Mandatory Execution Checklist (BINDING)

**Every item below is mandatory. Execute in order. No skipping.**

- [ ] Pre-flight check completed (determine initialization state)
- [ ] Init CLI executed (creates .clear/ structure, manifest, config, session 0, env vars, statusline)
- [ ] CLI output parsed and verified (success / partial / error)
- [ ] Session resume instructions added to project CLAUDE.md
- [ ] Success output displayed with project ID, session ID, and next steps

---

## Usage

```
/cf-init [--force]
```

**Arguments:**

- `--force` -- Reinitialize an existing CLEAR project. Creates a timestamped backup of the existing `.clear/` directory before reinitializing.

Current arguments: $ARGUMENTS

---

## Instructions

### Pre-flight Check

Before any initialization, determine the current state:

```bash
ls -la .clear/config/clear-manifest.yaml 2>/dev/null && echo "ALREADY_INITIALIZED" || echo "NOT_INITIALIZED"
```

**Branch on result:**

- **ALREADY_INITIALIZED without `--force`:** Display a message explaining the project is already initialized. Instruct the user to pass `--force` to reinitialize. STOP here.
- **`.clear/` exists but no manifest:** Display an error explaining this is an unknown state that cannot be safely initialized. STOP here.
- **NOT_INITIALIZED (or `--force` with ALREADY_INITIALIZED):** Proceed with the init CLI below.

---

### Run Init CLI

Execute the init CLI to perform all `.clear/` setup in a single command:

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/init/cli/init-cli.js" --cwd="$PROJECT_DIR" --plugin-root="$CLEAR_PLUGIN_ROOT" $( [ "$ARGUMENTS" = "--force" ] && echo "--force" )
```

This CLI performs:
1. Creates `.clear/` directory structure (7 subdirectories)
2. Creates manifest at `.clear/config/clear-manifest.yaml`
3. Creates configuration at `.clear/config/clear-config.yaml`
4. Initializes Session 0 (session.json, session-history.json, sync-state.json)
5. Configures environment variables (kill switches) in `.claude/settings.json`
6. Configures statusline for context window detection in `.claude/settings.json`

**Do NOT use Write or Edit on any `.clear/` file.** The CLI handles all `.clear/` mutations via `fs.writeFileSync`, which is invisible to the PreToolUse guard.

### Parse CLI Output

The CLI returns JSON:

```json
{
  "status": "success | partial | error",
  "init": {
    "success": true,
    "projectName": "...",
    "projectPath": "...",
    "projectId": "prj-xxxxxxxx",
    "sessionId": "init-xxxx-...",
    "steps": [{"step": "...", "success": true}],
    "checks": [{"name": "...", "passed": true, "message": "..."}]
  },
  "statusline": {
    "needsRestart": true,
    "originalStatusline": null
  },
  "error": "..." 
}
```

**Branch on status:**

- **`success`**: All steps completed. Proceed to Step 6.
- **`partial`**: Init succeeded but statusline configuration failed. Proceed to Step 6 with a warning about statusline.
- **`error`**: Initialization failed. Display the error message and the `init.steps` array showing which steps completed. Advise the user to run `/cf-init --force` to retry.

---

### Add Session Resume Instructions (Step 6)

**This is the only Write operation in the skill — it writes to `CLAUDE.md`, NOT to `.clear/`.**

Append session resume instructions to the project's `CLAUDE.md` file. These instructions tell Claude how to restore CLEAR context after `/clear` or compaction events. If `CLAUDE.md` does not exist, create it with the resume instructions.

---

### Error Recovery

If initialization fails partway through:

- Report which steps completed successfully (from `init.steps` array)
- Report which step failed and the reason
- Provide guidance: "Run `/cf-init --force` to retry from scratch"

---

## Completion Checklist

- [ ] Init CLI executed successfully (or partially with statusline warning)
- [ ] `.clear/` directory contains all 7 subdirectories (verified by CLI steps)
- [ ] Configuration and manifest files exist (verified by CLI)
- [ ] Session 0 is active (verified by CLI)
- [ ] Environment variables configured (verified by CLI)
- [ ] Session resume instructions appended to CLAUDE.md
- [ ] Success output displayed: project ID, Session 0 ID, and next steps
- [ ] User informed of next steps: create a plan, define workpackages, run `/cf-status`
- [ ] If statusline was configured (`statusline.needsRestart` is true): "Please exit, restart Claude Code, then run `/cf-init --verify` to confirm the statusline is working."
- [ ] Context advisory displayed: "CLEAR calculates context based on max usage, but it is advisable to start a new session after hitting 75%+ of operational context."
