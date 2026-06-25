# Capture Knowledge

Create or update a knowledge entry using the capture CLI. Supports 7 entry types and a multi-mode workflow.

## Modes

The capture CLI operates in 5 modes, invoked via flags:

| Mode | Flag | Description |
|------|------|-------------|
| Detect | `--detect` | Check if text contains a capture trigger, save pending state |
| Confirm | `--confirm` | Process user confirmation (type, tags, supersession) |
| Create | `--create` | Create the entry from provided fields |
| Update | `--update` | Update fields on an existing entry (tags, description, links — or type via type-change) |
| Check State | `--check-state` | Check if a pending capture exists |

## Entry Types (7 types)

| Type | ID Prefix | `--type=` value | Use for |
|------|-----------|-----------------|---------|
| Technical Decision | TD-XXX | `technical-decision` | Architectural / tech-stack choices |
| Business Rule | BR-XXX | `business-rule` | Mandatory invariants, prohibitions, validation requirements |
| Architectural Pattern | PAT-XXX | `architectural-pattern` | Reusable design patterns the project applies |
| Lesson Learned | LES-XXX | `lesson-learned` | Insights from past mistakes / hindsight reflections |
| Institutional Wiki | IW-XXX | `institutional-wiki` | External standards, regulations, reference docs |
| Stakeholder | SH-XXX | `stakeholder` | People / teams / orgs involved with the project |
| Process | PROC-XXX | `process` | Recurring workflows, runbooks, procedural guides |

## Core Arguments

| Argument | Required | Used In | Description |
|----------|----------|---------|-------------|
| `--clear-dir=<path>` | Yes | All | Path to .clear directory |
| `--detect` / `--confirm` / `--create` / `--update` / `--check-state` | Yes | One per invocation | Mode selector |
| `--text=<text>` | Yes (detect) | Detect | Text to analyze for triggers |
| `--response=<text>` | Yes (confirm) | Confirm | User response to confirmation prompt |
| `--title=<string>` | Yes (create) | Create | Entry title |
| `--type=<type>` | Yes (create) | Create / Update | One of the 7 type values above. In update mode, triggers type-change with ID regeneration. |
| `--id=<id>` | Yes (update) | Update | ID of entry to modify (e.g., `TD-001`, `LES-003`) |
| `--tags=<csv>` | No | Create / Update | Comma-separated tags (no spaces around commas) |
| `--description=<text>` | No | Create / Update | Entry description / body |
| `--supersedes=<id>` | No | Create | ID of entry this replaces |
| `--add-related-file=<path>` | No (repeatable) | Update | Add a file link to the entry's `related_files` |
| `--workpackage=<id>` | No | Create | Auto-link to workpackage after creation |
| `--session=<number>` | No | Create / Update | Session number for provenance |

## Type-Specific Flags

### Institutional Wiki (`--type=institutional-wiki`)

| Flag | Description |
|------|-------------|
| `--source=<string>` | Canonical external citation (e.g., `"ISO 27001:2022"`, `"RFC 7519"`) |
| `--source-updated=<date>` | When the source was last revised |
| `--scope=<string>` | One-line statement of what this entry covers |

Stored as frontmatter and surfaced in the body template's Source / Scope / Content sections. Silently ignored on non-IW types.

### Process (`--type=process`)

| Flag | Description |
|------|-------------|
| `--trigger-event=<string>` | Event that initiates the process (e.g., `"session-start"`, `"deploy-trigger"`) |
| `--frequency=<string>` | Execution cadence (e.g., `"weekly"`, `"on-demand"`, `"every release"`) |
| `--tools=<string>` | Tools / commands used (e.g., `"just, jq, gh"`) |
| `--automation-hook=<string>` | Reference to an automation entrypoint (e.g., a script path) |

Stored as frontmatter and surfaced in the body template's Trigger / Prerequisites / Steps / Verification sections. Silently ignored on non-PROC types. Note: a fifth PROC frontmatter field, `promotion_status`, is reserved for the process-to-skill promotion lifecycle; no CLI flag is plumbed at create time.

### Stakeholder (`--type=stakeholder`)

| Flag | Required | Description |
|------|----------|-------------|
| `--entity-type=<string>` | **Yes** | One of `"team"`, `"individual"`, `"org"`, `"role"`. Creation rejected with `status:error` envelope when omitted (mirrors the title+type cross-context gate). |
| `--role=<string>` | No | Role descriptor (e.g., `"Platform Lead"`, `"On-call rotation"`) |
| `--owns=<csv>` | No | Comma-separated relative paths the stakeholder owns. Absolute paths and `..` traversal rejected (same rule as `--add-related-file`). |
| `--contact=<string>` | No | Contact identifier (e.g., `"#payments-oncall"`, `"team@example.com"`) |

