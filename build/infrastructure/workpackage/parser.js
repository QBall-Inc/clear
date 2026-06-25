"use strict";
/**
 * Workpackage YAML Parser
 *
 * Parses workpackage definition files and registry files.
 * Updated Session 33 with Dual-ID Architecture support (P1.6).
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
exports.WorkpackageParseError = exports.EXTENSIONLESS_PATH_BASENAMES = void 0;
exports.isDeliverablePathToken = isDeliverablePathToken;
exports.extractDeliverablePaths = extractDeliverablePaths;
exports.extractLeadingDeliverablePath = extractLeadingDeliverablePath;
exports.parseWorkpackageFile = parseWorkpackageFile;
exports.parseWorkpackageContent = parseWorkpackageContent;
exports.parseRegistryFile = parseRegistryFile;
exports.parseStateFile = parseStateFile;
exports.writeStateFile = writeStateFile;
exports.serializeWorkpackage = serializeWorkpackage;
exports.writeWorkpackageAtomic = writeWorkpackageAtomic;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const types_1 = require("./types");
const types_2 = require("../sync/types");
// ===========================================================================
// Deliverable Path Extraction (shared create + read heuristic)
// ===========================================================================
//
// Single source of truth for "is this token a file path, and which paths does
// this deliverable description name?" Consumed by BOTH the create-time pattern
// populator (sync/plan-propagate.ts inferDeliverablePattern) and the read-time
// resolver (workpackage/registry.ts extractPathFromDescription / isPathShaped),
// so create and read can never disagree on what counts as a path.
//
// Consumer-general by design: it recognises file paths from ANY project layout
// (Go cmd/main.go + go.mod + Makefile, Python app/main.py, Rust Cargo.toml +
// src/main.rs), NOT just one fixed set of repository directories.
/**
 * Curated allowlist of extensionless build-file basenames treated as file
 * paths. These carry no extension, so the alphabetic-extension heuristic in
 * isDeliverablePathToken cannot recognise them; they are matched by exact
 * basename instead. Kept deliberately small and explicit — a general "any
 * extensionless token is a path" rule would re-admit prose like "user/admin".
 */
exports.EXTENSIONLESS_PATH_BASENAMES = [
    'Makefile',
    'Dockerfile',
    'Rakefile',
    'Gemfile',
    'Procfile',
    'Justfile'
];
/**
 * Conservative character set for a concrete file path: word chars plus the
 * separators and symbols that appear in real cross-platform paths (dot, slash,
 * at, plus, tilde, hyphen). Anything outside this set — regex/glob
 * metacharacters like ( ) | [ ] * ? { } ^ $ — means the token is prose or an
 * authored glob, NOT a concrete path. Rejecting such tokens during description
 * extraction stops text like "src/(a|b).ts" from producing a `pattern` that
 * would behave as a live regex operator in downstream glob matching.
 */
const SAFE_PATH_CHARS = /^[\w./@+~-]+$/;
/**
 * Strip surrounding punctuation that cannot be part of a real file path:
 * leading openers and trailing sentence/closer punctuation. The char classes
 * list literal punctuation only (inside `[]`, `(` `[` `{` `)` `]` `}` are plain
 * characters, not grouping). A real path never ends in these, so trimming is
 * safe — "src/foo.ts." -> "src/foo.ts", "(src/a.ts)" -> "src/a.ts".
 */
