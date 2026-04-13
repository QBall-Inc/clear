#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge Status CLI
 *
 * CLI tool for displaying knowledge base overview and statistics.
 * Default command for /cf-knowledge.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/status-cli.ts --clear-dir=/path/.clear
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKnowledgeStats = getKnowledgeStats;
exports.formatStats = formatStats;
exports.runStatusCLI = runStatusCLI;
const db_1 = require("../db");
const types_1 = require("../types");
const parse_args_1 = require("../../cli/parse-args");
/**
 * Get knowledge base statistics
 * @param db - Knowledge database instance
 * @returns Statistics object
 */
function getKnowledgeStats(db) {
    const statusCounts = db.getCountsByStatus();
    const typeCounts = db.getCountsByType();
    const recentEntries = db.getRecentEntries(5);
    const metadata = db.getAllMetadata();
    const total = db.getEntryCount();
    return {
        total,
        byStatus: {
            active: statusCounts['active'] || 0,
            superseded: statusCounts['superseded'] || 0,
            deprecated: statusCounts['deprecated'] || 0
        },
        byType: {
            'technical-decision': typeCounts['technical-decision'] || 0,
            'business-rule': typeCounts['business-rule'] || 0,
            'architectural-pattern': typeCounts['architectural-pattern'] || 0,
            'lesson-learned': typeCounts['lesson-learned'] || 0
        },
        recentActivity: recentEntries.map(entry => ({
            id: entry.id,
            title: entry.title,
            created: entry.created,
            created_session: entry.created_session,
            workpackage_id: entry.workpackage_id
        })),
        indexStatus: {
            lastRebuilt: metadata['last_full_rebuild'] || null,
            lastSession: metadata['last_full_rebuild_session']
                ? parseInt(metadata['last_full_rebuild_session'], 10)
                : null,
            entriesIndexed: total
        }
    };
}
/**
 * Format statistics for display
 * @param stats - Knowledge statistics
 * @returns Formatted string output
 */
function formatStats(stats) {
    const lines = [];
    lines.push('📚 Knowledge Base Overview');
    lines.push('');
    // Statistics section
    lines.push('Statistics:');
    lines.push(`  Total entries:    ${stats.total}`);
    lines.push(`  Active:           ${stats.byStatus.active}`);
    lines.push(`  Superseded:       ${stats.byStatus.superseded}`);
    lines.push(`  Deprecated:       ${stats.byStatus.deprecated}`);
    lines.push('');
    // By Type section
    lines.push('By Type:');
    lines.push(`  ${types_1.KNOWLEDGE_TYPE_PREFIXES['technical-decision']}  (Technical Decisions):    ${stats.byType['technical-decision']}`);
    lines.push(`  ${types_1.KNOWLEDGE_TYPE_PREFIXES['architectural-pattern']} (Architectural Patterns): ${stats.byType['architectural-pattern']}`);
    lines.push(`  ${types_1.KNOWLEDGE_TYPE_PREFIXES['business-rule']}  (Business Rules):         ${stats.byType['business-rule']}`);
    lines.push(`  ${types_1.KNOWLEDGE_TYPE_PREFIXES['lesson-learned']} (Lessons Learned):        ${stats.byType['lesson-learned']}`);
    lines.push('');
    // Recent Activity section
    if (stats.recentActivity.length > 0) {
        lines.push('Recent Activity:');
        for (const entry of stats.recentActivity) {
            const linked = entry.workpackage_id ? ` (linked to ${entry.workpackage_id})` : '';
            lines.push(`  ${entry.id}  Created session ${entry.created_session}${linked}`);
        }
        lines.push('');
    }
    // Index Status section
    lines.push('Index Status:');
    if (stats.indexStatus.lastRebuilt) {
        const date = stats.indexStatus.lastRebuilt.split('T')[0];
        lines.push(`  Last rebuilt: ${date} (session ${stats.indexStatus.lastSession})`);
    }
    else {
        lines.push('  Last rebuilt: Never');
    }
    lines.push(`  Entries indexed: ${stats.indexStatus.entriesIndexed}`);
    return lines.join('\n');
}
/**
 * Parse command line arguments
 */
function parseArgs() {
    return (0, parse_args_1.parseCliArgs)({ clearDir: '' }, []);
}
/**
 * Run knowledge status CLI
 * @param clearDir - Path to .clear directory
 * @returns CLI result
 */
async function runStatusCLI(clearDir) {
    // Validate clear directory
    if (!clearDir) {
        return {
            success: false,
            output: 'Error: --clear-dir is required'
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
        const stats = getKnowledgeStats(db);
        const output = formatStats(stats);
        return {
            success: true,
            output,
            stats
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
                'Usage: status-cli.js [options]',
                '',
                'Options:',
                '  --clear-dir=<path>           Path to .clear directory (required)',
                '',
                'Displays knowledge base statistics: entry counts, recent activity,',
                'index status, and supersession chains.',
            ].join('\n')
        }));
        process.exit(0);
    }
    const { clearDir } = parseArgs();
    runStatusCLI(clearDir).then(result => {
        console.log(result.output);
        process.exit(result.success ? 0 : 1);
    });
}
//# sourceMappingURL=status-cli.js.map