---
name: cf-plan
version: 1.1.0
author: Ashay Kubal @ Qball Inc.
description: Manage and view the development plan — status, progress, blockers, phases, and next steps. Use when the user asks about plan status, needs next-step recommendations, wants to create or modify the plan, or asks about phases and milestones.
user-invocable: true
argument-hint: "[subcommand|help] [options]"
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

> **CLI Usage:** When unsure about a CLI's interface or flags, run it with `--help` first. Do NOT attempt to discover functionality by reading plugin source code — doing so leads to incorrect execution from assumptions made without context of the holistic flow.

# CLEAR Plan Management

Manage and view the development plan: status, progress, blockers, phases, next steps, and plan creation.

## When to Use This Skill

| Trigger | Examples |
|---------|---------|
| Plan status or overview | "How's the plan looking?", "Plan status?" |
| Progress check | "How much progress have we made?", "Phase progress?" |
| Blocker analysis | "Are there any blockers?", "What's blocking us?" |
| Next-step recommendation | "What should we work on next?", "What's the next WP?" |
| Phase listing | "Show me the phases", "What phases are there?" |
| Plan creation | "Create a plan", "Initialize the development plan" |
| Add a phase | "Add a new phase", "Create phase 3" |

**Not for:** Workpackage management (`/cf-workpackage`), session status (`/cf-status`), debugging (`/cf-debug`).

---

## Pre-Flight Check

```bash
if [ -f ".clear/config/clear-manifest.yaml" ]; then
  echo "INITIALIZED"
else
  echo "NOT_INITIALIZED"
fi
```

If `NOT_INITIALIZED`: Display "CLEAR is not initialized in this project. Run `/cf-init` to set up CLEAR." and stop.

---

## Subcommand Table

| Subcommand | Type | Reference File | Intent Signals |
|------------|------|----------------|----------------|
| `status` | [R] | `references/status.md` | "status", "how's the plan", "overview" |
| `progress` | [R] | `references/progress.md` | "progress", "how far", "how much done" |
| `blockers` | [R] | `references/blockers.md` | "blockers", "what's blocking", "stuck" |
| `next` | [R] | `references/next.md` | "next", "what should we work on", "recommend" |
| `phases` | [R] | `references/phases.md` | "phases", "show phases", "what phases" |
| `help` | [R] | `references/help.md` | "help", "how do I", "usage" |
| `create` | [W] | `references/create.md` | "create a plan", "initialize plan", "set up plan" |
| `addPhase` | [W] | `references/add-phase.md` | "add phase", "new phase", "create phase" |
| `update` | [W] | `references/update.md` | "update the plan", "set active phase", "mark milestone", "rollup" |

---

## Routing

Follow these steps **in order**. Track which step you reached — this determines whether confirmation is needed.

**Step 1 — Check `$ARGUMENTS` for an explicit subcommand.**
Check whether `$ARGUMENTS` literally starts with one of the subcommand keywords from the table above (e.g., `status`, `progress`, `create`). This is a string match, not intent inference.
- If YES: load `references/{subcommand}.md`, pass remaining arguments. **Done — skip steps 2-4.**
- If NO (empty, missing, or does not start with a table keyword): continue to step 2.

**Step 2 — Infer intent from the user's natural language message.**
`$ARGUMENTS` did not contain an explicit subcommand. Determine which subcommand best matches the user's intent from their message. Use the subcommand table's intent signals, the "When to Use" examples, and the conversation context.
- If you can identify a specific subcommand with reasonable confidence: continue to step 3.
- If the user's message is purely a status or overview inquiry with no action intent (e.g., "how's the plan looking?"): load `references/default.md`. **Done.** Only use this exit if the message contains no entity identifiers (phase name, WP ID) and expresses no specific action intent.
- If you cannot determine intent with reasonable confidence: go to step 4.

**Step 3 — Confirm before write actions (NL-inferred only).**
You reached this step via intent inference (step 2), not explicit arguments (step 1).
- If the inferred subcommand is a **read** action ([R] in the table): load the reference file immediately.
- If the inferred subcommand is a **write** action ([W] in the table): **you MUST confirm before proceeding.** Ask: "I'll run **{subcommand}**{details}. Proceed?" where `{details}` includes the target identifier (e.g., " for phase_2"). For destructive actions, always include the target. Wait for the user's response. Only load the reference file after the user confirms.

**Step 4 — Ambiguity fallback.**
Ask the user: "I matched `/cf-plan` but I'm not sure which action you want. Did you mean: {top 2-3 candidates}?" Do NOT silently fall through to `default`.

---

## Related Commands

`/cf-workpackage`, `/cf-status`, `/cf-knowledge`, `/cf-debug`

---

## Completion Checklist

- [ ] Pre-flight check passed
- [ ] Correct subcommand reference loaded
- [ ] Command executed successfully
- [ ] Output displayed to user
