"use strict";
/**
 * Reverse File-Knowledge Index
 *
 * Maps file paths → knowledge entry IDs for fast lookup.
 * Used by PostToolUse and PreToolUse hooks to find relevant knowledge
 * when files are edited or about to be edited.
 *
 * No dependency on db.ts (SQLite) — reads markdown files directly.
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
exports.buildIndex = buildIndex;
exports.updateIndex = updateIndex;
exports.lookupFiles = lookupFiles;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const parser_1 = require("./parser");
const INDEX_VERSION = '1.0';
const INDEX_FILENAME = 'file-knowledge-index.json';
// ==============================================================================
// INDEX OPERATIONS
// ==============================================================================
/**
 * Build the complete reverse index from all knowledge entries.
 *
 * Scans all .md files in the knowledge entries directory, extracts
 * related_files from frontmatter, and builds the reverse mapping.
 *
 * @param clearDir - Path to .clear/ directory
 * @returns The built index
 */
function buildIndex(clearDir) {
    const entriesDir = path.join(clearDir, 'knowledge', 'entries');
    const files = (0, parser_1.scanKnowledgeFiles)(entriesDir);
    const index = {};
    let entryCount = 0;
    for (const filePath of files) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const parsed = (0, parser_1.parseFrontmatter)(content);
            if (!parsed) {
                process.stderr.write(`[file-index] Skipping malformed entry: ${path.basename(filePath)}\n`);
                continue;
            }
            const { frontmatter } = parsed;
            // Status filtering: exclude superseded and archived entries from index
            const status = frontmatter.status;
            if (status === 'superseded' || status === 'archived') {
                continue;
            }
            const relatedFiles = frontmatter.related_files;
            if (!relatedFiles || !Array.isArray(relatedFiles) || relatedFiles.length === 0) {
                continue;
            }
            entryCount++;
            for (const relFile of relatedFiles) {
                const normalized = normalizeFilePath(relFile);
                if (!index[normalized]) {
                    index[normalized] = [];
                }
                if (!index[normalized].includes(frontmatter.id)) {
                    index[normalized].push(frontmatter.id);
                }
            }
        }
        catch {
            process.stderr.write(`[file-index] Error reading: ${path.basename(filePath)}\n`);
        }
    }
    const result = {
        version: INDEX_VERSION,
        lastBuilt: new Date().toISOString(),
        entryCount,
        index,
    };
    writeIndex(clearDir, result);
    return result;
}
/**
 * Update a single entry's mappings in the existing index.
 *
 * Removes all references to the given entry ID, then re-adds from
 * the entry's current related_files. Creates index if missing.
 *
 * @param clearDir - Path to .clear/ directory
 * @param entryId - Knowledge entry ID to update
 * @returns The updated index
 */
function updateIndex(clearDir, entryId) {
    const existing = readIndex(clearDir);
    if (!existing) {
        return buildIndex(clearDir);
    }
    // Remove all references to this entry
    for (const filePath of Object.keys(existing.index)) {
        existing.index[filePath] = existing.index[filePath].filter(id => id !== entryId);
        if (existing.index[filePath].length === 0) {
            delete existing.index[filePath];
        }
    }
    // Find the entry file and re-add its related_files
    const entriesDir = path.join(clearDir, 'knowledge', 'entries');
    const entryFile = findEntryFile(entriesDir, entryId);
    if (!entryFile) {
        process.stderr.write(`[file-index] Entry not found for update: ${entryId}\n`);
        existing.lastBuilt = new Date().toISOString();
        writeIndex(clearDir, existing);
        return existing;
    }
    try {
        const content = fs.readFileSync(entryFile, 'utf-8');
        const parsed = (0, parser_1.parseFrontmatter)(content);
        const entryStatus = parsed?.frontmatter?.status;
        if (entryStatus === 'superseded' || entryStatus === 'archived') {
            // Entry excluded from index — remove references and save
            existing.lastBuilt = new Date().toISOString();
            writeIndex(clearDir, existing);
            return existing;
        }
        if (parsed && parsed.frontmatter.related_files && parsed.frontmatter.related_files.length > 0) {
            for (const relFile of parsed.frontmatter.related_files) {
                const normalized = normalizeFilePath(relFile);
                if (!existing.index[normalized]) {
                    existing.index[normalized] = [];
                }
                if (!existing.index[normalized].includes(entryId)) {
                    existing.index[normalized].push(entryId);
                }
            }
        }
    }
    catch {
        process.stderr.write(`[file-index] Error reading entry: ${entryId}\n`);
    }
    existing.lastBuilt = new Date().toISOString();
    writeIndex(clearDir, existing);
    return existing;
}
/**
 * Look up knowledge entry IDs for a given file path.
 *
 * Tries exact match first, then falls back to directory prefix match.
 * Prefix match: 'src/plan/' matches 'src/plan/types.ts' but NOT 'src/plan-extras/types.ts'.
 *
 * @param clearDir - Path to .clear/ directory
 * @param filePath - File path to look up
 * @returns Array of matching knowledge entry IDs
 */
function lookupFiles(clearDir, filePath) {
    const existing = readIndex(clearDir);
    if (!existing) {
        return [];
    }
    const normalized = normalizeFilePath(filePath);
    // Exact match
    if (existing.index[normalized]) {
        return [...existing.index[normalized]];
    }
    // Directory prefix match — indexed paths that are prefixes of the lookup path
    const matches = new Set();
    for (const indexedPath of Object.keys(existing.index)) {
        if (isDirectoryPrefix(indexedPath, normalized)) {
            for (const id of existing.index[indexedPath]) {
                matches.add(id);
            }
        }
    }
    return [...matches];
}
// ==============================================================================
// HELPERS
// ==============================================================================
/** Normalize file path: strip leading ./ and trailing / */
function normalizeFilePath(filePath) {
    // Don't strip trailing slash — it's meaningful for directory prefixes
    return filePath.replace(/^\.\//, '');
}
/** Check if indexedPath is a directory prefix of lookupPath */
function isDirectoryPrefix(indexedPath, lookupPath) {
    // Only match if indexed path ends with / (directory indicator)
    if (!indexedPath.endsWith('/')) {
        return false;
    }
    return lookupPath.startsWith(indexedPath);
}
/** Read the index from disk, or null if not found/invalid */
function readIndex(clearDir) {
    const indexPath = path.join(clearDir, 'state', INDEX_FILENAME);
    if (!fs.existsSync(indexPath)) {
        return null;
    }
    try {
        const content = fs.readFileSync(indexPath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/** Write the index to disk */
function writeIndex(clearDir, index) {
    const stateDir = path.join(clearDir, 'state');
    if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
    }
    const indexPath = path.join(stateDir, INDEX_FILENAME);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}
/** Find the entry file by ID (scans filenames for match) */
function findEntryFile(entriesDir, entryId) {
    const files = (0, parser_1.scanKnowledgeFiles)(entriesDir);
    for (const filePath of files) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const parsed = (0, parser_1.parseFrontmatter)(content);
            if (parsed && parsed.frontmatter.id === entryId) {
                return filePath;
            }
        }
        catch {
            continue;
        }
    }
    return null;
}
//# sourceMappingURL=file-index.js.map