function stripTokenPunctuation(token) {
    return token.replace(/^[([{'"]+/, '').replace(/[.,;:!?)\]}'"]+$/, '');
}
/**
 * True when `token` is a single file-path-like token (consumer-general).
 *
 * A token qualifies when ALL of:
 *   - it contains only safe path characters (SAFE_PATH_CHARS) and no ".."
 *     traversal segment; AND
 *   - its final path segment EITHER ends in an alphabetic file extension
 *     (.go .py .mod .ts .json .toml ...) — the leading-letter requirement
 *     rejects version/number tokens like "1.0", "v2.0", "3.0", so prose such
 *     as "version 1.0/2.0" is not mistaken for a path — OR is a curated
 *     extensionless build-file basename (Makefile, Dockerfile...).
 *
 * Prose with slashes but no extension ("user/admin", "3/4", "Voice/copy")
 * fails the extension test and returns false. Bare directory paths whose final
 * segment has no extension are intentionally NOT treated as concrete file paths
 * (they cannot be file-presence-tracked by detecting a created file).
 */
function isDeliverablePathToken(token) {
    if (!token)
        return false;
    if (token.includes('..'))
        return false; // reject parent-dir traversal segments
    if (!SAFE_PATH_CHARS.test(token))
        return false; // reject regex/glob metacharacters
    const slash = token.lastIndexOf('/');
    const lastSegment = slash >= 0 ? token.slice(slash + 1) : token;
    if (!lastSegment)
        return false; // trailing slash -> no concrete file segment
    if (exports.EXTENSIONLESS_PATH_BASENAMES.includes(lastSegment))
        return true;
    return /\.[A-Za-z]\w*$/.test(lastSegment);
}
/**
 * Extract the ordered, de-duplicated set of file-path tokens named in a
 * deliverable description, consumer-general. Tokenises on whitespace, trims
 * surrounding punctuation from each token, and keeps those that satisfy
 * isDeliverablePathToken. First-appearance order is preserved; exact
 * duplicates are collapsed. Returns [] when no path tokens are found.
 */
function extractDeliverablePaths(description) {
    if (!description)
        return [];
    const candidates = description
        .split(/\s+/)
        .map(stripTokenPunctuation)
        .filter(token => isDeliverablePathToken(token));
    return Array.from(new Set(candidates));
}
/**
 * Extract the LEADING file-path token from a description, honouring the
 * convention that a deliverable description starts with its file path. Used by
 * the read-time resolver's description fallback (registry.ts).
 *
 * @param description - Deliverable description text (optional)
 * @returns The leading path token, or null when it is absent or not path-like
 */
function extractLeadingDeliverablePath(description) {
    if (!description)
        return null;
    // split(limit=1)[0] is always a string at runtime; `?? ''` is a defensive
    // guard kept for a future noUncheckedIndexedAccess tsconfig.
    const first = stripTokenPunctuation(description.trimStart().split(/\s+/, 1)[0] ?? '');
    return isDeliverablePathToken(first) ? first : null;
}
/**
 * Error thrown during parsing.
 *
 * The errorCode discriminant lets callers route on category rather than
 * substring-matching the human-readable message — e.g., the registry loader
 * swallows FILE_NOT_FOUND as "not yet created" and re-throws everything else.
 */
class WorkpackageParseError extends Error {
    constructor(message, file, errorCode, details) {
        super(message);
        this.file = file;
        this.errorCode = errorCode;
        this.details = details;
        this.name = 'WorkpackageParseError';
    }
}
exports.WorkpackageParseError = WorkpackageParseError;
/**
 * Parse a workpackage definition file
 * @param filePath - Path to the workpackage YAML file
 * @param options - Optional parser knobs (see ParseOptions)
 * @returns Parsed workpackage entry
 * @throws WorkpackageParseError if parsing fails
 */
function parseWorkpackageFile(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
        throw new WorkpackageParseError('Workpackage file not found', filePath, 'FILE_NOT_FOUND');
    }
    let content;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    catch (error) {
        throw new WorkpackageParseError(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`, filePath, 'FILE_READ_ERROR');
    }
    return parseWorkpackageContent(content, filePath, options);
}
/**
 * Parse workpackage YAML content
 * @param content - YAML content string
 * @param sourcePath - Source path for error messages
 * @param options - Optional parser knobs (see ParseOptions)
 * @returns Parsed workpackage entry
 */
function parseWorkpackageContent(content, sourcePath, options = {}) {
    // Normalize line endings
    const normalizedContent = content.replace(/\r\n/g, '\n');
    let parsed;
    try {
        parsed = yaml.load(normalizedContent, { schema: yaml.JSON_SCHEMA });
    }
    catch (error) {
        throw new WorkpackageParseError(`Invalid YAML: ${error instanceof Error ? error.message : 'Unknown error'}`, sourcePath, 'INVALID_YAML');
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new WorkpackageParseError('Workpackage must be a YAML object', sourcePath, 'SCHEMA_MISMATCH');
    }
    const data = parsed;
    // Extract the display ID
    const displayId = validateString(data.id, 'id', sourcePath);
    // Tolerant-enum capture for type/priority. When options.tolerantEnums is true
    // and the field's value fails enum validation, push the would-be-thrown
    // message onto validationWarnings and preserve the ORIGINAL invalid value
    // on the returned entry. The pre-write round-trip via writeWorkpackageAtomic
    // (strict mode by default) STILL rejects unrepaired entries, so the caller
    // can't accidentally write back invalid data — they must mutate the field
    // to a valid value before serializing.
    const validationWarnings = [];
    const validateEnumTolerant = (value, allowed, field) => {
        try {
            return validateEnum(value, allowed, field, sourcePath);
        }
        catch (err) {
            if (options.tolerantEnums &&
                err instanceof WorkpackageParseError &&
                err.errorCode === 'SCHEMA_MISMATCH') {
                validationWarnings.push(err.message);
                // Preserve the user's raw string so the strict round-trip in
                // writeWorkpackageAtomic catches it if they don't repair. The
                // tolerant return is scoped to STRING values only: if the YAML
                // produced a non-string (null, number, boolean), preserving that
                // here would lie about the static union and surprise downstream
                // serializers. Fall through to a guaranteed-strict default — the
                // round-trip on write will still surface the corruption.
                if (typeof value === 'string') {
                    return value;
                }
            }
            throw err;
        }
    };
    // Validate and extract required fields
    const entry = {
        id: displayId,
        // Dual-ID fields (P1.6): parse if present, generate systemId if missing
        systemId: data.systemId
            ? validateOptionalString(data.systemId)
            : (0, types_2.generateSystemIdFromLegacy)(displayId, 'workpackage'),
        position: data.position !== undefined ? validateOptionalNumber(data.position) : undefined,
        phase: data.phase ? validateOptionalString(data.phase) : undefined,
        title: validateString(data.title, 'title', sourcePath),
        status: validateEnumLenient(data.status, ['not_started', 'in_progress', 'paused', 'complete', 'blocked', 'deferred', 'archived'], 'status', 'not_started'),
        type: data.type
            ? validateEnumTolerant(data.type, types_1.WORKPACKAGE_TYPES, 'type')
            : 'feature',
        priority: data.priority
            ? validateEnumTolerant(data.priority, types_1.WORKPACKAGE_PRIORITIES, 'priority')
            : 'medium',
        description: data.description
            ? validateString(data.description, 'description', sourcePath)
            : (data.title ? String(data.title) : ''),
        scope: parseScope(data.scope),
        dependencies: parseDependencies(data.dependencies),
        deliverables: parseDeliverables(data.deliverables, sourcePath),
        acceptance_criteria: validateStringArray(data.acceptance_criteria, 'acceptance_criteria', sourcePath),
        verification: Array.isArray(data.verification)
            ? data.verification.map(String)
            : undefined,
        notes: Array.isArray(data.notes)
            ? data.notes.map(String)
            : undefined,
        knowledge_required: data.knowledge_required
            ? validateStringArray(data.knowledge_required, 'knowledge_required', sourcePath)
            : undefined,
        progress: data.progress !== undefined ? validateOptionalNumber(data.progress) : undefined,
        // WP-PS7 phase_a (S188): bidirectional knowledge link surface.
        // Mirrors knowledge_required parsing above. Array of knowledge entry IDs
        // (TD-001, PAT-005, etc.) linked to this WP via link-cli or capture-cli
        // --workpackage. Empty/undefined → omitted from entry; non-array → throws.
        knowledge: data.knowledge
            ? validateStringArray(data.knowledge, 'knowledge', sourcePath)
            : undefined,
    };
    if (validationWarnings.length > 0) {
        entry.validationWarnings = validationWarnings;
    }
    return entry;
}
/**
 * Parse the registry YAML file
 * @param filePath - Path to registry.yaml
 * @returns Parsed registry
 */
function parseRegistryFile(filePath) {
    if (!fs.existsSync(filePath)) {
        // Return empty registry if file doesn't exist
        return { workpackages: [] };
    }
    let content;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    catch (error) {
        throw new WorkpackageParseError(`Failed to read registry: ${error instanceof Error ? error.message : 'Unknown error'}`, filePath, 'FILE_READ_ERROR');
    }
    // Normalize line endings
    const normalizedContent = content.replace(/\r\n/g, '\n');
    let parsed;
    try {
        parsed = yaml.load(normalizedContent, { schema: yaml.JSON_SCHEMA });
    }
    catch (error) {
        throw new WorkpackageParseError(`Invalid registry YAML: ${error instanceof Error ? error.message : 'Unknown error'}`, filePath, 'INVALID_YAML');
    }
    if (!parsed || typeof parsed !== 'object') {
        return { workpackages: [] };
    }
    const data = parsed;
    const workpackages = [];
    if (Array.isArray(data.workpackages)) {
        for (const wp of data.workpackages) {
            if (wp && typeof wp === 'object') {
                const entry = wp;
                const displayId = String(entry.id || '');
                workpackages.push({
                    id: displayId,
                    // Dual-ID fields (P1.6): parse if present, generate systemId if missing
                    systemId: entry.systemId
                        ? String(entry.systemId)
                        : (0, types_2.generateSystemIdFromLegacy)(displayId, 'workpackage'),
                    position: typeof entry.position === 'number' ? entry.position : undefined,
                    phase: entry.phase ? String(entry.phase) : undefined,
                    title: String(entry.title || entry.name || ''),
                    status: entry.status || 'not_started',
                    file: String(entry.file || ''),
                    blocked_by: Array.isArray(entry.blocked_by)
                        ? entry.blocked_by.map(String)
                        : undefined,
                    // P2.7 Lifecycle fields
                    progress: typeof entry.progress === 'number' ? entry.progress : undefined,
                    startedAt: entry.startedAt ? String(entry.startedAt) : undefined,
                    completedAt: entry.completedAt ? String(entry.completedAt) : undefined,
                    archivedAt: entry.archivedAt ? String(entry.archivedAt) : undefined,
                    linkedKnowledge: Array.isArray(entry.linkedKnowledge)
                        ? entry.linkedKnowledge.map(String)
                        : undefined
                });
            }
        }
    }
    return { workpackages };
}
/**
 * Parse workpackage state from JSON file
 * @param filePath - Path to workpackage.json state file
 * @returns Parsed state or default
 */
function parseStateFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return (0, types_1.createDefaultWorkpackageState)();
    }
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        return {
            activeWorkpackage: parsed.activeWorkpackage ?? null,
            // Dual-ID fields (P1.6)
            activeWorkpackageSystemId: parsed.activeWorkpackageSystemId ?? null,
            activePhaseSystemId: parsed.activePhaseSystemId ?? null,
            startedAt: parsed.startedAt ?? null,
            lastActivity: parsed.lastActivity ?? new Date().toISOString(),
            progress: parsed.progress ?? 0,
            deliverables: parsed.deliverables ?? Object.create(null),
            scopeWarnings: parsed.scopeWarnings ?? [],
            sessionId: parsed.sessionId ?? ''
        };
    }
    catch {
        return (0, types_1.createDefaultWorkpackageState)();
    }
}
/**
 * Write workpackage state to JSON file
 * @param filePath - Path to workpackage.json
 * @param state - State to write
 */
function writeStateFile(filePath, state) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}
/**
 * Serialize a workpackage entry back to YAML
 * @param entry - Workpackage entry
 * @returns YAML string
 */
function serializeWorkpackage(entry) {
    // Strip transient parser-only fields before serialization. validationWarnings
    // is populated by a tolerant load to surface enum issues to the caller; it
    // is NOT part of the WP YAML schema on disk and must not be written back.
    const { validationWarnings: _ignored, ...persisted } = entry;
    return yaml.dump(persisted, {
        indent: 2,
        lineWidth: 100,
        noRefs: true
    });
}
/**
 * Write a workpackage entry to disk atomically.
 *
 * Serializes the entry, runs a round-trip parse to validate the YAML before
 * any disk write lands, writes to a tmp file, then renames into place. If
 * serialization or the validation parse fails, no temp file is moved into
 * place and the original WP YAML stays intact.
 */
function writeWorkpackageAtomic(filePath, entry) {
    const serialized = serializeWorkpackage(entry);
    try {
        parseWorkpackageContent(serialized, filePath);
    }
    catch (e) {
        if (e instanceof WorkpackageParseError) {
            throw new Error(`Schema validation failed before write: ${e.message}`);
        }
        throw e;
    }
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, serialized, 'utf-8');
    try {
        fs.renameSync(tmpPath, filePath);
    }
    catch (e) {
        try {
            fs.unlinkSync(tmpPath);
        }
        catch { /* best effort */ }
        throw e;
    }
}
// ==============================================================================
// Validation Helpers
// ==============================================================================
function validateString(value, field, sourcePath) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new WorkpackageParseError(`Missing or invalid field: ${field}`, sourcePath, 'MISSING_REQUIRED');
    }
    return value.trim();
}
function validateEnum(value, allowed, field, sourcePath) {
    if (typeof value !== 'string' || !allowed.includes(value)) {
        throw new WorkpackageParseError(`Invalid ${field}: ${value}. Must be one of: ${allowed.join(', ')}`, sourcePath, 'SCHEMA_MISMATCH');
    }
    return value;
}
/**
 * Lenient enum validation — normalizes input before matching.
 * Handles mixed case ("Not Started" → "not_started") and spaces vs underscores.
 * Returns defaultValue if input is missing or unrecognized.
 */
function validateEnumLenient(value, allowed, _field, defaultValue) {
    if (typeof value !== 'string' || value.trim() === '') {
        return defaultValue;
    }
    const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
    if (allowed.includes(normalized)) {
        return normalized;
    }
    return defaultValue;
}
function validateStringArray(value, field, sourcePath) {
    if (!Array.isArray(value)) {
        throw new WorkpackageParseError(`Field ${field} must be an array`, sourcePath, 'SCHEMA_MISMATCH');
    }
    return value.map(v => String(v));
}
/**
 * Validate optional string field (P1.6 dual-ID support)
 */
function validateOptionalString(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== 'string') {
        return String(value);
    }
    return value.trim() || undefined;
}
/**
 * Validate optional number field (P1.6 dual-ID support)
 */
function validateOptionalNumber(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    const num = Number(value);
    if (isNaN(num)) {
        return undefined;
    }
    return num;
}
function parseScope(scope) {
    if (!scope || typeof scope !== 'object') {
        return { in_scope: [], out_of_scope: [] };
    }
    const s = scope;
    return {
        in_scope: Array.isArray(s.in_scope) ? s.in_scope.map(String) : [],
        out_of_scope: Array.isArray(s.out_of_scope) ? s.out_of_scope.map(String) : []
    };
}
// WP-DF2 AC7 (S166): preserve byte-identical round-trip for the dependencies
// block. Pre-fix, `parseDependencies` returned only `{ upstream: [...] }` —
// any `downstream:` value in source YAML was silently dropped on parse, so an
// `update-cli` round-trip elided it from the output. Now: if the source has a
// `downstream` key (populated OR explicit empty array), the parsed shape
// includes `downstream` so the serializer emits it. Absent key → absent in
// output (unchanged). Rationale: AC7 spec contract — "fields NOT touched by
// the update remain byte-identical in output". Since Claude (not the user)
// writes most workpackage YAMLs, the LLM may emit downstream:[] in one
// session and a different write surface may strip it; preservation enforces
// the contract regardless of which writer produced the field.
function parseDep(dep) {
    if (!dep || typeof dep !== 'object')
        return null;
    const entry = dep;
    // Fix-batch SEC-2 + TS-2 (cross-role duplicate, S166): explicit value-check
    // for DependencyType. Prior `(entry.type as DependencyType) || 'hard'`
    // accepted any truthy string ('admin', 'HARD', etc.) bypassing type-safety
    // contract; downstream registry/lifecycle code expects 'hard' | 'soft' only.
    const rawType = entry.type;
    const type = rawType === 'soft' ? 'soft' : 'hard';
    return {
        id: String(entry.id || ''),
        type,
        deliverables_needed: Array.isArray(entry.deliverables_needed)
            ? entry.deliverables_needed.map(String)
            : undefined,
        description: entry.description ? String(entry.description) : undefined
    };
}
function parseDependencies(deps) {
    if (!deps || typeof deps !== 'object') {
        return { upstream: [] };
    }
    const d = deps;
    const upstream = [];
    if (Array.isArray(d.upstream)) {
        for (const dep of d.upstream) {
            const parsed = parseDep(dep);
            if (parsed)
                upstream.push(parsed);
        }
    }
    // Downstream preservation: emit `downstream` in parsed shape only if source
    // YAML had the key (populated array, explicit empty array, or null shorthand
    // for empty). Absent key → omit from parsed shape so serializer doesn't emit.
    const hasDownstreamKey = 'downstream' in d;
    if (!hasDownstreamKey) {
        return { upstream };
    }
    const downstream = [];
    if (Array.isArray(d.downstream)) {
        for (const dep of d.downstream) {
            const parsed = parseDep(dep);
            if (parsed)
                downstream.push(parsed);
        }
    }
    // `downstream: null` (YAML shorthand for empty) and `downstream: []` both
    // arrive here with downstream === [] — preserved as empty array on output.
    return { upstream, downstream };
}
function parseDeliverables(deliverables, sourcePath) {
    if (!Array.isArray(deliverables)) {
        throw new WorkpackageParseError('Deliverables must be an array', sourcePath, 'SCHEMA_MISMATCH');
    }
    return deliverables.map((d, i) => {
        // String deliverables: auto-wrap into structured object (Tolerant Reader)
        if (typeof d === 'string') {
            return {
                id: `deliverable-${i}`,
                pattern: '',
                weight: 0,
                status: 'not_started',
                description: d
            };
        }
        if (!d || typeof d !== 'object') {
            throw new WorkpackageParseError(`Deliverable ${i} is invalid`, sourcePath, 'SCHEMA_MISMATCH');
        }
        const entry = d;
        return {
            id: String(entry.id || `deliverable-${i}`),
            pattern: String(entry.pattern || ''),
            weight: Number(entry.weight) || 0,
            status: entry.status || 'not_started',
            description: entry.description ? String(entry.description) : undefined,
            completedAt: entry.completedAt ? String(entry.completedAt) : undefined
        };
    });
}
//# sourceMappingURL=parser.js.map