# Subcommand: start

Activates a workpackage, transitioning it to `in_progress`.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<id>` | No | Workpackage ID to start. If omitted, resolves the next WP via next-cli.js and confirms with user. |
| `--force` | No | Start even if dependencies are not fully satisfied |

---

## Valid State Transitions

- `not_started` -> `in_progress` (requires dependencies satisfied, or `--force`)
- `paused` -> `in_progress`

---

## Execution

### Step 1 — Resolve workpackage ID

```bash
WP_ID="$1"
FORCE_FLAG=""
if [[ "$*" == *"--force"* ]]; then FORCE_FLAG="--force"; fi
```

If `WP_ID` is empty (user said "start the next workpackage" without specifying an ID):

```bash
if [ -z "$WP_ID" ]; then
  NEXT_RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/plan/cli/next-cli.js" --clear-dir=./.clear 2>/dev/null)
  NEXT_STATUS=$(echo "$NEXT_RESULT" | jq -r '.status // "error"')
  if [ "$NEXT_STATUS" = "success" ]; then
    NEXT_WP=$(echo "$NEXT_RESULT" | jq -r '.nextWorkpackage // ""')
    NEXT_NAME=$(echo "$NEXT_RESULT" | jq -r '.nextWorkpackageName // ""')
    echo "IMPLICIT_RESOLVE: $NEXT_WP ($NEXT_NAME)"
  else
    echo "Could not resolve next workpackage: $(echo "$NEXT_RESULT" | jq -r '.message // .error // "No recommendation available"')"
    exit 1
  fi
fi
```

When `IMPLICIT_RESOLVE` is returned, **you MUST confirm with the user** before proceeding:
- Ask: "The next workpackage is **{NEXT_WP}** ({NEXT_NAME}). Start it?"
- If the user confirms, set `WP_ID` to the resolved ID and continue to Step 2.
- If the user declines, stop.

### Step 2 — Execute start

```bash
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/lifecycle-cli.js" start "$WP_ID" $FORCE_FLAG --clear-dir=./.clear 2>/dev/null)
CONTEXT=$(echo "$RESULT" | jq -r '.message // .error // "Unknown error"')
echo "$CONTEXT"
```

---

## Expected Output

**Success:** Workpackage ID, new status `in_progress`, start timestamp.

**Blocked:** Dependency details showing which upstream workpackages are incomplete.

---

## Error Handling

- If `<id>` is missing and next-cli.js cannot resolve a next WP, display error and exit with code 1.
- If blocked by dependencies (without `--force`), exit with code 4.
- If invalid state transition, exit with code 3.
