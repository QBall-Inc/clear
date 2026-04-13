/**
 * Reverse File-Knowledge Index
 *
 * Maps file paths → knowledge entry IDs for fast lookup.
 * Used by PostToolUse and PreToolUse hooks to find relevant knowledge
 * when files are edited or about to be edited.
 *
 * No dependency on db.ts (SQLite) — reads markdown files directly.
 */
/** Reverse index mapping file paths to knowledge entry IDs */
export interface FileKnowledgeIndex {
    version: string;
    lastBuilt: string;
    entryCount: number;
    index: Record<string, string[]>;
}
/**
 * Build the complete reverse index from all knowledge entries.
 *
 * Scans all .md files in the knowledge entries directory, extracts
 * related_files from frontmatter, and builds the reverse mapping.
 *
 * @param clearDir - Path to .clear/ directory
 * @returns The built index
 */
export declare function buildIndex(clearDir: string): FileKnowledgeIndex;
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
export declare function updateIndex(clearDir: string, entryId: string): FileKnowledgeIndex;
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
export declare function lookupFiles(clearDir: string, filePath: string): string[];
//# sourceMappingURL=file-index.d.ts.map