# List All Phases

Lists all phases defined in the master plan.

---

## Steps

### 1. Check Plan Exists

```bash
if [ ! -f ".clear/plans/master-plan.yaml" ]; then
  echo "No plan found."
  exit 0
fi
```

### 2. Extract and Display Phases

```bash
echo "Plan Phases"
echo "==========="
echo ""

if command -v yq &> /dev/null; then
  yq -r '.phases[]? | "\(.id): \(.name) (\(.status // "unknown"))"' .clear/plans/master-plan.yaml 2>/dev/null
else
  grep -A 2 "^phases:" .clear/plans/master-plan.yaml | head -20
  echo ""
  echo "(Install yq for better YAML parsing)"
fi
```

### 3. Display Output

Present the phase list to the user showing each phase's display ID, name, and status. When `yq` is available, output is cleanly formatted; otherwise a basic grep extraction is used with a note about installing yq.

---

## Related Subcommands

- `addPhase` -- add a new phase to the plan
- `progress` -- view progress breakdown by phase
