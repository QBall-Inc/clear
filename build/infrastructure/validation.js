"use strict";
/**
 * Shared validation utilities for CLI path inputs.
 *
 * Provides path traversal protection for --clear-dir and similar
 * user-supplied paths across all CLI entry points.
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
exports.validateBasePath = validateBasePath;
exports.stripClearSuffix = stripClearSuffix;
exports.resolveClearDir = resolveClearDir;
exports.sanitizeForLog = sanitizeForLog;
const path = __importStar(require("path"));
/**
 * Validate and resolve a base path, preventing path traversal attacks.
 * Rejects paths containing unresolved '..' traversal sequences.
 *
 * @param rawPath - The raw path string from CLI input
 * @returns The resolved absolute path
 * @throws Error if the path contains traversal sequences
 */
function validateBasePath(rawPath) {
    const resolved = path.resolve(rawPath);
    // Reject if the original input contains '..' traversal
    if (rawPath.includes('..')) {
        throw new Error(`Path contains traversal sequence: ${rawPath}`);
    }
    return resolved;
}
/**
 * Strip a trailing `.clear` suffix from a basePath argument and return the
 * project-root basePath. Composes with `validateBasePath` (call `validateBasePath`
 * first if the input is untrusted CLI/external data — `stripClearSuffix` does
 * not perform traversal protection).
 *
 * Without this guard, callers passing a bare `.clear` to downstream writers
 * cause a `.clear/.clear/<sub>` duplicate-state hierarchy leak.
 *
 * Handled shapes:
 *   - `<path>/.clear`        → `<path>`  (silent — conventional `--clear-dir` shape)
 *   - `<path>/.clear/`       → `<path>`  (silent — trailing slash stripped first)
 *   - `.clear` (bare)        → `.`       (WARN — bare relative form is the bug class)
 *   - `.clear/` (bare+slash) → `.`       (WARN — same bug class)
 *   - `<path>` (clean)       → `<path>`  (unchanged, no warn)
 *
 * Warning policy: stderr warning fires ONLY on the bare `.clear` form, since
 * `<path>/.clear` is the conventional shape used across hooks/scripts and would
 * otherwise produce per-invocation noise. The warning is therefore a regression
 * detector — its appearance in stderr signals a new buggy caller passing bare `.clear`.
 *
 * @param rawBasePath - The raw basePath argument
 * @param callerContext - Optional identifier for the calling site (included in the warning)
 * @returns The stripped basePath rooted at the project (never the .clear subtree)
 */
function stripClearSuffix(rawBasePath, callerContext) {
    const trimmed = rawBasePath.replace(/\/+$/, '');
    // Case 1: bare ".clear" — no leading slash separator. Real conflation; warn.
    if (trimmed === '.clear') {
        // Sanitize raw input before interpolating into stderr — strip ANSI escape sequences,
        // control characters, and embedded newlines to prevent terminal injection / log spoofing.
        const safeInput = sanitizeForLog(rawBasePath);
        const safeContext = callerContext ? sanitizeForLog(callerContext) : undefined;
        process.stderr.write(`[CLEAR] warning: basePath '${safeInput}' conflated with '.clear' suffix` +
            (safeContext ? ` (caller: ${safeContext})` : '') +
            `. Stripped to '.'. Pass the project root (e.g., '.', './', or an absolute path) instead.\n`);
        return '.';
    }
    // Case 2: <path>/.clear — strip silently (conventional --clear-dir shape).
    const stripped = trimmed.replace(/\/\.clear$/, '');
    return stripped || '.';
}
/**
 * Resolve a raw `--clear-dir` input into BOTH the project root and the `.clear`
 * subdirectory, tolerant of every shape the flag is passed in across the
 * codebase's dispatchers and CLIs.
 *
 * The `--clear-dir` flag is supplied in two historical conventions:
 *   - the PROJECT ROOT (e.g. `.`, `$CWD`, `<abs>`)        — sync-bridge-style
 *   - the `.clear` DIR itself (e.g. `./.clear`, `<abs>/.clear`) — lifecycle/registry-style
 *
 * Routing either convention through this resolver yields the SAME pair, so a
 * call-site consumes the field it needs — `clearSubdir` for registry/state-file
 * lookups (the dir that contains `workpackages/`, `plans/`, `state/`), or
 * `projectRoot` for basePath / session-identity / reconcile sites — without
 * caring which form the caller supplied. This closes the `--clear-dir`
 * convention split at the TypeScript level (the OBS-8/4/7 root cause).
 *
 * IMPORTANT: this is NOT a `stripClearSuffix`-everywhere sweep. `stripClearSuffix`
 * returns the PARENT of `.clear`; the registry managers want the `.clear` dir
 * itself, and `PlanRegistryManager` already derives the root internally via
 * `path.resolve(clearDir, '..')` — so handing it a stripped parent double-strips.
 * The two-output pair lets each consumer take the correct field.
 *
 * Form-tolerance (all yield the same pair for a given project):
 *   `<root>`         → { projectRoot: <root>,      clearSubdir: <root>/.clear }
 *   `<root>/.clear`  → { projectRoot: <root>,      clearSubdir: <root>/.clear }
 *   `<root>/.clear/` → { projectRoot: <root>,      clearSubdir: <root>/.clear }
 *   `.clear` (bare)  → { projectRoot: <cwd>,       clearSubdir: <cwd>/.clear }
 *   `.`              → { projectRoot: <cwd>,       clearSubdir: <cwd>/.clear }
 *
 * Both outputs are absolute (via `path.resolve`) so the pair is unambiguous.
 * Traversal protection is the caller's responsibility via `validateBasePath`
 * (unchanged — CLIs already validate before resolving); `resolveClearDir` is a
 * pure resolver and does not warn. The bare-`.clear` regression warning stays
 * with `stripClearSuffix` for the legacy basePath callers that still use it.
 *
 * @param raw - The raw `--clear-dir` input (any supported shape)
 * @returns `{ projectRoot, clearSubdir }` as absolute paths
 */
function resolveClearDir(raw) {
    // Strip trailing slashes (keep at least the original if it was all slashes),
    // then resolve to an absolute path so the pair is unambiguous regardless of form.
    const trimmed = raw.replace(/\/+$/, '') || raw;
    const abs = path.resolve(trimmed);
    // If the resolved path IS a `.clear` dir, the parent is the project root.
    if (path.basename(abs) === '.clear') {
        return { projectRoot: path.dirname(abs), clearSubdir: abs };
    }
    // Otherwise the path is the project root; the `.clear` dir hangs off it.
    return { projectRoot: abs, clearSubdir: path.join(abs, '.clear') };
}
/**
 * Sanitize an arbitrary string for safe interpolation into a stderr/log line.
 * Strips ANSI/CSI escape sequences, removes ASCII control characters
 * (except printable space), and truncates at 200 chars to bound spam.
 * Use this on any untrusted text that flows into process.stderr.write or
 * console.error to prevent terminal injection or log spoofing.
 */
function sanitizeForLog(s) {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
}
//# sourceMappingURL=validation.js.map