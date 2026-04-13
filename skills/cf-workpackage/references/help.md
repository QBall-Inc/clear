# Subcommand: help

Display all available subcommands for `/cf-workpackage`.

---

## Output

```
/cf-workpackage — Workpackage Lifecycle Commands

  /cf-workpackage                          Active workpackage status (default)
  /cf-workpackage list [--all]             List all workpackages
  /cf-workpackage list --phase <id>        List filtered by phase
  /cf-workpackage list --status <status>   List filtered by status
  /cf-workpackage show <id>                Show detailed workpackage info
  /cf-workpackage create <phase-id> [<title>] [--type <t>] [--priority <p>]
                                           Create new workpackage in a phase
  /cf-workpackage start <id> [--force]     Activate a workpackage
  /cf-workpackage pause                    Pause current workpackage
  /cf-workpackage progress                 View current progress
  /cf-workpackage progress --set <N>       Set progress to N percent
  /cf-workpackage validate                 Check completion readiness
  /cf-workpackage complete [--force]       Complete current workpackage
  /cf-workpackage delete <id> [--confirm]  Archive a workpackage
  /cf-workpackage help                     Show this help
```
