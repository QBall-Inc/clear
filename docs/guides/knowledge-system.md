# The knowledge system

CLEAR's knowledge is **CKS — the CLEAR Knowledge Spec**: a standalone, markdown-native
knowledge specification with opinionated typed primitives, a lifecycle, and a defined
consumption pattern. This guide is the in-depth tour. For the formal specification,
see [`CKS.md`](../../CKS.md); for how the knowledge system fits the development loop,
see [How CLEAR works](./how-it-works.md).

---

## A concept is a file

Every piece of knowledge is one markdown file with a structured frontmatter block:

```markdown
---
id: TD-001
title: Use optimistic locking for the order table
type: technical-decision
status: active
tags: [persistence, concurrency]
related_files:
  - src/orders/repository.ts
description: Orders use a version column for optimistic concurrency control.
---

# Use optimistic locking for the order table

## Context
...
## Decision
...
```

The frontmatter is the machine-read contract; the body is human detail. Because each
concept is a plain file, the whole knowledge base is diffable, reviewable, and
version-controlled alongside the code it describes. There is no database server to
run. An index exists, but only as a derived cache over the files.

---

## The seven knowledge types

CKS defines a fixed set of seven first-class types. The type is not just a tag; it
carries meaning and, for several types, its own structured fields.

| Type | Prefix | Captures |
|------|--------|----------|
| Technical decision | `TD` | A decision made and why; the alternatives weighed. |
| Business rule | `BR` | A domain rule the software must honor. |
| Architectural pattern | `PAT` | A reusable structural pattern in the codebase. |
| Lesson learned | `LES` | A pitfall discovered the hard way, and how to avoid it. |
| Institutional wiki | `IW` | Reference knowledge sourced from a canonical document. |
| Stakeholder | `SH` | A person, team, role, vendor, or system, and what it owns. |
| Process | `PROC` | A recurring procedure: its trigger, frequency, and steps. |

The set is closed and opinionated **on purpose.** A format that leaves the taxonomy
entirely to the author is more flexible but says less; CKS takes the opposite stance,
because a known set of types is what lets the system treat a decision differently
from a process or a stakeholder.

