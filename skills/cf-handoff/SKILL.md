---
name: cf-handoff
version: 1.0.0
author: Ashay Kubal @ Qball Inc.
description: Generate a session handoff document. Use when ending a session, reaching token thresholds, or previewing handoff contents.
user-invocable: true
argument-hint: [--preview]
allowed-tools:
  - Bash
  - Read
  - Edit
---

> **CLI Usage:** When unsure about a CLI's interface or flags, run it with `--help` first. Do NOT attempt to discover functionality by reading plugin source code — doing so leads to incorrect execution from assumptions made without context of the holistic flow.

# Session Handoff

Generate or preview the session handoff document for the current CLEAR session. Captures metrics, decisions, progress, and priorities for the next session.

---

## When to Use This Skill

| Trigger Pattern | Example User Request |
|-----------------|---------------------|
| Session ending or wrapping up | "Create a session handoff" |
| Token budget checkpoint reached | "Generate handoff, I'm at 75%" |
| Preview handoff contents | "What would be in the handoff?" |

**DO NOT use for:**
- Initializing a new session (use `/cf-init` instead)
- Viewing session status without generating a handoff (use `/cf-status` instead)

---

## Usage

- `/cf-handoff` -- Generate the handoff document
- `/cf-handoff --preview` -- Preview contents without creating a file

---

## Instructions

### Step 0: Pre-flight Check

```bash
if [ -f ".clear/state/session.json" ]; then echo "SESSION_ACTIVE"; else echo "NO_SESSION"; fi
```

If `NO_SESSION`: display "No active CLEAR session. Run `/cf-init` to initialize CLEAR." and stop.

### Branch: --preview

If `$ARGUMENTS` contains `--preview`, read session state and display a preview:

```bash
SESSION_STATE=$(cat .clear/state/session.json)
SESSION_NUM=$(echo "$SESSION_STATE" | jq -r '.clearSessionNumber')
TOKEN_PCT=$(echo "$SESSION_STATE" | jq -r '(.tokenUsage.estimate * 100) | floor')
PROMPTS=$(echo "$SESSION_STATE" | jq -r '.tokenUsage.promptCount')
echo "Handoff Preview for Session ${SESSION_NUM}"
echo "========================================"
echo "Token Usage: ${TOKEN_PCT}% | Prompts: ${PROMPTS}"
echo ""
echo "The handoff document will include:"
echo "- YAML frontmatter with all metrics (to be updated)"
echo "- Summary, Completed/In Progress items, Technical decisions"
echo "- Changes this session (knowledge, plan, workpackage)"
echo "- Code changes table, Test results, Next session priorities"
echo ""
echo "Run /cf-handoff without --preview to generate the document."
```

Stop after displaying preview.

### Branch: Generate (no --preview)

**Step 1 -- Generate:** Invoke session-handoff.sh:

```bash
echo '{"session_id": "manual", "cwd": "'"$(pwd)"'", "manual": true}' | \
  "${CLEAR_PLUGIN_ROOT}/scripts/session/session-handoff.sh"
```

**Step 2 -- Display result.** The script returns JSON with the document path. Show:

```
Handoff document generated at: .clear/sessions/session_N_YYYYMMDD.md

Next steps:
1. Update YAML frontmatter metrics (prod/test files, lines, test results, complexity, hours)
2. Fill in markdown sections (Summary, Completed Items, Technical Decisions, Code Changes, Next Priorities)
3. Change status from PARTIAL to COMPLETE when done
```

**Step 3 -- Open for editing.** Read the generated file so Claude can help fill it in:

```bash
HANDOFF_PATH=$(cat .clear/state/session.json | jq -r '.handoff.documentPath')
cat "$HANDOFF_PATH"
```

### YAML Frontmatter Reference

The handoff uses a single YAML frontmatter block. Key fields:

| Group | Fields |
|-------|--------|
| Identity | `session`, `date`, `workpackage`, `branch`, `status` (PARTIAL/COMPLETE/BLOCKED) |
| Tokens | `tokens_pct`, `tokens_count`, `prompts` |
| Code Files | `prod_files_created`, `prod_files_modified`, `test_files_created`, `test_files_modified` |
| Lines | `lines_prod`, `lines_test`, `lines_docs` |
| Docs | `docs_created`, `docs_modified` |
| Tests | `tests_passed`, `tests_failed`, `tests_total` |
| Metadata | `complexity` (simple/medium/complex), `decisions_count`, `actual_hours` |

### Auto-trigger Note

This skill can also be triggered automatically by session-monitor.sh when token usage reaches 75%. Auto-generated documents will have placeholder values that should be updated before finalizing.

### After Handoff

1. Run the metrics collection script to extract metrics to CSV
2. Commit the handoff document to version control
3. The next session can resume using the documented priorities

---

## Completion Checklist

- [ ] Session state verified as active
- [ ] Handoff document generated (or preview displayed)
- [ ] Handoff file opened for review and editing
