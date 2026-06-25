#!/bin/bash
# session-handoff.sh - Generate session handoff document
#
# Triggered by: session-monitor.sh at critical threshold, or manual invocation
# Input: JSON via stdin with session_id, cwd, manual (optional)
# Output: JSON with additionalContext pointing to handoff document
#
# Creates:
#   .clear/sessions/session_[N]_[YYYYMMDD].md - Handoff document
#
# Template Design:
#   - Single YAML frontmatter contains ALL metrics (machine-parseable)
#   - Markdown body is for human context (not parsed by metrics script)
#   - Placeholder values (0) should be updated by Claude before finalizing

export SCRIPT_NAME="session-handoff"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"

SCRIPT_NAME="$(basename "$0" .sh)"

# Read input JSON
INPUT=$(cat)

# Extract fields from input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
CWD=$(canonicalize_cwd "$(echo "$INPUT" | jq -r '.cwd // "."')")
MANUAL=$(echo "$INPUT" | jq -r '.manual // false')

# Define paths
CLEAR_DIR="${CWD}/.clear"
STATE_DIR="${CLEAR_DIR}/state"
SESSIONS_DIR="${CLEAR_DIR}/sessions"
STATE_FILE="${STATE_DIR}/session.json"
SYNC_STATE_FILE="${STATE_DIR}/sync-state.json"

# Check if session is initialized
if [ ! -f "$STATE_FILE" ]; then
  echo '{"status": "no_session", "error": "Session not initialized"}'
  exit 0
fi

# Read current state
CURRENT_STATE=$(cat "$STATE_FILE")

# Check if handoff already prepared (skip if already done, unless manual)
HANDOFF_PREPARED=$(echo "$CURRENT_STATE" | jq -r '.handoff.prepared // false')
if [ "$HANDOFF_PREPARED" = "true" ] && [ "$MANUAL" = "false" ]; then
  EXISTING_PATH=$(echo "$CURRENT_STATE" | jq -r '.handoff.documentPath // ""')
  jq -n \
    --arg path "$EXISTING_PATH" \
    '{
      "status": "already_prepared",
      "documentPath": $path
    }'
  exit 0
fi

# Extract session info
SESSION_NUMBER=$(echo "$CURRENT_STATE" | jq -r '.clearSessionNumber // 0')
# shellcheck disable=SC2034  # Extracted from state for potential use
START_TIME=$(echo "$CURRENT_STATE" | jq -r '.startTime // ""')
PROMPT_COUNT=$(echo "$CURRENT_STATE" | jq -r '.tokenUsage.promptCount // 0')
TOKEN_ESTIMATE=$(echo "$CURRENT_STATE" | jq -r '.tokenUsage.estimate // 0')
CACHE_READ_TOKENS=$(echo "$CURRENT_STATE" | jq -r '.tokenUsage.cacheReadTokens // 0')

# Get current timestamp and date
TIMESTAMP=$(date -Iseconds)
DATE_STAMP=$(date +%Y%m%d)
DATE_HUMAN=$(date +"%Y-%m-%d")

# Calculate token percentage
TOKEN_PERCENT=$(awk "BEGIN { printf \"%.0f\", $TOKEN_ESTIMATE * 100 }")

# Ensure sessions directory exists
mkdir -p "$SESSIONS_DIR"

# Define handoff document path
HANDOFF_FILE="${SESSIONS_DIR}/session_${SESSION_NUMBER}_${DATE_STAMP}.md"

# Get git status if available
GIT_STATUS=""
GIT_BRANCH=""
if command -v git &> /dev/null && [ -d "${CWD}/.git" ]; then
  GIT_BRANCH=$(cd "$CWD" && git branch --show-current 2>/dev/null || echo "unknown")
  # shellcheck disable=SC2034  # Extracted for potential handoff content
  GIT_STATUS=$(cd "$CWD" && git --no-optional-locks status --porcelain 2>/dev/null | head -30 || echo "")
fi

# AC4 multi-source workpackage lookup —
# Primary: workpackage.json activeWorkpackage (displayId) + registry.yaml title.
# Fallback: sync-state.json (backward compat) → "Not set". yq runtime-detected
# per S163 D2; awk fallback parses registry.yaml when yq is absent.
# Note: "completed this session" marker (S163 D3) deferred — workpackage.json
# tracks only the current active WP, not per-WP history, so the data needed
# to implement the marker is not yet plumbed. See WP-DF3 / follow-up POST.
WORKPACKAGE_ID=""
WORKPACKAGE_NAME=""
WP_STATE_FILE="${STATE_DIR}/workpackage.json"
REGISTRY_FILE="${CLEAR_DIR}/workpackages/registry.yaml"

if [ -f "$WP_STATE_FILE" ]; then
  WORKPACKAGE_ID=$(jq -r '.activeWorkpackage // empty' "$WP_STATE_FILE" 2>/dev/null)
fi