Code is the *first* domain, not the only one. The model is built to grow first-class
primitives beyond code — people, places, organizations, business entities, events.
Those are reserved for a future revision (see [Shipped vs roadmap](#shipped-vs-roadmap)).

---

## The lifecycle

This is the dimension that keeps the graph fresh, and it is what most "knowledge as
markdown" conventions leave out. Every concept has a **status**:

| Status | Meaning |
|--------|---------|
| `pending` | Captured but not yet confirmed; provisional. |
| `active` | Confirmed and in force; eligible to be surfaced. |
| `superseded` | Replaced by a newer concept. |
| `deprecated` | No longer true or recommended; kept for history. |
| `archived` | Removed from active surfacing; terminal. |

Two ways a concept leaves active force:

- **Supersession** — a newer concept *replaces* an older one. The link is recorded on
  both sides and is navigable, so you can always trace what replaced what.
- **Deprecation** — a concept stops being true with no direct replacement.

Both are **surfaced**: when a superseded or deprecated concept would be served
(because its bound code is in play), CLEAR presents it *as* superseded or deprecated,
so an agent is never silently handed stale guidance. **Pruning** is the act of moving
stale concepts out of the active, surfaced set while keeping them on disk for
provenance.

The provisional `pending` status exists so that machine-captured knowledge can be
admitted without polluting the active set — it is promoted, or dropped, on review.

---

## Binding and linking

- **Code binding.** A concept's `related_files` list ties it to the code it concerns.
  This is what makes the knowledge base a graph: touch a bound file, and its concepts
  surface.
- **Cross-links.** Concepts reference each other with `[[slug]]` links. References
  resolve at display time, so a link written before its target exists is a valid
  forward reference, not an error.
- **Provenance.** Each concept records when and in what session it was created; the
  schema version it conforms to travels with it.

---

## The consumption pattern

CKS specifies both how knowledge is *written* and how it is *served*. A CLEAR
session surfaces the relevant active concepts when their bound resource enters play,
so the right context arrives without a manual search, and it respects the lifecycle,
presenting superseded and deprecated concepts as such. Serving knowledge this way is
what makes CKS a knowledge *system*, not only a *format*.

---

## How CKS relates to OKF

In **June 2026**, Google open-sourced the **Open Knowledge Format (OKF)** — a v0.1
*draft* for markdown-native, typed, resource-bound knowledge. CKS has been shipping a
working superset of that model — with full lifecycle management, for coding agents —
since 2025.

This is **convergent validation**, not a priority claim. Two facts matter:

- **OKF disclaims novelty itself.** Its own text positions OKF as close to existing
  approaches (LLM wiki repositories, note tools, "metadata as code"), differing
  "primarily in being specified." Nobody is claiming to have invented knowledge as
  markdown — the claim is about writing it down.
- **CLEAR was already running what OKF specifies.** Typed, resource-bound,
  cross-linked, *lifecycle-managed* concepts, through eight schema revisions, for the
  hard domain of coding agents.

So CKS stands on its own, and OKF's draft is independent confirmation that the model
is right. CLEAR selectively adopts OKF's best ideas — its single canonical
resource-binding convention and its citation model — to harden CKS, without folding
CKS into it or exporting to it.

### The comparison

Three layers. OKF specifies a **format**. CKS specifies a **format with a lifecycle**.
CLEAR is the **engine** that lives it.

**Layer 1 — concept format (shared; this is the convergence)**

| Dimension | OKF v0.1 (2026-06 draft) | CKS / CLEAR |
|---|---|---|
| Typed concepts | `type` (required, producer-defined) | `type` (required) — parity |
| Type taxonomy | deliberately unopinionated | opinionated first-class primitives; growing beyond code |
| One-line description | `description` | `description` — parity |
| Tags | optional | `tags` — parity |
| Resource binding | one canonical URI | `related_files` list (may adopt OKF's single-URI convention) |
| Cross-links | markdown links | `[[slug]]` links + lifecycle edges |
| Citations | citations section | `source` / `source_updated` (partial today) |
| Version declaration | `okf_version` | `schema_version` |

**Layer 2 — lifecycle & maintenance (CKS only; outside OKF's scope)**

| Dimension | OKF v0.1 | CKS / CLEAR |
|---|---|---|
| Status (pending / active / deprecated / …) | out of scope | shipped |
| Supersession (both directions, navigable) | — | shipped |
| Deprecation surfacing | — | shipped |
| Pruning / freshness as code evolves | — | shipped |
| Structured per-entry provenance | optional human-written log | shipped |
| Per-entry schema migration | format-level only | shipped |
| Surfacing observability | — | shipped |

**Layer 3 — the system around the spec (CLEAR; beyond any format)**

| Dimension | A format (OKF) | CLEAR |
|---|---|---|
| Capture during development | n/a | shipped |
| Structured workflow drives capture | n/a | shipped |
| Context serving (right context, right time) | n/a | shipped |
| Knowledge ↔ project-state sync | n/a | shipped |
| Index / search | n/a | SQLite full-text |
| Harness integration | n/a | Claude Code adapter; portable core |

**The read:** OKF and CKS *agree* on the format (Layer 1) — that is the convergence
proof. CKS *extends* it with a lifecycle (Layer 2). CLEAR *operationalizes* it
(Layer 3).

---

## Shipped vs roadmap

Everything described above as shipped is provable in v1.0. Some directions are
deliberately not yet here:

**Shipped in v1.0:** the seven types; descriptions, tags, code binding, `[[slug]]`
cross-links; the full lifecycle (status, supersession, deprecation surfacing,
pruning, provenance); schema versioning with forward migration; surfacing
observability; SQLite full-text search; knowledge ↔ state sync; session continuity.

**Roadmap (direction, not commitments):**

- **Knowledge beyond code** — new first-class primitives for people, places,
  organizations, business entities, and events.
- **Selective OKF adoption** — the single canonical resource-binding convention and a
  fuller citation model.
- **Verification method / confidence** — recording *how* a concept was verified and
  with what confidence.
- **Knowledge enrichment** — automatic extraction from handoffs and completed work.

---

## Where to go next

- [`CKS.md`](../../CKS.md) — the formal specification.
- [How CLEAR works](./how-it-works.md) — the loop that produces and prunes the graph.
- [Getting started](./getting-started.md) — install and your first loop.
