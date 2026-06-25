# `/cf-knowledge` — manage the knowledge base

`/cf-knowledge` is the command surface for CLEAR's knowledge base: search, view,
capture, index, link, deprecate, and supersede knowledge concepts. Much of the
capture happens automatically as you work; this command is for deliberate capture and
lookup, and for managing the lifecycle of entries.

For the concepts behind it (the seven types, the lifecycle, the consumption pattern),
read [The knowledge system](../guides/knowledge-system.md) and the formal
[`CKS.md`](../../CKS.md).

## Usage

```
/cf-knowledge [subcommand|help] [id] [options]
```

## Operations

| Operation | What it does |
|-----------|--------------|
| **search** | Full-text search across the knowledge base. |
| **show** | View a single entry by its ID (e.g. `TD-001`). |
| **capture** | Create a new entry, or confirm a capture CLEAR has detected. |
| **update** | Edit an entry's tags, description, or bound files — or change its type. |
| **index** | Rebuild or refresh the search index from the knowledge files. |
| **link** | Link an entry to the work it relates to. |
| **deprecate** | Mark an entry deprecated (no longer true or recommended). |
| **supersede** | Replace an older entry with a newer one, recording the link both ways. |
| **status** | Summary of the knowledge base: counts, anomalies, pending captures. |

Run `/cf-knowledge help` for the full subcommand list, and `<command> --help` on any
underlying CLI for its exact flags.

## Common flags

Most operations accept `--clear-dir=<path>` (defaults to `.clear`). Beyond that:

**Search**

| Flag | Meaning |
|------|---------|
| `--query=<text>` | The search text. |
| `--max-results=<n>` | Cap the number of results (default 10). |
| `--include-superseded` | Include superseded entries in results. |

**Capture (create mode)**

| Flag | Meaning |
|------|---------|
| `--type=<type>` | One of `technical-decision`, `business-rule`, `architectural-pattern`, `lesson-learned`, `institutional-wiki`, `stakeholder`, `process`. |
| `--title=<string>` | The entry title. |
| `--description=<string>` | The one-line description. |
| `--tags=<a,b,c>` | Comma-separated tags. |
| `--slug=<kebab-case>` | An explicit handle for `[[slug]]` cross-references (auto-derived from the title if omitted). |
| `--supersedes=<id>` | The entry this one replaces. |

Some types carry their own fields. For example, `stakeholder` takes `--entity-type`,
`--role`, `--owns`, and `--contact`; `process` takes `--trigger-event`,
`--frequency`, `--tools`, and `--automation-hook`; `institutional-wiki` takes
`--source` and `--source-updated`. See `--help` on the capture CLI for the complete,
per-type list.

## Examples

```
# Search for concurrency decisions
/cf-knowledge search --query="optimistic locking"

# View an entry
/cf-knowledge show TD-001

# Capture a technical decision
/cf-knowledge capture --type=technical-decision \
  --title="Use optimistic locking for the order table" \
  --description="Orders use a version column for optimistic concurrency control." \
  --tags="persistence,concurrency"
```

## Related

- [The knowledge system](../guides/knowledge-system.md) — types, lifecycle, freshness.
- [`CKS.md`](../../CKS.md) — the formal knowledge spec.
- [Architecture](../architecture.md) — how knowledge is indexed and served.
