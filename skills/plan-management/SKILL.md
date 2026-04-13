---
name: plan-management
version: 1.0.0
author: Ashay Kubal @ Qball Inc.
description: "Use when creating a new development plan from a topic or brief, importing an existing Bulwark plan YAML, checking plan status, identifying blockers, or getting next-step recommendations."
user-invocable: false
allowed-tools: Read, Write, Bash, Glob, Grep
skills:
  - subagent-prompting
---

> **CLI Usage:** When unsure about a CLI's interface or flags, run it with `--help` first. Do NOT attempt to discover functionality by reading plugin source code — doing so leads to incorrect execution from assumptions made without context of the holistic flow.

# Plan Management Skill

This skill manages the full plan lifecycle: importing an existing Bulwark-format plan (Track A) or
intelligently creating a new plan from scratch via a three-agent pipeline (Track B). It also handles
ongoing plan operations: status queries, blocker detection, progress updates, and milestone management.

## When to Use

| Trigger Pattern | Track | Action |
|-----------------|-------|--------|
| User provides a path to a `.yaml` file with `phases[]`/`workpackages[]`, or a directory containing `plan_v*.md` | A | Import via plan-import.sh |
| User provides a topic, brief, package.json description, or says "create a plan for..." | B | Three-agent creation pipeline |
| User says "what should I work on next?" or "recommend next steps" | — | Read `.clear/plans/` + analyze |
| User says "check for blockers" or "what's blocking progress" | — | Invoke plan-blockers.sh |
| User says "update plan progress" or "recalculate progress" | — | Invoke plan-progress.sh |
| User asks to read or view the current plan | — | Read `.clear/plans/master-plan.yaml` |

## DO NOT Use For

- Questions about plan history or reading raw plan documents without any action intent — just read the file directly.
- Workpackage lifecycle operations (starting, completing, updating a workpackage) — use the `workpackage-management` skill instead.

## Dependencies

- Skill: `subagent-prompting` (MUST be loaded before spawning any Track B sub-agent)
- Scripts: `scripts/plan/plan-import.sh`, `scripts/plan/plan-progress.sh`, `scripts/plan/plan-blockers.sh`
- Sub-agents (Track B only, located in plugin root `agents/`):
  - `plan-management-requirements-analyst`
  - `plan-management-architect`
  - `plan-management-detail-engineer`

---

## Mandatory Execution Checklist (BINDING)

**Every item below is mandatory. No deviations. No substitutions. No skipping.**

This skill uses a multi-stage pipeline with two tracks. You are the orchestrator. Follow every item in order.

**User Interaction Protocol (BINDING):** Sub-agents run in their own context window and cannot present options to the user directly. When you read a sub-agent's output and encounter questions, options, or decisions directed at the user, you MUST present these to the user via the `AskUserQuestion` tool — never as plain text output. Relay the user's response back to the next sub-agent stage as context.

- [ ] **Stage 0 — Input Assessment**: Input parsed (path, topic, or bare invocation)
- [ ] **Stage 0 — Input Assessment**: Input classified as Track A (Bulwark plan) or Track B (create from scratch)
- [ ] **Stage 1A — Track A Import**: (if Track A) plan-import.sh invoked via Bash
- [ ] **Stage 1A — Track A Import**: (if Track A) Results reported to user
- [ ] **Stage 1B — Track B Pre-Flight**: (if Track B) Output directory created at `$PROJECT_DIR/logs/plan-creation/{slug}/`
- [ ] **Stage 1B — Track B Pre-Flight**: (if Track B) subagent-prompting skill loaded
- [ ] **Stage 2B — Requirements**: (if Track B) Requirements Analyst sub-agent spawned, output read from `01-requirements.md`
- [ ] **Stage 3B — Architecture**: (if Track B) Architect sub-agent spawned with requirements path, output read from `02-architect.md`
- [ ] **Stage 4B — Detail**: (if Track B) Detail Engineer sub-agent spawned with architect output path, output read from `03-detail-engineer.md`
- [ ] **Stage 5B — Synthesis**: (if Track B) All 3 outputs synthesized into final plan YAML structure
- [ ] **Stage 5B — Approval**: (if Track B) Plan presented to user via AskUserQuestion
- [ ] **Stage 5B — Write**: (if Track B) Approved YAML piped through `plan-write-cli.js` (NOT direct Write on `.clear/`)
- [ ] **Stage 5B — Workpackages**: (if Track B) User prompted for WP YAML creation; if yes, pipe JSON to `create-cli.js --from-stdin` per WP

---

## Usage

```
/plan-management [path-to-bulwark-plan | topic | brief]
/plan-management                            # bare invocation: status + next steps
/plan-management plans/my-plan.yaml         # Track A: import Bulwark YAML
/plan-management "build a REST API"         # Track B: create plan from topic
```

---

## Pipeline Notation

