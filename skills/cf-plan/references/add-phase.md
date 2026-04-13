# Add Phase to Plan

Adds a new phase to the existing master plan.

---

## Parameters

- `<name>` (optional): Phase name (max 80 chars). If not provided, derive from context.
- `--after <id>`: Insert after this phase (display ID like "Phase-1" or system ID like "ph-12345678"). Default: append at end.

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
1. Use context from current conversation
2. Default to "New Phase"

### 3. Generate Phase

- Create a new phase entry with a unique `systemId` (format: `ph-` followed by 8 hex characters).
- Set status to `not_started`.
- If `--after <id>` was provided, insert after the specified phase.
- Otherwise, append at the end of the phases list.

### 4. Reindex Phases

After insertion, reindex all phase display IDs sequentially (Phase-1, Phase-2, Phase-3, etc.). System IDs (`ph-xxxx`) remain stable and unchanged.

### 5. Write Updated Plan

Write the updated phases list back to `master-plan.yaml`.

### 6. Display Output

```
Phase added: {displayId} - "{name}"

Position: {position} (after {previousPhase})
System ID: {systemId}

Phases:
  {list all phases with displayId, name, and status}
  {mark the new phase with "<- NEW"}
```
