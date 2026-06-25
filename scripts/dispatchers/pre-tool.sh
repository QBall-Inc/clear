#!/bin/bash
# pre-tool.sh - Dispatcher for PreToolUse event
#
# Fires before every Read/Write/Edit/Glob/Grep operation.
# Looks up the target file in the reverse knowledge index and injects
# relevant knowledge entry context via hookSpecificOutput.additionalContext.
#
# Mostly read-only dispatcher — pure jq on the common (no-match) path.
# On match: appends surfacing events to JSONL log (FR14 observability).
# Designed for <10ms on the common (no-match) path.
#
# Input: JSON via stdin (tool_name, tool_input, cwd)
# Output: JSON with hookSpecificOutput.additionalContext (or {})
#
# INVARIANT: Hooks NEVER load or inject markdown body content.
# Rationale: Hook output goes into Claude's context window. Injecting full
# markdown bodies would consume tokens with raw content that Claude already
# has access to via Read. Hooks surface entry IDs only — Claude reads bodies
# on demand via the knowledge CLI or direct file access.
#
# Exits 0 for normal paths. Exit 2 for corrupt index (blocks tool until fixed).
# Corrupt index is extremely rare (system crash, user error) — blocking is appropriate.

export SCRIPT_NAME="pre-tool"
source "$(cd "$(dirname "$0")" && pwd)/../lib/common.sh"
source "$(cd "$(dirname "$0")" && pwd)/lib/hook-formatters.sh"

# Read input once
INPUT=$(cat)

# Extract CWD early for logging (canonicalized for symlink-resolution consistency
# with the other dispatchers per WP-CI1 cross-role review finding).
CWD=$(canonicalize_cwd "$(echo "$INPUT" | jq -r '.cwd // "."')")

# WP-CI1: skip on uninitialized projects.
require_clear_initialized "$CWD" || { echo '{}'; exit 0; }

use_project_logs "$CWD"

