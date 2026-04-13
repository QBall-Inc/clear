# Subcommand: help

Display all available subcommands for `/cf-plan`.

---

## Output

```
/cf-plan — Plan Management Commands

  /cf-plan                              Plan overview (default)
  /cf-plan status                       Detailed plan status with multi-signal progress
  /cf-plan progress                     Progress breakdown by phase
  /cf-plan blockers                     Check for blocking issues
  /cf-plan next                         Suggest next workpackage to work on
  /cf-plan phases                       List all phases in the plan
  /cf-plan create [<name>]              Create a new master plan
  /cf-plan create --force               Overwrite existing plan
  /cf-plan addPhase [<name>]            Add phase at end of plan
  /cf-plan addPhase <name> --after <id> Insert phase after a specific phase
  /cf-plan help                         Show this help
```
