#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge Status CLI
 *
 * CLI tool for displaying knowledge base overview and statistics.
 * Default command for /cf-knowledge.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/status-cli.ts --clear-dir=/path/.clear [--json]
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
exports.getKnowledgeStats = getKnowledgeStats;
exports.getAnomalies = getAnomalies;
exports.formatStats = formatStats;
exports.runStatusCLI = runStatusCLI;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const db_1 = require("../db");
const types_1 = require("../types");
const context_hub_1 = require("../../sync/context-hub");
const parse_args_1 = require("../../cli/parse-args");
/**
 * Get knowledge base statistics
 * @param db - Knowledge database instance
 * @param clearDir - Path to .clear directory (used for Anomalies enumeration)
 * @returns Statistics object
 */
function getKnowledgeStats(db, clearDir) {
    const statusCounts = db.getCountsByStatus();
    const typeCounts = db.getCountsByType();
    const recentEntries = db.getRecentEntries(5);
    const metadata = db.getAllMetadata();
    const total = db.getEntryCount();
    const { anomalies, counts } = getAnomalies(clearDir, db);
    const byStatus = {};
    for (const status of types_1.KNOWLEDGE_STATUSES) {
        byStatus[status] = statusCounts[status] || 0;
    }
    const byType = {};
    for (const type of types_1.KNOWLEDGE_TYPES) {
        byType[type] = typeCounts[type] || 0;
    }
    return {
        total,
        byStatus,
        byType,
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
        },
        anomalies,
        counts
    };
}
/**
 * Enumerate knowledge-base anomalies + compute reconcile counts. Four
 * categories:
 *   (1) malformed_prefix — filenames in entries/ not matching
 *       VALID_ENTRY_FILENAME_REGEX (imported from types.ts).
 *   (2) missing_required_fields — entries with valid filenames but missing
 *       one or more REQUIRED_FRONTMATTER_FIELDS (imported from types.ts).
 *   (3) orphan_deprecated_refs — IDs in
 *       sync-state.knowledge.deprecatedReferences with no corresponding
 *       .md file on disk.
 *   (4) counts — files_on_disk / indexed / excluded for the reconcile line.
 *
 * @internal Exported for testing
 */
