#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge Load CLI Tool
 *
 * Loads relevant knowledge entries at session start.
 * Called by knowledge-load.sh bash wrapper.
 *
 * Usage: npx ts-node load-cli.ts --clear-dir=<path> [--level=<level>] [--context=<tags>]
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const parse_args_1 = require("../../cli/parse-args");
const validation_1 = require("../../validation");
const db_1 = require("../db");
const types_1 = require("../types");
const slug_index_1 = require("../slug-index");
const slug_resolver_1 = require("../slug-resolver");
/**
 * Parse command line arguments
 */
function parseArgs() {
    return (0, parse_args_1.parseCliArgs)({ clearDir: './.clear', level: 'balanced', contextTags: [] }, [
        {
            prefix: '--level=',
            apply: (v, o) => {
                const level = v;
                if (['minimal', 'balanced', 'comprehensive'].includes(level)) {
                    o.level = level;
                }
            }
        },
        {
            prefix: '--context=',
            apply: (v, o) => { o.contextTags = v.split(',').filter(Boolean); }
        },
        { prefix: '--workpackage=', apply: (v, o) => { o.workpackage = v; } },
        { prefix: '--session=', apply: (v, o) => { const n = parseInt(v, 10); if (!isNaN(n))
                o.session = n; } }
    ]);
}
/**
 * Load configuration from knowledge.yaml if it exists
 */
function loadConfig(clearDir) {
    const configPath = path.join(clearDir, 'config', 'knowledge.yaml');
    if (!fs.existsSync(configPath)) {
        return { level: types_1.DEFAULT_KNOWLEDGE_CONFIG.loading.level };
    }
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        // Simple YAML parsing for level field
        const levelMatch = content.match(/level:\s*(minimal|balanced|comprehensive)/);
        if (levelMatch) {
            return { level: levelMatch[1] };
        }
    }
    catch {
        // Ignore config read errors
    }
    return { level: types_1.DEFAULT_KNOWLEDGE_CONFIG.loading.level };
}
/**
 * Load entries from the JSON index export (index.json) when SQLite is unavailable.
 *
 * Returns the entries plus an `available` flag in a single read (no second pass):
 * `available: true` only when index.json is present AND parseable. `available: false`
 * means the index export could not be read — the caller uses this to emit an honest
 * status instead of a false "no entries". index.json is a DB export, so it is absent
 * when the database never initialized.
 */
function loadFromJsonFallback(clearDir) {
    const jsonPath = path.join(clearDir, 'knowledge', 'index.json');
    if (fs.existsSync(jsonPath)) {
        try {
            const content = fs.readFileSync(jsonPath, 'utf-8');
            const index = JSON.parse(content);
            const entries = Array.isArray(index.entries) ? index.entries : [];
            return { entries, available: true };
        }
        catch {
            // index.json present but unparseable → not a readable index; fall through.
        }
    }
    // No readable index export. Vestigial markdown scan retained as a last resort
    // (note: it currently scans knowledge/ not knowledge/entries/ — a known dead path
    // deferred to a follow-up). Availability is judged against the index export only.
    return { entries: scanMarkdownEntries(clearDir), available: false };
}
/**
 * Count knowledge entries persisted on disk (knowledge/entries/*.md). Used to tell a
 * genuinely-empty / fresh project (nothing captured) apart from "entries exist but the
 * index is unreadable" — only the latter is an honest no_knowledge_base condition.
 */
function countEntriesOnDisk(clearDir) {
    const entriesDir = path.join(clearDir, 'knowledge', 'entries');
    if (!fs.existsSync(entriesDir)) {
        return 0;
    }
    try {
        return fs.readdirSync(entriesDir).filter(f => f.endsWith('.md')).length;
    }
    catch {
        return 0;
    }
}
/**
 * Scan .md files in knowledge/ directory as last-resort fallback.
 * Parses YAML frontmatter for id, title, type, status fields.
 */
