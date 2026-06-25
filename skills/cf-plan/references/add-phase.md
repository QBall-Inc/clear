# Add Phase to Plan

Adds a new phase to the existing master plan via `phase-cli`. The CLI handles systemId generation, position assignment, display ID reindexing, and atomic write-back to `master-plan.yaml`.

---

## Parameters

- `<name>` (required): Phase name (max 80 chars). If not provided, derive from context.
- `--after=<id>` (optional): Insert after this phase. Accepts display ID (e.g., `phase_1`, `phase_3`) or system ID (e.g., `ph-12a34b56`). Default: append at end.

---

## Steps

### 1. Check Plan Exists

```bash
if [ ! -f ".clear/plans/master-plan.yaml" ]; then
  echo "NO_PLAN"
else
  echo "PLAN_EXISTS"
fi
```

If `NO_PLAN`: Display "No master plan found. Use `/cf-plan create` to create one first." and stop.

### 2. Derive Phase Name

If no explicit name was provided:
1. Use context from current conversation.
2. Default to "New Phase".

### 3. Run phase-cli

```bash
AFTER_FLAG=""
if [[ -n "$AFTER_ID" ]]; then AFTER_FLAG="--after=$AFTER_ID"; fi

RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/phase-cli.js" \
  --cwd="$PROJECT_DIR" \
  --name="$PHASE_NAME" \
  $AFTER_FLAG \
  --session-id="$SESSION_ID" 2>/dev/null)

STATUS=$(echo "$RESULT" | jq -r '.status // .success // "error"')
```

The CLI does the following internally:
- Generates a stable `systemId` (format: `ph-` + 8 hex characters).
- Assigns position based on `--after=<id>` or appends to end.
- Reindexes display IDs for downstream phases (system IDs unchanged).
- Writes the updated `master-plan.yaml` atomically.

### 4. Display Output

```bash
CONTEXT=$(echo "$RESULT" | jq -r '.message // .error // "Unknown error"')
echo "$CONTEXT"
```

Present the new phase's display ID, name, system ID, and position to the user. If downstream phases were renumbered, list the new IDs so the user can update any external references.

---

## Important Notes

**Do NOT manually edit master-plan.yaml.** The PreToolUse guard blocks Write/Edit on `.clear/` paths. `phase-cli` uses `fs.writeFileSync` (invisible to the guard) — always use the CLI.

**Display ID reindexing.** Inserting a phase at position N reindexes all phases after N. If you have references to old display IDs (e.g., in dev plan YAMLs, session handoffs, or knowledge entries), those are NOT auto-updated.

---

## Error Handling

- Exit code 2: Plan file not found (run `/cf-plan create` first).
- Exit code 1: Missing `--name` argument or invalid `--after=<id>`.

---

## Related Subcommands

- `phases` — list existing phases (file-read; use this before adding to choose a sensible `--after`).
- `create` — create a brand-new plan if none exists.
