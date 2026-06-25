#!/usr/bin/env npx ts-node
"use strict";
/**
 * Pending-reviews CLI (K2.7 P5 + WP-PS2.2)
 *
 * Emits the session-start carry-over banner for knowledge entries that were
 * surfaced via PostToolUse but not actioned in the previous session. Parallels
 * warnings-cli.ts (P3 deprecation warnings) — both feed session-start's
 * additionalContext stream.
 *
 * WP-PS2.2 (POST-72): adds --ack=<id> and --ack-all write actions. These
 * acknowledge a pending-review carry-over WITHOUT touching deprecation state
 * (distinct from dismiss-cli which is for deprecation acknowledgments).
 *
 * Usage:
 *   Read-only banner (backward-compatible default):
 *     npx ts-node pending-reviews-cli.ts --clear-dir=/path/.clear
 *
 *   Acknowledge a single pending-review entry:
 *     npx ts-node pending-reviews-cli.ts --ack=<id> --clear-dir=/path/.clear
 *
 *   Acknowledge ALL pending-review entries:
 *     npx ts-node pending-reviews-cli.ts --ack-all --clear-dir=/path/.clear
 *
 * Output:
 *   - Default mode: empty (exit 0) when queue empty OR all entries filtered out by
 *     lazy check; multi-line banner text on stdout otherwise.
 *   - --ack mode: single-line confirmation on stdout; exit 0 on success or no-op;
 *     exit 1 on validation failure.
 *   - --ack-all mode: count message on stdout; exit 0.
 *
 * WP-PS2.2 corruption prevention: --ack does NOT call db.setSupersessionReviewed,
 * does NOT modify markdown frontmatter, does NOT touch sync-state.deprecatedReferences.
 * For deprecation acknowledgments use dismiss-cli.
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
exports.runAckCLI = runAckCLI;
exports.runAckAllCLI = runAckAllCLI;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const validation_1 = require("../../validation");
const audit_log_1 = require("../../sync/audit-log");
const pending_reviews_1 = require("../pending-reviews");
const parser_1 = require("../parser");
const types_1 = require("../types");
/**
 * Read the raw pending-reviews queue WITHOUT the lazy file-existence filter
 * applied by `readPendingReviews()`. WP-PS2.2 F-SEC-2: --ack-all must be able
 * to drain "zombie" entries whose .md file no longer exists — otherwise
 * those entries silently accumulate in pending-reviews.json forever and the
 * banner never shows them.
 *
 * Encapsulated here (rather than re-exported from pending-reviews.ts) to
 * preserve the existing module's narrow public surface; the helper reads
 * the file directly with the same validation contract as readQueue().
 */
function readRawPendingQueue(clearDir) {
    const queuePath = path.join(clearDir, 'state', 'pending-reviews.json');
    if (!fs.existsSync(queuePath)) {
        return [];
    }
    try {
        const raw = fs.readFileSync(queuePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.entries)) {
            return [];
        }
        // Validate each entry against the contract enforced by isValidPendingEntry
        // in pending-reviews.ts. We re-validate here rather than import the private
        // helper to keep the module boundary clean.
        return parsed.entries.filter((e) => {
            if (typeof e !== 'object' || e === null)
                return false;
            const r = e;
            return (typeof r.entry_id === 'string' &&
                (0, parser_1.isValidId)(r.entry_id) &&
                typeof r.trigger === 'string' &&
                typeof r.file_path === 'string' &&
                typeof r.added_at === 'string' &&
                typeof r.source_tool === 'string');
        });
    }
    catch {
        return [];
    }
}
/**
 * Sanitize a string for inclusion in the carry-over banner emitted to
 * additionalContext (which gets concatenated into Claude's context window).
 * WP-PS2.2 F-SEC-6: a crafted pending-review entry with newlines in
 * file_path or source_tool could inject prompt fragments. Sanitization
 * collapses any whitespace run (including newlines, tabs, CR) into a single
 * space and trims edges.
 */
function sanitizeBannerField(s) {
    return s.replace(/\s+/g, ' ').trim();
}
/**
 * Acknowledge a single pending-review entry by ID.
 *
 * Effects (WP-PS2.2 corruption-prevention contract):
 *   - Removes <entryId> from .clear/state/pending-reviews.json (via drainPendingReview)
 *   - Writes audit log entry with metadata.ack_target='pending_review' (distinguishes
 *     from deprecation-ack which uses oldValue/newValue on supersession_reviewed)
 *   - DOES NOT touch supersession_reviewed flag in DB or markdown frontmatter
 *   - DOES NOT touch sync-state.deprecatedReferences
 *
 * Idempotent: if <entryId> is not in pending-reviews.json, returns success with
 * no-op message and writes NO audit log entry (silent in audit).
 */
