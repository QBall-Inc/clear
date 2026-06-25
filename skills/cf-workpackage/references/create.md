# Subcommand: create

Creates a new workpackage within a phase.

---

## Arguments

| Argument | Required | Description | Example |
|----------|----------|-------------|---------|
| `<phase-id>` | Yes | Phase to create the workpackage in | `phase_1`, `ph-abc123` |
| `<title>` | No | Workpackage title (derived from context if omitted) | `"API Authentication"` |
| `--after <id>` | No | Position after specified workpackage | `--after WP-003` |
| `--type <type>` | No | Workpackage type: feature, bugfix, refactor, documentation, infrastructure | `--type=bugfix` |
| `--priority <pri>` | No | Priority: critical, high, medium, low | `--priority=high` |
| `--from-stdin` | No | Read rich fields (acceptance_criteria, scope, deliverables, etc.) from stdin JSON | See Rich Mode below |

---

## Gather-Before-Create (MANDATORY)

**Before invoking the CLI, you MUST collect these fields:**
- `acceptance_criteria` — what defines "done" for this workpackage
- `scope` — in_scope and out_of_scope items
- `deliverables` — what artifacts will be produced

For **direct user invocation** (e.g., `/cf-workpackage create phase_1`): engage the user conversationally to gather acceptance_criteria, scope, and deliverables before creating the WP. Do NOT create skeleton workpackages with empty fields.

For **programmatic invocation** (e.g., from plan-management Stage 5B): all fields are available from the plan synthesis — construct JSON and pipe via `--from-stdin`.

---

## Execution: Simple Mode (CLI flags)

For basic creation with just title and phase:

```bash
PHASE_ID="$1"
if [ -z "$PHASE_ID" ]; then
  echo "Usage: /cf-workpackage create <phase-id> [<title>] [options]"; exit 1
fi
RESULT=$(node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/create-cli.js" \
  --cwd="$PROJECT_DIR" --phase="$PHASE_ID" --title="<title>" 2>&1)
echo "$RESULT" | jq -r '.message // .error // "Unknown error"'
```

If the CLI returns an error, inspect the output and inform the user with the specific error message. Do NOT retry silently.

## Execution: Rich Mode (--from-stdin)

For creation with full rich fields (preferred when all data is available):

```bash
echo '{
  "phaseId": "<phase system ID>",
  "title": "<WP title>",
  "description": "<WP description>",
  "acceptance_criteria": ["<criterion 1>", "<criterion 2>"],
  "deliverables_text": ["<deliverable 1>", "<deliverable 2>"],
  "scope_in": ["<in-scope item>"],
  "scope_out": ["<out-of-scope item>"],
  "verification": ["<verification step>"],
  "notes": ["<note>"]
}' | node "$CLEAR_PLUGIN_ROOT/build/infrastructure/workpackage/cli/create-cli.js" \
  --from-stdin --cwd="$PROJECT_DIR" --phase="<phase-id>"
```

---

## Expected Output

- New workpackage ID (system and display)
- Phase assignment
- Position within phase
- Initial status: `not_started`

---

## Error Handling

- If `<phase-id>` is missing, display usage and exit with code 1.
- If phase does not exist, exit with code 2.
- If `--from-stdin` is set but no JSON received, exit with code 1.
