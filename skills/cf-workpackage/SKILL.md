---
name: cf-workpackage
version: 1.1.0
author: Ashay Kubal @ Qball Inc.
description: Manage workpackage lifecycle — view status, list, create, start, pause, track progress, validate, complete, or delete. Use when the user mentions workpackages, asks to start or pause work, wants progress updates, or needs to change workpackage state.
user-invocable: true
argument-hint: "[subcommand|help] [id] [options]"
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

> **CLI Usage:** When unsure about a CLI's interface or flags, run it with `--help` first. Do NOT attempt to discover functionality by reading plugin source code — doing so leads to incorrect execution from assumptions made without context of the holistic flow.

# Workpackage Management

Manage the workpackage lifecycle: view status, list, create, start, pause, track progress, validate, complete, or delete workpackages.

## When to Use This Skill

| Trigger | Examples |
|---------|---------|
| Active workpackage status | "What workpackage am I on?", "Current WP?" |
| List or show workpackages | "Show all workpackages", "What's in phase 2?" |
| Lifecycle actions | "Start WP-2.1", "Let's begin the next workpackage", "Pause this one" |
| Progress or validation | "Update progress to 80%", "Is this WP ready to complete?" |
| Complete or delete | "Mark this workpackage done", "Delete WP-1.3" |

**Not for:** Plan operations (`/cf-plan`), knowledge base (`/cf-knowledge`), session status (`/cf-status`).

---

## Pre-Flight Check

```bash
if [ ! -d ".clear" ]; then
  echo "Error: CLEAR not initialized. Run /cf-init first."; exit 1
fi
```

---

## Subcommand Table

| Subcommand | Type | Reference File | Intent Signals |
|------------|------|----------------|----------------|
| `list` | [R] | `references/list.md` | "list", "show all", "what workpackages" |
| `show` | [R] | `references/show.md` | "show", "details", "tell me about" |
| `progress` | [R] | `references/progress.md` | "progress", "how far", "percentage" |
| `validate` | [R] | `references/validate.md` | "validate", "check", "ready to complete?" |
| `help` | [R] | `references/help.md` | "help", "how do I", "usage" |
| `create` | [W] | `references/create.md` | "create", "add", "new workpackage" |
| `start` | [W] | `references/start.md` | "start", "begin", "activate", "let's work on" |
| `pause` | [W] | `references/pause.md` | "pause", "stop for now", "take a break" |
| `complete` | [W] | `references/complete.md` | "done", "finished", "complete", "mark complete" |
| `delete` | [W] | `references/delete.md` | "delete", "remove", "archive" |

---

## Routing

Follow these steps **in order**. Track which step you reached — this determines whether confirmation is needed.

**Step 1 — Check `$ARGUMENTS` for an explicit subcommand.**
Check whether `$ARGUMENTS` literally starts with one of the subcommand keywords from the table above (e.g., `start`, `complete`, `list`). This is a string match, not intent inference.
- If YES: load `references/{subcommand}.md`, pass remaining arguments. **Done — skip steps 2-4.**
- If NO (empty, missing, or does not start with a table keyword): continue to step 2.

**Step 2 — Infer intent from the user's natural language message.**
`$ARGUMENTS` did not contain an explicit subcommand. Determine which subcommand best matches the user's intent from their message. Use the subcommand table's intent signals, the "When to Use" examples, and the conversation context.
- If you can identify a specific subcommand with reasonable confidence: continue to step 3.
- If the user's message is purely a status or overview inquiry with no action intent (e.g., "what's my current workpackage?"): load `references/default.md`. **Done.** Only use this exit if the message contains no entity identifiers (WP ID, phase name) and expresses no specific action intent.
- If you cannot determine intent with reasonable confidence: go to step 4.

**Step 3 — Confirm before write actions (NL-inferred only).**
You reached this step via intent inference (step 2), not explicit arguments (step 1).
- If the inferred subcommand is a **read** action ([R] in the table): load the reference file immediately.
- If the inferred subcommand is a **write** action ([W] in the table): **you MUST confirm before proceeding.** Ask: "I'll run **{subcommand}**{details}. Proceed?" where `{details}` includes the target identifier (e.g., " on WP-003"). For destructive actions (delete, complete), always include the target ID. Wait for the user's response. Only load the reference file after the user confirms.

**Step 4 — Ambiguity fallback.**
Ask the user: "I matched `/cf-workpackage` but I'm not sure which action you want. Did you mean: {top 2-3 candidates}?" Do NOT silently fall through to `default`.

---

## State Transitions

| From | To | Command |
|------|-----|---------|
| not_started | in_progress | `start` (deps satisfied) |
| not_started | archived | `delete` |
| in_progress | paused | `pause` |
| in_progress | complete | `complete` (validated) |
| paused | in_progress | `start` |
| paused | archived | `delete` |
| complete | archived | `delete` |

## Error Codes

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | Invalid usage / missing arguments |
| 2 | Workpackage not found |
| 3 | Invalid state transition |
| 4 | Blocked by dependencies |
| 5 | Validation failed |

## Related Commands

`/cf-plan`, `/cf-status`, `/cf-knowledge`, `/cf-debug`

---

## Completion Checklist

- [ ] Pre-flight check passed
- [ ] Correct subcommand reference loaded
- [ ] Command executed successfully
- [ ] Output displayed to user