Stored as frontmatter and surfaced in the body template's Entity / Role / Owns / Contact sections. Triggers lazy `buildOwnerIndex()` after the first SH entry create — `.clear/state/owner-index.json` maps `owns` paths to SH entry IDs and is consulted by PreToolUse alongside the file-knowledge-index. Silently ignored on non-SH types.

## Type-Change

Pass `--type=<new-type>` in update mode to reclassify an entry under a new type with regenerated ID.

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=./.clear \
  --update \
  --id=LES-003 \
  --type=technical-decision
```

**Behavior:**
- Old entry is preserved on disk with `status: superseded` and `superseded_by: NEW-NNN`
- A new entry is created at `NEW-NNN.md` with the body copied verbatim and `supersedes: OLD-NNN`
- All third-party entries that referenced the old ID via `supersedes` or `superseded_by` are cascaded to the new ID — **cascade is mandatory**
- Emits a `'supersede'` audit row (from the unified supersession primitive) plus an `'update'` audit row with `metadata.operation: 'type-change'` so queries can filter type-changes specifically
- Type-change to `stakeholder` requires `--entity-type=...` at the CLI boundary (mirrors the create-time SH gate)
- Rejected on entries already `superseded` or `deprecated`, or when the new type matches the current type
- Return JSON has `oldId`, `newId`, `action: 'type-change'`, and `cascadedRefs` at the top level

## Audit + Observability Flags

| Flag | Description |
|------|-------------|
| `--via=<mode>` | Capture origin: `direct_create` (default), `pattern_detected`, `extraction`, `bulk` |
| `--matched-pattern=<description>` | Echoes the `CapturePatternDef.description` when the entry was triggered by a YAML capture pattern |
| `--session-id=<guid>` | With `--session-number`, enables canonical audit-log emission to `.clear/audit/session_N.jsonl` |
| `--session-number=<n>` | Pair with `--session-id`. The production hook chain (`scripts/knowledge/knowledge-capture.sh`) reads these from `.clear/state/session.json` automatically; direct CLI users supply them explicitly. If either is absent, audit emit is silently skipped (legacy `--session=<n>`-only path preserved). |

Decline / failure / state-expired events are written to `.clear/state/capture-pattern-log.jsonl` regardless of session flags — that surface is daemon-curated, not single-event audit.

## Execution

### Direct create

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=./.clear \
  --create \
  --title="Use Redis for session caching" \
  --type=technical-decision \
  --tags="caching,redis,session-management" \
  --description="Decision to use Redis over Memcached for session storage" \
  --session=157
```

### Create institutional-wiki entry

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=./.clear --create --type=institutional-wiki \
  --title="ISO 27001:2022 Compliance Reference" \
  --source="ISO 27001:2022" --source-updated="2022-10-25" \
  --scope="Information security management system controls" \
  --tags="security,iso-27001,compliance"
```

### Create process entry

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=./.clear --create --type=process \
  --title="Weekly Deploy Runbook" \
  --trigger-event="deploy-trigger" --frequency="weekly" \
  --tools="just, jq, gh" --automation-hook="scripts/deploy/run.sh" \
  --tags="deploy,runbook,weekly"
```

### Create stakeholder entry

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=./.clear --create --type=stakeholder \
  --title="Payments On-Call Rotation" \
  --entity-type="team" --role="On-call rotation" \
  --owns="src/payments/,src/billing/" \
  --contact="#payments-oncall" \
  --tags="stakeholder,payments,on-call"
```

### Update fields

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=./.clear --update --id=TD-005 \
  --tags="caching,redis,session-management,evaluation" \
  --description="Updated description after Q2 review" \
  --session=157
```

### Change entry type

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=./.clear --update --id=LES-003 \
  --type=technical-decision
```

### Full detect → confirm → create workflow

```bash
# Step 1: Detect trigger in text
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=./.clear --detect --text="We decided to use Redis for caching"

# Step 2: Confirm (after user reviews detected type/tags)
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=./.clear --confirm --response="yes"

# Step 3: Create (uses pending state from detect+confirm)
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=./.clear --create --title="Use Redis for caching" --type=technical-decision
```

## Index Update

The CLI rebuilds the search index inline after every `--create` and `--update`. Manual rebuild is only needed after direct file edits.

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/index-cli.js" \
  --clear-dir=./.clear --mode=full --force
```

## Error Handling

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success |
| 5 | Content cannot be classified (detect mode), or required type-specific flag missing (e.g., `--entity-type` for stakeholder create / type-change) |

Type-change is rejected when: the entry is already `superseded` or `deprecated`, or the requested new type matches the current type. Returns a `status:error` JSON envelope rather than throwing.