function getAnomalies(clearDir, db) {
    const entriesDir = path.join(clearDir, 'knowledge', 'entries');
    let mdFiles = [];
    if (fs.existsSync(entriesDir)) {
        mdFiles = fs.readdirSync(entriesDir).filter(f => f.endsWith('.md'));
    }
    // Category 1: malformed-prefix entries
    const malformed_prefix = mdFiles
        .filter(f => !types_1.VALID_ENTRY_FILENAME_REGEX.test(f))
        .sort();
    // Category 2: missing-required-fields entries (only check files with valid
    // filenames — malformed ones are reported in category 1)
    const missing_required_fields = [];
    for (const filename of mdFiles.filter(f => types_1.VALID_ENTRY_FILENAME_REGEX.test(f)).sort()) {
        const filePath = path.join(entriesDir, filename);
        let content = '';
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        }
        catch {
            // Unreadable — treat as all-fields-missing for surfacing
            content = '';
        }
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const entryId = filename.replace(/\.md$/, '');
        if (!fmMatch) {
            missing_required_fields.push({
                entry_id: entryId,
                missing_fields: [...types_1.REQUIRED_FRONTMATTER_FIELDS]
            });
            continue;
        }
        const fmText = fmMatch[1];
        const missing = [];
        for (const field of types_1.REQUIRED_FRONTMATTER_FIELDS) {
            // Match `field: <non-whitespace>` at line start. Empty/whitespace-only
            // values count as missing — matches the parser's truthy-coerce contract
            // (parser.ts:58 rejects falsy values).
            const fieldRegex = new RegExp(`^${field}:[ \\t]+\\S`, 'm');
            if (!fieldRegex.test(fmText)) {
                missing.push(field);
            }
        }
        if (missing.length > 0) {
            missing_required_fields.push({ entry_id: entryId, missing_fields: missing });
        }
    }
    // Category 3: orphan deprecatedReferences (IDs in sync-state with no .md file)
    let orphan_deprecated_refs = [];
    try {
        const basePath = path.dirname(clearDir);
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        const deprecatedRefs = syncManager.getKnowledgeSummary().deprecatedReferences;
        orphan_deprecated_refs = deprecatedRefs
            .filter(id => !fs.existsSync(path.join(entriesDir, `${id}.md`)))
            .sort();
    }
    catch {
        // Sync-state missing / malformed — empty orphan list, no surfacing
        // (CS3-ish: not an error condition for status-cli)
    }
    // Reconcile counts
    const counts = {
        files_on_disk: mdFiles.length,
        indexed: db.getEntryCount(),
        excluded: malformed_prefix.length + missing_required_fields.length
    };
    return {
        anomalies: {
            malformed_prefix,
            missing_required_fields,
            orphan_deprecated_refs
        },
        counts
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
    // Statistics section — iterates KNOWLEDGE_STATUSES so a new status (e.g.
    // K2-era 'pending', K3-era 'archived') surfaces automatically.
    const STATUS_LABELS = {
        active: 'Active',
        pending: 'Pending',
        superseded: 'Superseded',
        deprecated: 'Deprecated',
        archived: 'Archived'
    };
    lines.push('Statistics:');
    lines.push(`  Total entries:    ${stats.total}`);
    for (const status of types_1.KNOWLEDGE_STATUSES) {
        const label = `${STATUS_LABELS[status]}:`;
        lines.push(`  ${label.padEnd(18)}${stats.byStatus[status]}`);
    }
    lines.push('');
    // By Type section — iterates KNOWLEDGE_TYPES so a new type added via the
    // category-expansion path surfaces here automatically.
    const TYPE_LABELS = {
        'technical-decision': 'Technical Decisions',
        'architectural-pattern': 'Architectural Patterns',
        'business-rule': 'Business Rules',
        'lesson-learned': 'Lessons Learned',
        'institutional-wiki': 'Institutional Wiki',
        'stakeholder': 'Stakeholders',
        'process': 'Processes'
    };
    lines.push('By Type:');
    for (const type of types_1.KNOWLEDGE_TYPES) {
        const prefix = types_1.KNOWLEDGE_TYPE_PREFIXES[type].padEnd(4);
        const label = `(${TYPE_LABELS[type]}):`.padEnd(28);
        lines.push(`  ${prefix} ${label} ${stats.byType[type]}`);
    }
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
    lines.push('');
    // WP-PS3 phase_b AC10/AC17 (S177): Anomalies section ALWAYS rendered, even
    // when all categories empty — users learn the section exists. Reconcile
    // counts line ALWAYS rendered with K=0 path included.
    lines.push('Anomalies:');
    const { malformed_prefix, missing_required_fields, orphan_deprecated_refs } = stats.anomalies;
    const total = malformed_prefix.length + missing_required_fields.length + orphan_deprecated_refs.length;
    if (total === 0) {
        lines.push('  None');
    }
    else {
        if (malformed_prefix.length > 0) {
            lines.push(`  Malformed prefix (${malformed_prefix.length}):`);
            for (const fn of malformed_prefix) {
                lines.push(`    - ${fn}`);
            }
        }
        if (missing_required_fields.length > 0) {
            lines.push(`  Missing required fields (${missing_required_fields.length}):`);
            for (const e of missing_required_fields) {
                lines.push(`    - ${e.entry_id}: missing ${e.missing_fields.join(', ')}`);
            }
        }
        if (orphan_deprecated_refs.length > 0) {
            lines.push(`  Orphan deprecated references (${orphan_deprecated_refs.length}):`);
            for (const id of orphan_deprecated_refs) {
                lines.push(`    - ${id} (in sync-state, no .md file)`);
            }
        }
    }
    lines.push('');
    lines.push(`  Files on disk: ${stats.counts.files_on_disk} | ` +
        `Indexed: ${stats.counts.indexed} | ` +
        `Excluded: ${stats.counts.excluded} (see Anomalies above)`);
    return lines.join('\n');
}
/**
 * Parse command line arguments
 */
function parseArgs() {
    // WP-PS3 phase_b AC11 (S177): --json flag added. parseCliArgs accepts string
    // defaults; bare --json toggled separately below.
    const parsed = (0, parse_args_1.parseCliArgs)({ clearDir: '' }, []);
    const json = process.argv.includes('--json');
    return { clearDir: parsed.clearDir, json };
}
/**
 * Run knowledge status CLI
 * @param clearDir - Path to .clear directory
 * @param options - { json: boolean } — when true, emit JSON shape instead of human text
 * @returns CLI result
 */
async function runStatusCLI(clearDir, options) {
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
        const stats = getKnowledgeStats(db, clearDir);
        const output = options?.json
            ? JSON.stringify(stats, null, 2)
            : formatStats(stats);
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
                '  --json                       Emit JSON output instead of human-readable text',
                '',
                'Displays knowledge base statistics: entry counts, recent activity,',
                'index status, supersession chains, and anomalies (malformed entries,',
                'missing-required-field entries, orphan deprecatedReferences).',
            ].join('\n')
        }));
        process.exit(0);
    }
    const { clearDir, json } = parseArgs();
    runStatusCLI(clearDir, { json }).then(result => {
        console.log(result.output);
        process.exit(result.success ? 0 : 1);
    });
}
//# sourceMappingURL=status-cli.js.map