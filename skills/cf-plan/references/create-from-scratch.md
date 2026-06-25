# Track B — Create Plan From Scratch

Builds a master plan from a topic, brief, or project description via a three-agent pipeline. Invoked when `/cf-plan create` receives free-form text (no path argument), or when classification resolves to "create from scratch" via the router's ambiguity prompt.

The three sub-agents run sequentially. Each writes its output to `$PROJECT_DIR/logs/plan-creation/{slug}/` for the next stage to consume.

---

## Pre-Condition

`create.md` (the router) has already:

1. Verified that no existing `master-plan.yaml` blocks creation (or that `--force` was passed).
2. Classified the argument as a Track B free-form topic.
3. Routed here.

The argument (topic / brief / description) is available verbatim as `$ARGUMENTS` or as the routed-through string.

---

## User Interaction Protocol (BINDING)

Sub-agents run in their own context window and cannot present options to the user directly. When you read a sub-agent's output and encounter questions, options, or decisions directed at the user, you MUST present these to the user via the `AskUserQuestion` tool — never as plain text output. Relay the user's response back to the next sub-agent stage as context.

---

## Stage 1B — Pre-Flight

1. **Derive a slug** from the topic: lowercase, spaces to hyphens, max 40 characters.
   Example: `"build a REST API"` → `build-a-rest-api`

2. **Create the output directory**:
   ```bash
   mkdir -p "$PROJECT_DIR/logs/plan-creation/${slug}"
   ```

---

## Stage 2B — Requirements Analyst

Spawn the Requirements Analyst sub-agent.

```
Task(subagent_type="plan-management-requirements-analyst", prompt=...)
```

Pass as context:

- The user's topic or brief (verbatim).
- The output path: `$PROJECT_DIR/logs/plan-creation/{slug}/01-requirements.md`.
- The project root: `$PROJECT_DIR`.

After the sub-agent completes, READ `01-requirements.md` in full before proceeding. Do not proceed to Stage 3B if the file is missing or empty.

---

## Stage 3B — Architect

Spawn the Architect sub-agent.

```
Task(subagent_type="plan-management-architect", prompt=...)
```

Pass as context:

- Path to `01-requirements.md`.
- The output path: `$PROJECT_DIR/logs/plan-creation/{slug}/02-architect.md`.
- The project root: `$PROJECT_DIR`.

After the sub-agent completes, READ `02-architect.md` in full before proceeding. Do not proceed to Stage 4B if the file is missing or empty.

---

## Stage 4B — Detail Engineer

Spawn the Detail Engineer sub-agent.

```
Task(subagent_type="plan-management-detail-engineer", prompt=...)
```

Pass as context:

- Path to `02-architect.md`.
- Path to `01-requirements.md` (for traceability).
- The output path: `$PROJECT_DIR/logs/plan-creation/{slug}/03-detail-engineer.md`.
- The project root: `$PROJECT_DIR`.

After the sub-agent completes, READ `03-detail-engineer.md` in full before proceeding.

---

## Stage 5B — Synthesis

Synthesize all three sub-agent outputs into a master plan structure. Synthesis produces TWO outputs handled separately:

1. **master-plan.yaml** — phases + milestones + plan-level pointers. Written via `plan-write-cli` to `.clear/plans/master-plan.yaml`.
2. **WP JSON payloads** — one per workpackage. Piped individually to `wp/create-cli --from-stdin` to write `.clear/workpackages/wp-<systemId>.yaml`. WPs are NOT written into master-plan.yaml.

### master-plan.yaml shape (canonical)

```yaml
version: '1.0'
projectName: "<derived from requirements>"
status: active
activePhase: phase_1                       # Top-level pointer; first phase becomes active on plan creation
activeWorkpackage: ''                      # Empty until first WP starts

phases:
  - id: phase_N                             # Display ID (auto-derived from position)
    name: "<from architect>"
    status: not_started                     # not_started | in_progress | complete
    workpackages: ["<WP display ID>", ...]  # P<phasePos>.<seq> — see "Workpackage display-ID convention" below
    # systemId, position, progress, weights are AUTO-POPULATED by plan-write-cli + CLI ops.
    # Do NOT pre-fill them in synthesis — let the system assign canonical values.

milestones:
  - id: <M-ID>
    name: "<from architect>"
    phase: <phase_N>
    type: major | minor | gate
    requires: ["<WP display ID>", ...]      # P<phasePos>.<seq> IDs — see "Workpackage display-ID convention" below
    status: not_started
```

**Fields NOT in canonical master-plan.yaml** (do not include them in synthesis output even if a sub-agent suggests them): `created`, `summary`, `description` on phases. Provenance / narrative belongs in sub-agent output files under `logs/plan-creation/{slug}/`, not in the canonical plan.

### Workpackage display-ID convention (IMPORTANT)

`create-cli` assigns each workpackage's display ID **automatically** — you do not choose it, and any `id` in the WP payload is ignored. The format is:

```
P<phasePosition>.<positionWithinPhase>
```

- `<phasePosition>` is the phase's 1-based position. For a standard plan written in order, `phase_1` → `P1`, `phase_2` → `P2`, and so on.
- `<positionWithinPhase>` is the WP's 1-based position within its phase, in creation order — first WP in `phase_1` is `P1.1`, second is `P1.2`, first in `phase_2` is `P2.1`.

