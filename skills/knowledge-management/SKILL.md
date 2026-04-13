---
name: knowledge-management
version: 1.1.0
author: Ashay Kubal @ Qball Inc.
description: "Use when PERFORMING knowledge actions: capturing decisions, searching the knowledge base, or creating knowledge entries. Do NOT load for questions about what knowledge exists or reading specific entries directly."
tags: knowledge, decisions, patterns, search
allowed-tools: Read, Bash, Glob, Grep
---

> **CLI Usage:** When unsure about a CLI's interface or flags, run it with `--help` first. Do NOT attempt to discover functionality by reading plugin source code — doing so leads to incorrect execution from assumptions made without context of the holistic flow.

# Knowledge Management Skill

## Purpose

This skill provides guidance for Claude on managing persistent project knowledge in the CLEAR framework. It covers capturing decisions, searching the knowledge base, viewing entries, managing lifecycle (linking, deprecation, supersession, update, deletion), and understanding automatic knowledge hooks.

## When to Take Action vs. Just Answer

### TAKE ACTION (run CLIs) when user says:
- "capture this decision" / "save this as a technical decision" → `/cf-knowledge create` or `capture-cli --create`
- "search knowledge for X" / "find what we decided about X" → `search-cli --query=X`
- "show me TD-001" → `/cf-knowledge TD-001` or `/cf-knowledge show TD-001`
- "create a business rule for X" → `capture-cli --create --type=business-rule`
- "rebuild the knowledge index" → `index-cli --mode=full --force`
- "link TD-001 to WP-P3.2" → `/cf-knowledge link TD-001 --to=P3.2`
- "deprecate LES-003" → `/cf-knowledge deprecate LES-003 --reason="..."`
- "update TD-001 tags" → `/cf-knowledge update TD-001 --tags=new-tag1,new-tag2`
- "delete LES-003" → `/cf-knowledge delete LES-003 --reason="..." --force`
- "knowledge status" → `/cf-knowledge status`

### JUST READ FILES (no CLIs) when user asks:
- "what decisions have we made?" → Read entries in `.clear/knowledge/entries/`
- "list all patterns" → Grep for `type: architectural-pattern` in `.clear/knowledge/entries/`
- "do we have any knowledge about X?" → Grep `.clear/knowledge/entries/` for keywords

**Do NOT use Write or Edit on `.clear/` files.** All mutations go through CLIs, which use `fs.writeFileSync` (invisible to the PreToolUse guard).

## Knowledge Types

| Type | ID Prefix | `--type` flag value |
|------|-----------|---------------------|
| Technical Decision | TD-XXX | `technical-decision` |
| Business Rule | BR-XXX | `business-rule` |
| Architectural Pattern | PAT-XXX | `architectural-pattern` |
| Lesson Learned | LES-XXX | `lesson-learned` |

All entries are stored in `.clear/knowledge/entries/` (flat directory, no subdirectories).

The SQLite search index is at `.clear/knowledge/index.db`.

## Unified Entry Point: `/cf-knowledge`

The `/cf-knowledge` command routes to all knowledge subcommands via `router.ts`:

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/router.js" \
  <subcommand> [args] --clear-dir=.clear
```

**Available subcommands:**

| Subcommand | Purpose | Example |
|------------|---------|---------|
| `status` | Knowledge base overview (default) | `/cf-knowledge status` |
| `show` | Display entry details | `/cf-knowledge show TD-001` |
| `link` | Link entry to workpackage | `/cf-knowledge link TD-001 --to=P3.2` |
| `unlink` | Unlink entry from workpackage | `/cf-knowledge unlink TD-001` |
| `deprecate` | Deprecate an entry | `/cf-knowledge deprecate TD-001 --reason="..."` |
| `supersede` | Replace one entry with another | `/cf-knowledge supersede TD-001 TD-005` |
| `update` | Update entry metadata | `/cf-knowledge update TD-001 --tags=...` |
| `delete` | Delete an entry | `/cf-knowledge delete LES-003 --reason="..." --force` |

**Direct ID shorthand:** `/cf-knowledge TD-001` is equivalent to `/cf-knowledge show TD-001`.

## CLI Reference

All CLIs are at `$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/`. Always run with `--help` first if unsure about flags.

### capture-cli — Create and Update Knowledge Entries

```bash
# Create a new entry
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=.clear \
  --create \
  --title="<Decision Title>" \
  --type=technical-decision \
  --tags="tag1,tag2,tag3" \
  --description="<Brief description>" \
  --session=<session-number>

# Update an existing entry
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=.clear \
  --update \
  --id=<entry-id> \
  --tags="new-tag1,new-tag2" \
  --description="Updated description" \
  --add-related-file="src/auth/middleware.ts" \
  --session=<session-number>
