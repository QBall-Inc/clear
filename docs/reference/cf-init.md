# `/cf-init` — initialize CLEAR in a project

`/cf-init` sets up CLEAR in your current project. It is the one-time bootstrap, and
also how you refresh configuration or reset CLEAR later.

For the guided first-run walkthrough, see [Getting started](../guides/getting-started.md).

## What it does

On a first run, `/cf-init`:

- creates the `.clear/` directory structure (`knowledge/`, `plans/`,
  `workpackages/`, `sessions/`, `state/`, `config/`);
- generates a project manifest describing the project to CLEAR;
- initializes your first session;
- wires up the plugin's lifecycle hooks and the status line.

When it finishes, the project has everything CLEAR needs to start building knowledge
as you work. Commit the `.clear/` directory — it is your project's persistent memory.

## Usage

```
/cf-init [--reinit-clean | --refresh-config | --force]
```

| Option | Effect |
|--------|--------|
| *(none)* | First-time setup. Provisions `.clear/`, the manifest, the first session, hooks, and the status line. |
| `--refresh-config` | **Non-destructive.** Refreshes the generated meta files (project instruction files) from the latest CLEAR templates, leaving your knowledge and state untouched. |
| `--reinit-clean` | **Destructive.** Reinitializes CLEAR from scratch. Use only when you want to discard existing CLEAR state and start over. |
| `--force` | Proceed past guards that would otherwise stop initialization. |

When you are unsure which mode you want, run `/cf-init --help` first; `--reinit-clean`
is destructive and should be a deliberate choice.

## After installing

`/cf-init` is typically the first thing you run after installing the plugin and
restarting your session. If you have just restarted and the status line is not
showing, [`/cf-debug install`](./cf-debug.md) confirms the Claude Code wiring.

## Related

- [Getting started](../guides/getting-started.md) — the full first-project walkthrough.
- [Architecture](../architecture.md) — what `.clear/` contains and why.
- [`/cf-debug`](./cf-debug.md) — diagnose and repair CLEAR state.
