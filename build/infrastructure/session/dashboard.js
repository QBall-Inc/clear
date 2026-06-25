"use strict";
/**
 * Session-start dashboard renderer (WP-PS4 AD-03).
 *
 * Pure function: renderDashboard(syncState, sessionInfo, ctx) -> string.
 * No I/O. All data resolution happens in dashboard-cli.ts (AD-04).
 *
 * Determinism (AC7): same inputs produce byte-identical output. Critical
 * for golden-file fixtures, git diffs, screenshot consistency, and the
 * inline-budget byte-offset assertion (AC11).
 *
 * ANSI palette mirrors scripts/statusline.sh for visual continuity.
 * Visible-width math strips ANSI before measuring so column alignment
 * is unaffected by color content.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUMMARY_LINE_MAX = void 0;
exports.renderDashboard = renderDashboard;
// =============================================================================
// Layout constants
// =============================================================================
const TOTAL_WIDTH = 76;
const CONTENT_WIDTH = 70;
const LEFT_PAD = '  ';
const RIGHT_PAD = '  ';
const BAR_WIDTH = 10;
// SR2 operational + max ceilings (see .claude/rules/rules.md SR2).
const OPERATIONAL_LIMIT = 500000;
const MAX_LIMIT = 1000000;
// Bar threshold asymmetry per AC4.
//   Progress bars (higher = better): coral < 50, yellow [50, 75), green >= 75
//   Token bars   (higher = worse):   green < 60, yellow [60, 70), coral >= 70
const PROGRESS_OK_THRESHOLD = 50;
const PROGRESS_GREEN_THRESHOLD = 75;
const TOKEN_WARN_THRESHOLD = 60;
const TOKEN_DANGER_THRESHOLD = 70;
// Single source of truth (XDUP-001): dashboard-cli imports this constant
// so the renderer + the wrapper agree on the last-session truncation budget.
exports.SUMMARY_LINE_MAX = 3;
const RECENT_KNOWLEDGE_MAX = 5;
// =============================================================================
// ANSI palette (24-bit RGB) — mirrors scripts/statusline.sh
// =============================================================================
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const COLOR_GREEN = '\x1b[38;2;175;255;175m';
const COLOR_YELLOW = '\x1b[38;2;255;244;176m';
const COLOR_CORAL = '\x1b[38;2;255;154;150m';
const COLOR_EMPTY = '\x1b[38;2;88;88;88m';
const COLOR_LABEL = '\x1b[38;2;138;138;138m';
const DOT_IN_PROGRESS = '🟢';
const DOT_BLOCKED = '🔴';
const DOT_PAUSED = '🟡';
// DOT_INACTIVE covers states where no active work is happening for the WP:
// not_started, complete, deferred, archived. Renamed from DOT_NOT_STARTED
// (XDUP-002) since the constant is used for all four states, not just the
// not_started one.
const DOT_INACTIVE = '🔵';
const DOT_NONE = '⚪';
// eslint-disable-next-line no-control-regex -- matching ANSI escape sequences requires the literal ESC byte
const ANSI_RE = /\x1b\[[0-9;]*m/g;
// =============================================================================
// Public renderer
// =============================================================================
function renderDashboard(syncState, sessionInfo, ctx) {
    const lines = [];
    lines.push(borderTop());
    appendSection(lines, renderHeaderLines(sessionInfo, ctx));
    lines.push(borderDivider());
    appendSection(lines, renderActiveWorkpackageLines(syncState));
    if (syncState.previousWorkpackage) {
        lines.push(borderDivider());
        appendSection(lines, renderPreviousWorkpackageLines(syncState));
    }
    lines.push(borderDivider());
    appendSection(lines, renderPlanLines(syncState, ctx));
    lines.push(borderDivider());
    appendSection(lines, renderLastSessionLines(ctx));
    lines.push(borderDivider());
    appendSection(lines, renderRecentKnowledgeLines(syncState, ctx));
    lines.push(borderDivider());
    appendSection(lines, renderPendingReviewsLines(ctx));
    lines.push(borderDivider());
    appendSection(lines, renderTokenBudgetLines(sessionInfo));
    lines.push(borderBottom());
    return lines.join('\n');
}
// =============================================================================
// Section renderers
// =============================================================================
function renderHeaderLines(sessionInfo, ctx) {
    const sessionLabel = `Session ${sessionInfo.clearSessionNumber}`;
    const last = ctx.lastSessionNumber !== null && ctx.lastSessionDate !== null
        ? `last: S${ctx.lastSessionNumber} (${ctx.lastSessionDate})`
        : 'first session';
    return [
        sectionHeader('CLEAR'),
        `${bold(sessionLabel)}${dim('  •  ')}${dim(last)}`,
    ];
}
function renderActiveWorkpackageLines(syncState) {
    if (syncState.workpackage.systemId === '') {
        return [sectionHeader('Active Workpackage'), dim('(none)')];
    }
    const wp = syncState.workpackage;
    const status = inferStatus(syncState);
    const dot = statusDot(status);
    const titleLine = truncate(`${dot} ${wp.displayId}  ${wp.title}`, CONTENT_WIDTH);
    const progressPct = clampPct(wp.progress);
    const progressLine = `${label('Progress: ')}${progressBar(progressPct)}`;
    return [sectionHeader('Active Workpackage'), titleLine, progressLine];
}
function renderPreviousWorkpackageLines(syncState) {
    const prev = syncState.previousWorkpackage;
    const titleLine = truncate(`${DOT_PAUSED} ${prev.displayId}  (paused ${reasonLabel(prev.reason)})`, CONTENT_WIDTH);
    const progressLine = `${label('At pause: ')}${progressBar(prev.progressAtPause)}`;
    return [sectionHeader('Previous Workpackage'), titleLine, progressLine];
}
function renderPlanLines(syncState, ctx) {
    const plan = syncState.plan;
    // A plan is "loaded" iff the always-present display ID is set. The systemId is
    // optional in the dual-ID architecture: a plan whose active phase has no
    // `ph-xxxx` systemId stores null in plan.json, and session-start reconcile
    // cannot copy a null into sync-state, so activePhaseSystemId stays at its ''
    // default even for a perfectly healthy plan. Gating the "(no plan loaded)"
    // sentinel on activePhaseSystemId therefore contradicts the other status
    // surfaces (cf-debug, Developer-Reference) that read the display ID / plan YAML
    // directly. activePhaseDisplayId is the authoritative presence signal and is
    // what the phase label below renders, so the sentinel keys off it instead.
    if (plan.activePhaseDisplayId === '') {
        return [sectionHeader('Plan'), dim('(no plan loaded)')];
    }
    const phaseLabel = ctx.phaseName
        ? `${plan.activePhaseDisplayId}  ${ctx.phaseName}`
        : plan.activePhaseDisplayId;
    const phaseLine = truncate(phaseLabel, CONTENT_WIDTH);
    const phasePct = clampPct(plan.phaseProgress);
    const planPct = plan.planProgress !== undefined ? clampPct(plan.planProgress) : null;
    const phaseProgressLine = `${label('Phase:    ')}${progressBar(phasePct)}`;
    const lines = [sectionHeader('Plan'), phaseLine, phaseProgressLine];
    if (planPct !== null) {
        lines.push(`${label('Plan:     ')}${progressBar(planPct)}`);
    }
    if (plan.blockers.length > 0) {
        lines.push(`${label('Blockers: ')}${DOT_BLOCKED} ${plan.blockers.length}`);
        for (const blocker of plan.blockers) {
            lines.push(truncate(`  ${dim('•')} ${blocker}`, CONTENT_WIDTH));
        }
    }
    return lines;
}
function renderLastSessionLines(ctx) {
    const lines = [sectionHeader('Last Session')];
    if (ctx.lastSessionNumber === null || ctx.lastSessionSummary.length === 0) {
        lines.push(dim('(no prior session)'));
        return lines;
    }
    const header = `${bold(`S${ctx.lastSessionNumber}`)} ${dim(ctx.lastSessionDate ?? '')}`.trim();
    lines.push(header);
    for (const summaryLine of ctx.lastSessionSummary.slice(0, exports.SUMMARY_LINE_MAX)) {
        lines.push(truncate(summaryLine, CONTENT_WIDTH));
    }
    return lines;
}
function renderRecentKnowledgeLines(syncState, ctx) {
    const recent = syncState.knowledge.recentEntries;
    if (recent.length === 0) {
        return [sectionHeader('Recent Knowledge'), dim('(none)')];
    }
    const lines = [sectionHeader('Recent Knowledge')];
    for (const id of recent.slice(0, RECENT_KNOWLEDGE_MAX)) {
        const title = ctx.recentEntryTitles.get(id);
        const row = title ? `${id}  ${title}` : id;
        lines.push(truncate(row, CONTENT_WIDTH));
    }
    return lines;
}
function renderPendingReviewsLines(ctx) {
    if (ctx.pendingReviewCount === 0) {
        return [sectionHeader('Pending Reviews'), dim('(none)')];
    }
    return [
        sectionHeader('Pending Reviews'),
        `${DOT_BLOCKED} ${bold(String(ctx.pendingReviewCount))} entries awaiting review`,
    ];
}
function renderTokenBudgetLines(sessionInfo) {
    return [
        sectionHeader('Token Budget'),
        `${label('Operational: ')}${tokenBar(sessionInfo.tokensUsed, OPERATIONAL_LIMIT)}`,
        `${label('Max:         ')}${tokenBar(sessionInfo.tokensUsed, MAX_LIMIT)}`,
    ];
}
// =============================================================================
// Layout primitives
// =============================================================================
function borderTop() {
    return '╔' + '═'.repeat(TOTAL_WIDTH - 2) + '╗';
}
function borderDivider() {
    return '╠' + '═'.repeat(TOTAL_WIDTH - 2) + '╣';
}
function borderBottom() {
    return '╚' + '═'.repeat(TOTAL_WIDTH - 2) + '╝';
}
function contentLine(text) {
    return `║${LEFT_PAD}${padRight(text, CONTENT_WIDTH)}${RIGHT_PAD}║`;
}
function appendSection(out, lines) {
    for (const line of lines) {
        out.push(contentLine(line));
    }
}
function sectionHeader(title) {
    return bold(title);
}
// =============================================================================
// Visible-width math (strips ANSI before measuring)
// =============================================================================
function visibleWidth(text) {
    // Strip ANSI sequences, then count UTF-16 code units. Emoji glyphs (status
    // dots) occupy 2 UTF-16 units but render as a single column-pair in most
    // terminals; in practice they render closer to 2 columns, matching the
    // raw-length count. Acceptable approximation for the dashboard's fixed
    // 70-col content area.
    return text.replace(ANSI_RE, '').length;
}
function padRight(text, width) {
    const w = visibleWidth(text);
    if (w >= width) {
        return text;
    }
    return text + ' '.repeat(width - w);
}
function truncate(text, width) {
    const stripped = text.replace(ANSI_RE, '');
    if (stripped.length <= width) {
        return text;
    }
    // No ANSI to preserve mid-string in the current renderer call sites, so a
    // raw slice on the stripped form is sufficient. If a caller adds inline
    // ANSI later, this helper will need ANSI-aware truncation.
    return stripped.slice(0, width - 1) + '…';
}
// =============================================================================
// Color + formatting helpers
// =============================================================================
function bold(text) {
    return `${BOLD}${text}${RESET}`;
}
// COLOR_LABEL serves both "dim" (de-emphasized parenthetical text) and
// "label" (gray prefix for `Phase:` / `Operational:` labels) semantics.
// Single implementation; label() preserved as semantic alias for readability
// at call sites and as the splitting point if/when label coloring diverges.
function dim(text) {
    return `${COLOR_LABEL}${text}${RESET}`;
}
function label(text) {
    return dim(text);
}
function clampPct(pct) {
    return clamp(Math.round(pct), 0, 100);
}
function reasonLabel(reason) {
    switch (reason) {
        case 'switched_to_new_wp':
            return 'switched';
        case 'user_explicit_pause':
            return 'user';
        case 'session_end':
            return 'session end';
        default:
            return reason;
    }
}
// =============================================================================
// Status inference (D-14 fallback when WorkpackageSummary.status is absent)
// =============================================================================
function inferStatus(syncState) {
    // D-14 fallback: explicit status wins; otherwise blockers⟹blocked, else
    // in_progress. previousWorkpackage signals the PREVIOUS WP is paused — it
    // does not imply anything about the active WP, which is by definition
    // not the one that was paused.
    if (syncState.workpackage.status) {
        return syncState.workpackage.status;
    }
    if (syncState.plan.blockers.length > 0) {
        return 'blocked';
    }
    return 'in_progress';
}
function statusDot(status) {
    switch (status) {
        case 'in_progress':
            return DOT_IN_PROGRESS;
        case 'blocked':
            return DOT_BLOCKED;
        case 'paused':
            return DOT_PAUSED;
        case 'not_started':
        case 'complete':
        case 'deferred':
        case 'archived':
            return DOT_INACTIVE;
        default:
            return DOT_NONE;
    }
}
// =============================================================================
// Bar renderers (threshold asymmetry per AC4)
// =============================================================================
function progressBar(percent) {
    const color = percent < PROGRESS_OK_THRESHOLD
        ? COLOR_CORAL
        : percent < PROGRESS_GREEN_THRESHOLD
            ? COLOR_YELLOW
            : COLOR_GREEN;
    return renderBar(percent, color);
}
function tokenBar(used, max) {
    const pct = max > 0 ? Math.round((used * 100) / max) : 0;
    const clamped = clamp(pct, 0, 100);
    const color = clamped < TOKEN_WARN_THRESHOLD
        ? COLOR_GREEN
        : clamped < TOKEN_DANGER_THRESHOLD
            ? COLOR_YELLOW
            : COLOR_CORAL;
    return `${renderBar(clamped, color)} ${dim(`(${formatTokens(used)}/${formatTokens(max)})`)}`;
}
function clamp(value, lo, hi) {
    if (value < lo)
        return lo;
    if (value > hi)
        return hi;
    return value;
}
function renderBar(percent, color) {
    const filled = Math.floor((percent * BAR_WIDTH) / 100);
    const empty = BAR_WIDTH - filled;
    const filledStr = '▰'.repeat(filled);
    const emptyStr = '▱'.repeat(empty);
    const pctStr = `${String(percent).padStart(3, ' ')}%`;
    return `${color}${filledStr}${RESET}${COLOR_EMPTY}${emptyStr}${RESET} ${color}${pctStr}${RESET}`;
}
function formatTokens(tokens) {
    if (tokens >= 1000000) {
        const m = tokens / 1000000;
        return `${m.toFixed(m >= 10 ? 0 : 1).replace(/\.0$/, '')}M`;
    }
    if (tokens >= 1000) {
        return `${Math.round(tokens / 1000)}K`;
    }
    return `${tokens}`;
}
//# sourceMappingURL=dashboard.js.map