#!/bin/bash
# CLEAR Framework Status Line (based on Bulwark statusline)
# Dual-gauge display: Operational (500K) + Official (1M)

set -euo pipefail

# === Color Definitions (RGB for exact hex colors) ===
RESET='\033[0m'

# Gauge colors
GAUGE_LOW='\033[38;2;175;255;175m'      # #AFFFAF pastel green
GAUGE_MID='\033[38;2;255;244;176m'      # #FFF4B0 pastel yellow
GAUGE_HIGH='\033[38;2;255;154;150m'     # #FF9A96 pastel coral
GAUGE_EMPTY='\033[38;2;88;88;88m'       # #585858 dim gray

# Model background colors (with dark foreground for contrast)
MODEL_FG='\033[38;2;30;30;30m'          # Dark text on pastel bg
MODEL_OPUS='\033[48;2;196;173;237m'     # #C4ADED soft purple
MODEL_SONNET='\033[48;2;172;213;243m'   # #ACD5F3 soft blue
MODEL_HAIKU='\033[48;2;172;239;214m'    # #ACEFD6 soft teal

# Segment colors
LABEL='\033[38;2;138;138;138m'          # #8A8A8A medium gray
FILE_PATH='\033[38;2;255;215;175m'      # #FFD7AF pastel peach
GIT_BRANCH='\033[38;2;135;215;255m'     # #87D7FF pastel cyan

# === Operational limit ===
OPERATIONAL_LIMIT=500000

# === Read JSON from stdin ===
INPUT=$(cat)

# === Parse JSON with jq ===
MODEL=$(echo "$INPUT" | jq -r '.model.display_name // "Unknown"')
PERCENT_RAW=$(echo "$INPUT" | jq -r '.context_window.used_percentage // 0')
CONTEXT_SIZE=$(echo "$INPUT" | jq -r '.context_window.context_window_size // 200000')
CWD=$(echo "$INPUT" | jq -r '.workspace.current_dir // ""')

# === Context Window Bridge (R3.4) ===
# Write context window data to .clear/state/session.json for session-monitor.sh.
# Failures are swallowed — must never break the statusline display.
if [ -n "$CWD" ] && [ -d "${CWD}/.clear/state" ]; then
  SESSION_FILE="${CWD}/.clear/state/session.json"
  if [ -f "$SESSION_FILE" ]; then
    jq --argjson size "$CONTEXT_SIZE" \
       --arg model "$MODEL" \
       --arg ts "$(date -Iseconds)" \
       '.contextWindow = {size: $size, source: "statusline", detectedModel: $model, lastUpdated: $ts}' \
       "$SESSION_FILE" > "${SESSION_FILE}.tmp" 2>/dev/null \
       && mv "${SESSION_FILE}.tmp" "$SESSION_FILE" || true
  fi
fi

