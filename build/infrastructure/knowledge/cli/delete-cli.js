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
const file_index_1 = require("../file-index");
const parser_1 = require("../parser");
const deprecate_cli_1 = require("./deprecate-cli");
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
    // Validate ID format to prevent path traversal
    if (!(0, parser_1.isValidId)(entryId)) {
        return {
            success: false,
            output: `Error: Invalid entry ID format: '${entryId}'. Expected format: TD-001, BR-002, PAT-003, LES-004`
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
        // 4. Write audit log entry
        if (options.sessionId && options.sessionNumber) {
            const auditLogger = new audit_log_1.AuditLogger(clearDir.replace('/.clear', ''), options.sessionId, options.sessionNumber);
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
                'Usage: delete-cli.js <entry-id> [options]',
                '',
                'Arguments:',
                '  <entry-id>                   Knowledge entry ID to delete (positional)',
                '',
                'Options:',
                '  --reason=<text>              Reason for deletion (required)',
                '  --force                      Skip confirmation for active entries',
                '  --clear-dir=<path>           Path to .clear directory (required)',
            ].join('\n')
        }));
        process.exit(0);
    }
    const { entryId, reason, force, clearDir } = parseArgs();
    runDeleteCLI(clearDir, entryId, { reason, force }).then(result => {
        console.log(result.output);
        process.exit(result.success ? 0 : 1);
    });
}
//# sourceMappingURL=delete-cli.js.map