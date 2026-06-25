# Contributing to CLEAR

Thanks for your interest in CLEAR. Contributions are welcome on three fronts: the
**design** itself, **harness ports**, and the **docs**. This guide explains how the
project is organized and how contributions flow.

## How this repository works

This public repository is the **published plugin surface** — the user-facing
components of CLEAR — and it is a **mirror of a private development repository**, not
the full development history.

The two are kept from diverging by a simple rule: anything that happens here is pulled
into the private repo, worked there, and synced back to public.

```
issue or PR opened here  ──▶  pulled into the private dev repo
                                        │
                                   worked + reviewed
                                        │
public repo  ◀──────────────────  synced back
```

So an issue you file or a PR you open is real and will be acted on. The substantive work
just happens in the private repo and lands back here on the next sync. You do not need to
know anything about the private repo to contribute; work against this one.

## Ways to contribute

### Report a bug or request a feature

[Open an issue](https://github.com/QBall-Inc/clear/issues). For a bug, include what
you did, what you expected, and what happened — and, where you can, the output of
[`/cf-debug`](docs/reference/cf-debug.md), which reports on CLEAR's state. For a
feature, describe the problem you are trying to solve, not just the solution you have
in mind.

### Improve the docs

The documentation lives under [`docs/`](docs/). Corrections, clarifications, and new
examples are all welcome. If something in the [guides](docs/guides/) tripped you up,
that is a signal worth an issue or a PR.

### Port CLEAR to another harness

This is the contribution we most want help with. CLEAR's core is **harness-agnostic by
design**: the engine, the [CKS knowledge format](CKS.md), the state model, and the
domain CLIs are portable, and Claude Code is the *first* adapter, not the only possible
one. A port reimplements only the adapter — binding another harness's lifecycle events
to the same core CLIs.

If you want to build an adapter for Codex, Cursor, Aider, Gemini CLI, or another coding
harness, start by reading [the architecture](docs/architecture.md), especially the
[portable core vs adapter](docs/architecture.md#portable-core-vs-adapter) boundary, and
then [open an issue](https://github.com/QBall-Inc/clear/issues) to discuss the design.
A clean, documented extraction of the core is itself on the roadmap, and an early adapter
attempt will help shape that boundary.

### Become a contributor

If you would like to take on a larger piece of work or come on as an ongoing
contributor, say so in an issue. We are happy to talk.

## Roadmap and backlog

The project backlog is being migrated to **[GitHub Issues](https://github.com/QBall-Inc/clear/issues)**
as the single public roadmap and contribution surface. Issues are where direction is
discussed; pull requests are how changes land. If you are looking for somewhere to
start, the issue tracker is the place.

## Pull requests

- Keep a PR focused on one change.
- Describe the problem it solves and how you verified the fix.
- For anything user-facing, update the relevant doc in the same PR.
- By submitting a contribution, you agree it is licensed under the project's license
  (below).

## License

CLEAR is licensed under the [Apache License 2.0](LICENSE). Contributions are accepted
under the same license, including its patent grant.

---

New to CLEAR? Start with [Getting started](docs/guides/getting-started.md) and
[How CLEAR works](docs/guides/how-it-works.md).
