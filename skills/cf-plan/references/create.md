# Create or Import Plan

Routes plan creation to one of two tracks:

- **Track A — Import** (`references/import.md`): the argument is a path to an existing plan YAML (or directory containing `plan_v*.md`).
- **Track B — Create from scratch** (`references/create-from-scratch.md`): the argument is a free-form topic, brief, or project description.

This file performs classification + the existing-plan pre-check, then loads the appropriate track's reference file.

---

## Parameters

- `<path-or-topic>` (optional): Either a path to a plan YAML file/directory (Track A) or a free-text topic/brief (Track B). If omitted, prompt the user.
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

### 2. Classify the Argument

Apply this table in order:

| Input Form | Classification |
|------------|---------------|
| Path ending in `.yaml` or `.yml` that exists on disk | Track A |
| Path to a directory containing one or more `plan_v*.md` files | Track A |
| Free-form text, topic, project name | Track B |
| Bare invocation with no arguments | Ambiguous — ask the user |

Implementation hints:

- For path detection: `test -f "<arg>"` plus extension check, OR `test -d "<arg>" && ls "<arg>"/plan_v*.md 2>/dev/null`.
- If neither matches but the argument is non-empty: classify as Track B.

### 3. Resolve Ambiguity (if needed)

If classification is ambiguous (no argument provided, or argument is a path-like string that doesn't resolve to either a `.yaml` file or a directory with `plan_v*.md`), present an `AskUserQuestion`:

- Question: "Is this a path to an existing plan YAML, or should I create a new plan from this description?"
- Options:
  - "Import existing plan" — proceed as Track A; ask for path if missing
  - "Create from scratch" — proceed as Track B; use the original argument (or ask for a topic if empty)

### 4. Route to the Track's Reference File

- **Track A**: load `references/import.md` and continue execution there. Pass through the resolved path + any `--force` / `--skip-workpackages` flags the user supplied.
- **Track B**: load `references/create-from-scratch.md` and continue execution there. Pass through the topic / brief text.

### 5. Display Output

After the track completes, confirm the result to the user. Each track handles its own output formatting (see `import.md` and `create-from-scratch.md`).

---

## Do NOT

- Do NOT invoke `plan-management` via `Skill()` here. The Track A and Track B logic lives in `import.md` and `create-from-scratch.md` directly — no skill chaining.
- Do NOT attempt to classify ambiguous input silently; surface the ambiguity to the user via `AskUserQuestion`.
- Do NOT write to `.clear/plans/master-plan.yaml` from this router file — only the tracks write, and only via the CLIs.
