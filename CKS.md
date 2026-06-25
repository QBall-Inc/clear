# CKS — The CLEAR Knowledge Spec

**Version 1.0** · Status: Stable · Format: markdown-native, filesystem-based

CKS is a standalone specification for **typed, code-bound, lifecycle-managed
knowledge** stored as plain markdown files. It defines three things a plain notes
convention does not:

1. **Opinionated primitives** — a fixed set of first-class knowledge *types*,
   each with its own structure and fields.
2. **A lifecycle** — every concept has a status and can be superseded, deprecated,
   and pruned as the domain it describes changes.
3. **A consumption pattern** — knowledge is not just *written*; the spec defines how
   it is *bound* to a resource and *served* against that resource when relevant.

Code is CKS's first domain, not its only one. The model is built to grow
first-class primitives beyond code (people, places, organizations, business
entities, events); those are **reserved** in this version (see
[§12 Reserved & roadmap](#12-reserved--roadmap)).

CKS is implemented by [CLEAR](https://github.com/QBall-Inc/clear). This document
specifies the format CLEAR produces and maintains; it is independent of any one
implementation.

---

## 1. Design principles

- **Markdown-native.** A concept is one markdown file with a YAML frontmatter
  block. Files are diffable, reviewable, and version-control friendly. No database
  server, no proprietary store — the files *are* the source of truth; an index is
  a derived cache.
- **Typed, not freeform.** Every concept declares a `type` from a closed set.
  Types carry meaning and structure; they are not just tags.
- **Bound to a resource.** A concept records the code (or, in future, the entity)
  it concerns, so it can be surfaced against that resource rather than searched for
  blind.
- **Lifecycle over accretion.** Knowledge is not append-only. A concept can be
  superseded by a newer one, deprecated when it stops being true, and pruned from
  active surfacing — so the graph stays fresh instead of accumulating stale advice.
- **Provenance carried in-file.** When a concept was created, in what context, and
  what it derives from travel with the concept.

---

## 2. Concept file

A CKS concept is a single UTF-8 markdown file:

```markdown
---
id: TD-001
title: Use optimistic locking for the order table
type: technical-decision
status: active
tags: [persistence, concurrency]
created: 2026-01-12
created_session: 14
description: Orders use a version column for optimistic concurrency control.
related_files:
  - src/orders/repository.ts
  - src/orders/schema.sql
alternatives_considered:
  - Pessimistic row locks
  - Serializable isolation
schema_version: 8
---

# Use optimistic locking for the order table

Orders use a version column for optimistic concurrency control...

## Context

...

## Decision

...
```

The frontmatter is the structured, machine-read contract. The body is
human-prose detail. Implementations MUST treat the frontmatter as authoritative for
structured fields and MUST NOT require the body to be parseable for the concept to
be valid.

### 2.1 Filename and identity

- A concept's **`id`** is `<PREFIX>-<NNN>`: a type prefix and a zero-padded
  three-digit sequence, e.g. `TD-001`, `PAT-014`, `PROC-003`.
- The canonical filename is `<id>.md` — e.g. `TD-001.md`.
- Prefixes are fixed per type ([§3](#3-knowledge-types-primitives)); the `id`
  prefix MUST match the concept's `type`.

---

## 3. Knowledge types (primitives)

CKS v1.0 defines **seven** first-class types. Each has a stable prefix.

| Type | Prefix | Captures |
|------|--------|----------|
| `technical-decision` | `TD` | A decision made and why; the alternatives weighed. |
| `business-rule` | `BR` | A domain rule the software must honor. |
| `architectural-pattern` | `PAT` | A reusable structural pattern in the codebase. |
| `lesson-learned` | `LES` | Something discovered the hard way; a pitfall and its avoidance. |
| `institutional-wiki` | `IW` | Reference knowledge sourced from an external or canonical document. |
| `stakeholder` | `SH` | A person, team, role, vendor, or system, and what it owns. |
| `process` | `PROC` | A recurring procedure: what triggers it, how often, and the steps. |

The type set is **closed** in v1.0: an implementation MUST reject a concept whose
`type` is not one of the seven. (Extension types are reserved — see
[§12](#12-reserved--roadmap).)

---

## 4. Frontmatter schema

Fields below are grouped by role. Unless marked **required**, a field is optional;
an implementation MAY omit a field it has no value for.

### 4.1 Core (all types)

| Field | Type | Required | Meaning |
|-------|------|:--------:|---------|
| `id` | string | ✅ | `<PREFIX>-<NNN>` identity; matches the type prefix. |
| `title` | string | ✅ | Short human-readable title. |
| `type` | enum | ✅ | One of the seven types in [§3](#3-knowledge-types-primitives). |
| `status` | enum | — | Lifecycle status ([§5](#5-status-lifecycle)). Defaults to `active`. |
| `description` | string | — | One-line summary used for surfacing and search. |
| `tags` | string[] | — | Free-form classification labels. |
| `related_files` | string[] | — | The code this concept is bound to ([§7](#7-resource-binding)). |
| `created` | date | — | ISO date the concept was created. |
| `created_session` | number | — | The session in which it was created (provenance). |
| `modified` | date | — | ISO date of the last structural change. |
| `schema_version` | number | — | The CKS schema revision the file conforms to ([§9](#9-schema-versioning)). |

The minimum a parser needs to admit a concept is `id`, `title`, and `type`.
Everything else is recoverable or defaultable.

### 4.2 Lifecycle

| Field | Type | Meaning |
|-------|------|---------|
| `supersedes` | string \| null | The `id` this concept replaces ([§6](#6-supersession--deprecation)). |
| `superseded_by` | string \| null | The `id` that replaced this concept. |
| `supersession_reviewed` | boolean | True once a human has acknowledged this concept's deprecation surface. |
| `surfaced_count` | number | How many times the concept has been served (a freshness/usefulness signal). |

An implementation MAY additionally track derived lifecycle timestamps
(`deprecated_at`, `superseded_at`, `archived_at`), a deprecation classification
(`obsolete` vs `superseded`), and a deprecation reason in its index. These are
derived state; the in-file `status` plus `supersedes`/`superseded_by` are the
portable record.

### 4.3 Linking

| Field | Type | Meaning |
|-------|------|---------|
| `slug` | string \| null | A stable human-readable handle for `[[slug]]` cross-references ([§8](#8-cross-linking)). |
| `linked_workpackages` | string[] \| string \| null | Units of work this concept is associated with. |
| `alternatives_considered` | string[] | Options weighed (primarily `technical-decision`). |

### 4.4 Provenance & citation

| Field | Type | Meaning |
|-------|------|---------|
| `source` | string \| null | The external/canonical document a concept derives from. |
| `source_updated` | date \| null | When that source was last known-current. |

`source` / `source_updated` are the citation surface (used most by
`institutional-wiki`). Provenance of *authorship* — when and in what session a
concept was created — lives in `created` / `created_session`.

### 4.5 Type-specific fields

These fields are populated only on concepts of the matching type and are null
otherwise.

**`stakeholder` (SH):**

| Field | Type | Meaning |
|-------|------|---------|
| `entity_type` | string | The kind of stakeholder: person, team, role, vendor, or system. |
| `role` | string | The stakeholder's function. |
| `contact` | string | How to reach them. |
| `owns` | string \| string[] | The paths/areas this stakeholder is responsible for. |
| `scope` | string | The boundary of the entity's responsibility. |

**`process` (PROC):**

| Field | Type | Meaning |
|-------|------|---------|
| `trigger_event` | string | What kicks the process off. |
| `frequency` | string | How often it recurs. |
| `tools` | string | Tooling the process uses. |
| `automation_hook` | string | Where any portion of the process is automated. |

**General:**

| Field | Type | Meaning |
|-------|------|---------|
| `promotion_status` | string \| null | Tracks a concept's progression from provisional to established. |

> **Field-list normalization.** Where a field is list-valued (`tags`,
> `related_files`, `alternatives_considered`, `owns`, `linked_workpackages`), a
> conforming parser MUST accept a bare scalar as a one-element list. This keeps
> hand-authored files forgiving without ambiguity.

---

## 5. Status lifecycle

Every concept has a `status` from a closed set of five:

| Status | Meaning |
|--------|---------|
| `pending` | Captured but not yet confirmed; provisional. |
| `active` | Confirmed and in force; eligible for surfacing. |
| `superseded` | Replaced by a newer concept (`superseded_by` points to it). |
| `deprecated` | No longer true or no longer recommended; retained for history. |
| `archived` | Removed from active surfacing; terminal. |

Typical progression:

```
pending ──▶ active ──▶ superseded ──▶ archived
                  └───▶ deprecated ──▶ archived
```

`pending` exists so that machine-captured knowledge can be admitted provisionally
and promoted (or dropped) on review, rather than polluting the active set on
capture. Only `active` (and, by policy, `pending`) concepts are surfaced; the rest
are retained for provenance and history.

---

## 6. Supersession & deprecation

CKS distinguishes two ways a concept leaves active force:

- **Supersession** — a newer concept *replaces* an older one. The new concept sets
  `supersedes: <old-id>`; the old concept's `status` becomes `superseded` and its
  `superseded_by` points to the new `id`. The link is bidirectional and
  navigable.
- **Deprecation** — a concept stops being true or recommended with no direct
  replacement. Its `status` becomes `deprecated`.

Both are **surfaced**: when a concept that has been superseded or deprecated is
about to be served (because its bound resource is in play), the implementation
SHOULD surface the deprecation so the reader is not handed stale guidance.
`supersession_reviewed` records that a human has seen and acknowledged that
surface, so it is not repeated indefinitely.

This is the dimension that keeps the graph **fresh**: as code evolves, concepts
are superseded or deprecated through the workflow rather than left to rot. Pruning
is the act of moving stale concepts out of the active, surfaced set while keeping
them on disk for history.

---

## 7. Resource binding

A concept records the resource it concerns in `related_files` — a list of paths
into the codebase. This is what makes CKS a **graph** rather than a pile of notes:
when a bound file is touched, the concepts attached to it can be surfaced
automatically.

v1.0 binds to **code paths**. A future revision may adopt a single canonical
`resource` identifier (a URI) alongside the path list; see
[§12](#12-reserved--roadmap).

---

## 8. Cross-linking

Concepts reference each other with a wiki-style double-bracket link:

```
... see [[use-optimistic-locking]] for the concurrency rationale ...
```

- A `[[slug]]` reference targets another concept by its `slug` handle.
- Links are resolved at the point of display, so a reference written before its
  target exists is not an error — it is a forward reference that resolves once the
  target is created.
- Lifecycle edges (`supersedes` / `superseded_by`) are a second, typed kind of
  link between concepts, distinct from free `[[slug]]` references.

`slug` handles are unique within a type's namespace.

---

## 9. Schema versioning

A concept declares the schema revision it conforms to in `schema_version`. CKS has
evolved through eight revisions while preserving backward compatibility — older
files remain valid and are migrated forward in place. The progression:

| Revision | Added |
|:--------:|-------|
| v1 | Base concept: id, title, type, status, tags, description, links. |
| v2 | Cross-domain binding to units of work and plan phases. |
| v3 | Deprecation (reason + timestamp). |
| v4 | Unified supersession (archival, supersession timestamps, deprecation classification). |
| v5 | Per-entry schema versioning + the `pending` status. |
| v6 | Surfacing observability (`surfaced_count`). |
| v7 | Deprecation-surfacing lifecycle (`supersession_reviewed`). |
| v8 | Category expansion to seven types + their type-specific fields. |

Implementations MUST migrate a lower-versioned file forward on read without data
loss, and MUST NOT reject a file solely because its `schema_version` is older than
current.

---

## 10. Consumption pattern

CKS specifies not just authoring but **serving**. A conforming consumer:

1. **Binds** concepts to resources via `related_files`.
2. **Surfaces** the relevant `active` (and, by policy, `pending`) concepts when
   their bound resource enters play — the right context at the right time, rather
   than a manual search.
3. **Respects lifecycle** — superseded/deprecated concepts are surfaced *as such*,
   not as current truth, and pruned from the default active set.
4. **Indexes** concepts for search as a derived cache over the files, never as the
   primary store.

The consumption pattern is what separates CKS from a format that only says how to
*write* a note. The files are portable on their own; the value compounds when a
consumer serves them this way.

---

## 11. Relationship to OKF

In June 2026, Google open-sourced the **Open Knowledge Format (OKF)** — a v0.1
draft for markdown-native, typed, resource-bound knowledge. CKS and OKF **agree on
the core**: typed concepts, a description, tags, resource binding, cross-links,
citations, and a version declaration. That agreement is independent confirmation
that the underlying model is sound.

CKS differs in two deliberate ways:

- **Opinionated primitives.** OKF leaves the type taxonomy to the producer by
  design; CKS ships a fixed, meaningful set of seven (growing).
- **A lifecycle.** Status, supersession, deprecation, pruning, and surfacing
  observability are out of OKF's scope and central to CKS.

CKS is its own standard. It selectively adopts OKF's best ideas — the single
canonical resource-binding convention and the citation model — to harden itself,
without folding into OKF or exporting to it. The full side-by-side comparison lives
in the knowledge-system guide.

---

## 12. Reserved & roadmap

The following are **reserved** in v1.0 — named here so producers do not collide
with them, but not yet specified:

- **Non-code primitives** — first-class types for people, places, organizations,
  business entities, and events. This is the bridge from code to non-code domains
  and the reason CKS is a general spec rather than a code-only convention.
- **Canonical `resource` binding** — a single URI identifier alongside
  `related_files`, adopting OKF's convention.
- **Fuller citation model** — a richer `source` treatment.
- **Verification method / confidence** — recording *how* a concept was verified
  and with what confidence, not just that a decision was made.

These are direction, not commitments. A concept that uses a reserved field name for
its own purpose risks a future conflict.

---

## 13. Conformance

An implementation **conforms to CKS v1.0** if it:

- stores each concept as one markdown file with YAML frontmatter;
- accepts a concept given at least `id`, `title`, and `type`, with `id` matching
  the type prefix;
- enforces the closed set of seven types and five statuses;
- preserves and navigates supersession links bidirectionally;
- surfaces superseded/deprecated concepts as such rather than as current truth;
- migrates older `schema_version` files forward on read without data loss;
- treats any index as a derived cache, never as the source of truth.

---

*CKS is developed alongside [CLEAR](https://github.com/QBall-Inc/clear), its
reference implementation. Spec revisions track the CLEAR release that introduces
them.*
