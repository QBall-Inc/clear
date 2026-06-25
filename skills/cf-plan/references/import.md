# Track A — Import Existing Plan YAML

Imports an existing plan YAML (or a directory containing `plan_v*.md`) into `.clear/plans/master-plan.yaml`. Invoked when `/cf-plan create` receives a path argument that resolves to either:

- A `.yaml` / `.yml` file with top-level `phases:` or `workpackages:` keys, OR
- A directory containing `plan_v*.md` files

Track A delegates the heavy lifting to `plan-import.sh`, which performs schema validation, phase indexing, workpackage extraction, and atomic write.

---

## Pre-Condition

`create.md` (the router) has already:

1. Verified that no existing `master-plan.yaml` blocks the import (or that `--force` was passed).
2. Classified the argument as a Track A path.
3. Routed here.

---

## Steps

### 1. Invoke `plan-import.sh` with JSON via stdin

`plan-import.sh` reads its input as a JSON envelope on stdin (not positional args). Construct the payload and pipe it in:

```bash
echo '{
  "cwd": ".",
  "plan_path": "<plan_path>",
  "force": "false",
  "session_id": "'"$CLAUDE_SESSION_ID"'",
  "session_number": "'"$CLEAR_SESSION_NUMBER"'"
}' | bash "${CLEAR_PLUGIN_ROOT}/scripts/plan/plan-import.sh"
```

- `plan_path` — the path the user provided (file or directory).
- `force` — set to `"true"` only when the user originally supplied `--force`; otherwise `"false"`.
- `session_id`, `session_number` — pass through from the current session environment.

Capture both stdout and stderr.

### 2. Report Results

On success: the script emits JSON to stdout with `status: "success"`, plus `phases_imported`, `workpackages_imported`, and `output_path`. Parse with `jq` and display:

```
Plan imported successfully.

  Phases imported:        <N>
  Workpackages imported:  <M>
  Plan location:          <output_path>
```

On failure: the script emits JSON with `status: "error"` and an `additionalContext` field describing the failure. Display the full error verbatim. Do not attempt manual transformation; the import CLI is the source of truth for parse semantics.

---

## Do NOT

- Do NOT attempt to parse `<plan_path>` directly with `yq` / `cat` / `Read` before invoking the script — the CLI performs the canonical schema validation.
- Do NOT write to `.clear/plans/master-plan.yaml` directly — the PreToolUse guard blocks Write/Edit on `.clear/` paths.
- Do NOT re-invoke `plan-management` via `Skill()` — Track A is fully self-contained here.
- Do NOT pass `<plan_path>` as a positional arg — `plan-import.sh` reads JSON from stdin only; positional args are ignored.
