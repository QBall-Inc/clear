/**
 * Shared validation utilities for CLI path inputs.
 *
 * Provides path traversal protection for --clear-dir and similar
 * user-supplied paths across all CLI entry points.
 */
/**
 * Validate and resolve a base path, preventing path traversal attacks.
 * Rejects paths containing unresolved '..' traversal sequences.
 *
 * @param rawPath - The raw path string from CLI input
 * @returns The resolved absolute path
 * @throws Error if the path contains traversal sequences
 */
export declare function validateBasePath(rawPath: string): string;
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
export declare function stripClearSuffix(rawBasePath: string, callerContext?: string): string;
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
export declare function resolveClearDir(raw: string): {
    projectRoot: string;
    clearSubdir: string;
};
/**
 * Sanitize an arbitrary string for safe interpolation into a stderr/log line.
 * Strips ANSI/CSI escape sequences, removes ASCII control characters
 * (except printable space), and truncates at 200 chars to bound spam.
 * Use this on any untrusted text that flows into process.stderr.write or
 * console.error to prevent terminal injection or log spoofing.
 */
export declare function sanitizeForLog(s: string): string;
//# sourceMappingURL=validation.d.ts.map