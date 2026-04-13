"use strict";
/**
 * Knowledge Entry Markdown Parser
 *
 * Parses markdown files with YAML frontmatter into KnowledgeEntry objects.
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
exports.parseFrontmatter = parseFrontmatter;
exports.parseKnowledgeFile = parseKnowledgeFile;
exports.scanKnowledgeFiles = scanKnowledgeFiles;
exports.parseAllKnowledgeFiles = parseAllKnowledgeFiles;
exports.generateKnowledgeMarkdown = generateKnowledgeMarkdown;
exports.writeKnowledgeFile = writeKnowledgeFile;
exports.updateKnowledgeFile = updateKnowledgeFile;
exports.getNextId = getNextId;
exports.isValidId = isValidId;
exports.getTypeFromId = getTypeFromId;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const types_1 = require("./types");
/**
 * Parse YAML frontmatter from markdown content
 * @param content - Full markdown content
 * @returns Parsed frontmatter and body, or null if invalid
 */
function parseFrontmatter(content) {
    // Check for frontmatter delimiter
    if (!content.startsWith('---')) {
        return null;
    }
    // Find end of frontmatter
    const endIndex = content.indexOf('---', 3);
    if (endIndex === -1) {
        return null;
    }
    try {
        const frontmatterStr = content.slice(3, endIndex).trim();
        const frontmatter = yaml.load(frontmatterStr, { schema: yaml.JSON_SCHEMA });
        // Validate required fields
        if (!frontmatter.id || !frontmatter.title || !frontmatter.type) {
            return null;
        }
        // Extract body (everything after frontmatter)
        const body = content.slice(endIndex + 3).trim();
        // Ensure tags is an array
        if (!Array.isArray(frontmatter.tags)) {
            frontmatter.tags = frontmatter.tags ? [String(frontmatter.tags)] : [];
        }
        // Set defaults
        frontmatter.status = frontmatter.status || 'active';
        frontmatter.supersedes = frontmatter.supersedes || null;
        frontmatter.superseded_by = frontmatter.superseded_by || null;
        return { frontmatter, body };
    }
    catch {
        // Return null for invalid frontmatter - caller handles gracefully
        return null;
    }
}
/**
 * Parse a knowledge entry markdown file
 * @param filePath - Path to markdown file
 * @param tfidfVector - Pre-computed TF-IDF vector (optional)
 * @returns Parsed KnowledgeEntry or null if invalid
 */
function parseKnowledgeFile(filePath, tfidfVector = {}) {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseFrontmatter(content);
        if (!parsed) {
            // Invalid frontmatter - return null, caller handles gracefully
            return null;
        }
        const { frontmatter, body } = parsed;
        // Use description from frontmatter, or extract from body
        let description = frontmatter.description || '';
        if (!description && body) {
            // Use first paragraph of body as description
            const firstPara = body.split('\n\n')[0];
            description = firstPara.replace(/^#+\s*/, '').trim();
        }
        // Use file mtime as modified timestamp (enables incremental mode tracking)
        const fileStat = fs.statSync(filePath);
        const fileModified = fileStat.mtime.toISOString();
        return {
            id: frontmatter.id,
            type: frontmatter.type,
            title: frontmatter.title,
            status: frontmatter.status,
            tags: frontmatter.tags,
            created: frontmatter.created,
            created_session: frontmatter.created_session,
            modified: fileModified,
            supersedes: frontmatter.supersedes || null,
            superseded_by: frontmatter.superseded_by || null,
            description,
            file_path: filePath,
            tfidf_vector: tfidfVector,
            // Schema v2 fields - null by default, set via linkToWorkpackage
            workpackage_id: null,
            phase_id: null,
            // Schema v3 fields - null by default, set via deprecateEntry
            deprecated_at: null,
            deprecated_reason: null,
            // Schema v4 fields - null by default, set via performSupersession
            archived_at: null,
            deprecation_type: null,
            superseded_at: null
        };
    }
    catch {
        // Failed to read/parse file - return null, caller handles gracefully
        return null;
    }
}
/**
 * Scan a directory recursively for knowledge entry markdown files.
 * @param entriesDir - Path to entries directory (or parent containing entries/)
 * @returns Array of absolute file paths to .md files
 */
function scanKnowledgeFiles(entriesDir) {
    try {
        if (!fs.existsSync(entriesDir)) {
            return [];
        }
        const entries = fs.readdirSync(entriesDir, { encoding: 'utf8', recursive: true });
        return entries
            .filter(entry => entry.endsWith('.md'))
            .map(entry => path.join(entriesDir, entry));
    }
    catch {
        // Failed to scan directory - return empty array
        return [];
    }
}
/**
 * Parse all knowledge files in a directory
 * @param entriesDir - Path to entries directory
 * @returns Array of parsed entries (invalid files skipped)
 */