# === Passthrough Mode (R3.4) ===
# If an original statusline exists (preserved by cf-init), hand off to it.
# CLEAR captures data above, then the original statusline renders the display.
# Only accept absolute paths to prevent PATH-based resolution of untrusted values.
if [ -n "${CLEAR_ORIGINAL_STATUSLINE:-}" ]; then
  case "$CLEAR_ORIGINAL_STATUSLINE" in
    /*) [ -x "${CLEAR_ORIGINAL_STATUSLINE}" ] && echo "$INPUT" | exec "${CLEAR_ORIGINAL_STATUSLINE}" ;;
  esac
fi

# === Calculate tokens from percentage ===
TOTAL_TOKENS=$(echo "$PERCENT_RAW $CONTEXT_SIZE" | awk '{printf "%.0f", ($1 / 100) * $2}')

# Format tokens (K/M suffix)
format_tokens() {
    local tokens=$1
    if [ "$tokens" -ge 1000000 ]; then
        echo "$((tokens / 1000000))M"
    elif [ "$tokens" -ge 1000 ]; then
        echo "$((tokens / 1000))K"
    else
        echo "$tokens"
    fi
}

# Build a gauge string given: used_tokens, max_tokens
# Outputs: colored gauge + percent + (used/max)
build_gauge() {
    local used=$1
    local max=$2
    local width=10

    local percent=0
    if [ "$max" -gt 0 ]; then
        percent=$((used * 100 / max))
    fi
    [ "$percent" -gt 100 ] && percent=100

    local filled=$((percent * width / 100))
    [ "$filled" -gt "$width" ] && filled=$width
    local empty=$((width - filled))

    # Select gauge color based on threshold
    local color
    if [ "$percent" -lt 60 ]; then
        color="$GAUGE_LOW"
    elif [ "$percent" -lt 70 ]; then
        color="$GAUGE_MID"
    else
        color="$GAUGE_HIGH"
    fi

    # Build gauge string
    local gauge=""
    for ((i=0; i<filled; i++)); do
        gauge="${gauge}▰"
    done
    local empty_str=""
    for ((i=0; i<empty; i++)); do
        empty_str="${empty_str}▱"
    done

    local used_fmt
    used_fmt=$(format_tokens "$used")
    local max_fmt
    max_fmt=$(format_tokens "$max")

    echo -ne "${color}${gauge}${RESET}${GAUGE_EMPTY}${empty_str}${RESET} ${color}${percent}%${RESET} (${used_fmt}/${max_fmt})"
}

TOKENS_USED_FMT=$(format_tokens "$TOTAL_TOKENS")

# === Select model background color ===
case "$MODEL" in
    *Opus*|*opus*)
        MODEL_BG="$MODEL_OPUS"
        ;;
    *Sonnet*|*sonnet*)
        MODEL_BG="$MODEL_SONNET"
        ;;
    *Haiku*|*haiku*)
        MODEL_BG="$MODEL_HAIKU"
        ;;
    *)
        MODEL_BG="$MODEL_SONNET"
        ;;
esac

# === Get git info ===
GIT_REPO=""
GIT_BRANCH_NAME=""
GIT_PENDING=0

if [ -n "$CWD" ] && [ -d "$CWD" ]; then
    cd "$CWD" 2>/dev/null || true
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        GIT_REPO=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "")
        GIT_BRANCH_NAME=$(git branch --show-current 2>/dev/null || echo "")
        GIT_PENDING=$(git --no-optional-locks status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    fi
fi

# === Get last modified file (most recent by mtime) ===
LAST_FILE=""
if [ -n "$CWD" ] && [ -d "$CWD" ]; then
    cd "$CWD" 2>/dev/null || true
    LAST_FILE=$( (git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null) | \
        xargs -I{} sh -c '[ -f "{}" ] && stat --format="%Y %n" "{}"' 2>/dev/null | \
        sort -rn | head -1 | cut -d' ' -f2- || true)
fi

# === Output Lines ===

# Line 1: Model
echo -e "${MODEL_BG}${MODEL_FG} ${MODEL} ${RESET}"

# Line 2: Context gauges — Ops (500K) | Max (1M)
OPS_GAUGE=$(build_gauge "$TOTAL_TOKENS" "$OPERATIONAL_LIMIT")
OFF_GAUGE=$(build_gauge "$TOTAL_TOKENS" "$CONTEXT_SIZE")

echo -e "${LABEL}Ops:${RESET} ${OPS_GAUGE} ${LABEL}|${RESET} ${LABEL}Max:${RESET} ${OFF_GAUGE}"

# Line 3: Last file (if available)
if [ -n "$LAST_FILE" ]; then
    echo -e "${LABEL}Last file:${RESET} ${FILE_PATH}${LAST_FILE}${RESET}"
fi

# Line 3: Git info (if available)
if [ -n "$GIT_REPO" ] && [ -n "$GIT_BRANCH_NAME" ]; then
    PENDING_TEXT=""
    if [ "$GIT_PENDING" -gt 0 ]; then
        PENDING_TEXT=" ${LABEL}(${GIT_PENDING} files pending)${RESET}"
    fi
    echo -e "${LABEL}Git:${RESET} ${GIT_BRANCH}${GIT_REPO}/${GIT_BRANCH_NAME}${RESET}${PENDING_TEXT}"
fi
