# Subcommand: update

Comprehensive mutation surface for an existing workpackage. Two modes: WP-level field updates, and per-deliverable field updates.

---

## Arguments

### WP-level mode

```bash
update-cli <wp-id> [flags]
```

| Flag | Description |
|------|-------------|
| `<wp-id>` | Required. Display ID (e.g., `P1.3`, `WP-AUTH.1`) or system ID (`wp-<hex>`) |
| `--status=<s>` | One of `not_started`, `in_progress`, `paused`, `blocked`, `complete`, `deferred`, `archived` |
| `--description="<text>"` | Replace WP description |
| `--acceptance-criteria=<json>` OR `--acceptance-criteria-file=<path>` | Replace acceptance criteria array |
| `--deliverables=<json>` OR `--deliverables-file=<path>` | Replace deliverables array |
| `--verification=<json>` OR `--verification-file=<path>` | Replace verification array |
| `--notes=<json>` OR `--notes-file=<path>` | Replace notes array |
| `--in-scope=<json>` OR `--in-scope-file=<path>` | Replace scope.in_scope array |
| `--out-of-scope=<json>` OR `--out-of-scope-file=<path>` | Replace scope.out_of_scope array |
| `--upstream=<json>` OR `--upstream-file=<path>` | Replace dependencies.upstream array |
| `--downstream=<json>` OR `--downstream-file=<path>` | Replace dependencies.downstream array |
| `--force` | Allow status transitions normally rejected (e.g., complete -> not_started) |

### Per-deliverable mode

```bash
update-cli <wp-id> deliverable <del-id> [flags]
```

| Flag | Description |
|------|-------------|
| `<del-id>` | Required. Deliverable ID from WP YAML's `deliverables[].id` |
| `--status=<s>` | Deliverable-level: `not_started`, `in_progress`, `complete` |
| `--description="<text>"` | Replace deliverable description |
| `--weight=<n>` | Non-negative integer; see Weight Conventions in `cf-workpackage/SKILL.md` |
| `--pattern=<glob>` | Filename glob for hook-driven auto-promotion |

### Common flags

| Flag | Description |
|------|-------------|
| `--clear-dir=<path>` | `.clear` directory (default: `<cwd>/.clear`) |
| `--cwd=<path>` | Working directory (default: `.`) |
| `--session-id=<id>` | Required (with --session-number) for audit log emission |
| `--session-number=<n>` | Required (with --session-id) for audit log emission |

---

## Execution

### WP-level update

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/update-cli.js" \
  "$WP_ID" \
  --status="$STATUS" \
  --description="$DESC" \
  --cwd="$PROJECT_DIR" \
  --session-id="$SESSION_ID" --session-number="$SESSION_NUMBER" \
  --clear-dir=./.clear
```

### Per-deliverable update

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/update-cli.js" \
  "$WP_ID" deliverable "$DEL_ID" \
  --status="$DEL_STATUS" \
  --pattern="$PATTERN" \
  --cwd="$PROJECT_DIR" \
  --session-id="$SESSION_ID" --session-number="$SESSION_NUMBER" \
  --clear-dir=./.clear
```

### Revert stub-triggered premature completion

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/update-cli.js" \
  "$WP_ID" deliverable "$DEL_ID" --status=in_progress \
  --cwd="$PROJECT_DIR" --clear-dir=./.clear
```

---

## Important Behavioral Notes

**Audit log gating** — Audit log entries (`workpackage/update`) emit only when BOTH `--session-id` AND `--session-number` are passed. Production hook chains forward these from `.clear/state/session.json` automatically; direct CLI users supply them explicitly. If either is absent, the update succeeds but no audit row is written.

**YAML comment loss** — `update-cli` writes via yaml.dump round-trip, which does NOT preserve comments in the WP YAML. If a WP YAML has hand-authored comments that matter, hand-edit it directly (after pausing CLI mutations) rather than running update-cli.

**Atomic write** — Schema validation runs pre-write; on validation failure the YAML is left unchanged. Writes are atomic (temp file + rename).

**Auto-promotion interaction** — The PostToolUse hook may auto-advance a deliverable on file write before you call update-cli explicitly. See "Auto-Promotion" in `cf-workpackage/SKILL.md` for details + the revert pattern above.

---

## Error Handling

- Exit code 2: Workpackage or deliverable not found.
- Exit code 3: Invalid state transition (use `--force` if intentional).
- Exit code 5: Schema validation failed — YAML left unchanged.
- Exit code 1: Invalid usage or missing arguments.
