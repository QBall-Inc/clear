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
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatEntry = formatEntry;
exports.runShowCLI = runShowCLI;
const db_1 = require("../db");
const parse_args_1 = require("../../cli/parse-args");
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
function formatEntry(entry) {
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
    // Description
    lines.push('Description:');
    lines.push(`  ${entry.description || 'No description available'}`);
    lines.push('');
    // Tags
    lines.push(`Tags:        ${entry.tags.length > 0 ? entry.tags.join(', ') : 'none'}`);
    lines.push('');
    // Linked workpackage/phase
    if (entry.workpackage_id || entry.phase_id) {
        lines.push('Linked To:');
        if (entry.workpackage_id) {
            lines.push(`  Workpackage: ${entry.workpackage_id}`);
        }
        if (entry.phase_id) {
            lines.push(`  Phase:       ${entry.phase_id}`);
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
        const output = formatEntry(entry);
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
    const { clearDir, id } = parseArgs();
    runShowCLI(clearDir, id).then(result => {
        console.log(result.output);
        process.exit(result.success ? 0 : 1);
    });
}
//# sourceMappingURL=show-cli.js.map