async function runAckCLI(clearDir, entryId, options) {
    if (!clearDir) {
        return { success: false, output: 'Error: --clear-dir is required' };
    }
    if (!entryId) {
        return { success: false, output: 'Error: --ack=<id> requires a non-empty entry ID argument' };
    }
    if (!(0, parser_1.isValidId)(entryId)) {
        return {
            success: false,
            output: `Error: Invalid entry ID format: '${entryId}'. Expected format: ${(0, types_1.formatValidIdExamples)()}`
        };
    }
    let drained = false;
    try {
        drained = (0, pending_reviews_1.drainPendingReview)(clearDir, entryId);
    }
    catch (drainError) {
        const msg = drainError instanceof Error ? drainError.message : String(drainError);
        return {
            success: false,
            output: `Error: failed to drain ${entryId} from pending-reviews: ${msg}`
        };
    }
    if (!drained) {
        return {
            success: true,
            output: `${entryId} was not in pending-reviews — no action taken.`,
            entryId,
            drained: false
        };
    }
    // Guard on presence, not truthiness: sessionNumber 0 is the first session
    // of a project and must still emit the audit row.
    if (options?.sessionId && options?.sessionNumber !== undefined) {
        const auditLogger = new audit_log_1.AuditLogger(path.dirname(clearDir), options.sessionId, options.sessionNumber);
        // WP-PS2.2 fix-batch (F-LINT-1 + F-TYPE-1 cross-role duplicate per
        // [[feedback_cross_role_duplicate_high_confidence]]): use distinct 'ack'
        // AuditAction instead of overloading 'update'. dismiss-cli stays on
        // 'update' (it mutates supersession_reviewed) — audit consumers can now
        // filter ack vs deprecation-ack by action alone, not by metadata key.
        auditLogger.logUpdate('knowledge', 'ack', entryId, {
            targetDisplayId: entryId,
            trigger: 'user_prompt',
            metadata: {
                operation: 'ack',
                ack_target: 'pending_review'
            }
        });
    }
    return {
        success: true,
        output: `Acknowledged ${entryId}: removed from pending-reviews carry-over. (Deprecation state untouched.)`,
        entryId,
        drained: true
    };
}
/**
 * Acknowledge ALL pending-review entries currently in the queue.
 *
 * Reads pending-reviews.json (with lazy file-existence filter), drains each
 * entry, writes one audit log entry per drain (correlated by AuditLogger
 * correlationId for grouping). Idempotent for empty queue.
 */
