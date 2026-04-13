# Subcommand: help

Display all available subcommands for `/cf-knowledge`.

---

## Output

```
/cf-knowledge — Knowledge Base Commands

  /cf-knowledge                            Overview and statistics (default)
  /cf-knowledge search <term>              Search by term, tag, or ID
  /cf-knowledge search <term> --type <t>   Search filtered by type (td, pat, br, les)
  /cf-knowledge show <id>                  Show entry details (e.g., TD-048)
  /cf-knowledge load [--level <lvl>]       Load entries into context (minimal|balanced|comprehensive)
  /cf-knowledge load --workpackage <id>    Load entries linked to a workpackage
  /cf-knowledge index [--full]             Rebuild knowledge index
  /cf-knowledge capture                    Start knowledge capture workflow
  /cf-knowledge deprecate <id> [--reason <text>]
                                           Deprecate an entry (no replacement)
  /cf-knowledge link <id> --to <wp>        Link entry to workpackage
  /cf-knowledge unlink <id>                Remove workpackage link
  /cf-knowledge supersede <old> <new>      Replace one entry with another
  /cf-knowledge help                       Show this help
```
