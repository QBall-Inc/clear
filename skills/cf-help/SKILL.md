---
name: cf-help
version: 1.0.0
author: Ashay Kubal @ Qball Inc.
description: Provides help and guidance for CLEAR Framework commands. Use when the user needs a reference, command syntax, or a guided walkthrough of CLEAR features.
user-invocable: true
argument-hint: [command] [subcommand] [--interactive|-i|--full]
allowed-tools:
  - Read
  - Glob
skills:
  - cf-help-guide
---

# CLEAR Help

Provides help and guidance for the CLEAR Framework. Routes to the appropriate reference based on arguments.

---

## When to Use This Skill

| Trigger Pattern | Example User Request |
|-----------------|---------------------|
| General help request | "How do I use CLEAR?" |
| Command-specific help | "/cf-help knowledge" |
| Subcommand detail | "/cf-help knowledge search" |
| Full reference listing | "/cf-help --full" |
| Guided walkthrough | "/cf-help --interactive" |

**DO NOT use for:** executing commands directly, or debugging CLEAR state (use `/cf-debug`).

---

## Dependencies

| Category | Files | When to Load |
|----------|-------|--------------|
| **Default** | `references/default-mode.md` | No arguments provided |
| **Command** | `references/command-mode.md` | Command name provided |
| **Subcommand** | `references/subcommand-mode.md` | Command + subcommand provided |
| **Full** | `references/full-mode.md` | `--full` flag provided |

---

## Routing

Parse `$ARGUMENTS` and route to exactly one mode. Load only the matching reference file.

1. **Interactive** -- args contain `--interactive`, `-i`, or `guide`:
   Load and invoke `skills/cf-help-guide/SKILL.md`. Stop here.

2. **Full** -- args contain `--full`:
   Load `references/full-mode.md`. Follow its instructions.

3. **Subcommand** -- two positional args (e.g., `knowledge search`):
   Load `references/subcommand-mode.md`. Pass command and subcommand.

4. **Command** -- one positional arg (e.g., `knowledge`):
   Load `references/command-mode.md`. Pass command name.

5. **Default** -- no args or unrecognized:
   Load `references/default-mode.md`. Display quick reference.

Error handling is defined within each reference file.

---

## Completion Checklist

- [ ] Correct mode identified from arguments
- [ ] Appropriate reference file loaded
- [ ] Output displayed to user
