#!/usr/bin/env bash
#
# Shared formatters for PreToolUse + PostToolUse knowledge-banner output.
#
# format_linked_entry_list reads newline-delimited entry IDs on stdin
# (one ID per line) and emits a single comma-space-delimited string on
# stdout. No truncation. No "... and N more" ellipsis. No filtering.
#
# Precondition: entry IDs MUST be slug-safe — no spaces, no commas, no
# control chars. Current callers (pre-tool.sh, post-tool.sh) read IDs
# from the knowledge index where entries are validated by isValidId
# (slug-format gate). Future callers MUST validate before invoking,
# or pre-sanitize via sanitize_for_context. Malformed input is not
# rejected by the helper itself — out-of-contract input would produce
# malformed joined output reaching Claude's context window.
#
# Why no truncation: tracker observed a load-bearing entry (TD-032,
# V1 product scope) silently hidden under a prior MAX_DISPLAY=5
# truncation. The "false sense of completeness" class — quality-gate
# hooks must NEVER hide signal under an ellipsis. Token budget for
# the knowledge banner is ~200 tokens; even 20 entries (8 chars each)
# fit comfortably. If future telemetry shows the list growing past
# the budget, REVISIT this comment and propose a DIFFERENT solution
# (e.g., emit a one-shot expansion-hint pointing at a CLI), not
# re-introduce truncation.
#
# Pure function: reads stdin, writes stdout, no side effects, no env
# mutation. Independently testable via bats. Sourced (not exec'd) by
# pre-tool.sh + post-tool.sh.

format_linked_entry_list() {
  # Accept input on stdin OR as a single argv string (newline-delimited).
  # Drop empty lines, then join with comma-space.
  local input
  if [ "$#" -gt 0 ]; then
    input="$1"
  else
    input=$(cat)
  fi

  # Use awk for deterministic join — avoids paste/jq dependency mismatches.
  # END guards against empty input — without the guard, `print out` emits an
  # empty line when no non-empty rows were seen, violating the documented
  # contract (empty input → empty output, no trailing newline beyond what
  # `echo`/command-substitution naturally trims).
  echo "$input" | awk 'NF { if (out) out = out ", " $0; else out = $0 } END { if (out) print out }'
}