```fsharp
// plan-management dispatch
InputAssessment(args)
|> (if BulwarkPlan then TrackA_Import else TrackB_Create)

// Track A
TrackA_Import(plan_path)
|> ReportResults()

// Track B
TrackB_PreFlight(topic)
|> RequirementsAnalyst(topic, codebase)
|> Architect(requirements)
|> DetailEngineer(architecture)
|> Synthesize(all_outputs)
|> ApprovalGate(plan)
|> WritePlan(approved_plan)
|> OfferWorkpackageCreation(plan)
```

---

## Stage 0: Input Assessment

Parse the invocation argument:

| Input Form | Classification |
|------------|---------------|
| Path ending in `.yaml` or `.yml` that exists on disk | Track A |
| Path to a directory containing `plan_v*.md` | Track A |
| YAML content with top-level `phases:` or `workpackages:` keys | Track A |
| Free-form text, topic, project name, or no argument | Track B |
| Bare invocation with no args | Existing plan operations (see Stage 6) |

If classification is ambiguous, ask the user: "Is this a path to an existing Bulwark plan YAML, or should I create a new plan from this description?"

---

## Stage 1A: Track A — Bulwark Plan Import

MUST be executed when input is classified as Track A.

```bash
bash "${CLEAR_PLUGIN_ROOT}/scripts/plan/plan-import.sh" "<plan_path>"
```

- Capture stdout and stderr.
- On success: report the imported phases, workpackage count, and output location to the user.
- On failure: display the full error output. Do not attempt manual transformation.

---

## Stage 1B–5B: Track B — Intelligent Plan Creation

### Pre-Flight (Stage 1B)

1. Derive a slug from the topic: lowercase, spaces to hyphens, max 40 characters.
   Example: "build a REST API" → `build-a-rest-api`
2. Create the output directory:
   ```bash
   mkdir -p "$PROJECT_DIR/logs/plan-creation/${slug}"
   ```
3. Load the `subagent-prompting` skill. MUST be done before spawning any sub-agent.

### Requirements Analyst (Stage 2B)

Load the `subagent-prompting` skill. Then spawn the Requirements Analyst sub-agent.

Spawn via: `Task(subagent_type="plan-management-requirements-analyst", prompt=...)`

Pass as context:
- The user's topic or brief (verbatim)
- The output path: `$PROJECT_DIR/logs/plan-creation/{slug}/01-requirements.md`
- The project root: `$PROJECT_DIR`

After the sub-agent completes, READ `01-requirements.md` in full before proceeding. Do not proceed to Stage 3B if the file is missing or empty.

### Architect (Stage 3B)

Spawn the Architect sub-agent.

Spawn via: `Task(subagent_type="plan-management-architect", prompt=...)`

Pass as context:
- Path to `01-requirements.md`
- The output path: `$PROJECT_DIR/logs/plan-creation/{slug}/02-architect.md`
- The project root: `$PROJECT_DIR`

After the sub-agent completes, READ `02-architect.md` in full before proceeding. Do not proceed to Stage 4B if the file is missing or empty.

### Detail Engineer (Stage 4B)

Spawn the Detail Engineer sub-agent.

Spawn via: `Task(subagent_type="plan-management-detail-engineer", prompt=...)`

Pass as context:
- Path to `02-architect.md`
- Path to `01-requirements.md` (for traceability)
- The output path: `$PROJECT_DIR/logs/plan-creation/{slug}/03-detail-engineer.md`
- The project root: `$PROJECT_DIR`

After the sub-agent completes, READ `03-detail-engineer.md` in full before proceeding.

### Synthesis (Stage 5B)

Synthesize all three outputs into a master plan YAML structure. The synthesized plan MUST include:

```yaml
version: "1.0"
projectName: "<derived from requirements>"
status: active
created: "<ISO date>"
summary: "<one paragraph from requirements problem statement>"

phases:
  - id: phase_N
    name: "<from architect>"
    description: "<from architect>"
    status: not_started
    workpackages: [<WP IDs>]

workpackages:
  - id: <WP-ID>
    title: "<from architect>"           # IMPORTANT: Use `title:` not `name:`. CLEAR WP YAMLs use `title:`.
    description: "<from architect>"
    status: not_started
    dependencies: [<IDs>]
    estimated_sessions: <from architect>
    confidence: <from architect>
    acceptance_criteria:       # from detail engineer
      - "<criterion>"
    deliverables:              # from detail engineer — structured objects
      - description: "<artifact description>"
        pattern: "<file glob pattern or empty string>"
    scope:                     # from detail engineer
      in_scope:
        - "<what is included>"
      out_of_scope:
        - "<what is excluded>"
    verification:              # from detail engineer
      - "<command or procedure>"
    notes:                     # from detail engineer
      - "<note>"

milestones:
  - id: <M-ID>
    name: "<from architect>"
    phase: <phase_N>
    type: major | minor | gate
    requires: [<WP IDs>]
    status: not_started
```

### Approval Gate (Stage 5B)

Present the synthesized plan to the user:

