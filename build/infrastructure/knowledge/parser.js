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
exports.getBodyTemplate = getBodyTemplate;
exports.generateKnowledgeMarkdown = generateKnowledgeMarkdown;
exports.writeKnowledgeFile = writeKnowledgeFile;
exports.updateKnowledgeFile = updateKnowledgeFile;
exports.getNextId = getNextId;
exports.isValidId = isValidId;
exports.getTypeFromId = getTypeFromId;
exports.cascadeIdRewrite = cascadeIdRewrite;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const types_1 = require("./types");
const db_1 = require("./db");
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
    // Find end of frontmatter — line-anchored. A naive `indexOf('---', 3)`
    // truncates at an embedded `---` inside a YAML block scalar (e.g., a
    // multi-line automation_hook value), silently losing the rest of the
    // frontmatter; only `\n---` followed by another newline or EOF is a
    // legitimate closing fence.
    const closingMatch = /\n---(?:\r?\n|$)/.exec(content);
    if (!closingMatch || closingMatch.index < 3) {
        return null;
    }
    const endIndex = closingMatch.index + 1;
    try {
        const frontmatterStr = content.slice(3, endIndex).trim();
        // TS-K3.4-01 (S155): yaml.load returns string | number | null | object — cast
        // through unknown + structural object guard before assertion. The K3.4 owns
        // normalization (below) accesses frontmatter.owns on the unvalidated object;
        // the outer try/catch was the only runtime safety net previously.
        const raw = yaml.load(frontmatterStr, { schema: yaml.JSON_SCHEMA });
        if (typeof raw !== 'object' || raw === null) {
            return null;
        }
        const frontmatter = raw;
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
        // Ensure related_files is an array (normalize inline YAML [a, b] and scalar forms)
        if (frontmatter.related_files !== undefined && !Array.isArray(frontmatter.related_files)) {
            frontmatter.related_files = frontmatter.related_files ? [String(frontmatter.related_files)] : [];
        }
        // Ensure alternatives_considered is an array
        if (frontmatter.alternatives_considered !== undefined && !Array.isArray(frontmatter.alternatives_considered)) {
            frontmatter.alternatives_considered = frontmatter.alternatives_considered ? [String(frontmatter.alternatives_considered)] : [];
        }
        // K3.4 D-K3.4-01: normalize `owns` (stakeholder paths) to string[]. The
        // type accepts scalar | array | null at the input boundary, but downstream
        // consumers (buildOwnerIndex) expect array form. Mirrors tags / related_files
        // / alternatives_considered precedent above. Null stays null.
        if (frontmatter.owns !== undefined && frontmatter.owns !== null && !Array.isArray(frontmatter.owns)) {
            frontmatter.owns = frontmatter.owns ? [String(frontmatter.owns)] : [];
        }
        // WP-PS7 phase_a (S188): normalize `linked_workpackages` scalar→array.
        // Mirrors the owns / tags / related_files precedent above. The frontmatter
        // type accepts string[] | string | null at the input boundary; downstream
        // consumers (link-cli round-trip writes, future MCP queries) expect array
        // form. Null stays null.
        if (frontmatter.linked_workpackages !== undefined && frontmatter.linked_workpackages !== null && !Array.isArray(frontmatter.linked_workpackages)) {
            frontmatter.linked_workpackages = frontmatter.linked_workpackages ? [String(frontmatter.linked_workpackages)] : [];
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
 * Serialize the post-normalize `owns` value for SQL row storage.
 *
 * K3.4 D-K3.4-01 asymmetry: `KnowledgeEntryFrontmatter.owns` accepts
 * `string | string[] | null` (parseFrontmatter normalizes scalar to array form
 * for downstream consumers like buildOwnerIndex). `KnowledgeEntry.owns` (the
 * DB-row type) and `KnowledgeEntryRow.owns` (raw SQL) STAY `string | null`
 * per disposition — the SQLite layer stores serialized form. Arrays serialize
 * to JSON-array strings; scalars pass through; null/undefined → null.
 *
 * Future SQLite-side consumers MUST deserialize via parseFrontmatter rather
 * than parsing this string directly — that path also handles legacy scalar
 * entries written before K3.4 shipped.
 */
function serializeOwnsForRow(owns) {
    if (owns == null) {
        return null;
    }
    if (Array.isArray(owns)) {
        return JSON.stringify(owns);
    }
    // STD-K3.4-CS3-02 (S155): scalar passthrough preserves pre-K3.4 raw form.
    // Future SQLite-side consumers (WP-K2.3 MCP, WP-K2.5 TF-IDF) MUST NOT
    // string-split this value — it may be either a JSON-array string or a
    // raw scalar path. Always deserialize via parseFrontmatter.
    return owns;
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
        // OOS-01: validate type and status at parse boundary. yaml.load returns
        // `unknown` and the cast inside parseFrontmatter trusts file content;
        // these guards narrow that trust to runtime-validated unions. Malformed
        // files return null — the same recovery path callers already handle.
        if (!(0, types_1.isKnowledgeType)(frontmatter.type)) {
            return null;
        }
        if (!(0, types_1.isKnowledgeStatus)(frontmatter.status)) {
            return null;
        }
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
            superseded_at: null,
            // Schema v5 fields - default to 1 if absent (pre-v5 entries)
            schema_version: frontmatter.schema_version ?? 1,
            // Schema v6 fields - default to 0 (no surfacing events yet)
            surfaced_count: frontmatter.surfaced_count ?? 0,
            // Schema v7 fields - default to false (not yet reviewed by user)
            supersession_reviewed: frontmatter.supersession_reviewed ?? false,
            // Schema v8 fields - null for non-K3.1 types and entries without category-specific frontmatter
            source: frontmatter.source ?? null,
            source_updated: frontmatter.source_updated ?? null,
            scope: frontmatter.scope ?? null,
            entity_type: frontmatter.entity_type ?? null,
            role: frontmatter.role ?? null,
            // K3.4 D-K3.4-01: KnowledgeEntry.owns stays scalar TEXT (DB-row type).
            // parseFrontmatter normalized arrays at the input boundary; here we
            // RE-SERIALIZE arrays to a JSON-array string for SQL storage. Future
            // SQLite-side consumers (WP-K2.3 MCP query, WP-K2.5 TF-IDF) deserialize
            // back to string[] via parseFrontmatter, NOT by parsing this DB string.
            // See WP-K3.4.yaml DESIGN NOTE for the full asymmetry rationale.
            owns: serializeOwnsForRow(frontmatter.owns),
            contact: frontmatter.contact ?? null,
            trigger_event: frontmatter.trigger_event ?? null,
            frequency: frontmatter.frequency ?? null,
            tools: frontmatter.tools ?? null,
            automation_hook: frontmatter.automation_hook ?? null,
            promotion_status: frontmatter.promotion_status ?? null
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
        // Fix-batch S166 SEC-3: filter symlinks. Node 20 `readdirSync(recursive:true)`
        // follows directory symlinks by default; without explicit filtering, a
        // symlink under .clear/knowledge/entries/ could point to files outside the
        // repo and pollute the slug-index / SQLite index with foreign content. Use
        // lstat (not stat) so we evaluate the link itself, not its target.
        return entries
            .filter(entry => entry.endsWith('.md'))
            .map(entry => path.join(entriesDir, entry))
            .filter(fullPath => {
            try {
                return !fs.lstatSync(fullPath).isSymbolicLink();
            }
            catch {
                return false;
            }
        });
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
 * Schema v8 (K3.1) category-specific frontmatter fields.
 * Listed once so K3.2-K3.4 generators do not need to duplicate per-type
 * passthrough logic. Only fields meaningful to the entry's type should be
 * populated by callers; this generator writes whichever are defined.
 */
const K3_CATEGORY_FRONTMATTER_FIELDS = [
    'source', 'source_updated', 'scope',
    'entity_type', 'role', 'owns', 'contact',
    'trigger_event', 'frequency', 'tools', 'automation_hook', 'promotion_status'
];
function renderHeader(entry) {
    const description = entry.description ?? 'Description to be added.';
    return `# ${entry.title}\n\n${description}`;
}
function defaultBodyTemplate(entry) {
    return renderHeader(entry);
}
function institutionalWikiBodyTemplate(entry) {
    return `${renderHeader(entry)}

## Source

(External source citation — see frontmatter \`source\` and \`source_updated\` for the canonical reference.)

## Scope

(See frontmatter \`scope\`. Elaborate here on what this entry covers and what it does not.)

## Content

(Institutional knowledge captured here.)`;
}
function processBodyTemplate(entry) {
    return `${renderHeader(entry)}

## Trigger

(See frontmatter \`trigger_event\` for the canonical event. Describe what kicks off this process; recurrence captured in frontmatter \`frequency\`.)

## Prerequisites

(What must be true before running this process: tools installed, permissions, prior steps. See frontmatter \`tools\` for the canonical tool list.)

## Steps

(Ordered actions to execute. Reference frontmatter \`automation_hook\` if any portion is automated.)

## Verification

(How to confirm the process completed successfully — observable outputs, side effects, or follow-up checks.)`;
}
function stakeholderBodyTemplate(entry) {
    return `${renderHeader(entry)}

## Entity

(See frontmatter \`entity_type\` for the canonical kind — person, team, role, vendor, system. Describe the scope of this entity: what it represents, where it sits in the org, and any boundaries.)

## Role

(See frontmatter \`role\` for the canonical title or function. Describe responsibilities, authority, and decision-making scope. Include reporting relationships if relevant.)

## Owns

(See frontmatter \`owns\` for the canonical path list. Describe ownership boundaries — what this stakeholder is responsible for maintaining, deciding on, or signing off. Include implicit ownership relationships not captured in path form.)

## Contact

(See frontmatter \`contact\` for the canonical channel. Describe escalation paths, availability windows, response-time expectations, and preferred communication modes.)`;
}
/**
 * Type-keyed body template dispatch. `Record<KnowledgeType, ...>` (not
 * `Partial`) so adding a type to the `KnowledgeType` union without registering
 * a builder here is a TS error — closes the silent-fallback class for K3.4
 * stakeholder and any future category. Types without a custom narrative shape
 * map to `defaultBodyTemplate` explicitly. Refactored in K3.3 from the K3.2
 * if-chain (LIN-01).
 */
const BODY_TEMPLATE_BUILDERS = {
    'technical-decision': defaultBodyTemplate,
    'business-rule': defaultBodyTemplate,
    'architectural-pattern': defaultBodyTemplate,
    'lesson-learned': defaultBodyTemplate,
    'institutional-wiki': institutionalWikiBodyTemplate,
    'stakeholder': stakeholderBodyTemplate,
    'process': processBodyTemplate
};
/**
 * Render the body template for a knowledge entry. Replace a type's entry in
 * `BODY_TEMPLATE_BUILDERS` to give it a custom narrative shape. Exported for
 * direct unit testing per CS1.
 */
function getBodyTemplate(type, entry) {
    return BODY_TEMPLATE_BUILDERS[type](entry);
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
        created_session: entry.created_session ?? 1,
        schema_version: entry.schema_version ?? db_1.SCHEMA_VERSION
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
    if (entry.supersession_reviewed) {
        frontmatter.supersession_reviewed = true;
    }
    if (entry.related_files && entry.related_files.length > 0) {
        frontmatter.related_files = entry.related_files;
    }
    if (entry.description) {
        frontmatter.description = entry.description;
    }
    // WP-DF2 AC4 (S166): emit slug when present + non-empty. Skipped on absence so
    // pre-S166 entries don't gain an empty `slug:` line on round-trip.
    if (typeof entry.slug === 'string' && entry.slug.trim().length > 0) {
        frontmatter.slug = entry.slug.trim();
    }
    for (const field of K3_CATEGORY_FRONTMATTER_FIELDS) {
        const value = entry[field];
        if (value !== undefined && value !== null) {
            frontmatter[field] = value;
        }
    }
    const frontmatterStr = yaml.dump(frontmatter, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false
    }).trim();
    const body = getBodyTemplate(entry.type, entry);
    return `---
${frontmatterStr}
---

${body}
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
        // Merge updates (back-fill schema_version for pre-v5 entries)
        const updatedFrontmatter = {
            ...parsed.frontmatter,
            ...updates,
            modified: new Date().toISOString(),
            schema_version: parsed.frontmatter.schema_version ?? 1
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
    return /^(TD|BR|PAT|LES|IW|SH|PROC)-\d{3}$/.test(id);
}
/**
 * Extract knowledge type from ID
 * @param id - Knowledge entry ID
 * @returns Knowledge type or null if invalid
 */
function getTypeFromId(id) {
    const prefix = id.split('-')[0];
    for (const [type, p] of Object.entries(types_1.KNOWLEDGE_TYPE_PREFIXES)) {
        if (p === prefix && (0, types_1.isKnowledgeType)(type)) {
            return type;
        }
    }
    return null;
}
/**
 * Rewrite supersedes / superseded_by references from oldId to newId across
 * every knowledge entry's frontmatter. Used by K3.5 type-change to propagate
 * ID renames through any third-party entries that referenced the old ID
 * (NEW-K3.5-01 cascade — AC2 mandates this).
 *
 * Skips the supersession participants themselves (oldId + newId) — their
 * frontmatter is owned by the caller's supersession primitive, not the
 * cascade walk. DB synchronization is the caller's responsibility (typically
 * via triggerIndexUpdate per returned ID).
 *
 * @param entriesDir - Path to entries directory
 * @param oldId - The ID being replaced
 * @param newId - The replacement ID
 * @returns Array of third-party entry IDs whose frontmatter was rewritten
 */
function cascadeIdRewrite(entriesDir, oldId, newId) {
    const updatedIds = [];
    const entries = parseAllKnowledgeFiles(entriesDir);
    for (const entry of entries) {
        if (entry.id === oldId || entry.id === newId) {
            continue;
        }
        // SEC-K3.5-01: parseKnowledgeFile only truthy-checks `id`; a hand-crafted
        // .md with `id: ../../shadow` would slip through here and produce an
        // escaped path at the updateKnowledgeFile write below. Belt-and-suspenders
        // — defer to isValidId before constructing the write path.
        if (!isValidId(entry.id)) {
            continue;
        }
        const updates = {};
        if (entry.supersedes === oldId) {
            updates.supersedes = newId;
        }
        if (entry.superseded_by === oldId) {
            updates.superseded_by = newId;
        }
        if (Object.keys(updates).length === 0) {
            continue;
        }
        const filePath = path.join(entriesDir, `${entry.id}.md`);
        if (updateKnowledgeFile(filePath, updates)) {
            updatedIds.push(entry.id);
        }
    }
    return updatedIds;
}
//# sourceMappingURL=parser.js.map