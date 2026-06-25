#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge Dismiss CLI (K2.7)
 *
 * CLI tool for dismissing a deprecation surfacing warning without superseding
 * or deleting the entry. Used when the user has reviewed the deprecation and
 * confirmed no replacement is needed.
 *
 * Effects:
 *   - Sets supersession_reviewed = true in SQLite (DB-backed flag)
 *   - Writes supersession_reviewed: true to markdown frontmatter (round-trippable)
 *   - Removes entry from sync-state deprecatedReferences (stops surfacing)
 *   - Writes audit log entry
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/dismiss-cli.ts <id> --clear-dir=/path/.clear
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
exports.runDismissCLI = runDismissCLI;
const path = __importStar(require("path"));
const db_1 = require("../db");
const validation_1 = require("../../validation");
const audit_log_1 = require("../../sync/audit-log");
const context_hub_1 = require("../../sync/context-hub");
const parser_1 = require("../parser");
const pending_reviews_1 = require("../pending-reviews");
const capture_cli_1 = require("./capture-cli");
const deprecate_cli_1 = require("./deprecate-cli");
const types_1 = require("../types");
/**
 * Run dismiss CLI
 */
async function runDismissCLI(clearDir, entryId, options) {
    if (!clearDir) {
        return { success: false, output: 'Error: --clear-dir is required' };
    }
    if (!entryId) {
        return { success: false, output: 'Error: Knowledge entry ID is required' };
    }
    if (!(0, parser_1.isValidId)(entryId)) {
        // LINT-K3.5-03: example list via the shared `formatValidIdExamples()` helper.
        return {
            success: false,
            output: `Error: Invalid entry ID format: '${entryId}'. Expected format: ${(0, types_1.formatValidIdExamples)()}`
        };
    }
    const db = new db_1.KnowledgeDatabase(clearDir);
    const initialized = db.initialize();
    if (!initialized) {
        db.close();
        return { success: false, output: 'Error: Failed to initialize knowledge database' };
    }
    try {
        const entry = db.getEntry(entryId);
        if (!entry) {
            throw new deprecate_cli_1.KnowledgeNotFoundError(entryId);
        }
        if (entry.supersession_reviewed) {
            return {
                success: true,
                output: `${entryId} already dismissed — no action taken.`,
                entryId,
                dismissed: false
            };
        }
        // WP-PS2.2 AC12 — DEFENSIVE GUARD: dismiss-cli is scoped to deprecation
        // surfacing acknowledgments. Reject if entry has NO deprecation state —
        // calling dismiss on a non-deprecated entry would corrupt the entry by
        // setting supersession_reviewed=true (the deprecation-ack flag) on an
        // entry that never had a deprecation to acknowledge. Pending-review
        // carry-over has a separate surface (pending-reviews-cli --ack) per
        // POST-72 / WP-PS2.2.
        //
        // Deprecation state is true if EITHER:
        //   (a) entry.deprecated_at is non-null in the DB (entry was deprecated
        //       via deprecate-cli) — primary check per AC12 spec.
        //   (b) entryId appears in sync-state.knowledge.deprecatedReferences
        //       (entry has an active deprecation surfacing warning).
        // The OR-check handles drift: an entry deprecated in DB but missing from
        // sync-state (stale sync) still passes the guard. CR S174 F-SEC-1 caught
        // the initial implementation that only checked (b).
        //
        // Guard loads sync-state ONCE here; the post-mutation
        // removeDeprecatedReference call below reuses this manager instance to
        // avoid double-load.
        const basePath = path.dirname(clearDir);
        let syncManager;
        try {
            syncManager = new context_hub_1.SyncStateManager(basePath);
            syncManager.load();
        }
        catch (syncError) {
            const msg = syncError instanceof Error ? syncError.message : String(syncError);
            return {
                success: false,
                output: `Error: failed to load sync-state for deprecation-guard check: ${msg}`
            };
        }
        // WP-PS2.2 fix-batch (F-TYPE-2): snapshot the array via spread instead of
        // reading the live reference on the SyncStateManager state. Current call
        // ordering (guard before mutation) is safe, but a future maintainer
        // reading the live reference after removeDeprecatedReference() would see
        // post-mutation state silently.
        const deprecatedRefs = [...syncManager.getState().knowledge.deprecatedReferences];
        const inSyncState = deprecatedRefs.includes(entryId);
        const inDb = entry.deprecated_at !== null && entry.deprecated_at !== undefined;
        if (!inSyncState && !inDb) {
            return {
                success: false,
                output: `Error: dismiss-cli is for deprecation acknowledgments. Entry ${entryId} has no active deprecation state (neither in DB deprecated_at nor in sync-state deprecatedReferences). For pending-review carry-over, use /cf-knowledge ack <id> instead.`
            };
        }
        // 1. Set supersession_reviewed = true in DB
        const dbUpdated = db.setSupersessionReviewed(entryId, true);
        if (!dbUpdated) {
            return {
                success: false,
                output: `Error: Failed to set supersession_reviewed for ${entryId}`
            };
        }
        // 2. Update .md frontmatter so the field round-trips through re-index
        const knowledgeDir = path.join(clearDir, 'knowledge', 'entries');
        const entryFilePath = path.join(knowledgeDir, `${entryId}.md`);
        const fileUpdated = (0, parser_1.updateKnowledgeFile)(entryFilePath, {
            supersession_reviewed: true
        });
        if (fileUpdated) {
            (0, capture_cli_1.triggerIndexUpdate)(clearDir, options?.sessionNumber ?? 0, entryId);
        }
        // 3. Remove from sync-state deprecatedReferences (eager drain).
        // WP-PS2.2 — reuses syncManager loaded for the deprecation guard above;
        // no second load needed.
        try {
            syncManager.removeDeprecatedReference(entryId);
            syncManager.save();
        }
        catch (syncError) {
            const msg = syncError instanceof Error ? syncError.message : String(syncError);
            process.stderr.write(`[CLEAR] Warning: failed to remove ${entryId} from deprecatedReferences: ${msg}\n`);
        }
        // 3b. Remove from pending-reviews.json (K2.7 P5 eager drain — AC17)
        try {
            (0, pending_reviews_1.drainPendingReview)(clearDir, entryId);
        }
        catch (drainError) {
            const msg = drainError instanceof Error ? drainError.message : String(drainError);
            process.stderr.write(`[CLEAR] Warning: failed to drain ${entryId} from pending-reviews: ${msg}\n`);
        }
        // 4. Audit log entry.
        // Guard on presence, not truthiness: sessionNumber 0 is the first session
        // of a project and must still emit the audit row.
        if (options?.sessionId && options?.sessionNumber !== undefined) {
            const auditLogger = new audit_log_1.AuditLogger(path.dirname(clearDir), options.sessionId, options.sessionNumber);
            auditLogger.logUpdate('knowledge', 'update', entryId, {
                targetDisplayId: entryId,
                oldValue: { supersession_reviewed: false },
                newValue: { supersession_reviewed: true },
                trigger: 'user_prompt',
                metadata: {
                    operation: 'dismiss',
                    reason: options.reason ?? 'No reason specified'
                }
            });
        }
        const lines = [];
        lines.push(`Dismissed ${entryId}: "${entry.title}"`);
        if (options?.reason) {
            lines.push('');
            lines.push(`Reason: ${options.reason}`);
        }
        lines.push('');
        lines.push('Effects:');
        lines.push('  - supersession_reviewed flag set (DB + frontmatter)');
        lines.push('  - Removed from session-start deprecation banner');
        if (options?.sessionId) {
            lines.push('  - Audit log entry created');
        }
        return {
            success: true,
            output: lines.join('\n'),
            entryId,
            dismissed: true
        };
    }
    catch (error) {
        if (error instanceof deprecate_cli_1.KnowledgeNotFoundError) {
            return { success: false, output: `Error: ${error.message}` };
        }
        throw error;
    }
    finally {
        db.close();
    }
}
/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    let entryId = '';
    let reason = '';
    let clearDir = '';
    for (const arg of args) {
        if (arg.startsWith('--reason=')) {
            reason = arg.split('=').slice(1).join('=');
        }
        else if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.split('=')[1];
        }
        else if (!arg.startsWith('--') && !entryId) {
            entryId = arg;
        }
    }
    if (clearDir) {
        clearDir = (0, validation_1.validateBasePath)(clearDir);
    }
    return { entryId, reason, clearDir };
}
// Main execution
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: dismiss-cli.js <entry-id> [options]',
                '',
                'Dismiss a deprecation surfacing warning without superseding or deleting.',
                '',
                'Arguments:',
                '  <entry-id>                   Knowledge entry ID to dismiss (positional)',
                '',
                'Options:',
                '  --reason=<text>              Optional reason for dismissal (audit metadata)',
                '  --clear-dir=<path>           Path to .clear directory (required)',
            ].join('\n')
        }));
        process.exit(0);
    }
    const { entryId, reason, clearDir } = parseArgs();
    runDismissCLI(clearDir, entryId, { reason }).then(result => {
        console.log(result.output);
        process.exit(result.success ? 0 : 1);
    });
}
//# sourceMappingURL=dismiss-cli.js.map