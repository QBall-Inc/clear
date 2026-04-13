# Create or Import Plan

Creates a new master plan. Delegates all classification and execution to the `plan-management` skill.

---

## Parameters

- `<path-or-topic>` (optional): Either a path to a Bulwark plan file/directory (Track A) or a free-text topic/brief (Track B). If omitted, plan-management will derive context from the project.
- `--force`: Overwrite existing plan (creates backup first).

---

## Steps

### 1. Check for Existing Plan

```bash
if [ -f ".clear/plans/master-plan.yaml" ]; then
  echo "PLAN_EXISTS"
else
  echo "NO_PLAN"
fi
```

If `PLAN_EXISTS` and `--force` was NOT passed: Display "A master plan already exists. Use `--force` to overwrite (a backup will be created)." and stop.

### 2. Invoke plan-management Skill

Use the Skill tool to invoke `plan-management`. Pass the user's argument (path, topic, or empty) as the args parameter:

```
Skill(skill="plan-management", args="<user's argument>")
```

The plan-management skill will:
- **Classify the input** as Track A (Bulwark plan import) or Track B (intelligent creation)
- **Execute the appropriate track**
- **Report results** back to the user

You do NOT need to classify the input yourself — plan-management handles all routing. Do NOT read the plan-management SKILL.md directly — invoke it via the Skill tool.

### 3. Display Output

After plan-management completes, confirm the result to the user. The plan-management skill will handle all output formatting.
