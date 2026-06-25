#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge Supersede CLI
 *
 * CLI tool for creating supersession relationships between knowledge entries.
 * Supersession marks one entry as replaced by another, with chain depth limits.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/supersede-cli.ts <old> <new> --clear-dir=/path/.clear
 *   npx ts-node src/infrastructure/knowledge/cli/supersede-cli.ts <old> <new> --force --clear-dir=/path/.clear
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
exports.InvalidSupersessionError = exports.ChainDepthExceededError = exports.KnowledgeNotFoundError = exports.MAX_CHAIN_DEPTH = void 0;
exports.validateChainDepth = validateChainDepth;
exports.validateEntriesForSupersession = validateEntriesForSupersession;
exports.formatChain = formatChain;
exports.runSupersedeCLI = runSupersedeCLI;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const db_1 = require("../db");
const validation_1 = require("../../validation");
const deprecation_1 = require("../../sync/deprecation");
const parser_1 = require("../parser");
const capture_cli_1 = require("./capture-cli");
/**
 * Maximum allowed supersession chain depth
 */
exports.MAX_CHAIN_DEPTH = 3;
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
 * Chain depth exceeded error
 */
class ChainDepthExceededError extends Error {
    constructor(chain, depth) {
        super(`Supersession chain exceeds maximum depth of ${exports.MAX_CHAIN_DEPTH}`);
        this.chain = chain;
        this.depth = depth;
        this.name = 'ChainDepthExceededError';
    }
}
exports.ChainDepthExceededError = ChainDepthExceededError;
/**
 * Invalid supersession error
 */
class InvalidSupersessionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidSupersessionError';
    }
}
exports.InvalidSupersessionError = InvalidSupersessionError;
/**
 * Validate supersession chain depth
 * @param db - Knowledge database
 * @param oldEntryId - Entry being superseded
 * @param newEntryId - Entry that supersedes
 * @returns Chain validation result
 */
function validateChainDepth(db, oldEntryId, newEntryId) {
    const chain = [newEntryId];
    let current = oldEntryId;
    // Walk back through the supersession chain
    while (current) {
        chain.unshift(current);
        const entry = db.getEntry(current);
        current = entry?.supersedes ?? '';
    }
    return {
        valid: chain.length <= exports.MAX_CHAIN_DEPTH,
        depth: chain.length,
        chain
    };
}
/**
 * Validate entries for supersession
 * @param oldEntry - Entry being superseded
 * @param newEntry - Entry that supersedes
 * @throws InvalidSupersessionError if entries cannot be superseded
 */
function validateEntriesForSupersession(oldEntry, newEntry) {
    // Check if old entry is already superseded
    if (oldEntry.status === 'superseded') {
        throw new InvalidSupersessionError(`Entry ${oldEntry.id} is already superseded by ${oldEntry.superseded_by}. ` +
            `Create a new supersession from ${oldEntry.superseded_by} instead.`);
    }
    // Check if old entry is deprecated
    if (oldEntry.status === 'deprecated') {
        throw new InvalidSupersessionError(`Entry ${oldEntry.id} is deprecated. Cannot supersede deprecated entries.`);
    }
    // Check if new entry is deprecated
    if (newEntry.status === 'deprecated') {
        throw new InvalidSupersessionError(`Entry ${newEntry.id} is deprecated. Cannot use deprecated entry as replacement.`);
    }
    // Check if new entry is already superseded
    if (newEntry.status === 'superseded') {
        throw new InvalidSupersessionError(`Entry ${newEntry.id} is superseded by ${newEntry.superseded_by}. ` +
            `Use the active entry in the chain instead.`);
    }
    // Check for self-supersession
    if (oldEntry.id === newEntry.id) {
        throw new InvalidSupersessionError(`Cannot supersede an entry with itself.`);
    }
    // Check if already in this supersession relationship
    if (oldEntry.superseded_by === newEntry.id) {
        throw new InvalidSupersessionError(`Entry ${oldEntry.id} is already superseded by ${newEntry.id}.`);
    }
}
/**
 * Format chain for display
 * @param chain - Array of entry IDs
 * @returns Formatted chain string
 */
function formatChain(chain) {
    return chain.join(' → ');
}
/**
 * Run supersede CLI
 * @param clearDir - Path to .clear directory
 * @param oldEntryId - Entry to be superseded
 * @param newEntryId - Entry that supersedes
 * @param options - Supersession options
 * @returns Supersede result
 */
