#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge Search CLI Tool
 *
 * Handles knowledge search requests with P1-P3 priority matching.
 * Called by knowledge-search.sh bash wrapper.
 *
 * Usage:
 *   npx ts-node search-cli.ts --clear-dir=<path> --query=<query> [--max-results=10]
 *   npx ts-node search-cli.ts --clear-dir=<path> --detect-only --text=<text>
 *
 * Modes:
 *   --detect-only: Check if text contains a search intent, return intent info
 *   (default): Perform search with P1-P3 priority matching
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
exports.formatSearchResultEntry = formatSearchResultEntry;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const validation_1 = require("../../validation");
const db_1 = require("../db");
const types_1 = require("../types");
const patterns_1 = require("../patterns");
const tfidf_1 = require("../tfidf");
// ==============================================================================
// Argument Parsing
// ==============================================================================
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        clearDir: '.clear',
        maxResults: types_1.DEFAULT_KNOWLEDGE_CONFIG.search.max_results,
        detectOnly: false,
        includeSuperseded: false
    };
    for (const arg of args) {
        if (arg.startsWith('--clear-dir=')) {
            options.clearDir = arg.substring('--clear-dir='.length);
        }
        else if (arg.startsWith('--query=')) {
            options.query = arg.substring('--query='.length);
        }
        else if (arg.startsWith('--max-results=')) {
            options.maxResults = parseInt(arg.substring('--max-results='.length), 10) || 10;
        }
        else if (arg === '--detect-only') {
            options.detectOnly = true;
        }
        else if (arg.startsWith('--text=')) {
            options.text = arg.substring('--text='.length);
        }
        else if (arg === '--include-superseded') {
            options.includeSuperseded = true;
        }
    }
    options.clearDir = (0, validation_1.validateBasePath)(options.clearDir);
    return options;
}
// ==============================================================================
// Search Implementation
// ==============================================================================
/**
 * Load entries from JSON fallback when SQLite unavailable
 */
function loadFromJsonFallback(clearDir) {
    const jsonPath = path.join(clearDir, 'knowledge', 'index.json');
    if (!fs.existsSync(jsonPath)) {
        return [];
    }
    try {
        const content = fs.readFileSync(jsonPath, 'utf-8');
        const index = JSON.parse(content);
        return index.entries || [];
    }
    catch {
        return [];
    }
}
/**
 * Load IDF values from JSON index metadata
 */
function loadIdfValues(clearDir) {
    const jsonPath = path.join(clearDir, 'knowledge', 'index.json');
    const idfMap = new Map();
    if (!fs.existsSync(jsonPath)) {
        return idfMap;
    }
    try {
        const content = fs.readFileSync(jsonPath, 'utf-8');
        const index = JSON.parse(content);
        if (index.metadata?.idf_values) {
            const idfValues = typeof index.metadata.idf_values === 'string'
                ? JSON.parse(index.metadata.idf_values)
                : index.metadata.idf_values;
            for (const [term, value] of Object.entries(idfValues)) {
                if (typeof value === 'number') {
                    idfMap.set(term, value);
                }
            }
        }
    }
    catch {
        // Ignore errors
    }
    return idfMap;
}
/**
 * P1 Search: Tag exact match
 * Tags in query are matched against entry tags
 */
function searchByTags(entries, queryTerms) {
    const results = [];
    for (const entry of entries) {
        const entryTags = entry.tags.map(t => t.toLowerCase());
        let matchCount = 0;
        for (const term of queryTerms) {
            if (entryTags.includes(term.toLowerCase())) {
                matchCount++;
            }
        }
        if (matchCount > 0) {
            results.push({
                entry,
                score: matchCount * 10, // Higher weight for tag matches
                matchType: 'tag'
            });
        }
    }
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results;
}
/**
 * P2 Search: Title keyword match
 * Query terms are matched against entry titles
 */