These IDs are **positional and system-managed**: inserting or reordering a WP re-computes them. You cannot pick `WP-1.1`-style IDs and expect them to stick.

**Why this matters for synthesis:** the `workpackages:` and `requires:` lists are written **before** the WPs exist, and `plan-write-cli` stores them as plain strings — it does **not** validate that those IDs are present in the registry. If they don't match what `create-cli` mints, the references dangle silently and surface only later in `next` / `progress` / `debug`, never at write time.

**To keep the plan consistent:**

1. Populate `workpackages:` and `requires:` using the `P<phasePosition>.<seq>` convention above (e.g. `workpackages: ["P1.1", "P1.2"]`).
2. Create the WPs **in the order they appear within each phase**, so the minted IDs match the references by construction.
3. `create-cli` prints each minted ID on success (`✅ Workpackage created: P1.1 - "…"`). If you used `afterId` or created WPs out of phase order and the minted IDs differ from your references, re-run `plan-write-cli` to reconcile `workpackages:`/`requires:` — it preserves phase `systemId`s, so the rewrite is safe.

### WP JSON payload shape (per workpackage)

Each workpackage from synthesis gets its own JSON payload piped to `wp/create-cli --from-stdin`. Schema matches `wp/create-cli --help`:

```json
{
  "phaseId": "<phase systemId — e.g. ph-12a34b56>",
  "title": "<WP title — IMPORTANT: use 'title' not 'name'. CLEAR WP YAMLs use 'title:'>",
  "afterId": "<optional — WP systemId to insert after for explicit ordering>",
  "type": "feature | spike | bug | refactor | doc",
  "priority": "low | medium | high",
  "description": "<WP description>",
  "acceptance_criteria": ["<criterion 1>", "<criterion 2>"],
  "deliverables_text": ["<artifact description 1>", "<artifact description 2>"],
  "scope_in": ["<in-scope item>"],
  "scope_out": ["<out-of-scope item>"],
  "verification": ["<command or procedure>"],
  "notes": ["<note>"]
}
```

Note: deliverables are passed as `deliverables_text` (array of plain strings). The CLI generates structured `deliverables[]` objects with `id`, `weight`, `status`, `pattern` fields server-side. Do NOT try to pre-construct the structured deliverable shape from synthesis.

---

## Stage 5B — Approval, Write, and Workpackage Creation

### Approval Gate

Present the synthesized plan to the user via `AskUserQuestion`:

- Question: "Plan ready for review. Approve and write to `.clear/plans/master-plan.yaml`?"
- Options:
  - "Approve and write" — proceed to write step
  - "Edit before writing" — re-present after incorporating feedback (re-spawn detail-engineer if scope changes meaningfully)
  - "Cancel" — stop and discard; no `.clear/` mutations

Display the full YAML in the question context (or in the preceding response) so the user can review.

### Write Plan

On approval, pipe the approved YAML through `plan-write-cli` (do NOT use the Write tool directly on `.clear/` paths — the PreToolUse guard will block it):

```bash
echo '<approved YAML>' | node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/plan-write-cli.js" --cwd="$PROJECT_DIR"
```

The CLI validates the YAML via `parseMasterPlanContent()`, then delegates to `writeMasterPlan()` which handles directory creation, backup, and serialization.

### Workpackage Creation

After writing the plan, ask via `AskUserQuestion`:

- Question: "Plan written. Create individual workpackage YAML files for each WP now?"
- Options: "Create WPs now", "Defer WP creation"

If "Create WPs now": for each workpackage in the plan, construct a JSON payload
(see "WP JSON payload shape" above for full schema) and pipe it to
`wp/create-cli --from-stdin`. This preserves all rich fields (acceptance_criteria,
scope, deliverables) across the skill-CLI boundary. Create the WPs **in the order
they appear within each phase** so the auto-minted `P<phasePosition>.<seq>` IDs
match the `workpackages:`/`requires:` references already written into
master-plan.yaml (see "Workpackage display-ID convention" above).
Each success line prints the minted ID; if any differ, reconcile with a second
`plan-write-cli` pass.

```bash
echo '{
  "phaseId": "<phase system ID>",
  "title": "<WP title>",
  "type": "feature",
  "priority": "medium",
  "description": "<WP description>",
  "acceptance_criteria": ["<criterion 1>", "<criterion 2>"],
  "deliverables_text": ["<deliverable 1>", "<deliverable 2>"],
  "scope_in": ["<in-scope item>"],
  "scope_out": ["<out-of-scope item>"],
  "verification": ["<verification step>"],
  "notes": ["<note>"]
}' | node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/create-cli.js" --from-stdin --cwd="$PROJECT_DIR" --phase="<phase-id>"
```

Do NOT write WP YAML files directly — the PreToolUse guard blocks Write/Edit on `.clear/` paths.

---

## Do NOT

- Do NOT invoke `plan-management` via `Skill()` — Track B is fully self-contained here.
- Do NOT use the Write tool on any path under `.clear/` — use the CLIs.
- Do NOT pre-construct phase `systemId` / `position` / `progress` / `weights` values — `plan-write-cli` assigns them canonically.
