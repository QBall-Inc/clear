# Changelog

All notable changes to CLEAR are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

CLEAR is a Claude Code plugin that pairs a filesystem-based, code-bound knowledge
graph (the CLEAR Knowledge Spec, or CKS) with a structured plan, schedule, act, and
manage workflow. It publishes to npm as `@qball-inc/clear`.

## [Unreleased]

Planned for upcoming releases:

- **Help-system coherence** — a single source of truth for command help shared by
  `/cf-help` and every CLI `--help`, so command documentation never drifts.
- **Knowledge enrichment** — automatic extraction of decisions and lessons from
  session handoffs and completed work, plus optional background curation.
- **Harness adapters** — broader integration surfaces for orchestrating CLEAR
  alongside other tooling.

## [1.0.2] - 2026-06-26

### Fixed

- **Status line survives plugin updates.** The status line is now configured with a
  stable, project-relative path (`${CLAUDE_PROJECT_DIR}/.clear/statusline.sh`) rather
  than an absolute path tied to a specific installed version. Previously the configured
  path pointed into a versioned plugin directory and broke when the plugin updated to a
  newer version. Existing installs migrate automatically on the first session after
  updating — no re-initialization required.
- **`cf-debug` no longer false-flags a correct status line.** The install diagnostic now
  resolves the project-relative path before checking the script on disk, so it stops
  reporting a "missing on disk" error for a status line that is, in fact, configured
  correctly.

## [1.0.1] - 2026-06-25

### Fixed

- **Hook scripts now ship executable.** The plugin's hook dispatcher scripts are
  committed with the executable bit set (git mode `100755`), so hooks run correctly
  after a marketplace or GitHub install. In 1.0.0 they were stored non-executable on
  those install paths, causing every hook to fail with a "Permission denied" error.

## [1.0.0] - 2026-06-24

First stable release. CLEAR delivers a complete, state-correct lifecycle surface:
a typed, code-bound knowledge graph and an end-to-end plan, schedule, act, and
manage workflow, all driven from the `/cf-*` command set inside Claude Code.

### Added

- **CLEAR Knowledge Spec (CKS).** Knowledge is stored as plain markdown files with
  structured frontmatter, version-controllable alongside the code they describe. The
  spec defines the entry shape, identifiers, and lifecycle.
- **Seven knowledge types.** Capture technical decisions, business rules,
  architectural patterns, lessons learned, institutional wiki notes, stakeholders,
  and processes, each with type-appropriate behavior.
- **Code-bound entries.** Every entry carries a one-line description, tags, and
  `related_files` links that bind knowledge to the code it explains, plus `[[slug]]`
  cross-links between related entries.
- **Full knowledge lifecycle.** Entries move through explicit status states with
  supersession, deprecation surfacing, pruning and freshness signals, and structured
  provenance, so stale or replaced knowledge is flagged rather than silently trusted.
- **Schema versioning with in-place migration.** Entries forward-migrate across
  eight schema revisions automatically, so existing knowledge bases upgrade without
  manual rewrites.
- **Surfacing observability.** A surfacing log records when and why knowledge was
  presented, making the knowledge graph's behavior inspectable.
- **SQLite full-text index and search.** Knowledge is indexed for fast full-text
  search across the whole base.
- **Plan, schedule, act, manage workflow.** Built-in plan, workpackage, and session
  management for structuring and tracking work from intent through delivery.
- **Knowledge and project-state synchronization.** Knowledge and project state stay
  in sync through a single-writer state model that keeps the two from drifting apart.
- **Session handoff continuity.** Each session can hand off to the next with a
  structured summary, so context carries forward across sessions.
- **The `/cf-*` command surface.** `/cf-init`, `/cf-plan`, `/cf-workpackage`,
  `/cf-knowledge`, `/cf-status`, `/cf-handoff`, `/cf-help`, `/cf-reload`, and
  `/cf-debug`.
- **Apache-2.0 license**, including an explicit patent grant.

---

The entries below reconstruct CLEAR's pre-1.0 development timeline from the project's
own commit history. There were no public releases before 1.0.0; these `0.x.0` markers
record when each capability first landed during development, not prior published
versions. Dates are drawn from the real commit log.

