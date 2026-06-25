"use strict";
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
exports.resolveSlugRefs = resolveSlugRefs;
exports.logSlugWarning = logSlugWarning;
exports.resolveSlugRefsWithLog = resolveSlugRefsWithLog;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ==============================================================================
// PUBLIC API
// ==============================================================================
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
function resolveSlugRefs(text, slugIndex) {
    if (!text || !slugIndex) {
        return { resolved: text || '', unresolved: [] };
    }
    const slugRefPattern = /\[\[([a-z][a-z0-9_-]{0,79})\]\]/g;
    const unresolved = [];
    const resolved = text.replace(slugRefPattern, (match, slug) => {
        const entryId = slugIndex.slugMap[slug];
        if (entryId) {
            return `[[${entryId}]]`;
        }
        unresolved.push(slug);
        return match;
    });
    return { resolved, unresolved };
}
/**
 * Append an unresolved-slug warning to `.clear/state/slug-warnings.jsonl`.
 * Best-effort: silently no-ops on write failure to avoid breaking display
 * surfaces. One line per warning, JSONL format.
 *
 * Schema:
 *   { slug: string, surface: string, ts: ISO-8601 string }
 */
function logSlugWarning(clearDir, slug, surface) {
    try {
        const stateDir = path.join(clearDir, 'state');
        if (!fs.existsSync(stateDir)) {
            return;
        }
        const logPath = path.join(stateDir, 'slug-warnings.jsonl');
        const entry = JSON.stringify({
            slug,
            surface,
            ts: new Date().toISOString()
        });
        fs.appendFileSync(logPath, entry + '\n', 'utf-8');
    }
    catch {
        // Display surfaces should never break on warning-log failure.
    }
}
/**
 * Convenience wrapper: resolve + auto-log unresolved warnings in one call.
 * Returns the resolved text only. Use when caller wants warning side-effects
 * but doesn't need to inspect the unresolved list.
 */
function resolveSlugRefsWithLog(text, slugIndex, clearDir, surface) {
    const { resolved, unresolved } = resolveSlugRefs(text, slugIndex);
    for (const slug of unresolved) {
        logSlugWarning(clearDir, slug, surface);
    }
    return resolved;
}
//# sourceMappingURL=slug-resolver.js.map