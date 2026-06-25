"use strict";
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
exports.validateSlug = validateSlug;
exports.deriveSlug = deriveSlug;
exports.buildSlugIndex = buildSlugIndex;
exports.readSlugIndex = readSlugIndex;
exports.writeSlugIndex = writeSlugIndex;
exports.rebuildSlugIndex = rebuildSlugIndex;
exports.getExistingSlugs = getExistingSlugs;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const parser_1 = require("./parser");
const INDEX_FORMAT_VERSION = '1.0';
const INDEX_FILENAME = 'slug-index.json';
const SLUG_MAX_LENGTH = 40;
/**
 * Kebab-case slug validator. Accepts lowercase a-z, digits, hyphen, underscore.
 * Must start with a letter (alpha) — matches SLUG_REF_PATTERN in slug-resolver.ts
 * so any user-provided slug that's accepted here will round-trip through the
 * `[[slug]]` cross-ref grammar.
 */
const SLUG_VALIDATION_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/;
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
function validateSlug(slug) {
    if (typeof slug !== 'string') {
        return 'slug must be a string';
    }
    const trimmed = slug.trim();
    if (trimmed.length === 0) {
        return 'slug must not be empty';
    }
    if (trimmed.length > SLUG_MAX_LENGTH) {
        return `slug exceeds ${SLUG_MAX_LENGTH}-char limit (got ${trimmed.length})`;
    }
    if (!SLUG_VALIDATION_PATTERN.test(trimmed)) {
        return `slug must be lowercase kebab-case (letter-starts, alphanumeric + hyphen/underscore): got '${trimmed}'`;
    }
    return null;
}
// ==============================================================================
// PUBLIC API — SLUG DERIVATION
// ==============================================================================
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
function deriveSlug(title, existingSlugs) {
    const base = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, SLUG_MAX_LENGTH)
        .replace(/-+$/g, ''); // re-trim after slice
    if (base.length === 0) {
        // Fallback for titles that are entirely non-alphanumeric (rare). Use a
        // generic placeholder + counter so the slug is still unique-able.
        return findUnique('entry', existingSlugs);
    }
    return findUnique(base, existingSlugs);
}
function findUnique(base, existingSlugs) {
    if (!existingSlugs.has(base))
        return base;
    for (let n = 2; n < 10000; n++) {
        const candidate = `${base}-${n}`;
        if (!existingSlugs.has(candidate))
            return candidate;
    }
    // Astronomically unlikely: 10k collisions on the same title. Fall back to
    // timestamp suffix rather than throw.
    return `${base}-${Date.now()}`;
}
// ==============================================================================
// PUBLIC API — INDEX BUILD / READ / WRITE
// ==============================================================================
/**
 * Scan all knowledge entries under `knowledgeDir`, extract their `slug` field
 * (when present), and build a fresh SlugIndex. Entries without a slug field
 * are excluded from the index (caller is responsible for back-filling slugs
 * via capture-cli / update-cli).
 */
function buildSlugIndex(knowledgeDir) {
    const slugMap = {};
    let entryCount = 0;
    const files = (0, parser_1.scanKnowledgeFiles)(knowledgeDir);
    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf-8');
            const parsed = (0, parser_1.parseFrontmatter)(content);
            const fm = parsed?.frontmatter;
            if (!fm || !fm.id)
                continue;
            entryCount++;
            const slug = typeof fm.slug === 'string' ? fm.slug.trim() : '';
            // Fix-batch S166 SEC-1: validate the entry id format BEFORE inserting
            // into the reverse map. A hand-crafted .md file with a yaml block-scalar
            // id (e.g., newline-bearing string) would otherwise reach slugMap and
            // flow through resolveSlugRefs into Claude's context. isValidId rejects
            // non-`PREFIX-DIGITS` shapes.
            if (slug.length > 0 && (0, parser_1.isValidId)(String(fm.id))) {
                slugMap[slug] = String(fm.id);
            }
        }
        catch {
            // Best-effort: malformed entries are skipped. parseFrontmatter is the
            // canonical surface for entry-level validation errors.
        }
    }
    return {
        version: INDEX_FORMAT_VERSION,
        lastBuilt: new Date().toISOString(),
        entryCount,
        slugMap
    };
}
/**
 * Read the persisted SlugIndex from `.clear/state/slug-index.json`. Returns
 * null when the file is absent OR corrupt — callers fall through to a null
 * index, which causes `resolveSlugRefs` to return text unchanged.
 */
function readSlugIndex(clearDir) {
    const indexPath = path.join(clearDir, 'state', INDEX_FILENAME);
    if (!fs.existsSync(indexPath))
        return null;
    try {
        const raw = fs.readFileSync(indexPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.slugMap)
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
/** Write the SlugIndex atomically to `.clear/state/slug-index.json`. */
function writeSlugIndex(clearDir, index) {
    const stateDir = path.join(clearDir, 'state');
    if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
    }
    const indexPath = path.join(stateDir, INDEX_FILENAME);
    const tmpPath = `${indexPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(index, null, 2), 'utf-8');
    fs.renameSync(tmpPath, indexPath);
}
/**
 * Rebuild the SlugIndex from disk and persist to `.clear/state/slug-index.json`.
 * Convenience wrapper: typically called by capture-cli / update-cli after
 * mutating the knowledge directory, so the next display-surface read sees the
 * updated slug ↔ ID mapping.
 *
 * `knowledgeDir` is the directory containing entry markdown files (typically
 * `.clear/knowledge/` under the consumer project).
 */
function rebuildSlugIndex(clearDir, knowledgeDir) {
    const index = buildSlugIndex(knowledgeDir);
    writeSlugIndex(clearDir, index);
    return index;
}
/**
 * Collect all in-use slugs (across all entry types) for collision avoidance
 * when deriving a new slug. Reads the persisted index if available, falling
 * back to a live scan when the index is absent.
 */
function getExistingSlugs(clearDir, knowledgeDir) {
    const index = readSlugIndex(clearDir) ?? buildSlugIndex(knowledgeDir);
    return new Set(Object.keys(index.slugMap));
}
//# sourceMappingURL=slug-index.js.map