function parseAllKnowledgeFiles(entriesDir) {
    const files = scanKnowledgeFiles(entriesDir);
    const entries = [];
    for (const filePath of files) {
        const entry = parseKnowledgeFile(filePath);
        if (entry) {
            entries.push(entry);
        }
    }
    return entries;
}
/**
 * Generate knowledge entry markdown content
 * @param entry - Knowledge entry (partial, for creation)
 * @returns Markdown content with frontmatter
 */
function generateKnowledgeMarkdown(entry) {
    const frontmatter = {
        id: entry.id,
        title: entry.title,
        type: entry.type,
        status: entry.status || 'active',
        tags: entry.tags || [],
        created: entry.created || new Date().toISOString(),
        created_session: entry.created_session || 1
    };
    if (entry.modified) {
        frontmatter.modified = entry.modified;
    }
    if (entry.supersedes) {
        frontmatter.supersedes = entry.supersedes;
    }
    if (entry.superseded_by) {
        frontmatter.superseded_by = entry.superseded_by;
    }
    const frontmatterStr = yaml.dump(frontmatter, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false
    }).trim();
    const description = entry.description || 'Description to be added.';
    return `---
${frontmatterStr}
---

# ${entry.title}

${description}
`;
}
/**
 * Write a knowledge entry to file
 * @param entry - Knowledge entry to write
 * @param entriesDir - Directory to write to
 * @returns Path to written file, or null on failure
 */
function writeKnowledgeFile(entry, entriesDir) {
    try {
        // Ensure directory exists
        if (!fs.existsSync(entriesDir)) {
            fs.mkdirSync(entriesDir, { recursive: true });
        }
        const content = generateKnowledgeMarkdown(entry);
        const filePath = path.join(entriesDir, `${entry.id}.md`);
        fs.writeFileSync(filePath, content, 'utf-8');
        return filePath;
    }
    catch (error) {
        console.error(`Failed to write knowledge file: ${error}`);
        return null;
    }
}
/**
 * Update frontmatter in an existing knowledge file
 * @param filePath - Path to knowledge file
 * @param updates - Fields to update
 * @returns True if successful
 */
function updateKnowledgeFile(filePath, updates) {
    try {
        if (!fs.existsSync(filePath)) {
            return false;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseFrontmatter(content);
        if (!parsed) {
            return false;
        }
        // Merge updates
        const updatedFrontmatter = {
            ...parsed.frontmatter,
            ...updates,
            modified: new Date().toISOString()
        };
        // Regenerate file
        const frontmatterStr = yaml.dump(updatedFrontmatter, {
            lineWidth: -1,
            quotingType: '"',
            forceQuotes: false
        }).trim();
        const newContent = `---
${frontmatterStr}
---

${parsed.body}`;
        fs.writeFileSync(filePath, newContent, 'utf-8');
        return true;
    }
    catch (error) {
        console.error(`Failed to update knowledge file: ${error}`);
        return false;
    }
}
/**
 * Get next available ID for a knowledge type
 * @param entriesDir - Path to entries directory
 * @param type - Knowledge type
 * @returns Next available ID (e.g., "TD-004")
 */
function getNextId(entriesDir, type) {
    const prefix = types_1.KNOWLEDGE_TYPE_PREFIXES[type];
    if (prefix === undefined) {
        throw new Error(`Unknown knowledge type: '${type}'. Valid types: ${Object.keys(types_1.KNOWLEDGE_TYPE_PREFIXES).join(', ')}`);
    }
    const files = scanKnowledgeFiles(entriesDir);
    let maxNum = 0;
    const pattern = new RegExp(`^${prefix}-(\\d+)$`);
    for (const filePath of files) {
        const fileName = path.basename(filePath, '.md');
        const match = fileName.match(pattern);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) {
                maxNum = num;
            }
        }
    }
    const nextNum = maxNum + 1;
    return `${prefix}-${String(nextNum).padStart(3, '0')}`;
}
/**
 * Validate knowledge entry ID format
 * @param id - ID to validate
 * @returns True if valid format
 */
function isValidId(id) {
    return /^(TD|BR|PAT|LES)-\d{3}$/.test(id);
}
/**
 * Extract knowledge type from ID
 * @param id - Knowledge entry ID
 * @returns Knowledge type or null if invalid
 */
function getTypeFromId(id) {
    const prefix = id.split('-')[0];
    for (const [type, p] of Object.entries(types_1.KNOWLEDGE_TYPE_PREFIXES)) {
        if (p === prefix) {
            return type;
        }
    }
    return null;
}
//# sourceMappingURL=parser.js.map