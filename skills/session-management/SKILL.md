---
name: session-management
version: 1.0.0
author: Ashay Kubal @ Qball Inc.
description: "Use when PERFORMING session actions: checking token usage, preparing handoffs, or ending sessions early. Do NOT load for questions about past sessions or reading historical handoff documents."
tags: session, lifecycle, handoff, token-management
allowed-tools: Read, Write, Bash, Glob
---

> **CLI Usage:** When unsure about a CLI's interface or flags, run it with `--help` first. Do NOT attempt to discover functionality by reading plugin source code — doing so leads to incorrect execution from assumptions made without context of the holistic flow.

# Session Management Skill

## Purpose

This skill provides guidance for Claude on managing session lifecycle in the CLEAR framework. It explains token thresholds, handoff procedures, and how to manually invoke session operations.

## When to Take Action vs. Just Answer

### TAKE ACTION (run scripts) when user says:
- "check my token usage" / "how much context have I used"
- "prepare session handoff" / "prepare for handoff"
- "end session early" / "wrap up this session"
- "initialize session tracking"

### JUST READ FILES (no scripts) when user asks:
- "have we completed the handoff?" → Check `.clear/state/session.json`
- "what was in the last handoff?" → Read `.clear/sessions/*.md`
- "how many sessions have we had?" → Read `.clear/state/session-history.json`
- "what happened in session 14?" → Read the specific session file

## Manual Invocation

When the user requests a session action, run the appropriate script.

**Script Location**: `scripts/session/` in the CLEAR plugin directory

### Check Token/Context Usage

**User says**: "check my token usage", "how much context am I using"

**Action**: Run the session monitor script
```bash
echo '{"session_id":"manual","cwd":"'$(pwd)'","hook_event_name":"Manual"}' | "$CLEAR_PLUGIN_ROOT/scripts/session/session-monitor.sh"
```

**Present to user**: The estimated token usage percentage and prompt count.

### Prepare Session Handoff

**User says**: "prepare session handoff", "prepare for handoff", "end session early"

**Action**: Run the session handoff script
```bash
echo '{"session_id":"manual","cwd":"'$(pwd)'","manual":true}' | "$CLEAR_PLUGIN_ROOT/scripts/session/session-handoff.sh"
```

**Present to user**:
- Path to the generated handoff document
- Resume command for next session
- Prompt user to review and enhance the handoff content

### Initialize Session (if needed)

**User says**: "initialize session tracking", "start session tracking"

**Action**: Run the session init script
```bash
echo '{"session_id":"manual-'$(date +%s)'","cwd":"'$(pwd)'","hook_event_name":"Manual"}' | "$CLEAR_PLUGIN_ROOT/scripts/session/session-init.sh"
```

**Present to user**: Confirmation of session initialization with session number.

## How Automatic Session Automation Works

The CLEAR plugin includes hook scripts that handle session events automatically:

| Script | Triggered By | What It Does |
|--------|--------------|--------------|
| `session-init.sh` | SessionStart hook | Creates session state, initializes tracking |
| `session-monitor.sh` | UserPromptSubmit hook | Tracks prompt count, estimates token usage |
| `session-handoff.sh` | Called by monitor at 75% | Generates handoff document |
| `session-finalize.sh` | Stop hook | Persists final state (runs silently) |

These run automatically. Manual invocation (above) is for on-demand user requests.

## Token Thresholds

The scripts monitor token consumption against these thresholds:

| Threshold | Default | Action |
|-----------|---------|--------|
| Warning | 60% | Prepare for handoff, complete current task |
| Critical | 75% | Handoff document generated automatically |
| Emergency | 85% | Stop new work immediately |

## Understanding Session State

The scripts maintain state in `.clear/state/session.json`:

```json
{
  "sessionId": "uuid-from-claude-code",
  "clearSessionNumber": 15,
  "tokenUsage": { "estimate": 0.45, "promptCount": 12 },
  "status": "active",
  "handoff": { "prepared": false }
}
```

## Session Files Reference

| File | Purpose |
|------|---------|
| `.clear/state/session.json` | Current session state |
| `.clear/state/session-history.json` | Recent sessions (last 10) |
| `.clear/sessions/session_[N]_[DATE].md` | Handoff documents |
| `.clear/config/session-management.yaml` | Configuration overrides |

## Configuration

The scripts read configuration from `.clear/config/session-management.yaml` if it exists:

```yaml
session_management:
  token_thresholds:
    warning: 0.60
    critical: 0.75
    emergency: 0.85
```

