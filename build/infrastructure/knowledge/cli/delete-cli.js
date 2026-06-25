#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge Delete CLI
 *
 * CLI tool for deleting knowledge entries with impact analysis and audit trail.
 * Follows deprecate-cli.ts pattern with additional file removal and index cleanup.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/delete-cli.ts <id> --reason="duplicate entry" --force --clear-dir=/path/.clear
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
exports.runDeleteCLI = runDeleteCLI;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const db_1 = require("../db");
const validation_1 = require("../../validation");
const audit_log_1 = require("../../sync/audit-log");
const context_hub_1 = require("../../sync/context-hub");
const file_index_1 = require("../file-index");
const parser_1 = require("../parser");
const types_1 = require("../types");
const pending_reviews_1 = require("../pending-reviews");
const deprecate_cli_1 = require("./deprecate-cli");
/**
 * Audit-log sentinel marking force-malformed deletions as deliberate
 * CR-KR-3 (deprecate-don't-delete) violations. Downstream consumers
 * (status-cli, sync) filter on this exact string — keep it as a single
 * source of truth so a rename can't silently break the filter.
 */
const CR_KR_3_VIOLATION_MARKER = 'CR-KR-3-violation';
/**
 * Run delete CLI
 * @param clearDir - Path to .clear directory
 * @param entryId - Knowledge entry ID to delete
 * @param options - Delete options
 * @returns Delete result
 */
