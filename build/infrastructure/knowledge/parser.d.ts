/**
 * Knowledge Entry Markdown Parser
 *
 * Parses markdown files with YAML frontmatter into KnowledgeEntry objects.
 */
import { KnowledgeEntry, KnowledgeEntryFrontmatter, KnowledgeType, TfIdfVector } from './types';
/**
 * Parse YAML frontmatter from markdown content
 * @param content - Full markdown content
 * @returns Parsed frontmatter and body, or null if invalid
 */
export declare function parseFrontmatter(content: string): {
    frontmatter: KnowledgeEntryFrontmatter;
    body: string;
} | null;
/**
 * Parse a knowledge entry markdown file
 * @param filePath - Path to markdown file
 * @param tfidfVector - Pre-computed TF-IDF vector (optional)
 * @returns Parsed KnowledgeEntry or null if invalid
 */
export declare function parseKnowledgeFile(filePath: string, tfidfVector?: TfIdfVector): KnowledgeEntry | null;
/**
 * Scan a directory recursively for knowledge entry markdown files.
 * @param entriesDir - Path to entries directory (or parent containing entries/)
 * @returns Array of absolute file paths to .md files
 */
export declare function scanKnowledgeFiles(entriesDir: string): string[];
/**
 * Parse all knowledge files in a directory
 * @param entriesDir - Path to entries directory
 * @returns Array of parsed entries (invalid files skipped)
 */
export declare function parseAllKnowledgeFiles(entriesDir: string): KnowledgeEntry[];
/**
 * Render the body template for a knowledge entry. Replace a type's entry in
 * `BODY_TEMPLATE_BUILDERS` to give it a custom narrative shape. Exported for
 * direct unit testing per CS1.
 */
export declare function getBodyTemplate(type: KnowledgeType, entry: {
    title: string;
    description?: string;
}): string;
/**
 * Generate knowledge entry markdown content
 * @param entry - Knowledge entry (partial, for creation)
 * @returns Markdown content with frontmatter
 */
export declare function generateKnowledgeMarkdown(entry: Omit<Partial<KnowledgeEntry>, 'owns'> & {
    id: string;
    title: string;
    type: KnowledgeType;
    /** Frontmatter-only field; not part of KnowledgeEntry DB row. */
    related_files?: string[];
    /**
     * K3.4 (S154) frontmatter form: array OR scalar. yaml.dump emits arrays as
     * inline YAML lists, scalars as plain strings. Asymmetric with the DB-row
     * type (KnowledgeEntry.owns: string | null) per D-K3.4-01 — see this file's
     * `serializeOwnsForRow` helper for the parse-back boundary.
     */
    owns?: string | string[] | null;
    /**
     * WP-DF2 AC4 (S166) frontmatter-only slug for [[slug]] cross-references.
     * Lowercase kebab-case. Not part of the KnowledgeEntry DB row (SQL-side
     * slug queries are deferred — see WP-DF2.yaml AC4 design notes). Future
     * promotion to a native column tracked via the same schema-vN migration
     * pattern used for `owns` (K3.4 D-K3.4-01 precedent).
     */
    slug?: string | null;
}): string;
/**
 * Write a knowledge entry to file
 * @param entry - Knowledge entry to write
 * @param entriesDir - Directory to write to
 * @returns Path to written file, or null on failure
 */
export declare function writeKnowledgeFile(entry: Partial<KnowledgeEntry> & {
    id: string;
    title: string;
    type: KnowledgeType;
}, entriesDir: string): string | null;
/**
 * Update frontmatter in an existing knowledge file
 * @param filePath - Path to knowledge file
 * @param updates - Fields to update
 * @returns True if successful
 */
export declare function updateKnowledgeFile(filePath: string, updates: Partial<KnowledgeEntryFrontmatter>): boolean;
/**
 * Get next available ID for a knowledge type
 * @param entriesDir - Path to entries directory
 * @param type - Knowledge type
 * @returns Next available ID (e.g., "TD-004")
 */
export declare function getNextId(entriesDir: string, type: KnowledgeType): string;
/**
 * Validate knowledge entry ID format
 * @param id - ID to validate
 * @returns True if valid format
 */
export declare function isValidId(id: string): boolean;
/**
 * Extract knowledge type from ID
 * @param id - Knowledge entry ID
 * @returns Knowledge type or null if invalid
 */
export declare function getTypeFromId(id: string): KnowledgeType | null;
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
export declare function cascadeIdRewrite(entriesDir: string, oldId: string, newId: string): string[];
//# sourceMappingURL=parser.d.ts.map