```
Plan ready for review:

  Project: <name>
  Phases: <N>
  Workpackages: <N>
  Milestones: <N>

[Display full YAML]

Approve this plan and write to .clear/plans/master-plan.yaml? [Y/n/edit]
```

Wait for user response via AskUserQuestion. On "edit", incorporate the user's changes and re-present. On "n", stop and discard.

### Write Plan (Stage 5B)

On approval, pipe the approved YAML through `plan-write-cli.js` (do NOT use the Write tool directly on `.clear/` paths — the PreToolUse guard will block it):

```bash
echo '<approved YAML>' | node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/plan-write-cli.js" --cwd="$PROJECT_DIR"
```

The CLI validates the YAML via `parseMasterPlanContent()`, then delegates to `writeMasterPlan()` which handles directory creation, backup, and serialization.

### Offer Workpackage Creation (Stage 5B)

After writing the plan, ask:

```
Plan written. Create individual workpackage YAML files for each WP? [Y/n]
```

If yes: for each workpackage in the plan, construct a JSON payload and pipe it to `create-cli.js --from-stdin`. This preserves all rich fields (acceptance_criteria, scope, deliverables) across the skill-CLI boundary.

```bash
echo '{
  "phaseId": "<phase system ID>",
  "title": "<WP title>",
  "description": "<WP description>",
  "acceptance_criteria": ["<criterion 1>", "<criterion 2>"],
  "deliverables_text": ["<deliverable 1>", "<deliverable 2>"],
  "scope_in": ["<in-scope item>"],
  "scope_out": ["<out-of-scope item>"],
  "verification": ["<verification step>"],
  "notes": ["<note>"]
}' | node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/create-cli.js" --from-stdin --cwd="$PROJECT_DIR" --phase="<phase-id>"
```

Do NOT write WP YAML files directly — the PreToolUse guard blocks Write/Edit on `.clear/` paths. Do NOT use the Skill tool for WP creation during Stage 5B — use the CLI directly to avoid re-entering the skill system.

---

## Stage 6: Existing Plan Operations (Bare Invocation)

When invoked with no arguments, or when user asks about status, blockers, or next steps:

### Next-Step Recommendations

1. Read `$PROJECT_DIR/.clear/plans/master-plan.yaml`
2. Read `$PROJECT_DIR/.clear/workpackages/` — all WP files
3. Find workpackages where all dependencies have `status: complete`
4. Prioritize: critical path (HIGH), unblocking others (MEDIUM), parallel (LOWER)
5. Present recommendations in ranked list with rationale

### Check for Blockers

```bash
bash "${CLEAR_PLUGIN_ROOT}/scripts/plan/plan-blockers.sh"
```

Present: blocked WP ID, blocker type (dependency / technical / decision), severity, resolution path.

### Update Plan Progress

```bash
bash "${CLEAR_PLUGIN_ROOT}/scripts/plan/plan-progress.sh"
```

Present: overall progress %, phase breakdown, at-risk milestones.

### Milestone Status Update

Mark a milestone complete and append a changelog entry — both via CLI:

```bash
# Step 1: Mark milestone complete in .clear/plans/master-plan.yaml
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/update-cli.js" --cwd="$PROJECT_DIR" --milestone=<id> --status=complete --session-id=<session-id> --session-number=<num>
```

```bash
# Step 2: Append changelog entry to .clear/plans/change-log.yaml
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/update-cli.js" --cwd="$PROJECT_DIR" --changelog --changelog-type=milestone_complete --changelog-milestone=<id> --session-number=<num>
```

**Do NOT use Write or Edit on `.clear/` files.** The CLI handles all `.clear/` mutations via `fs.writeFileSync`, which is invisible to the PreToolUse guard.

Parse each CLI's JSON output to confirm `"status": "success"` before proceeding.

---

## Plan File Locations

| File | Purpose |
|------|---------|
| `$PROJECT_DIR/.clear/plans/master-plan.yaml` | Active plan |
| `$PROJECT_DIR/.clear/plans/change-log.yaml` | Audit trail of plan changes |
| `$PROJECT_DIR/.clear/workpackages/<ID>.yaml` | Per-WP detail files |
| `$PROJECT_DIR/.clear/workpackages/registry.yaml` | WP status index |
| `$PROJECT_DIR/logs/plan-creation/{slug}/01-requirements.md` | Requirements Analyst output |
| `$PROJECT_DIR/logs/plan-creation/{slug}/02-architect.md` | Architect output |
| `$PROJECT_DIR/logs/plan-creation/{slug}/03-detail-engineer.md` | Detail Engineer output |

---

## Automatic Hook Integrations

| Script | Triggered By | What It Does |
|--------|--------------|--------------|
| `scripts/plan/plan-load.sh` | SessionStart hook | Loads active plan and phase context |
| `scripts/plan/plan-progress.sh` | UserPromptSubmit hook | Aggregates progress from workpackages |
| `scripts/plan/plan-blockers.sh` | On demand | Detects and reports blockers |
