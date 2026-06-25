# Subcommand: reorder

Reorder a workpackage to a different 1-based position within its phase. Display IDs are position-derived, so reordering changes the display ID and propagates to master-plan.yaml.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<wp-id>` | Yes | Display ID (e.g., `P1.3`, `WP-AUTH.1`) or system ID (`wp-<hex>`) |
| `--position=<N>` | Yes | 1-based target position within the phase |

---

## Execution

```bash
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/lifecycle-cli.js" \
  reorder "$WP_ID" --position="$POSITION" \
  --cwd="$PROJECT_DIR" \
  --session-id="$SESSION_ID" --session-number="$SESSION_NUMBER" \
  --clear-dir=./.clear 2>/dev/null)
CONTEXT=$(echo "$RESULT" | jq -r '.message // .error // "Unknown error"')
echo "$CONTEXT"
```

---

## Expected Output

- Old position -> new position confirmation
- Old display ID -> new display ID (display IDs are position-derived, so reordering rebases the visible ID)
- Affected sibling WPs: their display IDs shift to accommodate the move
- Updated master-plan.yaml reference

---

## Important Notes

**Display IDs change** — A reorder operation re-assigns display IDs across the phase. SystemIds remain stable. If you have references to the old display ID in dev plan YAMLs, session handoffs, or knowledge entries, those references are NOT auto-updated. Cross-reference impact before reordering high-traffic WPs.

**No effect on dependencies** — Reordering does NOT modify `dependencies.upstream` / `dependencies.downstream` arrays (those track systemIds, not display IDs).

---

## Error Handling

- Exit code 2: Workpackage not found.
- Exit code 1: Invalid `--position` (out of range, non-positive integer, or missing).
