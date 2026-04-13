#!/bin/bash
# session-precompact.sh - Called before context compaction
#
# Triggered by: PreCompact hook
# Input: JSON via stdin with trigger, custom_instructions, cwd
# Output: stderr only (PreCompact cannot add additionalContext)
#
# Purpose:
#   - Log that compaction is about to occur
#   - Save critical state before context compression
#   - Cannot block compaction (Claude Code limitation)
#
# Note: Per Claude Code docs, PreCompact can only output to stderr.
# The output is shown to user only, not added to context.

export SCRIPT_NAME="session-precompact"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

SCRIPT_NAME="$(basename "$0" .sh)"

# Read input JSON
INPUT=$(cat)

# Extract fields from input
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
TRIGGER=$(echo "$INPUT" | jq -r '.trigger // "unknown"')
# shellcheck disable=SC2034  # Extracted from input for log context
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')

# Define paths
CLEAR_DIR="${CWD}/.clear"
STATE_DIR="${CLEAR_DIR}/state"
STATE_FILE="${STATE_DIR}/session.json"
AUDIT_DIR="${CLEAR_DIR}/audit"

# Check if CLEAR is initialized
if [ ! -d "$CLEAR_DIR" ]; then
  # Not a CLEAR project, exit silently
  exit 0
fi

# Log compaction event
TIMESTAMP=$(date -Iseconds)
echo "[CLEAR] Context compaction imminent (trigger: ${TRIGGER})" >&2

# Read current session state
if [ -f "$STATE_FILE" ]; then
  CURRENT_SESSION_ID=$(jq -r '.sessionId // ""' "$STATE_FILE" 2>/dev/null || echo "")
  CURRENT_STATUS=$(jq -r '.status // ""' "$STATE_FILE" 2>/dev/null || echo "")
  CURRENT_TOKENS=$(jq -r '.tokenUsage.estimate // 0' "$STATE_FILE" 2>/dev/null || echo "0")
  CURRENT_PROMPTS=$(jq -r '.tokenUsage.promptCount // 0' "$STATE_FILE" 2>/dev/null || echo "0")

  # Update last activity timestamp
  jq --arg ts "$TIMESTAMP" '.lastActivity = $ts' \
     "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
else
  CURRENT_SESSION_ID="unknown"
  CURRENT_STATUS="unknown"
  CURRENT_TOKENS="0"
  CURRENT_PROMPTS="0"
fi

# Write to audit log if audit directory exists
if [ -d "$AUDIT_DIR" ]; then
  AUDIT_FILE="${AUDIT_DIR}/session-${CURRENT_SESSION_ID}.log"

  # Append compaction event
  cat >> "$AUDIT_FILE" <<EOF
---
event: precompact
timestamp: ${TIMESTAMP}
trigger: ${TRIGGER}
session_id: ${CURRENT_SESSION_ID}
status: ${CURRENT_STATUS}
tokens_at_compact: ${CURRENT_TOKENS}
prompts_at_compact: ${CURRENT_PROMPTS}
---
EOF
fi

# Drain pending knowledge index rebuild (POST-32: dual-hook drain)
KNOWLEDGE_DRAIN="${SCRIPT_DIR}/../knowledge/knowledge-drain.sh"
if [ -f "$KNOWLEDGE_DRAIN" ]; then
  source "$KNOWLEDGE_DRAIN"
  drain_pending_index "${CLEAR_DIR}" || true
fi

# Inform user that state is preserved
echo "[CLEAR] Session state saved. Context will reload after compaction." >&2

exit 0
