#!/usr/bin/env npx ts-node
"use strict";
/**
 * Session-start dashboard CLI (WP-PS4 AD-04).
 *
 * Thin wrapper around src/infrastructure/session/dashboard.ts. Resolves all
 * I/O from CLEAR consumer artifacts and hands a fully-populated
 * DashboardContext to the pure renderer.
 *
 * Sources (all under <clearDir>):
 *   - state/sync-state.json         -> SyncState (workpackage, plan, knowledge, links)
 *   - state/session.json            -> session number, status, token estimate
 *   - state/pending-reviews.json    -> pendingReviewCount (via readPendingReviews)
 *   - plans/master-plan.yaml        -> active phase name (per D-10 path correction)
 *   - knowledge/index.db            -> recent entry titles (per D-11 + DB filename)
 *   - sessions/session_*.md         -> latest handoff Summary + N + date (per D-13/D-16)
 *
 * Non-fatal: any missing or unparseable source falls back to empty-state
 * rendering for that section (per WP-PS4 AC9). The dashboard always prints.
 *
 * Usage:
 *   node dashboard-cli.js --clear-dir=/path/.clear
 *   npx ts-node dashboard-cli.ts --clear-dir=/path/.clear
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractSummaryLines = extractSummaryLines;
exports.runDashboardCLI = runDashboardCLI;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const validation_1 = require("../../validation");
const types_1 = require("../../sync/types");
const pending_reviews_1 = require("../../knowledge/pending-reviews");
const db_1 = require("../../knowledge/db");
const parser_1 = require("../../plan/parser");
const dashboard_1 = require("../dashboard");
const HANDOFF_FILENAME_RE = /^session_(\d+)_(\d{8})\.md$/;
/**
 * SEC-001 (S191 CR fix-batch): every untrusted string flowing into
 * additionalContext (Claude's context surface) must collapse whitespace runs
 * to a single space + trim. An adversary with .clear/ write access could
 * otherwise inject prompt fragments via knowledge-entry titles, phase names,
 * blockers, WP titles, or handoff summary lines. Same shape as
 * pending-reviews-cli.ts:107 sanitizeBannerField (WP-PS2.2 F-SEC-6).
 */
function sanitizeBannerField(s) {
    return s.replace(/\s+/g, ' ').trim();
}
/**
 * Generic safe-loader (LINT-001): wraps a load function with try/catch and
 * returns the fallback on any throw. Centralizes the non-fatal contract
 * (WP-PS4 AC9) so each loader can express its happy path linearly.
 */
function safeLoad(load, fallback) {
    try {
        return load();
    }
    catch {
        return fallback;
    }
}
/**
 * Structural guard for sync-state.json (TS-001): `JSON.parse(...) as SyncState`
 * casts the raw value without verifying the required nested objects. A
 * truncated or schema-drifted file would type-pass and then NPE inside the
 * renderer. This guard re-asserts the load-bearing shape (SyncState has 4
 * non-nullable nested objects per src/infrastructure/sync/types.ts:299-323)
 * before the file is trusted.
 */
function isValidSyncState(v) {
    if (typeof v !== 'object' || v === null)
        return false;
    const r = v;
    const hasObj = (k) => typeof r[k] === 'object' && r[k] !== null;
    return (hasObj('session') &&
        hasObj('workpackage') &&
        hasObj('plan') &&
        hasObj('knowledge'));
}
/**
 * Structural guard for session.json (TS-002): same rationale as
 * isValidSyncState. We only need the top-level shape to be an object;
 * RawSessionFile fields are all optional and individually defaulted.
 */
