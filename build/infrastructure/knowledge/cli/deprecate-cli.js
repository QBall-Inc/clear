#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge Deprecate CLI
 *
 * CLI tool for deprecating knowledge entries with impact analysis.
 * Deprecation is human-initiated only - marks knowledge as outdated
 * when no replacement exists.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/deprecate-cli.ts <id> --clear-dir=/path/.clear
 *   npx ts-node src/infrastructure/knowledge/cli/deprecate-cli.ts <id> --reason="Outdated approach" --clear-dir=/path/.clear
 *   npx ts-node src/infrastructure/knowledge/cli/deprecate-cli.ts <id> --force --clear-dir=/path/.clear
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
exports.InvalidDeprecationError = exports.KnowledgeNotFoundError = void 0;
exports.getDeprecationImpact = getDeprecationImpact;
exports.formatImpactAnalysis = formatImpactAnalysis;
exports.validateEntryForDeprecation = validateEntryForDeprecation;
exports.runDeprecateCLI = runDeprecateCLI;
const path = __importStar(require("path"));
const db_1 = require("../db");
const types_1 = require("../types");
const validation_1 = require("../../validation");
const audit_log_1 = require("../../sync/audit-log");
const context_hub_1 = require("../../sync/context-hub");
const parser_1 = require("../parser");
const capture_cli_1 = require("./capture-cli");
/**
 * Knowledge not found error
 */
class KnowledgeNotFoundError extends Error {
    constructor(id) {
        super(`Knowledge entry not found: ${id}`);
        this.id = id;
        this.name = 'KnowledgeNotFoundError';
    }
}
exports.KnowledgeNotFoundError = KnowledgeNotFoundError;
/**
 * Invalid deprecation error
 */
class InvalidDeprecationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidDeprecationError';
    }
}
exports.InvalidDeprecationError = InvalidDeprecationError;
/**
 * Get deprecation impact analysis for a knowledge entry
 * @param db - Knowledge database
 * @param entryId - Knowledge entry ID
 * @returns Impact analysis
 */
function getDeprecationImpact(db, entryId) {
    const impact = {
        workpackages: [],
        otherEntries: [],
        hasReferences: false
    };
    // Get all entries to check for supersession relationships
    const allEntries = db.getAllEntries();
    for (const entry of allEntries) {
        // Check if this entry supersedes the target
        if (entry.supersedes === entryId) {
            impact.otherEntries.push({
                id: entry.id,
                title: entry.title,
                relationship: 'supersedes'
            });
        }
        // Check if this entry is superseded by the target
        if (entry.superseded_by === entryId) {
            impact.otherEntries.push({
                id: entry.id,
                title: entry.title,
                relationship: 'superseded_by'
            });
        }
    }
    // Get the entry itself to check workpackage link
    const targetEntry = db.getEntry(entryId);
    if (targetEntry?.workpackage_id) {
        impact.workpackages.push({
            systemId: targetEntry.workpackage_id,
            displayId: targetEntry.workpackage_id // Would need registry to get display ID
        });
    }
    impact.hasReferences = impact.workpackages.length > 0 || impact.otherEntries.length > 0;
    return impact;
}
/**
 * Format impact analysis for display
 * @param impact - Deprecation impact
 * @returns Formatted string
 */
function formatImpactAnalysis(impact) {
    const lines = [];
    lines.push('Impact Analysis:');
    if (impact.workpackages.length > 0) {
        lines.push(`  Referenced in workpackages: ${impact.workpackages.map(wp => wp.displayId).join(', ')}`);
    }
    if (impact.otherEntries.length > 0) {
        const supersedes = impact.otherEntries.filter(e => e.relationship === 'supersedes');
        const supersededBy = impact.otherEntries.filter(e => e.relationship === 'superseded_by');
        if (supersedes.length > 0) {
            lines.push(`  Superseded by: ${supersedes.map(e => e.id).join(', ')}`);
        }
        if (supersededBy.length > 0) {
            lines.push(`  Supersedes: ${supersededBy.map(e => e.id).join(', ')}`);
        }
    }
    if (!impact.hasReferences) {
        lines.push('  No external references found.');
    }
    return lines.join('\n');
}
/**
 * Validate entry for deprecation
 * @param entry - Knowledge entry
 * @throws InvalidDeprecationError if entry cannot be deprecated
 */
function validateEntryForDeprecation(entry) {
    if (entry.status === 'deprecated') {
        throw new InvalidDeprecationError(`Entry ${entry.id} is already deprecated.`);
    }
    if (entry.status === 'superseded') {
        throw new InvalidDeprecationError(`Entry ${entry.id} is superseded by ${entry.superseded_by}. ` +
            `Use the superseding entry instead, or deprecate that one.`);
    }
}
/**
 * Run deprecate CLI
 * @param clearDir - Path to .clear directory
 * @param entryId - Knowledge entry ID to deprecate
 * @param options - Deprecation options
 * @returns Deprecate result
 */
