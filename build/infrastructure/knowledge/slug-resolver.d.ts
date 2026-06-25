/**
 * WP-DF2 AC4 (S166) — Slug-ref deferred resolution
 *
 * Resolves `[[slug-name]]` cross-references in knowledge entry descriptions to
 * actual entry IDs at display time. Storage-preserving design (Option 3 from
 * WP-DF2.yaml AC4 design notes): entries keep `[[slug]]` AS-WRITTEN in their
 * description field; substitution happens lazily at display surfaces.
 *
 * Two alternatives were rejected during design:
 *   (a) batch-aware capture-time resolution — brittle + complex
 *   (b) storage rewrite at index time — destroys user intent on slug rename
 * Option 3 keeps storage immutable; resolution is a display concern. Side
 * benefit: re-indexing the slug-index after type-change or supersession just
 * rebuilds the lookup table — entry descriptions don't churn.
 */
import type { SlugIndex } from './slug-index';
/**
 * Resolve `[[slug-name]]` refs in `text` to `[[entry-id]]` using the provided
 * slug index. Unresolved refs are LEFT AS-WRITTEN — the caller may choose to
 * log a warning via `logSlugWarning()`. Returns the resolved text + a list of
 * unresolved slugs for caller-side logging.
 *
 * Resolution is purely lexical: each match is replaced with `[[<entryId>]]`
 * when the slug exists in the index. No reachability check or cycle detection
 * (slugs are flat identifiers, not nested refs).
 *
 * Slug grammar: lowercase letters, digits, hyphens, underscores. First char
 * must be alpha. Matches the output of `deriveSlug()` in slug-index.ts.
 * Restrictive on purpose — avoids substituting markdown wiki-link syntax that
 * happens to share `[[...]]` brackets (e.g., `[[1024]]` parens-only tokens).
 *
 * Pattern length cap is intentionally LOOSER than `SLUG_MAX_LENGTH=40` in
 * slug-index.ts: deriveSlug() truncates auto-derived slugs to 40 chars at
 * write time, but the `[[slug-name]]` reference appearing in description text
 * may have come from manual editing OR from a legacy entry pre-dating the
 * 40-char cap. Matching up to 80 chars here gives `validateSlug()` (in
 * slug-index.ts) the final-say at write-time without forcing read-time
 * substitution to silently drop slightly-too-long refs.
 *
 * Fix-batch S166 LINT-1: regex literal inline inside this function rather
 * than at module scope — avoids the stateful-/g-regex footgun if any future
 * caller uses .exec() or .test() in a loop on a shared module-level pattern.
 */
export declare function resolveSlugRefs(text: string, slugIndex: SlugIndex | null): {
    resolved: string;
    unresolved: string[];
};
/**
 * Append an unresolved-slug warning to `.clear/state/slug-warnings.jsonl`.
 * Best-effort: silently no-ops on write failure to avoid breaking display
 * surfaces. One line per warning, JSONL format.
 *
 * Schema:
 *   { slug: string, surface: string, ts: ISO-8601 string }
 */
export declare function logSlugWarning(clearDir: string, slug: string, surface: string): void;
/**
 * Convenience wrapper: resolve + auto-log unresolved warnings in one call.
 * Returns the resolved text only. Use when caller wants warning side-effects
 * but doesn't need to inspect the unresolved list.
 */
export declare function resolveSlugRefsWithLog(text: string, slugIndex: SlugIndex | null, clearDir: string, surface: string): string;
//# sourceMappingURL=slug-resolver.d.ts.map