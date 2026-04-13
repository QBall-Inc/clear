# Capture Knowledge

Create a knowledge entry using a multi-step CLI workflow.

## Modes

The capture CLI operates in 4 modes, invoked via flags:

| Mode | Flag | Description |
|------|------|-------------|
| Detect | `--detect` | Check if text contains a capture trigger, save pending state |
| Confirm | `--confirm` | Process user confirmation (type, tags, supersession) |
| Create | `--create` | Create the entry from provided fields |
| Check State | `--check-state` | Check if a pending capture exists |

## Arguments

| Argument | Required | Used In | Description |
|----------|----------|---------|-------------|
| `--clear-dir=<path>` | Yes | All | Path to .clear directory |
| `--detect` | Mode | Detect | Enable detect mode |
| `--confirm` | Mode | Confirm | Enable confirm mode |
| `--create` | Mode | Create | Enable create mode |
| `--check-state` | Mode | Check | Enable check-state mode |
| `--text=<text>` | Yes (detect) | Detect | Text to analyze for triggers |
| `--response=<text>` | Yes (confirm) | Confirm | User response to confirmation prompt |
| `--title=<string>` | Yes (create) | Create | Entry title |
| `--type=<type>` | Yes (create) | Create | Entry type: `technical-decision`, `pattern`, `business-rule`, `lesson` |
| `--tags=<csv>` | No | Create | Comma-separated tags (no spaces around commas) |
| `--description=<text>` | No | Create | Entry description/body |
| `--supersedes=<id>` | No | Create | ID of entry this replaces |
| `--session=<number>` | No | Create | Session number for provenance |

## Execution

### Direct create (skip detect/confirm):

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=.clear \
  --create \
  --title="Decision Title" \
  --type=technical-decision \
  --tags="tag1,tag2,tag3" \
  --description="Description of the decision" \
  --session=123
```

### Full workflow (detect → confirm → create):

```bash
# Step 1: Detect trigger in text
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=.clear --detect --text="We decided to use Redis for caching"

# Step 2: Confirm (after user reviews detected type/tags)
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=.clear --confirm --response="yes"

# Step 3: Create (uses pending state from detect+confirm)
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js" \
  --clear-dir=.clear --create --title="Use Redis for caching" --type=technical-decision
```

## Index Update

After creating an entry, the CLI triggers an async index update via a pending marker in `.clear/state/index-pending.json`. This is **not a synchronous rebuild** — if you need the entry to be immediately searchable, run the index CLI explicitly:

```bash
node "$CLEAR_PLUGIN_ROOT/build/infrastructure/knowledge/cli/index-cli.js" --clear-dir=.clear --force
```

## Error Handling

- Exit code 5 if content cannot be classified (detect mode).
- Exit code 0 on successful capture.