async function runDeprecateCLI(clearDir, entryId, options) {
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
        return {
            success: false,
            output: 'Error: Failed to initialize knowledge database'
        };
    }
    try {
        // Get knowledge entry
        const entry = db.getEntry(entryId);
        if (!entry) {
            throw new KnowledgeNotFoundError(entryId);
        }
        // Validate entry can be deprecated
        validateEntryForDeprecation(entry);
        // Get impact analysis
        const impact = getDeprecationImpact(db, entryId);
        // If not forcing and there are references, show impact and request confirmation
        if (!options?.force && impact.hasReferences) {
            const lines = [];
            lines.push(`⚠️ Deprecating ${entryId} "${entry.title}"`);
            lines.push('');
            lines.push(formatImpactAnalysis(impact));
            lines.push('');
            lines.push('After deprecation:');
            lines.push("  - Entry status → 'deprecated'");
            lines.push('  - Search results will show ⚠️ indicator');
            lines.push('  - References preserved but will show warning');
            lines.push('  - Entry remains loadable for historical context');
            lines.push('');
            lines.push('Use --force to proceed without confirmation.');
            return {
                success: true,
                output: lines.join('\n'),
                entryId,
                impact,
                deprecated: false
            };
        }
        // Perform deprecation
        const reason = options?.reason ?? 'No reason specified';
        const deprecated = db.deprecateEntry(entryId, reason);
        if (!deprecated) {
            return {
                success: false,
                output: `Error: Failed to deprecate ${entryId}`
            };
        }
        // K2.7 gap fix: add to sync-state deprecatedReferences so the entry surfaces
        // in the session-start warning banner on the next session.
        try {
            const basePath = path.dirname(clearDir);
            const syncManager = new context_hub_1.SyncStateManager(basePath);
            syncManager.load();
            syncManager.addDeprecatedReference(entryId);
            syncManager.save();
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(`[CLEAR] Warning: failed to add ${entryId} to deprecatedReferences: ${msg}\n`);
        }
        // Update .md frontmatter to match SQLite (prevents index rebuild from reverting status)
        const knowledgeDir = path.join(clearDir, 'knowledge', 'entries');
        const entryFilePath = path.join(knowledgeDir, `${entryId}.md`);
        const fileUpdated = (0, parser_1.updateKnowledgeFile)(entryFilePath, {
            status: 'deprecated'
        });
        // Trigger index rebuild only if .md file exists — incrementalUpdate removes
        // entries without corresponding files, which would revert the deprecation
        if (fileUpdated) {
            (0, capture_cli_1.triggerIndexUpdate)(clearDir, options?.sessionNumber ?? 0, entryId);
        }
        // Log audit entry if session info provided.
        // Guard on presence, not truthiness: sessionNumber 0 is the first session
        // of a project and must still emit the audit row.
        if (options?.sessionId && options?.sessionNumber !== undefined) {
            const auditLogger = new audit_log_1.AuditLogger(path.dirname(clearDir), options.sessionId, options.sessionNumber);
            auditLogger.logUpdate('knowledge', 'deprecate', entryId, {
                targetDisplayId: entryId,
                oldValue: { status: entry.status },
                newValue: { status: 'deprecated', deprecated_reason: reason },
                trigger: 'user_prompt',
                metadata: {
                    reason,
                    impactedWorkpackages: impact.workpackages.map(wp => wp.displayId),
                    operation: 'deprecate'
                }
            });
        }
        const lines = [];
        lines.push(`✅ ${entryId} deprecated`);
        lines.push('');
        if (reason !== 'No reason specified') {
            lines.push(`Reason: ${reason}`);
            lines.push('');
        }
        if (impact.hasReferences) {
            lines.push('References updated:');
            if (impact.workpackages.length > 0) {
                lines.push(`  - ${impact.workpackages.length} workpackage(s) notified`);
            }
            lines.push('  - Audit log entry created');
        }
        else {
            lines.push('Audit log entry created.');
        }
        return {
            success: true,
            output: lines.join('\n'),
            entryId,
            impact,
            deprecated: true
        };
    }
    catch (error) {
        if (error instanceof KnowledgeNotFoundError) {
            return {
                success: false,
                output: `Error: ${error.message}`
            };
        }
        if (error instanceof InvalidDeprecationError) {
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
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    let entryId = '';
    let reason = '';
    let force = false;
    let clearDir = '';
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--reason=')) {
            reason = arg.split('=').slice(1).join('=');
        }
        else if (arg === '--force') {
            force = true;
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
    return { entryId, reason, force, clearDir };
}
// Main execution
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: deprecate-cli.js <entry-id> [options]',
                '',
                'Arguments:',
                '  <entry-id>                   Knowledge entry ID to deprecate (positional)',
                '',
                'Options:',
                '  --reason=<text>              Reason for deprecation',
                '  --force                      Skip confirmation when impact is detected',
                '  --clear-dir=<path>           Path to .clear directory (required)',
            ].join('\n')
        }));
        process.exit(0);
    }
    const { entryId, reason, force, clearDir } = parseArgs();
    runDeprecateCLI(clearDir, entryId, { reason, force }).then(result => {
        console.log(result.output);
        process.exit(result.success ? 0 : 1);
    });
}
//# sourceMappingURL=deprecate-cli.js.map