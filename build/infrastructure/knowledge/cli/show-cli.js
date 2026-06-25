#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge Show CLI
 *
 * CLI tool for displaying comprehensive details of a single knowledge entry.
 * Used by /cf-knowledge show <id>.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/show-cli.ts --clear-dir=/path/.clear --id=TD-048
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
exports.formatEntry = formatEntry;
exports.runShowCLI = runShowCLI;
const fs = __importStar(require("fs"));
const db_1 = require("../db");
const parser_1 = require("../parser");
const parse_args_1 = require("../../cli/parse-args");
const validation_1 = require("../../validation");
const registry_1 = require("../../workpackage/registry");
const registry_2 = require("../../plan/registry");
const slug_index_1 = require("../slug-index");
const slug_resolver_1 = require("../slug-resolver");
/**
 * Status icons for display
 */
const STATUS_ICONS = {
    active: '✅',
    superseded: '🔄',
    deprecated: '⚠️'
};
/**
 * Type display names
 */
const TYPE_NAMES = {
    'technical-decision': 'Technical Decision',
    'business-rule': 'Business Rule',
    'architectural-pattern': 'Architectural Pattern',
    'lesson-learned': 'Lesson Learned'
};
/**
 * Format a knowledge entry for detailed display
 * @param entry - Knowledge entry to format
 * @returns Formatted string output
 */
function formatEntry(entry, options) {
    const lines = [];
    const icon = STATUS_ICONS[entry.status] || '❓';
    const typeName = TYPE_NAMES[entry.type] || entry.type;
    // Header
    lines.push(`📄 ${entry.id}: ${entry.title}`);
    lines.push('');
    // Basic info
    lines.push(`Type:        ${typeName}`);
    lines.push(`Status:      ${icon} ${entry.status}`);
    lines.push(`Created:     ${formatDate(entry.created)} (session ${entry.created_session})`);
    lines.push(`Modified:    ${entry.modified ? formatDate(entry.modified) : '-'}`);
    lines.push('');
    // Description — WP-DF2 AC4 (S166): resolve [[slug-name]] refs to entry IDs
    // at display time when clearDir is provided. Storage stays as-written.
    const rawDescription = entry.description || 'No description available';
    let resolvedDescription = rawDescription;
    if (options?.clearDir) {
        const slugIndex = (0, slug_index_1.readSlugIndex)(options.clearDir);
        resolvedDescription = (0, slug_resolver_1.resolveSlugRefsWithLog)(rawDescription, slugIndex, options.clearDir, 'show-cli');
    }
    lines.push('Description:');
    lines.push(`  ${resolvedDescription}`);
    lines.push('');
    // Tags
    lines.push(`Tags:        ${entry.tags.length > 0 ? entry.tags.join(', ') : 'none'}`);
    lines.push('');
    // Linked workpackage/phase
    if (entry.workpackage_id || entry.phase_id) {
        lines.push('Linked To:');
        if (entry.workpackage_id) {
            const wpLabel = options?.wpDisplayId || entry.workpackage_id;
            lines.push(`  Workpackage: ${wpLabel}`);
        }
        if (entry.phase_id) {
            const phaseLabel = options?.phaseDisplayId || entry.phase_id;
            lines.push(`  Phase:       ${phaseLabel}`);
        }
        lines.push('');
    }
    // Supersession chain
    if (entry.supersedes || entry.superseded_by) {
        lines.push('Supersession:');
        lines.push(`  Supersedes:    ${entry.supersedes || '-'}`);
        lines.push(`  Superseded by: ${entry.superseded_by || '-'}`);
        lines.push('');
    }
    // Deprecation info (if deprecated)
    if (entry.status === 'deprecated' && entry.deprecated_at) {
        lines.push('Deprecation:');
        lines.push(`  Deprecated:    ${formatDate(entry.deprecated_at)}`);
        lines.push(`  Reason:        ${entry.deprecated_reason || 'No reason specified'}`);
        lines.push('');
    }
    // Related files
    if (options?.relatedFiles && options.relatedFiles.length > 0) {
        lines.push('Related Files:');
        for (const file of options.relatedFiles) {
            lines.push(`  - ${file}`);
        }
        lines.push('');
    }
    // File path
    lines.push(`File Path:   ${entry.file_path}`);
    return lines.join('\n');
}
/**
 * Format a date string for display
 * @param dateStr - ISO date string
 * @returns Formatted date
 */
function formatDate(dateStr) {
    try {
        const date = new Date(dateStr);
        return date.toISOString().split('T')[0];
    }
    catch {
        return dateStr;
    }
}
/**
 * Parse command line arguments
 */
function parseArgs() {
    return (0, parse_args_1.parseCliArgs)({ clearDir: '', id: '' }, [
        { prefix: '--id=', apply: (v, o) => { o.id = v; } }
    ]);
}
/**
 * Run knowledge show CLI
 * @param clearDir - Path to .clear directory
 * @param id - Knowledge entry ID
 * @returns CLI result
 */
async function runShowCLI(clearDir, id) {
    // Validate arguments
    if (!clearDir) {
        return {
            success: false,
            output: 'Error: --clear-dir is required'
        };
    }
    if (!id) {
        return {
            success: false,
            output: 'Error: --id is required'
        };
    }
    // Initialize database
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
        // Get entry by ID
        const entry = db.getEntry(id);
        if (!entry) {
            return {
                success: false,
                output: `Error: Knowledge entry not found: ${id}`
            };
        }
        // Read related_files from .md frontmatter (not stored in SQLite)
        let relatedFiles = [];
        if (entry.file_path && fs.existsSync(entry.file_path)) {
            const content = fs.readFileSync(entry.file_path, 'utf-8');
            const parsed = (0, parser_1.parseFrontmatter)(content);
            if (parsed?.frontmatter?.related_files) {
                relatedFiles = parsed.frontmatter.related_files;
            }
        }
        // Resolve system IDs to display IDs
        let wpDisplayId;
        let phaseDisplayId;
        try {
            if (entry.workpackage_id) {
                const wpRegistry = new registry_1.WorkpackageRegistryManager(clearDir);
                wpDisplayId = wpRegistry.getDisplayIdForSystemId(entry.workpackage_id) ?? undefined;
            }
            if (entry.phase_id) {
                const planRegistry = new registry_2.PlanRegistryManager(clearDir);
                phaseDisplayId = planRegistry.getDisplayIdForSystemId(entry.phase_id) ?? undefined;
            }
        }
        catch {
            // Fall back to system IDs if registries unavailable
        }
        const output = formatEntry(entry, { relatedFiles, wpDisplayId, phaseDisplayId, clearDir });
        return {
            success: true,
            output,
            entry
        };
    }
    finally {
        db.close();
    }
}
// Main execution
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: show-cli.js [options]',
                '',
                'Options:',
                '  --clear-dir=<path>           Path to .clear directory (required)',
                '  --id=<id>                    Knowledge entry ID to display (required)',
            ].join('\n')
        }));
        process.exit(0);
    }
    const { clearDir: rawClearDir, id } = parseArgs();
    // Normalize to the .clear subdir, tolerant of either --clear-dir convention.
    const clearDir = (0, validation_1.resolveClearDir)(rawClearDir).clearSubdir;
    runShowCLI(clearDir, id).then(result => {
        console.log(result.output);
        process.exit(result.success ? 0 : 1);
    });
}
//# sourceMappingURL=show-cli.js.map