async function runDeleteCLI(clearDir, entryId, options) {
    if (!clearDir) {
        return {
            success: false,
            output: 'Error: --clear-dir is required'
        };
    }
    if (!entryId) {
        return {
            success: false,
            output: 'Error: Knowledge entry ID is required'
        };
    }
    // WP-PS3 phase_b AC19-AC22 (S177, POST-70): --force-malformed escape hatch.
    // Narrowly scoped to ID-validator-rejected entries (cleanup of historical
    // artifacts like undefined-XXX from old capture-cli bugs). Deliberate
    // CR-KR-3 violation (bypasses deprecate-don't-delete). Guarded by:
    //   (a) double opt-in (AC20: --force-malformed + --yes-i-mean-it)
    //   (b) scope restriction to ID-validator-rejected entries only (AC21)
    //   (c) audit log entry with 'CR-KR-3-violation' marker for posterity (AC25)
    if (options?.forceMalformed) {
        if (!options?.yesIMeanIt) {
            // AC20: --force-malformed alone fails fast with explicit double-opt-in
            // requirement. STDERR-bound warning + actionable error.
            return {
                success: false,
                output: '[CLEAR] --force-malformed deletes a malformed entry, violating CR-KR-3 (deprecate-don\'t-delete). ' +
                    'This bypasses the audit trail. If you understand the consequences, re-run with both ' +
                    '--force-malformed AND --yes-i-mean-it.'
            };
        }
        if ((0, parser_1.isValidId)(entryId)) {
            // AC21: scope guard. Valid-ID entries MUST go through deprecate/supersede,
            // not the cleanup escape hatch.
            return {
                success: false,
                output: `[CLEAR] --force-malformed is only for ID-validator-rejected entries. ` +
                    `Entry ${entryId} has a valid ID format — use deprecate-cli or supersede-cli for ` +
                    `legitimate lifecycle transitions.`
            };
        }
        return runForceDeleteMalformed(clearDir, entryId, options);
    }
    // Validate ID format to prevent path traversal. LINT-K3.5-03: example list
    // delegated to the shared `formatValidIdExamples()` helper so all four
    // CLIs surface the same prefix matrix.
    if (!(0, parser_1.isValidId)(entryId)) {
        return {
            success: false,
            output: `Error: Invalid entry ID format: '${entryId}'. Expected format: ${(0, types_1.formatValidIdExamples)()}`
        };
    }
    // --reason is mandatory for delete
    if (!options?.reason) {
        return {
            success: false,
            output: 'Error: --reason is required for delete. Usage: delete <id> --reason="reason text" --force'
        };
    }
    const db = new db_1.KnowledgeDatabase(clearDir);
    const initialized = db.initialize();
    if (!initialized) {
        db.close();
        return {
            success: false,
            output: 'Error: Failed to initialize knowledge database'
        };
    }
    try {
        // Get knowledge entry
        const entry = db.getEntry(entryId);
        if (!entry) {
            throw new deprecate_cli_1.KnowledgeNotFoundError(entryId);
        }
        // Get impact analysis
        const impact = (0, deprecate_cli_1.getDeprecationImpact)(db, entryId);
        // Guard: active entries with references require --force
        if (!options.force && (entry.status === 'active' || impact.hasReferences)) {
            const lines = [];
            lines.push(`⚠️ Deleting ${entryId} "${entry.title}" (status: ${entry.status})`);
            lines.push('');
            lines.push((0, deprecate_cli_1.formatImpactAnalysis)(impact));
            lines.push('');
            lines.push('This will permanently:');
            lines.push('  - Remove the entry file from disk');
            lines.push('  - Remove from SQLite search index');
            lines.push('  - Remove from file-knowledge index');
            lines.push('  - Create an audit log entry');
            lines.push('');
            lines.push('Use --force to proceed.');
            return {
                success: true,
                output: lines.join('\n'),
                entryId,
                impact,
                deleted: false
            };
        }
        const reason = options.reason;
        // 1. Delete the markdown file
        const entryFilePath = path.join(clearDir, 'knowledge', 'entries', `${entryId}.md`);
        if (fs.existsSync(entryFilePath)) {
            fs.unlinkSync(entryFilePath);
        }
        // 2. Remove from SQLite
        const dbDeleted = db.deleteEntry(entryId);
        if (!dbDeleted) {
            process.stderr.write(`[CLEAR] Warning: entry ${entryId} not found in SQLite (index drift)\n`);
        }
        // 3. Update file-knowledge index (removes all references to this entry)
        try {
            (0, file_index_1.updateIndex)(clearDir, entryId);
        }
        catch (indexError) {
            process.stderr.write(`[CLEAR] Warning: file-index update failed for ${entryId}: ${indexError instanceof Error ? indexError.message : String(indexError)}\n`);
        }
        // 4. K2.7 gap fix: remove from sync-state deprecatedReferences so the entry
        // stops surfacing in session-start warning banner (prevents ghost warnings
        // for entries that no longer exist).
        try {
            const basePath = path.dirname(clearDir);
            const syncManager = new context_hub_1.SyncStateManager(basePath);
            syncManager.load();
            syncManager.removeDeprecatedReference(entryId);
            syncManager.save();
        }
        catch (syncError) {
            process.stderr.write(`[CLEAR] Warning: failed to remove ${entryId} from deprecatedReferences: ${syncError instanceof Error ? syncError.message : String(syncError)}\n`);
        }
        // 4b. K2.7 P5 (AC17): drain from pending-reviews.json — entry no longer exists,
        // so any carry-over surface is orphaned.
        try {
            (0, pending_reviews_1.drainPendingReview)(clearDir, entryId);
        }
        catch (drainError) {
            process.stderr.write(`[CLEAR] Warning: failed to drain ${entryId} from pending-reviews: ${drainError instanceof Error ? drainError.message : String(drainError)}\n`);
        }
        // 5. Write audit log entry
        if (options.sessionId && options.sessionNumber) {
            const auditLogger = new audit_log_1.AuditLogger(path.dirname(clearDir), options.sessionId, options.sessionNumber);
            auditLogger.logUpdate('knowledge', 'delete', entryId, {
                targetDisplayId: entryId,
                oldValue: { status: entry.status, title: entry.title },
                newValue: null,
                trigger: 'user_prompt',
                metadata: {
                    reason,
                    operation: 'delete',
                    impactedWorkpackages: impact.workpackages.map(wp => wp.displayId)
                }
            });
        }
        const lines = [];
        lines.push(`Deleted ${entryId}: "${entry.title}"`);
        lines.push('');
        lines.push(`Reason: ${reason}`);
        lines.push('');
        lines.push('Artifacts removed:');
        lines.push('  - Entry file removed from disk');
        lines.push('  - Removed from SQLite search index');
        lines.push('  - File-knowledge index updated');
        lines.push('  - Audit log entry created');
        return {
            success: true,
            output: lines.join('\n'),
            entryId,
            impact,
            deleted: true
        };
    }
    catch (error) {
        if (error instanceof deprecate_cli_1.KnowledgeNotFoundError) {
            return {
                success: false,
                output: `Error: ${error.message}`
            };
        }
        throw error;
    }
    finally {
        db.close();
    }
}
/**
 * WP-PS3 phase_b AC19-AC25 (S177): direct-file delete path for malformed
 * entries that bypass the ID validator. Malformed-prefix files (e.g.,
 * undefined-001.md from historical capture-cli bugs) are not parseable + not
 * in the SQLite index, so the normal lookup/impact-analysis flow does not
 * apply. This path:
 *   1. Verifies the file exists on disk under .clear/knowledge/entries/
 *   2. Removes the file
 *   3. Writes an audit log entry with explicit 'CR-KR-3-violation' marker
 *      (AC25) so future status-cli + sync surfaces can filter for it
 *   4. Loud STDERR warning to make the deliberate violation visible at runtime
 *
 * @internal Scope-restricted by AC21 (caller verifies !isValidId(entryId) first).
 */