```

**Create modes:** `--detect` (scan text for capture triggers), `--confirm` (process user confirmation), `--create` (direct creation), `--check-state` (check pending capture).

**Update flags:** `--id=<id>` (required), `--tags=<comma-separated>`, `--description=<text>`, `--add-related-file=<path>` (repeatable), `--session=<number>`.

Additional flags: `--supersedes=<id>` (mark an entry as superseding another).

Output is JSON. Parse to confirm success and extract the entry ID and file path.

### delete-cli — Delete a Knowledge Entry

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/delete-cli.js" \
  <entry-id> --reason="<reason>" --clear-dir=.clear
```

**Flags:**
- `--reason=<text>` — Reason for deletion (required)
- `--force` — Skip confirmation for active entries
- `--clear-dir=<path>` — Path to .clear directory (required)

Shows impact analysis (linked WPs, supersession chains, related entries) before deletion. Without `--force`, active entries require explicit confirmation.

### search-cli — Search Knowledge Base

```bash
# Search by query
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/search-cli.js" \
  --clear-dir=.clear \
  --query="authentication approach"

# Detect search intent in user text
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/search-cli.js" \
  --clear-dir=.clear \
  --detect-only --text="what did we decide about caching"
```

Uses 3-pass search: P1 (tag exact match), P2 (title keyword), P3 (TF-IDF cosine similarity). Flags: `--max-results=<n>`, `--include-superseded`.

### show-cli — Display Entry Details

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/show-cli.js" \
  --clear-dir=.clear --id=TD-001
```

### load-cli — Load Knowledge at Session Start

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/load-cli.js" \
  --clear-dir=.clear \
  --level=balanced \
  --context="auth,security" \
  --workpackage=P3.2
```

Levels: `minimal`, `balanced`, `comprehensive`. Ranks entries by relevance score (active status, tag matches, recency, type).

### index-cli — Rebuild Knowledge Index

```bash
# Full rebuild
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/index-cli.js" \
  --clear-dir=.clear --mode=full --force

# Incremental update
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/index-cli.js" \
  --clear-dir=.clear --mode=incremental
```

Rebuilds the SQLite search index (`.clear/knowledge/index.db`). The index is automatically rebuilt inline after every `--create` and `--update` operation. Manual rebuild is only needed after direct file edits or if search results seem stale.

### link-cli — Link Entry to Workpackage

```bash
# Link
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/link-cli.js" \
  link TD-001 --to=P3.2 --clear-dir=.clear

# Unlink
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/link-cli.js" \
  unlink TD-001 --clear-dir=.clear
```

### deprecate-cli — Deprecate an Entry

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/deprecate-cli.js" \
  TD-001 --reason="Superseded by new approach" --clear-dir=.clear
```

Shows impact analysis (linked WPs, supersession chains) before proceeding. Use `--force` to skip confirmation.

### supersede-cli — Replace One Entry with Another

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/supersede-cli.js" \
  TD-001 TD-005 --clear-dir=.clear
```

Marks old entry as superseded, links both entries. Use `--force` to skip chain depth validation.

### status-cli — Knowledge Base Overview

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/status-cli.js" \
  --clear-dir=.clear
```

Shows entry counts by status/type, recent activity, index health, and supersession chains.

### file-index-cli — File-to-Knowledge Index

```bash
# Rebuild reverse index
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/file-index-cli.js" \
  --rebuild --clear-dir=.clear

# Look up entries linked to a file
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/file-index-cli.js" \
  --lookup=src/auth/middleware.js --clear-dir=.clear

# Update index for a specific entry
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/file-index-cli.js" \
  --update=TD-001 --clear-dir=.clear
```

## Automatic Knowledge Hooks

These run without user action:

| Hook Event | Script | What It Does |
|------------|--------|--------------|
| SessionStart | `knowledge-load.sh` | Loads top N entries by relevance via `load-cli`. Also drains pending index updates via `knowledge-drain.sh` |
| UserPromptSubmit | `knowledge-search.sh` | Pattern-matches prompts for search intent, runs `search-cli` |
| UserPromptSubmit | `knowledge-capture.sh` | Detects decision/pattern/lesson phrases, starts multi-turn capture |
| PreToolUse | `pre-tool.sh` | Looks up edited file in `file-knowledge-index.json`, surfaces linked entries |
| PostToolUse | `post-tool.sh` | After Write/Edit, surfaces linked entries for review |
| PreCompact | `session-precompact.sh` | Drains pending index updates via `knowledge-drain.sh` before context compaction |
| Stop | `session-stop.sh` | 3-tier knowledge assessment: Level A (deterministic path match), Level B (`change-pattern-cli` evaluation), Level C (LLM prompt). Prompts capture when modified files are knowledge-relevant |

**Internal helpers** (not user-facing):
- `knowledge-drain.sh` — Shared function that drains pending index updates (marker-file fallback recovery). Called by `knowledge-load.sh` at session start and `session-precompact.sh` at PreCompact.
- `change-pattern-cli` — Evaluates changed files against knowledge patterns for Level B assessment in the Stop hook.

## Token Efficiency

**Budget Allocation:**
- Per entry summary (hooks): ~0.5% of context
- Per full entry (show-cli): ~2-5%
- Target total: <10% for knowledge