## [0.7.0] - 2026-06-23

Reliability and state-correctness hardening ahead of the first stable release,
driven by extended real-project usage.

### Added

- Recovery and repair paths for project state, including a rebuild operation for the
  knowledge index and drift detection between the index and on-disk entries.
- Knowledge-base initialization that bootstraps the native search index and verifies
  it on every run, with an honest status message when the index is unavailable.

### Changed

- Knowledge-to-project-state synchronization reworked so that mutating operations
  propagate their own state changes intrinsically through a single shared writer,
  removing a class of silent desync.
- Session identity reconciled so that resuming a session is treated as a continuation
  rather than a new session.
- Command help and warnings made consistently actionable, with clearer messages when
  an operation cannot proceed.

### Fixed

- Workpackage and plan progress accounting corrected to a single canonical 0–100
  scale across all readers, writers, and displays.
- Numerous initialization and recovery edge cases surfaced during real-project use,
  including safer re-initialization and cleanup behavior.

### Security

- Tightened the write-guard around shell commands, closing command-substitution and
  redirect bypasses while still permitting read-only operations.

## [0.6.0] - 2026-05-12

Knowledge type system expanded to its full shape.

### Added

- Expanded knowledge from four types to seven: added institutional wiki, process,
  and stakeholder types alongside the existing technical-decision, business-rule,
  architectural-pattern, and lesson-learned types.
- Type-change support that regenerates an entry's identifier and cascades the change
  through cross-links and the index.

### Changed

- Schema advanced to revision eight with automatic in-place migration of existing
  entries.

## [0.5.0] - 2026-04-20

Knowledge pipeline repair, progressive disclosure, and observability.

### Added

- A surfacing log and grace-period handling so the system can explain when and why
  knowledge was presented or held back.
- Schema versioning with a pending-review state for newly captured knowledge.
- Deprecation lifecycle surfacing that flags superseded and deprecated entries at the
  point they would otherwise be trusted.

### Changed

- Repaired the end-to-end knowledge capture, indexing, and surfacing pipeline so
  captured knowledge reliably reaches search and recall.

## [0.4.0] - 2026-03-31

Hardening pass plus active context engineering for the knowledge graph.

### Added

- Capture-time auto-linking and automatic `related_files` population, so new
  knowledge is connected to existing entries and code without manual wiring.
- Unified supersession with chain traversal, so replacement history is followed end
  to end.
- A live reverse index from files to knowledge, and context injection that surfaces
  relevant knowledge during work.
- Session-start loading of the previous session's handoff for automatic continuity.

### Changed

- Modernized the hook architecture (session lifecycle, pre/post tool use, and stop
  handling) and aligned the command and CLI contract across the surface.

### Fixed

- A broad code-review and test-audit pass resolving correctness, data-flow, and
  state-propagation defects across the CLIs and skills.

## [0.3.0] - 2025-12-24

The `/cf-*` command surface.

### Added

- The interactive command set: `/cf-init`, `/cf-status`, `/cf-handoff`, `/cf-debug`,
  `/cf-plan`, `/cf-workpackage`, `/cf-knowledge`, `/cf-help`, and `/cf-reload`,
  bringing initialization, status, handoff, planning, workpackage, knowledge, and
  help workflows under one command family.

## [0.2.0] - 2025-12-10

Core automation.

### Added

- Knowledge capture and search, backed by a SQLite index.
- Workpackage and plan automation for structuring and tracking work.
- Cross-domain synchronization keeping knowledge, plans, workpackages, and session
  state aligned.

## [0.1.0] - 2025-11-27

Project foundation.

### Added

- Plugin infrastructure for Claude Code: hook orchestration, an explicit
  configuration system with schema validation, and the initial session-management and
  knowledge-management capabilities.

[Unreleased]: https://github.com/QBall-Inc/clear/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/QBall-Inc/clear/releases/tag/v1.0.0
[0.7.0]: https://github.com/QBall-Inc/clear/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/QBall-Inc/clear/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/QBall-Inc/clear/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/QBall-Inc/clear/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/QBall-Inc/clear/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/QBall-Inc/clear/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/QBall-Inc/clear/releases/tag/v0.1.0
