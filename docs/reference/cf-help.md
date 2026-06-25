# `/cf-help` — command help and guidance

`/cf-help` is the in-session reference for CLEAR. Run it for an overview of the
commands, the syntax of a specific one, or a guided walkthrough of a feature.

## Usage

```
/cf-help [command] [subcommand] [--interactive | -i | --full]
```

| Form | What you get |
|------|--------------|
| `/cf-help` | An overview of the CLEAR commands. |
| `/cf-help <command>` | Help for one command (e.g. `/cf-help plan`). |
| `/cf-help <command> <subcommand>` | Help for a specific operation. |
| `--full` | The complete reference rather than the summary. |
| `--interactive`, `-i` | A guided, step-by-step walkthrough. |

## The command surface

| Command | Purpose | Reference |
|---------|---------|-----------|
| `/cf-init` | Set up CLEAR in a project. | [cf-init](./cf-init.md) |
| `/cf-plan` | Create or import a plan. | [cf-plan](./cf-plan.md) |
| `/cf-workpackage` | Define and track units of work. | [cf-workpackage](./cf-workpackage.md) |
| `/cf-knowledge` | Capture and manage knowledge. | [cf-knowledge](./cf-knowledge.md) |
| `/cf-status` | Show the current project state. | [cf-status](./cf-status.md) |
| `/cf-handoff` | Write a session handoff. | [cf-handoff](./cf-handoff.md) |
| `/cf-reload` | Reload CLEAR state in-session. | [cf-reload](./cf-reload.md) |
| `/cf-debug` | Diagnose and repair state. | [cf-debug](./cf-debug.md) |
| `/cf-help` | This command. | — |

Beyond `/cf-help`, every underlying CLI responds to `--help` for its exact flags.

## Related

- [Getting started](../guides/getting-started.md) — install and your first loop.
- [How CLEAR works](../guides/how-it-works.md) — the workflow the commands serve.