function isValidRawSessionFile(v) {
    return typeof v === 'object' && v !== null;
}
// =============================================================================
// Source loaders (each returns a fallback on failure; no throws escape)
// =============================================================================
function loadSyncState(clearDir) {
    const filePath = path.join(clearDir, 'state', 'sync-state.json');
    if (!fs.existsSync(filePath)) {
        return (0, types_1.createDefaultSyncState)();
    }
    return safeLoad(() => {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!isValidSyncState(parsed)) {
            return (0, types_1.createDefaultSyncState)();
        }
        // SEC-001: sanitize the user-authored strings before they reach
        // additionalContext. Workpackage title, blockers, and previous-WP displayId
        // can carry newlines from WP YAML / plan.blockers entries.
        sanitizeSyncStateInPlace(parsed);
        return parsed;
    }, (0, types_1.createDefaultSyncState)());
}
function sanitizeSyncStateInPlace(s) {
    s.workpackage.title = sanitizeBannerField(s.workpackage.title);
    s.workpackage.displayId = sanitizeBannerField(s.workpackage.displayId);
    s.plan.activePhaseDisplayId = sanitizeBannerField(s.plan.activePhaseDisplayId);
    s.plan.blockers = s.plan.blockers.map(sanitizeBannerField);
    if (s.previousWorkpackage) {
        s.previousWorkpackage.displayId = sanitizeBannerField(s.previousWorkpackage.displayId);
    }
}
function loadSessionInfo(clearDir, syncState) {
    const filePath = path.join(clearDir, 'state', 'session.json');
    const raw = fs.existsSync(filePath)
        ? safeLoad(() => {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return isValidRawSessionFile(parsed) ? parsed : {};
        }, {})
        : {};
    const clearSessionNumber = raw.clearSessionNumber ?? syncState.session.number ?? 0;
    const status = raw.status ?? syncState.session.status ?? 'active';
    // session.json stores estimate as a fraction (0-1); contextWindow.size is
    // the harness-reported max. tokensUsed = floor(estimate * size). sync-state
    // already stores a computed tokensUsed; we prefer the live session.json
    // value when present since it tracks per-prompt updates via session-monitor.
    let tokensUsed = syncState.session.tokensUsed ?? 0;
    if (raw.tokenUsage?.estimate !== undefined && raw.contextWindow?.size !== undefined) {
        tokensUsed = Math.floor(raw.tokenUsage.estimate * raw.contextWindow.size);
    }
    return { clearSessionNumber, tokensUsed, status };
}
function loadPendingReviewCount(clearDir) {
    try {
        return (0, pending_reviews_1.readPendingReviews)(clearDir).length;
    }
    catch {
        return 0;
    }
}
function loadPhaseName(clearDir, activePhaseSystemId) {
    if (!activePhaseSystemId) {
        return '';
    }
    // Path correction (S190 SD1 D-10): plural `plans/`, sourced from
    // src/infrastructure/plan/registry.ts:116-120. plan-defaults.yaml text
    // says singular `plan/` but runtime code uses plural. Runtime wins.
    const planPath = path.join(clearDir, 'plans', 'master-plan.yaml');
    return safeLoad(() => {
        const plan = (0, parser_1.parseMasterPlanYaml)(planPath);
        if (!plan) {
            return '';
        }
        const phase = plan.phases.find(ph => ph.systemId === activePhaseSystemId);
        if (!phase) {
            // STD-003 (CS3 fail-fast diagnostic): a sync-state activePhaseSystemId
            // that doesn't match any phase in master-plan.yaml is a soft
            // inconsistency; render falls back to displayId-only but operators need
            // a stderr breadcrumb to investigate the drift.
            process.stderr.write(`[dashboard-cli] phase systemId '${activePhaseSystemId}' not found in master-plan.yaml; rendering with empty phase name\n`);
            return '';
        }
        return sanitizeBannerField(phase.name);
    }, '');
}
function loadRecentEntryTitles(clearDir, entryIds) {
    const titles = new Map();
    if (entryIds.length === 0) {
        return titles;
    }
    // DB filename correction (S190 SD1 D-11): index.db (not knowledge.db).
    // KnowledgeDatabase constructor joins clearDir/knowledge/index.db per
    // src/infrastructure/knowledge/db.ts:129.
    const dbPath = path.join(clearDir, 'knowledge', 'index.db');
    if (!fs.existsSync(dbPath)) {
        return titles;
    }
    const db = new db_1.KnowledgeDatabase(clearDir);
    try {
        if (!db.initialize()) {
            return titles;
        }
        for (const id of entryIds) {
            try {
                const entry = db.getEntry(id);
                if (entry && entry.title) {
                    // SEC-001: sanitize before banner emission.
                    titles.set(id, sanitizeBannerField(entry.title));
                }
            }
            catch {
                // skip this ID, continue with the rest
            }
        }
    }
    catch {
        // initialization failed; return whatever we collected
    }
    finally {
        try {
            db.close();
        }
        catch {
            // ignore
        }
    }
    return titles;
}
function loadLastSession(clearDir) {
    const sessionsDir = path.join(clearDir, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
        return { summary: [], number: null, date: null };
    }
    let candidates;
    try {
        candidates = fs
            .readdirSync(sessionsDir)
            .filter(f => HANDOFF_FILENAME_RE.test(f))
            .map(f => {
            const full = path.join(sessionsDir, f);
            return { file: f, mtime: fs.statSync(full).mtimeMs };
        });
    }
    catch {
        return { summary: [], number: null, date: null };
    }
    if (candidates.length === 0) {
        return { summary: [], number: null, date: null };
    }
    candidates.sort((a, b) => b.mtime - a.mtime);
    const latest = candidates[0].file;
    const match = HANDOFF_FILENAME_RE.exec(latest);
    if (!match) {
        return { summary: [], number: null, date: null };
    }
    const number = parseInt(match[1], 10);
    const dateRaw = match[2];
    const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
    const summary = safeLoad(() => {
        const content = fs.readFileSync(path.join(sessionsDir, latest), 'utf8');
        // SEC-001: handoff content is user-authored markdown — sanitize each line
        // before it flows into Claude's context.
        return extractSummaryLines(content, dashboard_1.SUMMARY_LINE_MAX).map(sanitizeBannerField);
    }, []);
    return { summary, number, date };
}
/**
 * Extract the first non-empty `maxLines` content lines from the cf-handoff
 * `## Summary` section. Section names follow cf-handoff canonical per
 * scripts/session/session-handoff.sh:191 — NOT Bulwark dev-style.
 */