# --- Kill switches (global + per-hook) ---
if [ "${CLEAR_HOOKS_ENABLED:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi
if [ "${CLEAR_PRETOOL_ENABLED:-1}" = "0" ]; then
  echo '{}'
  exit 0
fi

# Block messages — Write/Edit and Bash branches have distinct trigger semantics
# post-WP-PS2, so messages are split to describe each path honestly per CS3
# (errors must be actionable).
#   _WRITE_EDIT: Write/Edit tool with file_path under .clear/ (unchanged from
#                pre-WP-PS2 BLOCK_MSG; covered by existing tests).
#   _BASH:       Bash command containing a write verb OUTSIDE quoted strings
#                AND a .clear/ path token. Quote-strip pre-pass (WP-PS2 AC1)
#                neutralizes most false-positives (node -e, jq, perl inline,
#                git commit messages with `>`/`.clear/` in prose). Message
#                lists write verbs + carve-out + diagnostic hint.
BLOCK_MSG_WRITE_EDIT="[CLEAR] Direct writes to .clear/ are blocked, except .clear/sessions/*.md (handoff prose, edited directly). For other paths use /cf-workpackage, /cf-plan, /cf-knowledge CLIs."
BLOCK_MSG_BASH="[CLEAR] Blocked: a Bash command contained a write verb (>, >>, tee, cp, mv, sed -i, dd of=, rsync, ln -sf, truncate, perl -i, patch) outside quoted strings AND referenced a .clear/ path. Carve-out: writes to .clear/sessions/*.md (handoff prose) pass. For other .clear/ mutations use /cf-workpackage, /cf-plan, /cf-knowledge CLIs (which use fs.writeFileSync and bypass this hook by design). If you hit this in error, the write verb or .clear/ token may be in an unquoted context — quoting the relevant portion (or splitting the command) typically resolves it."

# --- Per-tool file path extraction ---
# Read/Write/Edit: tool_input.file_path (always present)
# Glob/Grep: tool_input.path (optional — may be absent)
# Bash: tool_input.command — write-guard branch handles inline and exits
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

case "$TOOL_NAME" in
  Read|Write|Edit)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
    ;;
  Glob|Grep)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // ""')
    ;;
  Bash)
    BASH_CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
    # Cheap short-circuit: no `.clear/` substring → no possible write.
    case "$BASH_CMD" in
      *.clear/*) ;;
      *) echo '{}'; exit 0 ;;
    esac
    # Anchored write-verb / redirection detection. Expanded per S164 CR findings
    # to cover dd of=, rsync, ln -sf, truncate, perl -i, patch (Security F7).
    # Known accepted gap: variable-resolved paths (OUT=.clear/x; cat > "$OUT")
    # bypass the anchor — mitigation is explicit-CLI preference in skill prompts.
    WRITE_PREFIX='(>|>>|tee[[:space:]]+(-a[[:space:]]+)?|cp[[:space:]]+[^[:space:]]+[[:space:]]+|mv[[:space:]]+[^[:space:]]+[[:space:]]+|sed[[:space:]]+-i[^|;]*|dd[[:space:]]+[^|;]*of=|rsync[[:space:]]+[^|;]*[[:space:]]+|ln[[:space:]]+-sf?[[:space:]]+[^[:space:]]+[[:space:]]+|truncate[[:space:]]+[^|;]*[[:space:]]+|perl[[:space:]]+-i[^|;]*|patch[[:space:]]+[^|;]+[[:space:]]+)'
    # WP-PS2 AC1 — quote-strip pre-pass before WRITE_PREFIX matching.
    # Replace single- and double-quoted regions with a single-char sentinel (Q)
    # so the WRITE_PREFIX regex sees only structure outside of quoted strings,
    # but argument-shape is preserved (vs. deletion, which would break verbs
    # like `cp 'X' 'Y'` where the arg-count anchor matters).
    #
    # Examples (post-strip column shows what WRITE_PREFIX sees):
    #   Input                                            Post-strip          Match?
    #   node -e "const f = a => a > 0"                   node -e Q           no    -> short-circuit
    #   git commit -m "see >.clear/foo"                  git commit -m Q     no    -> short-circuit
    #   cp '.clear/foo' '.clear/bar'                     cp Q Q              YES   -> path extract -> block
    #   echo x > '.clear/state/evil.json'                echo x > Q          YES   -> path extract -> block
    #   cat foo > .clear/knowledge/bad.md                (unchanged)         YES   -> path extract -> block
    #
    # Order: strip double-quoted FIRST (so literal `'` inside `"..."` is not
    # mis-parsed as opening a single-quoted region), then single-quoted.
    #
    # Documented limitations (acknowledged 95%-case design — direction
    # of error varies by pattern, see per-item notes):
    #   - Escaped quotes inside strings (`"she said \"hi\""` or
    #     `python3 -c "open(\"f\", \"w\")"`) may strip incorrectly. The
    #     direction depends on the pattern: if the unmatched `"` leaves a
    #     write verb outside any stripped region, false-NEGATIVE (write
    #     slips through). If it leaves a `.clear/` token outside any
    #     stripped region but the write verb is genuinely outside too,
    #     false-positive block is possible. CR S172 F-SEC-2 surfaced
    #     this — worst-case is now documented as direction-dependent, not
    #     uniformly false-positive.
    #   - Naked heredocs (`cat <<EOF ... EOF`) are not stripped — body
    #     remains visible. Quoted heredocs (`bash -c "<<EOF ... EOF"`) ARE
    #     stripped via the enclosing quotes. Worst-case: false-positive
    #     block (same as pre-fix).
    #   - Shell comments (`# > ...`) are not stripped. Worst-case:
    #     false-positive block (same as pre-fix).
    #   - The sentinel `Q` is a real letter chosen for placeholder
    #     visibility. The load-bearing invariant is that the sentinel must
    #     NOT be a shell structural character (`>`, `|`, `;`, `&`, space,
    #     tab) — any non-structural letter (`Q`, `X`, `_`, etc.) is safe.
    #     A literal `Q` already in the user command would have had the
    #     same non-effect pre-strip — no new false-positives.
    #   - Sub-shell delegation classes (`sh -c "..."`, `bash -c "..."`,
    #     `eval "..."`) where the entire payload is inside the outer
    #     double-quoted argument: pre-pass strips the inner contents
    #     including any write verb. So `sh -c "echo x > .clear/state/y"`
    #     short-circuits and PASSES post-WP-PS2 (pre-WP-PS2 it would have
    #     blocked because `>` was visible inside the unprocessed string).
    #     This is a NEW false-negative, NOT equivalence to pre-fix. CR
    #     S172 F-SEC-1 surfaced this. Practical risk is low — Claude does
    #     direct redirections, not sub-shell delegation, in normal use.
    #     Mitigation: explicit-CLI preference in skill prompts (project
    #     convention; same mitigation as variable-resolved paths at line
    #     79). Strong fix would require recursive sub-shell parsing,
    #     which is out of scope for the WP-PS2 95%-case design.
    #   - Read-from-.clear + write-to-non-.clear-non-/dev/null path
    #     (e.g., `cat .clear/x > /tmp/out`) still blocks. Path extraction
    #     does not distinguish read source from write target by
    #     `>`-relative position — any `.clear/` path token in the command
    #     is treated as a candidate write target. POST-71 / WP-PS2.1
    #     addressed the high-frequency subset (FD-redirect + /dev/null)
    #     via additional strip passes (see below). Full position-aware
    #     analysis would require bash-token parsing and is deferred.
    #     Mitigation: write the read output to a temp file via a separate
    #     read command, or use a CLI helper. Friction, not data-loss.
    #
    # Multi-line handling: sed processes line-by-line, so a multi-line
    # quoted region (e.g., `"$(cat <<EOF\n...\nEOF\n)"` in a git commit -m)
    # would NOT match `"[^"]*"` if the `"` characters are on different lines.
    # AC8a canonical reproducer hit this. Mitigation: pre-pass with `tr` to
    # convert newlines to vertical-tab `\v` so sed sees a single logical
    # line. `\v` (0x0B) is technically in POSIX `[[:space:]]`, but in
    # practice WRITE_PREFIX only matches write verbs in real shell positions
    # (a `\v` in such a position implies the user's BASH_CMD was already
    # exotic and structurally suspect pre-strip). No new false-positives in
    # WRITE_PREFIX matching; the choice of `\v` over NUL/SOH avoids sed
    # corner cases with NUL-handling on some implementations.
    #
    # WP-PS2.1 (POST-71) — FD-redirect strip passes appended after quote-strip:
    #   Pass 3: [0-9]*>&[0-9-]+  → R   (FD-to-FD redirect with numeric or
    #                                    empty FD prefix: 2>&1, 1>&2, 2>&-,
    #                                    >&2 — no file write)
    #   Pass 4: ([0-9]*>>?|&>>?)[[:space:]]*/dev/null([[:space:]|;&)>]|$) → R\2
    #                                   (well-known safe sink — covers
    #                                    > /dev/null, 2>/dev/null, >>/dev/null,
    #                                    &>/dev/null, &>>/dev/null. Trailing
    #                                    discriminator group requires the
    #                                    /dev/null token to END at a shell
    #                                    separator [space, |, ;, &, ), >] or
    #                                    end-of-line — so /dev/null.bak or
    #                                    /dev/nullified are NOT partial-
    #                                    stripped. Captured tail char is
    #                                    preserved via \2 so downstream tokens
    #                                    are not corrupted. CR S173
    #                                    F-IMP-1/F-LINT-2 + AC17 lock this in.
    #                                    Note: `\b` was the initial fix but
    #                                    `.` is a non-word char, so `\b`
    #                                    MATCHES between `null` and `.` —
    #                                    the explicit separator class is the
    #                                    correct discriminator.)
    # Sentinel `R` is distinct from quote-strip's `Q` so debug-tracers can
    # tell which pass produced which sentinel. Same shell-structural-char
    # invariant applies — `R` is a non-structural letter.
    #
    # Pipeline ordering rationale (CR S173 F-STD-4): quote-strip MUST run
    # before FD-redirect strip because a `>&` token inside a quoted string
    # (e.g., `git commit -m "see 2>&1 in the docs"`) would otherwise be
    # replaced with `R` before quote-strip neutralized the outer string —
    # net effect would be identical for this specific case, but reversing
    # the order could mask future regex edits that depend on quoted
    # boundaries. Both FD-strip passes can run in either order relative to
    # each other (their patterns are disjoint: Pass 3 requires `&` AFTER
    # `>`, Pass 4 matches the literal `/dev/null` target). All FD strips
    # MUST run before WRITE_PREFIX grep.
    #
    # The FD-FD regex requires `&` immediately after `>`, so `2>&1` (FD-FD,
    # no write) is stripped but `2>file.log` (real redirect to file) is NOT
    # stripped — the discriminator is the literal `&`. WP-PS2.1 AC10/AC11
    # lock this distinction in via regression-guard tests (tee .clear/x 2>&1
    # still blocks; cat foo 2>.clear/log still blocks).
    #
    # `&>/dev/null` is structurally distinct from `&>file` — only the
    # /dev/null target is the well-known safe sink; `&>.clear/log` is a
    # real write to .clear/log and MUST still block. Pass 4's regex
    # discriminates by requiring the literal /dev/null target post-`>`.
    # WP-PS2.1 AC15/AC16 (added in CR S173 fix-batch) lock this in.
    # WP-SS1 — escaped-quote pre-pass (FIRST, before the quote strip). A `\"` is
    # a LITERAL double-quote in bash (inside OR outside `"..."`), never a string
    # delimiter — but the `"[^"]*"` strip below treats it as one, which DESYNCS
    # the strip and leaves the rest of the string (e.g. a `->` arrow, OBS-S4-9)
    # spuriously exposed to WRITE_PREFIX. Neutralizing `\"` to a non-structural
    # sentinel (E) before the strip makes `"[^"]*"` faithful to bash quoting.
    # This MITIGATES the documented limitation at lines 107-115 in BOTH
    # directions: it removes the S4-9 false-positive AND closes the symmetric
    # false-NEGATIVE (a write verb spuriously hidden by the desync). Safety: the
    # pre-pass only removes `\"` pairs — it cannot move a genuinely-unquoted `>`
    # into a quoted region, so it can never hide a real redirect (worst case it
    # exposes MORE, i.e. errs toward blocking).
    BASH_CMD_STRIPPED=$(echo "$BASH_CMD" \
      | tr '\n' '\v' \
      | sed -e 's/\\"/E/g' \
      | sed -e 's/"[^"]*"/Q/g' -e "s/'[^']*'/Q/g" \
      | sed -E -e 's/[0-9]*>&[0-9-]+/R/g' \
                -e 's@([0-9]*>>?|&>>?)[[:space:]]*/dev/null([[:space:]|;&)>]|$)@R\2@g')
    # WP-SS1 — command-position `[[ ]]` blank (OBS-S31-01 / POST-140). Inside the
    # `[[ ]]` keyword a `>`/`<` is a string comparison, never a redirect — so a
    # read-only test like `[[ "$a" > "$b" ]] && cat .clear/x` must not block. But
    # `[[` is the test KEYWORD only in COMMAND POSITION: at the start, directly
    # after a separator (`;` `&` `|` `(`), or after a reserved word that expects a
    # command and is ITSELF at command position (`if elif while until then else
    # do`). In ARGUMENT position `[[` is a literal bareword and a following `>` IS
    # a real redirect — both `echo hello [[ > .clear/x ]]` and
    # `echo then [[ a > .clear/x ]]` are genuine writes (the reserved word is a
    # bare echo arg, not a keyword). So the blank requires a leading separator,
    # then an OPTIONAL command-position reserved word, then `[[ ` (the keyword form
    # demands the space). The target view (BASH_CMD_GATE) is used ONLY for the
    # write-verb presence gate; path extraction below still uses the original
    # $BASH_CMD. `[^]]*` is intentionally NON-greedy (stops at the first `]`): a
    # greedy `.*` would let an attacker append `]]` to swallow a trailing real
    # redirect (`[[ x ]] && echo evil > .clear/y ]]`). Non-greedy at worst
    # over-blocks an array-subscript test (`[[ ${a[0]} > 0 ]]`) or a `[[` opening a
    # continuation line or after `!` — the safe (over-block) direction.
    BASH_CMD_GATE=$(echo "$BASH_CMD_STRIPPED" \
      | sed -E 's/(^|[;&|(])([[:space:]]*)((elif|while|until|then|else|do|if)[[:space:]]+)?\[\[[[:space:]][^]]*\]\]/\1\2\3T/g')
    # If no write-verb in the gate view, the .clear/ substring is in a quoted
    # region (read/string-mention), a command-position test comparison, or is
    # otherwise unreachable from any write op. Short-circuit OK to allow.
    # L-IMP-01 (S172 CR fix-batch): quote $WRITE_PREFIX + add `--` end-of-options
    # guard. No active bug today, but defends against future regex edits that
    # add bracket chars or against a regex that starts with `-`.
    if ! echo "$BASH_CMD_GATE" | grep -qE -- "$WRITE_PREFIX"; then
      echo '{}'
      exit 0
    fi
    # Extract every .clear/<...> path token in the command, regardless of position.
    # Validate each one matches the .clear/sessions/<bare>.md carve-out — anything
    # else blocks. Catches: chained writes with mixed targets (Sec F1), quoted
    # paths (Sec F2), absolute + ./-prefixed paths (Sec F3), .md.bak / subdir
    # carve-out bypasses (Sec F4), multi-arg tee/cp/mv.
    # Acceptable false-positive: echo "...the .clear/state/ dir..." > /tmp/x
    # blocks because the substring is treated as a candidate path. Mitigation
    # is explicit-CLI preference in skill prompts (already a project convention).
    #
    # L-IMP-02 (S172 CR fix-batch): path extraction DELIBERATELY uses original
    # $BASH_CMD (not $BASH_CMD_STRIPPED). Rationale: the stripped form replaced
    # path tokens inside quoted regions with sentinel Q — we need the actual
    # path strings to perform the carve-out comparison. WRITE_PREFIX matching
    # above (line ~127) already confirmed a write verb is present in unquoted
    # context. Do NOT "fix" this to $BASH_CMD_STRIPPED — it would silently
    # break path extraction for all quoted-path forms (e.g., `cp '.clear/foo' ...`).
    #
    # WP-CB-D AC1 — read-only git-subcommand exemption (OBS-S11 E0459 / NEW-SIGNAL).
    # A `.clear/` path that is an OPERAND of a read-only git subcommand
    # (`git rm --cached`, `git add`, `git status`, `git diff`) is NOT a filesystem
    # write to `.clear/` — these touch the git index or are read-only; they never
    # write `.clear/` file CONTENTS. Pre-fix, the coarse co-occurrence test blocked
    # a legitimate `git rm --cached .clear/...journals && printf '...' >> .gitignore`
    # (the `>>` targeted .gitignore, a NON-.clear/ file; the `.clear/` tokens were
    # read-only untrack operands). Blank ONLY the read-only subcommand's own operand
    # run for the PATH-EXTRACTION view, bounded by the first redirection (`< > | &`),
    # command separator (`;`), OR command-substitution delimiter (backtick / `$` / `(`
    # / `)`). SAFE-BY-CONSTRUCTION: the `[^<>|&;`$()]*` bound can never cross any of
    # those, so the strip can NEVER remove a real `.clear/` write target — a chained,
    # redirected, OR command-substituted write in the same line survives and still
    # blocks. The substitution delimiters were added after an adversarial CR proved the
    # original `[^<>|&;]*` bound greedily swallowed a write hidden inside a `$(...)` /
    # backtick substitution AFTER a git verb (e.g. `git add .clear/x $(cp evil
    # .clear/state/y)`), which bash EXECUTES regardless of the git context (SEC-CBD-01).
    # `git` is anchored to command position (start or after a separator/space/paren) so
    # `mygit` does not match. `rm` REQUIRES `--cached` (bare `git rm` deletes the
    # working-tree file — a real mutation — and is NOT exempted). Any unmatched git form
    # (exotic flags, `git rm` w/o `--cached`) falls through to the original over-block:
    # the direction of error is ALWAYS toward blocking. The view is used ONLY for path
    # extraction; the write-verb GATE above is unchanged (so the reproducer still
    # reaches this branch).
    #   git rm --cached .clear/knowledge/index.db-wal .clear/knowledge/index.db-shm \
    #     && printf '\n*.db-wal\n*.db-shm\n' >> .gitignore          -> now PASSES
    #   echo x > .clear/state/y.json                                -> still BLOCKS
    #   git rm --cached .clear/x && echo evil > .clear/state/y      -> still BLOCKS
    #   git add .clear/x $(cp evil .clear/state/y)                  -> still BLOCKS
    BASH_CMD_PATHVIEW=$(echo "$BASH_CMD" \
      | sed -E 's/(^|[[:space:]();&|])git[[:space:]]+(rm[[:space:]]+--cached|add|status|diff)([[:space:]][^<>|&;`$()]*)?/\1G/g')
    # `|| true` guards `set -euo pipefail` (common.sh:7): post-WP-CB-D the PATHVIEW
    # strip can legitimately remove ALL `.clear/` tokens (every one was a read-only
    # git operand), so grep -oE returns exit 1 (no match) — which without the guard
    # would kill the hook BEFORE the `[ -z "$CLEAR_PATHS" ]` allow check below.
    # Convention matches the jq lookups at lines ~426/431/438.
    CLEAR_PATHS=$(echo "$BASH_CMD_PATHVIEW" | grep -oE -- "\.clear/[^[:space:]'\"<>|&;)]+" || true)
    if [ -z "$CLEAR_PATHS" ]; then
      echo '{}'
      exit 0
    fi
    BLOCKED=0
    while IFS= read -r CLEAR_PATH; do
      [ -z "$CLEAR_PATH" ] && continue
      # Defensive trailing-quote strip in case the extraction regex missed.
      CLEAR_PATH="${CLEAR_PATH%\"}"
      CLEAR_PATH="${CLEAR_PATH%\'}"
      case "$CLEAR_PATH" in
        .clear/sessions/*.md)
          REST="${CLEAR_PATH#.clear/sessions/}"
          case "$REST" in
            */*)     BLOCKED=1; break ;;
            *.md.*)  BLOCKED=1; break ;;
          esac
          ;;
        *)
          BLOCKED=1; break ;;
      esac
    done <<< "$CLEAR_PATHS"
    if [ "$BLOCKED" = "1" ]; then
      echo "$BLOCK_MSG_BASH" >&2
      echo '{}'
      exit 2
    fi
    echo '{}'
    exit 0
    ;;
  *)
    # Unknown tool — no meaningful file path to look up
    echo '{}'
    exit 0
    ;;