async function runAckAllCLI(clearDir, options) {
    if (!clearDir) {
        return {
            success: false,
            output: 'Error: --clear-dir is required',
            drainedCount: 0,
            drainedIds: [],
            failedIds: []
        };
    }
    // WP-PS2.2 fix-batch (F-SEC-2): use RAW queue read (no lazy file-existence
    // filter) so "zombie" entries whose .md file has been deleted CAN be
    // cleared by --ack-all. readPendingReviews() applies a lazy filter that
    // omits zombies from the banner, but if we used the same filter here those
    // entries would silently accumulate in pending-reviews.json forever — the
    // exact failure class WP-PS2.2 was filed to fix.
    const entries = readRawPendingQueue(clearDir);
    if (entries.length === 0) {
        return {
            success: true,
            output: 'No pending reviews to acknowledge.',
            drainedCount: 0,
            drainedIds: [],
            failedIds: []
        };
    }
    const drainedIds = [];
    const failedIds = [];
    for (const e of entries) {
        try {
            const drained = (0, pending_reviews_1.drainPendingReview)(clearDir, e.entry_id);
            if (drained) {
                drainedIds.push(e.entry_id);
            }
            else {
                // drainPendingReview returns false if the ID was not in the queue at
                // drain time (race or already-drained). Not a hard failure.
                failedIds.push(e.entry_id);
            }
        }
        catch (drainError) {
            const msg = drainError instanceof Error ? drainError.message : String(drainError);
            process.stderr.write(`[CLEAR] Warning: failed to drain ${e.entry_id}: ${msg}\n`);
            failedIds.push(e.entry_id);
        }
    }
    // Guard on presence, not truthiness: sessionNumber 0 is the first session
    // of a project and must still emit the audit row.
    if (drainedIds.length > 0 && options?.sessionId && options?.sessionNumber !== undefined) {
        const auditLogger = new audit_log_1.AuditLogger(path.dirname(clearDir), options.sessionId, options.sessionNumber);
        // WP-PS2.2 fix-batch (F-LINT-1 + F-TYPE-1): use 'ack' action — see
        // runAckCLI rationale above. Correlated so all drains in one --ack-all
        // call share a correlation ID for audit-log grouping.
        auditLogger.logCorrelated(drainedIds.map(id => ({
            domain: 'knowledge',
            action: 'ack',
            target: id,
            targetDisplayId: id,
            trigger: 'user_prompt',
            metadata: {
                operation: 'ack',
                ack_target: 'pending_review',
                batch: 'ack-all'
            }
        })));
    }
    // WP-PS2.2 fix-batch (F-LINT-2): expose partial-failure via failedIds +
    // output message. Pre-fix, a partial failure (some entries failed to drain)
    // returned success=true with no signal that drains were incomplete —
    // exactly the silent-re-surface class WP-PS2.2 was filed to fix.
    const count = drainedIds.length;
    const noun = count === 1 ? 'pending review' : 'pending reviews';
    let output = `Acknowledged ${count} ${noun}`;
    if (drainedIds.length > 0) {
        output += `: ${drainedIds.join(', ')}`;
    }
    output += '. (Deprecation state untouched.)';
    if (failedIds.length > 0) {
        output += ` ${failedIds.length} entr${failedIds.length === 1 ? 'y' : 'ies'} failed to drain: ${failedIds.join(', ')} (may re-surface next session — see stderr for details).`;
    }
    return {
        success: failedIds.length === 0,
        output,
        drainedCount: count,
        drainedIds,
        failedIds
    };
}
function parseArgs() {
    const args = process.argv.slice(2);
    let clearDir = '';
    let ack = '';
    let ackAll = false;
    let sessionId = '';
    let sessionNumber;
    for (const arg of args) {
        if (arg.startsWith('--clear-dir=')) {
            // WP-PS2.2 fix-batch (F-SEC-3): use slice(1).join('=') so paths
            // containing '=' (rare but legal on some filesystems) aren't truncated.
            // Matches the --ack= parsing convention below for internal consistency.
            clearDir = arg.split('=').slice(1).join('=');
        }
        else if (arg.startsWith('--ack=')) {
            ack = arg.split('=').slice(1).join('=');
        }
        else if (arg === '--ack-all') {
            ackAll = true;
        }
        else if (arg.startsWith('--session-id=')) {
            sessionId = arg.split('=').slice(1).join('=');
        }
        else if (arg.startsWith('--session-number=')) {
            const v = arg.split('=').slice(1).join('=');
            const parsed = parseInt(v, 10);
            if (!Number.isNaN(parsed)) {
                sessionNumber = parsed;
            }
            else {
                process.stderr.write(`[CLEAR] Warning: --session-number=${v} is not numeric; audit log entry will be skipped for this invocation\n`);
            }
        }
    }
    if (clearDir) {
        clearDir = (0, validation_1.validateBasePath)(clearDir);
    }
    return { clearDir, ack, ackAll, sessionId, sessionNumber };
}
async function main() {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log([
            'Usage: pending-reviews-cli.js [--clear-dir=<path>] [action]',
            '',
            'Surfaces or acknowledges knowledge entries carried over from prior',
            'session PostToolUse surfacing warnings.',
            '',
            'Actions (mutually exclusive — pick at most one):',
            '  (default)                    Print the carry-over banner (read-only)',
            '  --ack=<id>                   Acknowledge a single pending-review entry',
            '                               (drains from pending-reviews.json; does NOT',
            '                               touch deprecation state — for that use',
            '                               dismiss-cli)',
            '  --ack-all                    Acknowledge ALL pending-review entries',
            '',
            'Common options:',
            '  --clear-dir=<path>           Path to .clear directory (required)',
            '  --session-id=<id>            Session ID for audit log (optional)',
            '  --session-number=<n>         Session number for audit log (optional)',
            '  --help                       Show this help'
        ].join('\n'));
        process.exit(0);
    }
    const { clearDir, ack, ackAll, sessionId, sessionNumber } = parseArgs();
    if (!clearDir) {
        process.stderr.write('Error: --clear-dir is required\n');
        process.exit(1);
    }
    // WP-PS2.2: --ack-all mode
    if (ackAll) {
        const result = await runAckAllCLI(clearDir, { sessionId, sessionNumber });
        console.log(result.output);
        process.exit(result.success ? 0 : 1);
    }
    // WP-PS2.2: --ack=<id> mode
    if (ack) {
        const result = await runAckCLI(clearDir, ack, { sessionId, sessionNumber });
        console.log(result.output);
        process.exit(result.success ? 0 : 1);
    }
    // Default mode (backward-compatible): print carry-over banner
    const entries = (0, pending_reviews_1.readPendingReviews)(clearDir);
    if (entries.length === 0) {
        return;
    }
    const lines = [];
    lines.push('**Knowledge review carry-over (suggested review):** The following knowledge entries were surfaced in a prior session but have not been actioned. For each, please confirm with the user whether the entry still reflects reality, needs supersession, or can be dismissed:');
    for (const e of entries) {
        // WP-PS2.2 fix-batch (F-SEC-6): sanitize source_tool and file_path before
        // emission. These fields originate from PostToolUse input and flow into
        // additionalContext (Claude's context window). Crafted newlines or
        // whitespace-control chars could otherwise inject prompt fragments.
        // entry_id is already validated via isValidId (strict prefix-NNN format).
        const safeSource = sanitizeBannerField(e.source_tool);
        const safePath = sanitizeBannerField(e.file_path);
        lines.push(`  - ${e.entry_id} (surfaced by ${safeSource} on ${safePath})`);
    }
    lines.push('Run `/cf-knowledge show <id>` to inspect, `/cf-knowledge supersede <old> <new>` to replace, `/cf-knowledge capture --update --id=<id>` to refresh, or `/cf-knowledge ack <id>` to mark reviewed (use `/cf-knowledge ack --all` to clear all). Use `/cf-knowledge dismiss <id>` ONLY for entries that appear in the deprecation banner (different surface).');
    console.log(lines.join('\n'));
}
if (require.main === module) {
    main().catch(err => {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=pending-reviews-cli.js.map