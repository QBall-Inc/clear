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
 * Generate knowledge entry markdown content
 * @param entry - Knowledge entry (partial, for creation)
 * @returns Markdown content with frontmatter
 */
export declare function generateKnowledgeMarkdown(entry: Partial<KnowledgeEntry> & {
    id: string;
    title: string;
    type: KnowledgeType;
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
//# sourceMappingURL=parser.d.ts.map