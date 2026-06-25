# Plan Update

Programmatic plan state updates: change active phase, mark milestones complete, or trigger plan rollup.

**IMPORTANT: Most of these operations auto-fire.** Read "Automatic State Advancement" below before invoking manually — redundant manual updates may conflict with auto-advance.

---

## Automatic State Advancement (K0 Behavior)

| Auto-Transition | Fires When |
|-----------------|------------|
| Milestone auto-completes | All WPs in the milestone's `requires:` list hit `status: complete` |
| activePhase auto-advances | Current phase's required milestones all complete |
| master-plan.yaml write-back | Any state-mutating CLI invocation (lifecycle-cli, update-cli) |

**Use manual `--milestone= --status=complete`** only when the milestone's WPs do NOT all show complete but the milestone's intent has been satisfied (e.g., one WP deferred), or to set non-complete statuses.

**Use manual `--active-phase=`** only as a transient override (auto-advance will replay over it on the next state change in a phase).

---

## Subcommands

### Set Active Phase

```bash
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/update-cli.js" \
  --cwd=. --clear-dir=./.clear \
  --active-phase="$PHASE_ID" \
  --session-id="$CLAUDE_SESSION_ID" \
  --session-number="$CLEAR_SESSION_NUMBER" 2>/dev/null)

STATUS=$(echo "$RESULT" | jq -r '.status')
if [ "$STATUS" = "success" ]; then
  echo "$RESULT" | jq -r '.message'
else
  echo "Error: $(echo "$RESULT" | jq -r '.error')"
fi
```

Where `$PHASE_ID` is either a display ID (e.g., `Phase-2`) or a system ID (e.g., `ph-a1b2c3d4`).

### Mark Milestone Complete

```bash
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/update-cli.js" \
  --cwd=. --clear-dir=./.clear \
  --milestone="$MILESTONE_ID" --status=complete \
  --session-id="$CLAUDE_SESSION_ID" \
  --session-number="$CLEAR_SESSION_NUMBER" 2>/dev/null)

STATUS=$(echo "$RESULT" | jq -r '.status')
if [ "$STATUS" = "success" ]; then
  echo "$RESULT" | jq -r '.message'
else
  echo "Error: $(echo "$RESULT" | jq -r '.error')"
fi
```

### Trigger Plan Rollup

Recalculates phase progress from workpackage completion status and writes results back to master-plan.yaml.

```bash
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/update-cli.js" \
  --cwd=. --clear-dir=./.clear \
  --rollup \
  --session-id="$CLAUDE_SESSION_ID" \
  --session-number="$CLEAR_SESSION_NUMBER" 2>/dev/null)

STATUS=$(echo "$RESULT" | jq -r '.status')
if [ "$STATUS" = "success" ]; then
  echo "$RESULT" | jq -r '.message'
else
  echo "Error: $(echo "$RESULT" | jq -r '.error')"
fi
```

---

## Notes

- `--active-phase` accepts both display IDs and system IDs
- `--milestone` currently only supports `--status=complete`
- `--rollup` writes updated progress and derived phase status back to master-plan.yaml (with backup)
- All operations update plan.json state and output JSON to stdout
