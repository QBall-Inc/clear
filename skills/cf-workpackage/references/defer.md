# Subcommand: defer

Defer a workpackage — marks it as `deferred` and propagates the change to the plan. Defers are explicit pauses with reason metadata; preferred over `pause` when the WP won't resume in the current phase.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<wp-id>` | Yes | Display ID (e.g., `P1.3`, `WP-AUTH.1`) or system ID (`wp-<hex>`) |
| `--reason="<text>"` | No | Reason for deferral (recommended — captured in audit log + plan metadata) |

---

## Valid State Transition

- `not_started` -> `deferred`
- `in_progress` -> `deferred`
- `paused` -> `deferred`

(A `complete` or `archived` WP cannot be deferred.)

---

## Execution

```bash
REASON_FLAG=""
if [[ -n "$REASON" ]]; then REASON_FLAG="--reason=$REASON"; fi
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/lifecycle-cli.js" \
  defer "$WP_ID" $REASON_FLAG \
  --cwd="$PROJECT_DIR" \
  --session-id="$SESSION_ID" --session-number="$SESSION_NUMBER" \
  --clear-dir=./.clear 2>/dev/null)
CONTEXT=$(echo "$RESULT" | jq -r '.message // .error // "Unknown error"')
echo "$CONTEXT"
```

---

## Expected Output

- Workpackage ID and new status: `deferred`
- Reason (if provided), echoed for confirmation
- Updated master-plan.yaml reference (deferral propagated to plan)
- Downstream impact: WPs that depended on this one are now blocked pending resumption or cancellation

---

## Error Handling

- Exit code 2: Workpackage not found.
- Exit code 3: Invalid state transition (e.g., trying to defer an already-complete WP).
- Exit code 1: Invalid usage / missing arguments.