esac

# Empty file path — no meaningful lookup (Glob/Grep without path)
if [ -z "$FILE_PATH" ]; then
  echo '{}'
  exit 0
fi

# --- Normalize to relative path ---
REL_PATH="$FILE_PATH"
if [[ "$REL_PATH" == "$CWD/"* ]]; then
  REL_PATH="${REL_PATH#"$CWD/"}"
fi

# --- .clear/ write guard (POST-19 + WP-DF1 AC1) ---
# Block Write/Edit on .clear/ paths, EXCEPT .clear/sessions/*.md (handoff prose,
# edited directly via Edit per cf-handoff/SKILL.md skill contract). Other
# legitimate mutations go through CLIs (fs.writeFileSync, invisible to PreToolUse).
case "$TOOL_NAME" in
  Write|Edit)
    case "$REL_PATH" in
      .clear/sessions/*.md)
        # AC1 carve-out — handoff prose direct edits pass.
        ;;
      .clear/*)
        echo "$BLOCK_MSG_WRITE_EDIT" >&2
        echo '{}'
        exit 2
        ;;
    esac
    ;;
esac

# --- Exclusion check (hardcoded for v1.0) ---
case "$REL_PATH" in
  .clear/state/*|.clear/audit/*|logs/*|tmp/*|sessions/*|node_modules/*|.claude/*|.git/*|build/*)
    echo '{}'
    exit 0
    ;;
esac

# --- Reverse index lookup (jq only — no Node.js spawn) ---
CLEAR_DIR="${CWD}/.clear"
INDEX_FILE="${CLEAR_DIR}/state/file-knowledge-index.json"
OWNER_INDEX_FILE="${CLEAR_DIR}/state/owner-index.json"

if [ ! -f "$INDEX_FILE" ]; then
  echo '{}'
  exit 0
fi

# Validate index JSON — corrupt index blocks tool until rebuilt (exit 2)
if ! jq -e '.' "$INDEX_FILE" >/dev/null 2>&1; then
  echo '[CLEAR] Knowledge index is corrupt. Run: /cf-knowledge rebuild-index' >&2
  echo '{}'
  exit 2
fi

# K3.4 (S154) FR22: dual-index lookup via single jq -s slurp-mode invocation
# when owner-index exists. .[0] is file-knowledge-index (any entry's
# related_files); .[1] is owner-index (stakeholder owns paths). Both indexes
# share the same shape: { index: { path: [entry_id, ...] } }. Lazy invariant
# preserved: if owner-index.json is absent, the original single-file logic
# runs unchanged so non-SH workspaces pay zero added jq cost.
ALL_ENTRIES=""
if [ -f "$OWNER_INDEX_FILE" ]; then
  # Validate owner-index JSON — corrupt blocks tool until rebuilt (exit 2)
  if ! jq -e '.' "$OWNER_INDEX_FILE" >/dev/null 2>&1; then
    echo '[CLEAR] Owner index is corrupt. Run: /cf-knowledge rebuild-owner-index' >&2
    echo '{}'
    exit 2
  fi

  # Dual-index slurp-mode lookup: exact match across both indexes, falling
  # back to directory-prefix match across both. Output is unique entry IDs.
  # CROSS-K3.4-02 (S155): jq -s slurp-array mapping (argument order at the
  # closing line below):  .[0] = file-knowledge-index   .[1] = owner-index
  ALL_ENTRIES=$(jq -rs --arg fp "$REL_PATH" '
    (([(.[0].index[$fp] // []), (.[1].index[$fp] // [])] | add) | unique) as $exact
    | if ($exact | length) > 0 then
        $exact | .[]
      else
        ([
          (.[0].index | to_entries | map(select(.key | endswith("/"))) | map(select(.key as $k | $fp | startswith($k))) | [.[].value[]]),
          (.[1].index | to_entries | map(select(.key | endswith("/"))) | map(select(.key as $k | $fp | startswith($k))) | [.[].value[]])
        ] | flatten | unique) as $prefix
        | if ($prefix | length) > 0 then $prefix | .[] else empty end
      end
  ' "$INDEX_FILE" "$OWNER_INDEX_FILE" 2>/dev/null || true)
else
  # Single-index lookup (lazy fallback — owner-index does not yet exist)
  EXACT_ENTRIES=$(jq -r --arg fp "$REL_PATH" '
    (.index[$fp] // []) | if length > 0 then .[] else empty end
  ' "$INDEX_FILE" 2>/dev/null || true)

  # Directory prefix match (only if no exact match)
  PREFIX_ENTRIES=""
  if [ -z "$EXACT_ENTRIES" ]; then
    PREFIX_ENTRIES=$(jq -r --arg fp "$REL_PATH" '
      .index | to_entries | map(select(.key | endswith("/"))) | map(select(.key as $k | $fp | startswith($k))) | [.[].value[]] | unique | if length > 0 then .[] else empty end
    ' "$INDEX_FILE" 2>/dev/null || true)
  fi

  # Combine: exact first, then prefix (preserving order for truncation)
  if [ -n "$EXACT_ENTRIES" ] && [ -n "$PREFIX_ENTRIES" ]; then
    ALL_ENTRIES=$(printf '%s\n%s' "$EXACT_ENTRIES" "$PREFIX_ENTRIES" | sort -u)
  elif [ -n "$EXACT_ENTRIES" ]; then
    ALL_ENTRIES="$EXACT_ENTRIES"
  elif [ -n "$PREFIX_ENTRIES" ]; then
    ALL_ENTRIES="$PREFIX_ENTRIES"
  fi
fi

# No entries found
if [ -z "$ALL_ENTRIES" ]; then
  echo '{}'
  exit 0
fi

# --- Append surfacing events to JSONL log (FR14: observability) ---
STATE_DIR="${CLEAR_DIR}/state"
SURFACING_LOG="${STATE_DIR}/surfacing-log.jsonl"
SURF_TS=$(date -Iseconds)
echo "$ALL_ENTRIES" | while IFS= read -r eid; do
  [ -z "$eid" ] && continue
  jq -nc --arg id "$eid" --arg trigger "PreToolUse" --arg fp "$REL_PATH" --arg ts "$SURF_TS" \
    '{entry_id: $id, trigger: $trigger, file_path: $fp, ts: $ts}' >> "$SURFACING_LOG"
done

# --- Format output via shared helper (no truncation; full list always visible) ---
# See scripts/dispatchers/lib/hook-formatters.sh for the rationale on no-truncation.
# Symmetric with post-tool.sh (drift-proof via shared helper, not duplicated logic).
# Sanitization symmetric with post-tool.sh L220-222 — both REL_PATH and ENTRY_LIST
# flow into Claude's additionalContext; control chars are stripped to prevent
# newline-based prompt-injection if a filename or entry_id carries embedded LF/CR.
ENTRY_LIST=$(echo "$ALL_ENTRIES" | format_linked_entry_list)
SAFE_REL_PATH=$(sanitize_for_context "$REL_PATH")
SAFE_ENTRY_LIST=$(sanitize_for_context "$ENTRY_LIST")
CONTEXT="[CLEAR] File '${SAFE_REL_PATH}' is linked to knowledge entries: ${SAFE_ENTRY_LIST}. Review these for context before proceeding."

jq -n --arg ctx "$CONTEXT" '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": $ctx
  }
}'
exit 0