function runForceDeleteMalformed(clearDir, entryId, options) {
    const entriesDir = path.join(clearDir, 'knowledge', 'entries');
    const entryFilePath = path.join(entriesDir, `${entryId}.md`);
    // AC19 deliberately bypasses isValidId(), so entryId may contain traversal
    // sequences. Two layered guards:
    //   (a) reject path separators / '..' in entryId outright (fast rejection)
    //   (b) resolved entry file must be a direct child of resolved entriesDir
    if (entryId.includes('/') || entryId.includes('\\') || entryId.includes('..')) {
        return {
            success: false,
            output: `[CLEAR] Refusing to force-delete: entry ID '${entryId}' contains path separator or traversal sequence.`
        };
    }
    const resolvedEntriesDir = path.resolve(entriesDir);
    const resolvedEntryFile = path.resolve(entryFilePath);
    if (path.dirname(resolvedEntryFile) !== resolvedEntriesDir) {
        return {
            success: false,
            output: `[CLEAR] Refusing to force-delete entry path outside entries directory: '${entryId}'.`
        };
    }
    if (!fs.existsSync(entryFilePath)) {
        return {
            success: false,
            output: `[CLEAR] Malformed entry '${entryId}' not found at ${entryFilePath}. Nothing to delete.`
        };
    }
    // AC22: loud STDERR warning on actual execution makes the CR-KR-3 violation
    // visible at runtime, not just in audit logs.
    process.stderr.write(`[CLEAR] Force-deleting malformed entry: ${entryId}. CR-KR-3 violation logged to audit log.\n`);
    try {
        fs.unlinkSync(entryFilePath);
    }
    catch (unlinkError) {
        return {
            success: false,
            output: `[CLEAR] Failed to remove malformed entry file '${entryFilePath}': ${unlinkError instanceof Error ? unlinkError.message : String(unlinkError)}`
        };
    }
    // AC25: audit log entry with CR-KR-3-violation marker. Note: malformed
    // entries aren't in SQLite, so no DB delete needed; not in file-index by
    // construction (parser rejects malformed frontmatter); not in sync-state
    // deprecatedReferences by construction (deprecation flow requires valid ID).
    let auditLogged = false;
    if (options.sessionId && options.sessionNumber !== undefined) {
        try {
            const auditLogger = new audit_log_1.AuditLogger(path.dirname(clearDir), options.sessionId, options.sessionNumber);
            auditLogger.logUpdate('knowledge', 'delete', entryId, {
                targetDisplayId: entryId,
                oldValue: { malformed: true, file_path: entryFilePath },
                newValue: null,
                trigger: 'user_prompt',
                metadata: {
                    reason: options.reason ?? 'force-delete-malformed (cleanup)',
                    operation: 'force-delete-malformed',
                    violation: CR_KR_3_VIOLATION_MARKER
                }
            });
            auditLogged = true;
        }
        catch (auditErr) {
            // Non-fatal: file already removed. Surface a warning.
            process.stderr.write(`[CLEAR] Warning: audit log emit failed for ${entryId}: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}\n`);
        }
    }
    const lines = [];
    lines.push(`Force-deleted malformed entry: ${entryId}`);
    lines.push('');
    lines.push(`Reason: ${options.reason ?? '(none)'}`);
    lines.push('');
    lines.push('Artifacts removed:');
    lines.push('  - Malformed entry file removed from disk');
    if (auditLogged) {
        lines.push(`  - Audit log entry created with ${CR_KR_3_VIOLATION_MARKER} marker`);
    }
    else {
        lines.push('  - Audit log entry SKIPPED (missing --session-id / --session-number)');
    }
    return {
        success: true,
        output: lines.join('\n'),
        entryId,
        deleted: true
    };
}
/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    let entryId = '';
    let reason = '';
    let force = false;
    let forceMalformed = false;
    let yesIMeanIt = false;
    let clearDir = '';
    let sessionId;
    let sessionNumber;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--reason=')) {
            reason = arg.split('=').slice(1).join('=');
        }
        else if (arg === '--force') {
            force = true;
        }
        else if (arg === '--force-malformed') {
            forceMalformed = true;
        }
        else if (arg === '--yes-i-mean-it') {
            yesIMeanIt = true;
        }
        else if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.split('=')[1];
        }
        else if (arg.startsWith('--session-id=')) {
            sessionId = arg.split('=').slice(1).join('=');
        }
        else if (arg.startsWith('--session-number=')) {
            const raw = arg.split('=')[1];
            const parsed = Number.parseInt(raw, 10);
            if (Number.isFinite(parsed)) {
                sessionNumber = parsed;
            }
        }
        else if (!arg.startsWith('--') && !entryId) {
            entryId = arg;
        }
    }
    if (clearDir) {
        clearDir = (0, validation_1.validateBasePath)(clearDir);
    }
    return { entryId, reason, force, forceMalformed, yesIMeanIt, clearDir, sessionId, sessionNumber };
}
// Main execution
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: delete-cli.js <entry-id> [options]',
                '',
                'Arguments:',
                '  <entry-id>                   Knowledge entry ID to delete (positional)',
                '',
                'Options:',
                '  --reason=<text>              Reason for deletion (required for normal delete)',
                '  --force                      Skip confirmation for active entries',
                '  --force-malformed            CLEANUP ONLY: bypass the ID-format validator',
                '                               to delete entries with malformed IDs (e.g.,',
                '                               undefined-XXX from historical capture-cli',
                '                               bugs). Requires --yes-i-mean-it. Logs a',
                '                               CR-KR-3-violation entry to audit log.',
                '                               REJECTED on entries with valid IDs — use',
                '                               deprecate-cli / supersede-cli instead.',
                '  --yes-i-mean-it              Confirms --force-malformed (double opt-in).',
                '  --clear-dir=<path>           Path to .clear directory (required)',
                '  --session-id=<id>            Session ID for audit-log attribution (required for audit emit)',
                '  --session-number=<n>         Session number for audit-log attribution (required for audit emit)',
            ].join('\n')
        }));
        process.exit(0);
    }
    const { entryId, reason, force, forceMalformed, yesIMeanIt, clearDir, sessionId, sessionNumber } = parseArgs();
    runDeleteCLI(clearDir, entryId, {
        reason,
        force,
        forceMalformed,
        yesIMeanIt,
        sessionId,
        sessionNumber
    }).then(result => {
        console.log(result.output);
        process.exit(result.success ? 0 : 1);
    });
}
//# sourceMappingURL=delete-cli.js.map