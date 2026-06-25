/**
 * WP-DF2 AC4 (S166) — Slug Index
 *
 * Reverse map: slug → entry ID. Persisted to `.clear/state/slug-index.json`.
 * Built by scanning knowledge entry frontmatter for `slug:` field; entries
 * without an explicit slug get a deterministic auto-derived slug at capture
 * time via `deriveSlug()`.
 *
 * Pattern matches `file-index.ts` / `owner-index.json` precedent — JSON file
 * in `.clear/state/`, schema-versioned, lastBuilt timestamp.
 */
/** Reverse index mapping slug → entry ID. */
export interface SlugIndex {
    version: string;
    lastBuilt: string;
    entryCount: number;
    /** Map of slug (lowercase kebab-case) → entry ID (e.g., `BR-001`). */
    slugMap: Record<string, string>;
}
/**
 * Validate a user-provided slug against the kebab-case contract from WP-DF2
 * AC4. Returns null on valid; on invalid returns a human-readable error string
 * suitable for stderr surface at the createEntry / update boundary.
 *
 * Contract:
 *   - 1-40 chars
 *   - first char lowercase letter [a-z]
 *   - remaining chars lowercase alphanumeric + hyphen + underscore
 *
 * Fix-batch S166 AC4-validation (Stage 3c — addresses Stage 2 + SEC-4 + STD-4 +
 * TA-1 cross-source finding cluster).
 */
export declare function validateSlug(slug: string): string | null;
/**
 * Derive a deterministic slug from an entry title. Algorithm:
 *
 *   lowercase + replace non-alphanumeric with `-` + collapse runs of `-` to
 *   single + trim leading/trailing `-` + truncate to SLUG_MAX_LENGTH chars.
 *
 * Collision handling: if the derived slug is already in `existingSlugs`, append
 * `-2`, `-3`, … until a unique slug is found. Pure function (no I/O).
 *
 * @param title    raw title text from the entry
 * @param existingSlugs set of slugs already in use (current entry-type namespace)
 * @returns unique kebab-case slug
 */
export declare function deriveSlug(title: string, existingSlugs: Set<string>): string;
/**
 * Scan all knowledge entries under `knowledgeDir`, extract their `slug` field
 * (when present), and build a fresh SlugIndex. Entries without a slug field
 * are excluded from the index (caller is responsible for back-filling slugs
 * via capture-cli / update-cli).
 */
export declare function buildSlugIndex(knowledgeDir: string): SlugIndex;
/**
 * Read the persisted SlugIndex from `.clear/state/slug-index.json`. Returns
 * null when the file is absent OR corrupt — callers fall through to a null
 * index, which causes `resolveSlugRefs` to return text unchanged.
 */
export declare function readSlugIndex(clearDir: string): SlugIndex | null;
/** Write the SlugIndex atomically to `.clear/state/slug-index.json`. */
export declare function writeSlugIndex(clearDir: string, index: SlugIndex): void;
/**
 * Rebuild the SlugIndex from disk and persist to `.clear/state/slug-index.json`.
 * Convenience wrapper: typically called by capture-cli / update-cli after
 * mutating the knowledge directory, so the next display-surface read sees the
 * updated slug ↔ ID mapping.
 *
 * `knowledgeDir` is the directory containing entry markdown files (typically
 * `.clear/knowledge/` under the consumer project).
 */
export declare function rebuildSlugIndex(clearDir: string, knowledgeDir: string): SlugIndex;
/**
 * Collect all in-use slugs (across all entry types) for collision avoidance
 * when deriving a new slug. Reads the persisted index if available, falling
 * back to a live scan when the index is absent.
 */
export declare function getExistingSlugs(clearDir: string, knowledgeDir: string): Set<string>;
//# sourceMappingURL=slug-index.d.ts.map