# Default Mode -- Quick Reference

Display this quick reference overview to the user. Output it verbatim inside a code block:

```
CLEAR Framework Help
====================

CLEAR provides persistent memory and context management for Claude Code.

Commands (use /help for discovery):
  Core:      /cf-init, /cf-reload, /cf-status
  Context:   /cf-knowledge (10), /cf-workpackage (9), /cf-plan (7)
  Utility:   /cf-handoff, /cf-debug, /cf-help

Quick Start:
  1. /cf-init          Initialize CLEAR in project
  2. /cf-status        Verify setup
  3. /cf-knowledge     Manage persistent knowledge

Details: /cf-help <command>      (e.g., /cf-help knowledge)
Full:    /cf-help --full         (all commands expanded)
Guided:  /cf-help --interactive  (conversational guide)
```

## Notes

- The parenthetical numbers after Context commands indicate subcommand count.
- No file reads are needed for this mode -- output is static.
