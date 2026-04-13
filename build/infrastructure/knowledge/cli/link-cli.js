#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge Link/Unlink CLI
 *
 * CLI tools for manually linking and unlinking knowledge entries
 * to/from workpackages.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/link-cli.ts link <id> --to <wp> --clear-dir=/path/.clear
 *   npx ts-node src/infrastructure/knowledge/cli/link-cli.ts unlink <id> --clear-dir=/path/.clear
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidLinkError = exports.WorkpackageNotFoundError = exports.KnowledgeNotFoundError = void 0;
exports.validateEntryForLinking = validateEntryForLinking;
exports.runLinkCLI = runLinkCLI;
exports.runUnlinkCLI = runUnlinkCLI;
const db_1 = require("../db");
const validation_1 = require("../../validation");
const registry_1 = require("../../workpackage/registry");
const audit_log_1 = require("../../sync/audit-log");
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
 * Workpackage not found error
 */
class WorkpackageNotFoundError extends Error {
    constructor(id) {
        super(`Workpackage not found: ${id}`);
        this.id = id;
        this.name = 'WorkpackageNotFoundError';
    }
}
exports.WorkpackageNotFoundError = WorkpackageNotFoundError;
/**
 * Invalid link operation error
 */
class InvalidLinkError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidLinkError';
    }
}
exports.InvalidLinkError = InvalidLinkError;
/**
 * Validate knowledge entry for linking
 * @param entry - Knowledge entry
 * @returns True if valid for linking
 * @throws InvalidLinkError if entry cannot be linked
 */
function validateEntryForLinking(entry) {
    if (entry.status === 'deprecated') {
        throw new InvalidLinkError(`Cannot link deprecated entry ${entry.id}. Deprecated entries are no longer valid.`);
    }
    return true;
}
/**
 * Run link CLI
 * @param clearDir - Path to .clear directory
 * @param entryId - Knowledge entry ID
 * @param workpackageId - Workpackage ID (display or system)
 * @param options - Optional audit configuration
 * @returns Link result
 */