function scanMarkdownEntries(clearDir) {
    const knowledgeDir = path.join(clearDir, 'knowledge');
    if (!fs.existsSync(knowledgeDir))
        return [];
    const entries = [];
    const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(knowledgeDir, file), 'utf-8');
            // Parse YAML frontmatter between --- delimiters
            const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
            if (!fmMatch)
                continue;
            const fm = fmMatch[1];
            const getId = (key) => {
                const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
                return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
            };
            const id = getId('id') || file.replace('.md', '');
            const title = getId('title') || file.replace('.md', '');
            const type = getId('type') || 'note';
            const status = getId('status') || 'active';
            // Skip non-active entries in fallback path (mirrors DB/index filtering)
            if (status !== 'active')
                continue;
            const created = getId('created') || new Date().toISOString();
            // Extract first paragraph after frontmatter as description
            const bodyStart = content.indexOf('---', content.indexOf('---') + 3);
            const body = bodyStart > 0 ? content.substring(bodyStart + 3).trim() : '';
            const firstPara = body.split('\n\n')[0] || title;
            entries.push({
                id,
                title,
                type: type,
                status: status,
                tags: [],
                description: firstPara.substring(0, 300),
                created,
                created_session: 0,
                modified: null,
                supersedes: null,
                superseded_by: null,
                file_path: path.join('knowledge', file),
                tfidf_vector: {},
                workpackage_id: null,
                phase_id: null,
                deprecated_at: null,
                deprecated_reason: null,
                archived_at: null,
                deprecation_type: null,
                superseded_at: null,
                schema_version: 1,
                surfaced_count: 0,
                supersession_reviewed: false,
                source: null,
                source_updated: null,
                scope: null,
                entity_type: null,
                role: null,
                owns: null,
                contact: null,
                trigger_event: null,
                frequency: null,
                tools: null,
                automation_hook: null,
                promotion_status: null,
            });
        }
        catch {
            // Skip malformed entries
        }
    }
    return entries;
}
/**
 * Calculate relevance score for an entry
 * Higher score = more relevant
 */
function calculateRelevanceScore(entry, contextTags, currentSession) {
    let score = 0;
    // Base score: active entries get priority
    if (entry.status === 'active') {
        score += 10;
    }
    else if (entry.status === 'superseded') {
        score -= 5;
    }
    else if (entry.status === 'deprecated') {
        score -= 10;
    }
    // Grace period boost: new entries with no surfacing history get +8
    // for the first 5 sessions after creation (overcomes cold-start problem)
    if (currentSession != null && entry.created_session > 0) {
        const sessionAge = currentSession - entry.created_session;
        if (sessionAge >= 0 && sessionAge < 5) {
            score += 8;
        }
    }
    // Tag matches (each match adds points)
    if (contextTags.length > 0) {
        const entryTags = new Set(entry.tags.map(t => t.toLowerCase()));
        for (const tag of contextTags) {
            if (entryTags.has(tag.toLowerCase())) {
                score += 5;
            }
        }
    }
    // Recency score (entries from recent sessions score higher)
    const sessionAge = Date.now() - new Date(entry.created).getTime();
    const daysOld = sessionAge / (1000 * 60 * 60 * 24);
    if (daysOld < 7) {
        score += 3;
    }
    else if (daysOld < 30) {
        score += 1;
    }
    // Type priority (decisions and patterns often more relevant)
    if (entry.type === 'technical-decision') {
        score += 2;
    }
    else if (entry.type === 'architectural-pattern') {
        score += 1;
    }
    return score;
}
/**
 * Format entries for additionalContext output
 */
function formatEntriesForContext(entries, level, clearDir) {
    const config = types_1.TOKEN_LEVEL_CONFIGS[level];
    if (entries.length === 0) {
        return '[CLEAR Knowledge] No knowledge entries available.';
    }
    // Check if we should summarize (more than summary threshold)
    const shouldSummarize = entries.length > config.summaryThreshold;
    // WP-DF2 AC4 (S166): read slug-index once per call. Detailed-mode rendering
    // (shouldSummarize === false) below resolves [[slug-name]] refs in entry
    // descriptions to actual entry IDs. Brief-mode skips the description so no
    // resolution is needed. Null index → resolveSlugRefs passes text through.
    const slugIndex = (clearDir && !shouldSummarize)
        ? (0, slug_index_1.readSlugIndex)(clearDir)
        : null;
    let output = `[CLEAR Knowledge] Loaded ${entries.length} entries:\n`;
    for (const entry of entries) {
        const statusIndicator = entry.status === 'active' ? '' : ` [${entry.status}]`;
        if (shouldSummarize) {
            // Brief format for many entries
            output += `• ${entry.id}: ${entry.title}${statusIndicator}\n`;
        }
        else {
            // Detailed format for few entries
            output += `\n### ${entry.id}: ${entry.title}${statusIndicator}\n`;
            output += `Type: ${entry.type} | Tags: ${entry.tags.join(', ')}\n`;
            // WP-DF2 AC4 (S166): resolve [[slug-name]] refs in description BEFORE
            // truncating so the entry-ID expansion is what the user sees in context.
            const resolvedDesc = clearDir
                ? (0, slug_resolver_1.resolveSlugRefsWithLog)(entry.description, slugIndex, clearDir, 'load-cli')
                : entry.description;
            const desc = resolvedDesc.length > 200
                ? resolvedDesc.substring(0, 200) + '...'
                : resolvedDesc;
            output += `${desc}\n`;
        }
    }
    return output.trim();
}
/**
 * Main load operation
 */
