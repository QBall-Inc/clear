---
name: cf-knowledge
version: 1.1.0
author: Ashay Kubal @ Qball Inc.
description: Manage the CLEAR knowledge base — search, view, capture, index, link, deprecate, and supersede entries. Use when the user asks about knowledge base entries, wants to capture a decision or lesson, search for patterns, or manage entry lifecycle.
user-invocable: true
argument-hint: "[subcommand|help] [id] [options]"
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

> **CLI Usage:** When unsure about a CLI's interface or flags, run it with `--help` first. Do NOT attempt to discover functionality by reading plugin source code — doing so leads to incorrect execution from assumptions made without context of the holistic flow.

# Knowledge Management

Manage the CLEAR knowledge base: search, view, capture, index, link, deprecate, and supersede entries.

## When to Use This Skill

| Trigger | Examples |
|---------|---------|
| View overview | "Show me the knowledge base status", "What's in the KB?" |
| Search or find entries | "Search knowledge for caching pattern", "Find decisions about auth" |
| View entry details | "Show me TD-015", "What does LES-003 say?" |
| Load into context | "Load knowledge for this workpackage" |
| Rebuild index | "Rebuild the knowledge index", "Reindex knowledge" |
| Capture knowledge | "Capture this decision", "Save this as a lesson learned" |
| Deprecate an entry | "Deprecate PAT-003", "This pattern is outdated" |
| Link or unlink | "Link TD-012 to WP-04", "Unlink LES-001" |
| Supersede an entry | "TD-005 replaces TD-002", "Supersede PAT-001 with PAT-007" |

**Not for:** Project status (`/cf-status`), workpackage ops (`/cf-workpackage`), debug (`/cf-debug`).

---

## Pre-Flight Check

```bash
if [ ! -d ".clear" ]; then
  echo "ERROR: CLEAR not initialized. Run /cf-init first." >&2
  exit 1
fi
```

---

## Subcommand Table

| Subcommand | Type | Reference File | Intent Signals |
|------------|------|----------------|----------------|
| `search` | [R] | `references/search.md` | "search", "find", "look for" |
| `show` | [R] | `references/show.md` | "show", "details", "what does X say" |
| `load` | [R] | `references/load.md` | "load", "load knowledge", "bring in context" |
| `index` | [R] | `references/index.md` | "index", "reindex", "rebuild index" |
| `help` | [R] | `references/help.md` | "help", "how do I", "usage" |
| `capture` | [W] | `references/capture.md` | "capture", "save", "record this decision", "lesson learned" |
| `deprecate` | [W] | `references/deprecate.md` | "deprecate", "outdated", "no longer valid" |
| `link` | [W] | `references/link.md` | "link", "associate", "connect to WP" |
| `unlink` | [W] | `references/unlink.md` | "unlink", "disconnect", "remove link" |
| `supersede` | [W] | `references/supersede.md` | "supersede", "replace", "X replaces Y" |

---

## Routing

Follow these steps **in order**. Track which step you reached — this determines whether confirmation is needed.

**Step 1 — Check `$ARGUMENTS` for an explicit subcommand.**
Check whether `$ARGUMENTS` literally starts with one of the subcommand keywords from the table above (e.g., `capture`, `search`, `deprecate`). This is a string match, not intent inference.
- If YES: load `references/{subcommand}.md`, pass remaining arguments. **Done — skip steps 2-4.**
- If NO (empty, missing, or does not start with a table keyword): continue to step 2.

**Step 2 — Infer intent from the user's natural language message.**
`$ARGUMENTS` did not contain an explicit subcommand. Determine which subcommand best matches the user's intent from their message. Use the subcommand table's intent signals, the "When to Use" examples, and the conversation context.
- If you can identify a specific subcommand with reasonable confidence: continue to step 3.
- If the user's message is purely a status or overview inquiry with no action intent (e.g., "show me the knowledge base status"): load `references/default.md`. **Done.** Only use this exit if the message contains no entity identifiers (entry ID, WP ID) and expresses no specific action intent.
- If you cannot determine intent with reasonable confidence: go to step 4.

**Step 3 — Confirm before write actions (NL-inferred only).**
You reached this step via intent inference (step 2), not explicit arguments (step 1).
- If the inferred subcommand is a **read** action ([R] in the table): load the reference file immediately.
- If the inferred subcommand is a **write** action ([W] in the table): **you MUST confirm before proceeding.** Ask: "I'll run **{subcommand}**{details}. Proceed?" where `{details}` includes the target identifier (e.g., " on TD-015", " superseding TD-002 with PAT-007"). For destructive actions (deprecate, supersede, delete), always include the target ID. Wait for the user's response. Only load the reference file after the user confirms.

**Step 4 — Ambiguity fallback.**
Ask the user: "I matched `/cf-knowledge` but I'm not sure which action you want. Did you mean: {top 2-3 candidates}?" Do NOT silently fall through to `default`.

---

## Error Codes

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | Invalid usage or missing arguments |
| 2 | Knowledge entry not found |
| 3 | Invalid operation (e.g., deprecate already deprecated) |
| 4 | Chain depth exceeded |
| 5 | Validation failed |

---

## Completion Checklist

- [ ] Pre-flight passed
- [ ] Correct reference loaded and executed
- [ ] Exit code 0, output displayed
