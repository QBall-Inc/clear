# Full Mode -- Expanded Command Reference

Display the full command reference listing. Output verbatim inside a code block:

```
CLEAR Framework - Full Command Reference
=========================================

CORE COMMANDS
-------------

/cf-init - Initialize CLEAR framework in the current project
  No subcommands

/cf-reload - Reload CLEAR context into current session
  No subcommands

/cf-status - Show CLEAR session status and context health
  No subcommands

CONTEXT COMMANDS
----------------

/cf-knowledge - Manage knowledge entries and relationships
  Subcommands: default, search, show, load, index, capture, deprecate, link, unlink, supersede

/cf-workpackage - Manage workpackage lifecycle and progress
  Subcommands: default, list, show, start, pause, progress, validate, complete, delete

/cf-plan - View plan status, progress, blockers, and next steps
  Subcommands: default, next, blockers, progress, create, addPhase, validate

UTILITY COMMANDS
----------------

/cf-handoff - Generate session handoff document
  No subcommands

/cf-debug - Diagnose and repair CLEAR state issues
  Subcommands: default, repair, check-ids

/cf-help - CLEAR Framework help and guidance
  Modes: default, <command>, <command> <subcommand>, --full, --interactive

---
Use /cf-help <command> for detailed help on any command.
```

## Notes

- This output is static. No file reads are needed.
- If subcommand lists change in the future, update this reference file.