function loadKnowledge(options) {
    const { clearDir, level, contextTags } = options;
    const config = types_1.TOKEN_LEVEL_CONFIGS[level];
    // Try to load from SQLite database first, but only if it exists
    const dbPath = path.join(clearDir, 'knowledge', 'index.db');
    const db = new db_1.KnowledgeDatabase(clearDir);
    let entries = [];
    // Only try SQLite if database file exists (avoid creating empty DB)
    let dbInitialized = false;
    if (fs.existsSync(dbPath)) {
        try {
            dbInitialized = db.initialize();
        }
        catch {
            // Silently fall back to JSON on any DB error
            dbInitialized = false;
        }
    }
    // Track whether ANY index source was readable. `indexAvailable: false` means both the
    // DB and its JSON export are unreadable (search/load is blind) — distinct from a
    // readable-but-empty index. The canonical index is the DB/index.json, not the vestigial
    // markdown scan, so availability is judged against those sources.
    let indexAvailable = false;
    if (dbInitialized) {
        try {
            entries = db.getAllEntries('active');
            db.close();
            indexAvailable = true;
        }
        catch {
            db.close();
            const fallback = loadFromJsonFallback(clearDir);
            entries = fallback.entries;
            indexAvailable = fallback.available;
        }
    }
    else {
        // Fall back to JSON if DB doesn't exist or failed to initialize
        try {
            db.close();
        }
        catch { /* ignore */ }
        const fallback = loadFromJsonFallback(clearDir);
        entries = fallback.entries;
        indexAvailable = fallback.available;
    }
    const totalAvailable = entries.length;
    // If no entries, distinguish "index unreadable while entries exist on disk" (blind →
    // honest no_knowledge_base) from "genuinely empty" (readable-but-empty index, OR a
    // fresh project with nothing captured). A fresh project must NOT report unavailable.
    if (entries.length === 0) {
        if (!indexAvailable && countEntriesOnDisk(clearDir) > 0) {
            return {
                success: false,
                status: 'no_knowledge_base',
                additionalContext: '[CLEAR Knowledge] Knowledge index unavailable — the index (SQLite database / its JSON export) could not be read, so saved entries cannot be loaded. Run /cf-debug to diagnose and get the rebuild + reindex remediation.',
                entriesLoaded: 0,
                level,
                totalAvailable: 0
            };
        }
        return {
            success: true,
            additionalContext: '[CLEAR Knowledge] No knowledge entries available.',
            entriesLoaded: 0,
            level,
            totalAvailable: 0
        };
    }
    // Score entries by relevance
    const scoredEntries = entries.map(entry => ({
        entry,
        score: calculateRelevanceScore(entry, contextTags, options.session)
    }));
    // Sort by score (descending)
    scoredEntries.sort((a, b) => b.score - a.score);
    // Take top N based on token level
    const selectedEntries = scoredEntries
        .slice(0, config.maxEntries)
        .map(se => se.entry);
    // Format for output
    const additionalContext = formatEntriesForContext(selectedEntries, level, clearDir);
    return {
        success: true,
        additionalContext,
        entriesLoaded: selectedEntries.length,
        level,
        totalAvailable
    };
}
// Main execution
if (process.argv.includes('--help') || process.argv.includes('help')) {
    console.log(JSON.stringify({
        success: true,
        message: [
            'Usage: load-cli.js [options]',
            '',
            'Options:',
            '  --clear-dir=<path>           Path to .clear directory (default: .clear)',
            '  --level=<level>              Token level: minimal, balanced, comprehensive',
            '                               (default: balanced, overridden by knowledge.yaml)',
            '  --context=<tags>             Comma-separated context tags for relevance filtering',
            '  --workpackage=<id>           Active workpackage ID for relevance boosting',
            '  --session=<number>           Current session number for grace period boost',
        ].join('\n')
    }));
    process.exit(0);
}
const options = parseArgs();
// Normalize to the .clear subdir, tolerant of either --clear-dir convention.
options.clearDir = (0, validation_1.resolveClearDir)(options.clearDir).clearSubdir;
// Override level from config if not specified on command line
const configLevel = loadConfig(options.clearDir);
if (!process.argv.some(arg => arg.startsWith('--level='))) {
    options.level = configLevel.level;
}
const result = loadKnowledge(options);
console.log(JSON.stringify(result));
//# sourceMappingURL=load-cli.js.map