if [ -n "$WORKPACKAGE_ID" ] && [ -f "$REGISTRY_FILE" ]; then
  if command -v yq >/dev/null 2>&1; then
    WORKPACKAGE_NAME=$(yq -r ".workpackages[] | select(.id == \"${WORKPACKAGE_ID}\") | .title // \"\"" "$REGISTRY_FILE" 2>/dev/null)
  else
    # awk regex uses \047 (octal for single quote) to avoid bash quoting hell.
    WORKPACKAGE_NAME=$(awk -v target="$WORKPACKAGE_ID" '
      /^  - id:[[:space:]]/ {
        val = $0
        sub(/^  - id:[[:space:]]*/, "", val)
        sub(/[[:space:]]*$/, "", val)
        sub(/^[\047"]/, "", val)
        sub(/[\047"]$/, "", val)
        in_target = (val == target)
        next
      }
      in_target && /^    title:[[:space:]]/ {
        sub(/^    title:[[:space:]]*/, "", $0)
        sub(/[[:space:]]*$/, "", $0)
        sub(/^[\047"]/, "", $0)
        sub(/[\047"]$/, "", $0)
        print
        exit
      }
    ' "$REGISTRY_FILE")
  fi
fi

# Fallback to sync-state.json (backward compat) if workpackage.json was empty.
if [ -z "$WORKPACKAGE_ID" ] && [ -f "$SYNC_STATE_FILE" ]; then
  SYNC_STATE=$(cat "$SYNC_STATE_FILE")
  WORKPACKAGE_ID=$(echo "$SYNC_STATE" | jq -r '.workpackage.displayId // ""')
  WORKPACKAGE_NAME=$(echo "$SYNC_STATE" | jq -r '.workpackage.title // ""')
fi

# Build workpackage string
if [ -n "$WORKPACKAGE_ID" ] && [ -n "$WORKPACKAGE_NAME" ]; then
  WORKPACKAGE_STR="${WORKPACKAGE_ID} - ${WORKPACKAGE_NAME}"
elif [ -n "$WORKPACKAGE_ID" ]; then
  WORKPACKAGE_STR="${WORKPACKAGE_ID}"
else
  WORKPACKAGE_STR="Not set"
fi

# Generate handoff document with comprehensive YAML frontmatter
cat > "$HANDOFF_FILE" << EOF
---
# Session Identity
session: ${SESSION_NUMBER}
date: ${DATE_HUMAN}
workpackage: "${WORKPACKAGE_STR}"
branch: ${GIT_BRANCH}
status: PARTIAL

# Token Metrics
tokens_pct: ${TOKEN_PERCENT}
tokens_count: ${CACHE_READ_TOKENS}
conversation_turns: ${PROMPT_COUNT}

# Code Files (update before finalizing)
prod_files_created: 0
prod_files_modified: 0
test_files_created: 0
test_files_modified: 0

# Lines of Code (update before finalizing)
lines_prod: 0
lines_test: 0
lines_docs: 0

# Documentation Files (update before finalizing)
docs_created: 0
docs_modified: 0

# Test Results (update before finalizing)
tests_passed: 0
tests_failed: 0
tests_total: 0

# Session Metadata
complexity: medium
decisions_count: 0
actual_hours: 2.5
---

# Session ${SESSION_NUMBER} Handoff

## Summary

<!-- 1-2 sentence summary of what was accomplished this session -->

## Completed Items

- [ ] Item 1
- [ ] Item 2

## In Progress

- [ ] Current task (if any)

## Technical Decisions

<!-- Document key decisions with rationale -->

### TD-XXX: [Decision Title]
- **Decision:** What was decided
- **Rationale:** Why this choice was made
- **Impact:** What this affects

## Patterns Established

<!-- Patterns established or refined this session. One bullet per pattern.
     Include the PAT-N ID if you captured this via /cf-knowledge.
     Leave bullets empty if nothing applies. -->
- **<pattern-name>**: <description>

## Learnings

<!-- Discrete session learnings. One bullet per learning.
     Include the LES-N ID if you captured this via /cf-knowledge.
     Leave bullets empty if nothing applies. -->
- <learning>

## Patterns Observed

<!-- Patterns observed in-session but not yet established as canonical.
     One bullet per observation. Leave bullets empty if nothing applies. -->
- <observation>

## Changes This Session

<!-- List knowledge/plan/workpackage changes - details in audit log -->

### Knowledge Updates
- None

### Plan/Workpackage Updates
- None

### Deprecations
- None

> Full change audit: \`.clear/audit/session_${SESSION_NUMBER}.jsonl\`

## Code Changes

| File | Type | Change |
|------|------|--------|
| path/to/file.ts | prod | Description |

## Test Results

<!-- Update with actual test results -->
\`\`\`
X/Y tests passing
\`\`\`

## Next Session Priorities

1. **P1:** First priority
2. **P2:** Second priority

## Blockers / Unresolved

- None

## Resume

\`\`\`bash
claude --resume ${SESSION_ID}
\`\`\`

---
*Generated by CLEAR Framework session-handoff.sh at ${TIMESTAMP}*
*Update YAML frontmatter metrics before finalizing*
EOF

# Update session state to mark handoff as prepared
jq --arg path "$HANDOFF_FILE" \
   --arg ts "$TIMESTAMP" \
   '.handoff.prepared = true |
    .handoff.documentPath = $path |
    .handoff.preparedAt = $ts' \
   "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"

# Prepare output message
if [ "$MANUAL" = "true" ]; then
  CONTEXT_MSG="📝 [CLEAR] Handoff document created manually
Path: ${HANDOFF_FILE}
Please review and enhance the document with:
- Completed work details
- Technical decisions made
- Next session priorities

Resume command: claude --resume ${SESSION_ID}"
else
  CONTEXT_MSG="📝 [CLEAR] Handoff document auto-generated
Path: ${HANDOFF_FILE}
Token usage at ${TOKEN_PERCENT}% - please complete current task and review handoff.

Resume command: claude --resume ${SESSION_ID}"
fi

# Return JSON response
jq -n \
  --arg context "$CONTEXT_MSG" \
  --arg path "$HANDOFF_FILE" \
  --arg sessionId "$SESSION_ID" \
  --argjson sessionNumber "$SESSION_NUMBER" \
  '{
    "additionalContext": $context,
    "documentPath": $path,
    "sessionId": $sessionId,
    "clearSessionNumber": $sessionNumber,
    "status": "success"
  }'

exit 0