function extractSummaryLines(content, maxLines) {
    const lines = content.split(/\r?\n/);
    const out = [];
    let inSection = false;
    for (const line of lines) {
        if (/^## Summary\s*$/.test(line)) {
            inSection = true;
            continue;
        }
        if (inSection && /^## /.test(line)) {
            break;
        }
        if (inSection) {
            const trimmed = line.trim();
            if (trimmed.length === 0) {
                continue;
            }
            out.push(trimmed);
            if (out.length >= maxLines) {
                break;
            }
        }
    }
    return out;
}
function parseArgs(argv) {
    let clearDir = '';
    let help = false;
    for (const arg of argv) {
        if (arg === '--help' || arg === '-h' || arg === 'help') {
            help = true;
        }
        else if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.split('=').slice(1).join('=');
        }
    }
    return { clearDir, help };
}
function printHelp() {
    console.log([
        'Usage: dashboard-cli.js --clear-dir=<path>',
        '',
        'Renders the session-start ASCII dashboard from CLEAR consumer state',
        '(sync-state.json + session.json + pending-reviews.json + master-plan.yaml',
        '+ knowledge/index.db + latest sessions/session_*.md handoff).',
        '',
        'Options:',
        '  --clear-dir=<path>           Path to .clear directory (required)',
        '  --help, -h                   Show this help',
        '',
        'Output: dashboard text on stdout. Exit 0 always (non-fatal source',
        'failures fall back to empty-state rendering per WP-PS4 AC9).',
    ].join('\n'));
}
function runDashboardCLI(clearDir) {
    const syncState = loadSyncState(clearDir);
    const sessionInfo = loadSessionInfo(clearDir, syncState);
    const pendingReviewCount = loadPendingReviewCount(clearDir);
    const phaseName = loadPhaseName(clearDir, syncState.plan.activePhaseSystemId);
    const recentEntryTitles = loadRecentEntryTitles(clearDir, syncState.knowledge.recentEntries);
    const lastSession = loadLastSession(clearDir);
    const ctx = {
        pendingReviewCount,
        phaseName,
        recentEntryTitles,
        lastSessionSummary: lastSession.summary,
        lastSessionNumber: lastSession.number,
        lastSessionDate: lastSession.date,
    };
    return (0, dashboard_1.renderDashboard)(syncState, sessionInfo, ctx);
}
function main() {
    const { clearDir, help } = parseArgs(process.argv.slice(2));
    if (help) {
        printHelp();
        process.exit(0);
    }
    if (!clearDir) {
        process.stderr.write('Error: --clear-dir is required\n');
        process.exit(1);
    }
    const validated = (0, validation_1.validateBasePath)(clearDir);
    // SEC-002 defense-in-depth: validateBasePath rejects '..' traversal but
    // does not enforce the .clear-suffix convention. A misconfigured caller
    // pointing at an attacker-controlled directory would otherwise feed
    // adversarial data into the SEC-001 sanitization pipeline. Belt-and-braces.
    const clearSuffix = `${path.sep}.clear`;
    if (!validated.endsWith(clearSuffix) && !validated.endsWith('/.clear')) {
        process.stderr.write(`Error: --clear-dir must end with /.clear (got '${validated}')\n`);
        process.exit(1);
    }
    // AC9 non-fatal contract: even if .clear is malformed, emit empty-state
    // dashboard. Crashing here would lose carry-over signal entirely.
    try {
        const output = runDashboardCLI(validated);
        process.stdout.write(output);
        process.stdout.write('\n');
    }
    catch (err) {
        process.stderr.write(`[dashboard-cli] non-fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(0);
    }
}
if (require.main === module) {
    main();
}
//# sourceMappingURL=dashboard-cli.js.map