# Subcommand: deps

Validate workpackage dependencies and report blockers. Use to answer "what blocks WP-X?" / "is WP-X ready to start?" without manual registry reads.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--workpackage=<wp-id>` | Yes | Display ID (e.g., `P1.3`, `WP-AUTH.1`) or system ID. Note this is the only WP-CLI that uses `--workpackage=` flag form — positional ID is NOT accepted. |
| `--check-deliverables` | No | Also validate that upstream deliverables exist on disk (not just that the upstream WP is `complete`). |
| `--clear-dir=<path>` | No | `.clear` directory (default: `.clear`) |

---

## Execution

```bash
EXTRA_FLAG=""
if [[ "$*" == *"--check-deliverables"* ]]; then EXTRA_FLAG="--check-deliverables"; fi
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/deps-cli.js" \
  --workpackage="$WP_ID" $EXTRA_FLAG \
  --clear-dir=./.clear 2>/dev/null)
CONTEXT=$(echo "$RESULT" | jq -r '.message // .error // "Unknown error"')
echo "$CONTEXT"
```

---

## Expected Output

- Target WP display ID + current status
- List of upstream WPs with each one's status (resolved from registry.yaml)
- Per-upstream verdict: satisfied (`complete`) / blocking (any other status)
- Overall readiness: ready / blocked
- With `--check-deliverables`: per-upstream deliverable existence checks (file presence on disk for description-extracted paths)

---

## Use Cases

- "What's blocking WP-AUTH.1?" -> `deps-cli --workpackage=WP-AUTH.1`
- "Is WP-AUTH-spike ready?" -> `deps-cli --workpackage=WP-AUTH-spike`
- "Are the deliverables actually on disk for the upstreams?" -> `deps-cli --workpackage=<id> --check-deliverables`

---

## Error Handling

- Exit code 2: Workpackage not found.
- Exit code 1: Missing `--workpackage=<id>` argument.