function searchByTitle(entries, queryTerms) {
    const results = [];
    for (const entry of entries) {
        const titleLower = entry.title.toLowerCase();
        let matchCount = 0;
        for (const term of queryTerms) {
            if (titleLower.includes(term.toLowerCase())) {
                matchCount++;
            }
        }
        if (matchCount > 0) {
            results.push({
                entry,
                score: matchCount * 5, // Medium weight for title matches
                matchType: 'title'
            });
        }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
}
/**
 * P3 Search: TF-IDF similarity
 * Query vector is compared against entry TF-IDF vectors
 */
function searchByTfIdf(entries, query, idfValues, minSimilarity = 0.1) {
    const results = [];
    // Tokenize query and compute TF
    const queryTokens = (0, tfidf_1.tokenize)(query);
    if (queryTokens.length === 0) {
        return results;
    }
    const queryTf = (0, tfidf_1.computeTermFrequency)(queryTokens);
    // Build query TF-IDF vector
    const queryVector = {};
    let magnitude = 0;
    for (const [term, tf] of queryTf) {
        const idf = idfValues.get(term) || 1;
        const tfidf = tf * idf;
        queryVector[term] = tfidf;
        magnitude += tfidf * tfidf;
    }
    // Normalize query vector
    magnitude = Math.sqrt(magnitude);
    if (magnitude > 0) {
        for (const term of Object.keys(queryVector)) {
            queryVector[term] /= magnitude;
        }
    }
    // Compare with each entry's TF-IDF vector
    for (const entry of entries) {
        if (!entry.tfidf_vector || Object.keys(entry.tfidf_vector).length === 0) {
            continue;
        }
        const similarity = (0, tfidf_1.cosineSimilarity)(queryVector, entry.tfidf_vector);
        if (similarity >= minSimilarity) {
            results.push({
                entry,
                score: similarity,
                matchType: 'tfidf'
            });
        }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
}
/**
 * Status icons for display
 */
const STATUS_ICONS = {
    active: '✅',
    superseded: '🔄',
    deprecated: '⚠️'
};
/**
 * Format a single search result entry with status icon
 * @param result - Search result
 * @returns Formatted line
 */
function formatSearchResultEntry(result) {
    const entry = result.entry;
    const icon = STATUS_ICONS[entry.status] || '❓';
    let line = `  ${icon} ${entry.id} "${entry.title}"`;
    // Add status indicator for non-active entries
    if (entry.status === 'deprecated') {
        line += ' (deprecated)';
    }
    else if (entry.status === 'superseded' && entry.superseded_by) {
        line += ` → ${entry.superseded_by}`;
    }
    line += `     [${entry.status}]`;
    // Add tags and workpackage info on second line
    const tags = entry.tags.length > 0 ? entry.tags.join(', ') : 'none';
    const linked = entry.workpackage_id ? entry.workpackage_id : 'none';
    line += `\n     Tags: ${tags} | Linked: ${linked}`;
    // Add score on third line
    const scoreFormatted = result.matchType === 'tfidf'
        ? result.score.toFixed(2)
        : result.score.toString();
    line += `\n     Score: ${scoreFormatted} (${result.matchType} match)`;
    return line;
}
/**
 * Format search results for additionalContext output
 */
function formatResultsForContext(p1Results, p2Results, p3Results, query) {
    const totalCount = p1Results.length + p2Results.length + p3Results.length;
    if (totalCount === 0) {
        return `[CLEAR Search] No matches found for "${query}".`;
    }
    // Count by status
    const allResults = [...p1Results, ...p2Results, ...p3Results];
    const activeCount = allResults.filter(r => r.entry.status === 'active').length;
    const deprecatedCount = allResults.filter(r => r.entry.status === 'deprecated').length;
    const supersededCount = allResults.filter(r => r.entry.status === 'superseded').length;
    let output = `Search results for "${query}":\n`;
    if (p1Results.length > 0) {
        output += '\n';
        for (const result of p1Results) {
            output += formatSearchResultEntry(result) + '\n';
        }
    }
    if (p2Results.length > 0) {
        output += '\n';
        for (const result of p2Results) {
            output += formatSearchResultEntry(result) + '\n';
        }
    }
    if (p3Results.length > 0) {
        output += '\n';
        for (const result of p3Results) {
            output += formatSearchResultEntry(result) + '\n';
        }
    }
    // Summary line
    const statusParts = [];
    if (activeCount > 0)
        statusParts.push(`${activeCount} active`);
    if (deprecatedCount > 0)
        statusParts.push(`${deprecatedCount} deprecated`);
    if (supersededCount > 0)
        statusParts.push(`${supersededCount} superseded`);
    output += `\n${totalCount} results (${statusParts.join(', ')})`;
    return output.trim();
}
/**
 * Convert SearchResult[] to summary format
 */
function toSummary(results) {
    return results.map(r => ({
        id: r.entry.id,
        title: r.entry.title,
        status: r.entry.status,
        score: r.score,
        matchType: r.matchType
    }));
}
// ==============================================================================
// Internal Helpers
// ==============================================================================
/**
 * Load knowledge entries from DB (preferred) or JSON fallback.
 * Handles DB initialization, status filtering, and graceful fallback.
 */
function loadKnowledgeEntries(clearDir, includeSuperseded) {
    const dbPath = path.join(clearDir, 'knowledge', 'index.db');
    const db = new db_1.KnowledgeDatabase(clearDir);
    let entries = [];
    let dbInitialized = false;
    if (fs.existsSync(dbPath)) {
        try {
            dbInitialized = db.initialize();
        }
        catch {
            dbInitialized = false;
        }
    }
    if (dbInitialized) {
        try {
            // Get all entries (we'll filter by status later to include superseded if requested)
            entries = includeSuperseded
                ? [...db.getAllEntries('active'), ...db.getAllEntries('superseded')]
                : db.getAllEntries('active');
            db.close();
        }
        catch {
            db.close();
            entries = loadFromJsonFallback(clearDir);
        }
    }
    else {
        try {
            db.close();
        }
        catch { /* ignore */ }
        entries = loadFromJsonFallback(clearDir);
        if (!includeSuperseded) {
            entries = entries.filter(e => e.status === 'active');
        }
    }
    return entries;
}
/**
 * Deduplicate across priority levels and limit results per level.
 * P1 results take precedence over P2, P2 over P3.
 */
function deduplicateAndLimit(p1Results, p2Results, p3Results, maxResults) {
    // Deduplicate: entries found in P1 shouldn't appear in P2 or P3
    const p1Ids = new Set(p1Results.map(r => r.entry.id));
    const filteredP2 = p2Results.filter(r => !p1Ids.has(r.entry.id));
    const p2Ids = new Set(filteredP2.map(r => r.entry.id));
    const filteredP3 = p3Results.filter(r => !p1Ids.has(r.entry.id) && !p2Ids.has(r.entry.id));
    // Limit results per priority level
    const limitPerLevel = Math.ceil(maxResults / 3);
    return {
        limitedP1: p1Results.slice(0, limitPerLevel),
        limitedP2: filteredP2.slice(0, limitPerLevel),
        limitedP3: filteredP3.slice(0, limitPerLevel)
    };
}
// ==============================================================================
// Main Operations
// ==============================================================================
/**
 * Detect search intent in text
 */
function detectSearch(text, clearDir) {
    // Clear cache to ensure fresh pattern load (useful for testing)
    (0, patterns_1.clearPatternsCache)();
    const cwd = path.dirname(clearDir); // .clear is inside project root
    const result = (0, patterns_1.detectSearchIntent)(text, cwd);
    if (result.matched) {
        return {
            script: 'knowledge-search',
            detected: true,
            query: result.query,
            patternDescription: result.pattern.description
        };
    }
    return {
        script: 'knowledge-search',
        detected: false
    };
}
/**
 * Perform P1-P3 search
 */
function performSearch(options) {
    const { clearDir, query, maxResults, includeSuperseded } = options;
    if (!query) {
        return {
            script: 'knowledge-search',
            success: false,
            status: 'error',
            additionalContext: '[CLEAR Search] No query provided.',
            matchCount: 0,
            error: 'No query provided'
        };
    }
    // Check if knowledge base exists
    const knowledgeDir = path.join(clearDir, 'knowledge');
    if (!fs.existsSync(knowledgeDir)) {
        return {
            script: 'knowledge-search',
            success: false,
            status: 'no_knowledge_base',
            additionalContext: '[CLEAR Search] No knowledge base found.',
            matchCount: 0
        };
    }
    // Load entries
    const entries = loadKnowledgeEntries(clearDir, includeSuperseded);
    if (entries.length === 0) {
        return {
            script: 'knowledge-search',
            success: true,
            status: 'no_results',
            additionalContext: '[CLEAR Search] No knowledge entries available.',
            matchCount: 0
        };
    }
    // Tokenize query for searching
    const queryTerms = (0, tfidf_1.tokenize)(query);
    // Perform P1-P3 searches
    const p1Results = searchByTags(entries, queryTerms);
    const p2Results = searchByTitle(entries, queryTerms);
    // For P3, we need IDF values
    const idfValues = loadIdfValues(clearDir);
    const p3Results = searchByTfIdf(entries, query, idfValues);
    // Deduplicate and limit results per priority level
    const { limitedP1, limitedP2, limitedP3 } = deduplicateAndLimit(p1Results, p2Results, p3Results, maxResults);
    const totalMatches = limitedP1.length + limitedP2.length + limitedP3.length;
    if (totalMatches === 0) {
        return {
            script: 'knowledge-search',
            success: true,
            status: 'no_results',
            additionalContext: `[CLEAR Search] No matches found for "${query}".`,
            matchCount: 0
        };
    }
    const additionalContext = formatResultsForContext(limitedP1, limitedP2, limitedP3, query);
    return {
        script: 'knowledge-search',
        success: true,
        status: 'success',
        additionalContext,
        matchCount: totalMatches,
        results: {
            p1_tag: toSummary(limitedP1),
            p2_title: toSummary(limitedP2),
            p3_tfidf: toSummary(limitedP3)
        }
    };
}
// ==============================================================================
// Main Execution
// ==============================================================================
if (process.argv.includes('--help') || process.argv.includes('help')) {
    console.log(JSON.stringify({
        success: true,
        message: [
            'Usage: search-cli.js [options]',
            '',
            'Search mode:',
            '  --query=<string>             Search query text',
            '  --max-results=<number>       Maximum results to return (default: 10)',
            '  --include-superseded         Include superseded entries in results',
            '',
            'Detection mode:',
            '  --detect-only                Check if text contains search intent',
            '  --text=<string>              Text to analyze for search intent',
            '',
            'Common:',
            '  --clear-dir=<path>           Path to .clear directory (default: .clear)',
        ].join('\n')
    }));
    process.exit(0);
}
const options = parseArgs();
if (options.detectOnly) {
    // Detection mode: check if text contains search intent
    const text = options.text || '';
    const result = detectSearch(text, options.clearDir);
    console.log(JSON.stringify(result));
}
else {
    // Search mode: perform P1-P3 search
    const result = performSearch(options);
    console.log(JSON.stringify(result));
}
//# sourceMappingURL=search-cli.js.map