async function runSupersedeCLI(clearDir, oldEntryId, newEntryId, options) {
    if (!clearDir) {
        return {
            success: false,
            output: 'Error: --clear-dir is required'
        };
    }
    if (!oldEntryId) {
        return {
            success: false,
            output: 'Error: Old entry ID is required'
        };
    }
    if (!newEntryId) {
        return {
            success: false,
            output: 'Error: New entry ID is required'
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
        // Get both entries
        const oldEntry = db.getEntry(oldEntryId);
        if (!oldEntry) {
            throw new KnowledgeNotFoundError(oldEntryId);
        }
        const newEntry = db.getEntry(newEntryId);
        if (!newEntry) {
            throw new KnowledgeNotFoundError(newEntryId);
        }
        // Validate entries
        validateEntriesForSupersession(oldEntry, newEntry);
        // Validate chain depth
        const chainValidation = validateChainDepth(db, oldEntryId, newEntryId);
        if (!chainValidation.valid && !options?.force) {
            const lines = [];
            lines.push('⚠️ Chain depth limit reached');
            lines.push('');
            lines.push(`Current chain would become:`);
            lines.push(`  ${formatChain(chainValidation.chain)} (${chainValidation.depth} levels)`);
            lines.push('');
            lines.push(`Maximum allowed: ${exports.MAX_CHAIN_DEPTH} levels`);
            lines.push('');
            lines.push('Options:');
            lines.push('  1. Use --force to proceed anyway');
            lines.push('  2. Consolidate older entries to point directly to the new one');
            lines.push('  3. Cancel');
            return {
                success: true,
                output: lines.join('\n'),
                oldEntryId,
                newEntryId,
                chainDepth: chainValidation.depth,
                superseded: false
            };
        }
        // Perform unified supersession (DB + markdown + sync-state + audit)
        const basePath = path.dirname(clearDir);
        const supersessionResult = await (0, deprecation_1.performSupersession)(basePath, oldEntryId, newEntryId, {
            sessionId: options?.sessionId || 'unknown',
            sessionNumber: options?.sessionNumber || 0,
            migrateLinks: true
        });
        if (supersessionResult.status === 'error') {
            return {
                success: false,
                output: `Error: ${supersessionResult.error || 'Supersession failed'}`
            };
        }
        // Update new entry's supersedes field in DB and .md frontmatter
        const knowledgeDir = path.join(clearDir, 'knowledge', 'entries');
        const newEntryUpdated = db.getEntry(newEntryId);
        if (newEntryUpdated) {
            newEntryUpdated.supersedes = oldEntryId;
            db.upsertEntry(newEntryUpdated);
            // Sync supersedes to .md so incrementalUpdate won't overwrite it
            const newFilePath = path.join(knowledgeDir, `${newEntryId}.md`);
            (0, parser_1.updateKnowledgeFile)(newFilePath, { supersedes: oldEntryId });
        }
        // Trigger index rebuild only if .md files exist — incrementalUpdate removes
        // entries without corresponding files, which would revert the supersession
        const oldFilePath = path.join(knowledgeDir, `${oldEntryId}.md`);
        if (fs.existsSync(oldFilePath)) {
            (0, capture_cli_1.triggerIndexUpdate)(clearDir, options?.sessionNumber ?? 0, oldEntryId);
        }
        const lines = [];
        lines.push(`🔄 Superseding ${oldEntryId} with ${newEntryId}`);
        lines.push('');
        lines.push(`Chain: ${formatChain(chainValidation.chain)}`);
        lines.push(`Chain depth: ${chainValidation.depth}`);
        lines.push('');
        lines.push('Changes:');
        lines.push(`  ${oldEntryId}:`);
        lines.push(`    status: ${oldEntry.status} → superseded`);
        lines.push(`    superseded_by: ${newEntryId}`);
        lines.push('');
        lines.push(`  ${newEntryId}:`);
        lines.push(`    supersedes: ${oldEntryId}`);
        lines.push('');
        lines.push(`✅ ${oldEntryId} superseded by ${newEntryId}`);
        lines.push('');
        lines.push('Search results will show:');
        lines.push(`  🔄 ${oldEntryId} "${oldEntry.title}" → ${newEntryId}`);
        return {
            success: true,
            output: lines.join('\n'),
            oldEntryId,
            newEntryId,
            chainDepth: chainValidation.depth,
            superseded: true
        };
    }
    catch (error) {
        if (error instanceof KnowledgeNotFoundError) {
            return {
                success: false,
                output: `Error: ${error.message}`
            };
        }
        if (error instanceof InvalidSupersessionError) {
            return {
                success: false,
                output: `Error: ${error.message}`
            };
        }
        if (error instanceof ChainDepthExceededError) {
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
    let oldEntryId = '';
    let newEntryId = '';
    let force = false;
    let clearDir = '';
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--force') {
            force = true;
        }
        else if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.split('=')[1];
        }
        else if (!arg.startsWith('--')) {
            if (!oldEntryId) {
                oldEntryId = arg;
            }
            else if (!newEntryId) {
                newEntryId = arg;
            }
        }
    }
    if (clearDir) {
        clearDir = (0, validation_1.validateBasePath)(clearDir);
    }
    return { oldEntryId, newEntryId, force, clearDir };
}
// Main execution
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: supersede-cli.js <old-entry-id> <new-entry-id> [options]',
                '',
                'Arguments:',
                '  <old-entry-id>              Entry being superseded (positional, first)',
                '  <new-entry-id>              Entry that supersedes it (positional, second)',
                '',
                'Options:',
                '  --force                      Skip chain depth validation',
                '  --clear-dir=<path>           Path to .clear directory (required)',
            ].join('\n')
        }));
        process.exit(0);
    }
    const { oldEntryId, newEntryId, force, clearDir } = parseArgs();
    runSupersedeCLI(clearDir, oldEntryId, newEntryId, { force }).then(result => {
        console.log(result.output);
        process.exit(result.success ? 0 : 1);
    });
}
//# sourceMappingURL=supersede-cli.js.map