async function runLinkCLI(clearDir, entryId, workpackageId, options) {
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
    if (!workpackageId) {
        return {
            success: false,
            output: 'Error: Workpackage ID (--to) is required'
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
        // Get and validate knowledge entry
        const entry = db.getEntry(entryId);
        if (!entry) {
            throw new KnowledgeNotFoundError(entryId);
        }
        validateEntryForLinking(entry);
        // Get and validate workpackage
        const wpRegistry = new registry_1.WorkpackageRegistryManager(clearDir);
        const workpackage = wpRegistry.resolveWorkpackage(workpackageId);
        if (!workpackage) {
            throw new WorkpackageNotFoundError(workpackageId);
        }
        // Check if workpackage is archived
        const wpStatus = wpRegistry.getWorkpackageStatus(workpackage.id);
        if (wpStatus === 'archived') {
            throw new InvalidLinkError(`Cannot link to archived workpackage ${workpackage.id}. Use an active workpackage.`);
        }
        // Get phase ID from workpackage
        const phaseId = workpackage.phase ?? null;
        const wpSystemId = workpackage.systemId ?? workpackage.id;
        // Check if already linked to this workpackage (idempotent)
        if (entry.workpackage_id === wpSystemId) {
            return {
                success: true,
                output: `✅ ${entryId} "${entry.title}" is already linked to ${workpackage.id}`,
                entryId,
                workpackageId: wpSystemId,
                phaseId: phaseId ?? undefined
            };
        }
        // Perform the link
        const linked = db.linkToWorkpackage(entryId, wpSystemId, phaseId ?? '');
        if (!linked) {
            return {
                success: false,
                output: `Error: Failed to link ${entryId} to ${workpackage.id}`
            };
        }
        // Log audit entry if session info provided
        if (options?.sessionId && options?.sessionNumber) {
            const auditLogger = new audit_log_1.AuditLogger(clearDir.replace('/.clear', ''), options.sessionId, options.sessionNumber);
            auditLogger.logUpdate('knowledge', 'link', entryId, {
                targetDisplayId: entryId,
                oldValue: { workpackage_id: entry.workpackage_id },
                newValue: { workpackage_id: wpSystemId, phase_id: phaseId },
                trigger: 'user_prompt',
                metadata: {
                    workpackageDisplayId: workpackage.id,
                    operation: 'link'
                }
            });
        }
        const lines = [];
        lines.push(`✅ ${entryId} "${entry.title}" linked to ${workpackage.id}`);
        lines.push('');
        lines.push('Updated:');
        lines.push(`  - Knowledge entry workpackage_id: ${wpSystemId}`);
        if (phaseId) {
            lines.push(`  - Knowledge entry phase_id: ${phaseId}`);
        }
        lines.push('  - Audit log entry created');
        return {
            success: true,
            output: lines.join('\n'),
            entryId,
            workpackageId: wpSystemId,
            phaseId: phaseId ?? undefined
        };
    }
    catch (error) {
        if (error instanceof KnowledgeNotFoundError) {
            return {
                success: false,
                output: `Error: ${error.message}`
            };
        }
        if (error instanceof WorkpackageNotFoundError) {
            return {
                success: false,
                output: `Error: ${error.message}`
            };
        }
        if (error instanceof InvalidLinkError) {
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
 * Run unlink CLI
 * @param clearDir - Path to .clear directory
 * @param entryId - Knowledge entry ID
 * @param options - Optional audit configuration
 * @returns Unlink result
 */
async function runUnlinkCLI(clearDir, entryId, options) {
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
        // Check if already unlinked
        if (!entry.workpackage_id) {
            return {
                success: true,
                output: `${entryId} is not linked to any workpackage`,
                entryId
            };
        }
        const previousWorkpackageId = entry.workpackage_id;
        // Perform the unlink
        const unlinked = db.unlinkFromWorkpackage(entryId);
        if (!unlinked) {
            return {
                success: false,
                output: `Error: Failed to unlink ${entryId}`
            };
        }
        // Log audit entry if session info provided
        if (options?.sessionId && options?.sessionNumber) {
            const auditLogger = new audit_log_1.AuditLogger(clearDir.replace('/.clear', ''), options.sessionId, options.sessionNumber);
            auditLogger.logUpdate('knowledge', 'unlink', entryId, {
                targetDisplayId: entryId,
                oldValue: { workpackage_id: previousWorkpackageId },
                newValue: { workpackage_id: null },
                trigger: 'user_prompt',
                metadata: {
                    operation: 'unlink'
                }
            });
        }
        const lines = [];
        lines.push(`✅ ${entryId} unlinked`);
        lines.push('');
        lines.push('The entry remains in the knowledge base but is no longer');
        lines.push('associated with any specific workpackage.');
        return {
            success: true,
            output: lines.join('\n'),
            entryId,
            previousWorkpackageId
        };
    }
    catch (error) {
        if (error instanceof KnowledgeNotFoundError) {
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
    let command = 'link';
    let entryId = '';
    let workpackageId = '';
    let clearDir = '';
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === 'link' || arg === 'unlink') {
            command = arg;
        }
        else if (arg.startsWith('--to=')) {
            workpackageId = arg.split('=')[1];
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
    return { command, entryId, workpackageId, clearDir };
}
// Main execution
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: link-cli.js <command> <entry-id> [options]',
                '',
                'Commands:',
                '  link                         Link a knowledge entry to a workpackage',
                '  unlink                       Unlink a knowledge entry from its workpackage',
                '',
                'Arguments:',
                '  <entry-id>                   Knowledge entry ID (positional)',
                '',
                'Options:',
                '  --to=<workpackage-id>        Target workpackage ID (required for link)',
                '  --clear-dir=<path>           Path to .clear directory (required)',
            ].join('\n')
        }));
        process.exit(0);
    }
    const { command, entryId, workpackageId, clearDir } = parseArgs();
    if (command === 'link') {
        runLinkCLI(clearDir, entryId, workpackageId).then(result => {
            console.log(result.output);
            process.exit(result.success ? 0 : 1);
        });
    }
    else {
        runUnlinkCLI(clearDir, entryId).then(result => {
            console.log(result.output);
            process.exit(result.success ? 0 : 1);
        });
    }
}
//# sourceMappingURL=link-cli.js.map