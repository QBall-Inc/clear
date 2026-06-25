/**
 * SQLite native-module bootstrap (knowledge system prerequisite).
 *
 * CLEAR's knowledge system (capture / search / load / index / deprecate / dismiss /
 * supersede) is backed by better-sqlite3, a native addon. The shipped plugin's
 * node_modules is populated without the compiled addon (the staging build installs
 * with --ignore-scripts, and Claude Code does not run `npm install` when it loads a
 * plugin), so on a consumer machine the addon is typically UNBUILT. An unbuilt addon
 * leaves the knowledge system non-functional: reads return empty, mutations hard-fail.
 *
 * This module ensures the addon is built — idempotently — at init time:
 *   1. Probe whether the addon loads (an in-memory open; no on-disk DB needed).
 *   2. If it does not, first try to DOWNLOAD a precompiled binary via `prebuild-install`
 *      (better-sqlite3's own dependency). The download path needs no compiler toolchain
 *      (make/gcc/python), is faster, and is the path proven to work on a real consumer
 *      machine. If the download is unavailable or does not yield a loadable addon, fall
 *      back to COMPILING from source with `npm rebuild better-sqlite3`. Both run in the
 *      PLUGIN's own node_modules and inherit the process environment, so an org-managed
 *      npm/binary mirror (NPM_CONFIG_REGISTRY and/or better-sqlite3_binary_host_mirror,
 *      injected via the managed settings.json `env` block) is honored automatically.
 *      No org-specific configuration is hard-coded here.
 *   3. Re-probe after each strategy. On success the knowledge system is ready; on failure
 *      we FAIL LOUD — the caller surfaces a Claude-actionable remediation (naming BOTH the
 *      download and compile recovery paths) and the knowledge system is reported
 *      non-functional rather than silently broken.
 *
 * The download/rebuild targets the plugin install (one binary serves every project the
 * user runs CLEAR in), so it is keyed off the plugin root, not the consumer's .clear/.
 */
export type SqliteBootstrapStatus = 'already-built' | 'downloaded' | 'rebuilt' | 'failed' | 'not-applicable';
export interface SqliteBootstrapResult {
    status: SqliteBootstrapStatus;
    message: string;
}
/**
 * Ensure the better-sqlite3 native addon is built for the plugin at `pluginRoot`.
 * Idempotent: returns 'already-built' (no side effects) when the addon already loads,
 * 'not-applicable' when the package is not installed under the plugin root, 'downloaded'
 * when a precompiled binary was fetched via prebuild-install, 'rebuilt' when a compile
 * produced a loadable addon, and 'failed' (with a Claude-actionable remediation message)
 * when the addon could not be made loadable.
 *
 * Strategy order when the addon is unbuilt: DOWNLOAD first (prebuild-install — no compiler,
 * the path proven to work on a real consumer), then COMPILE (npm rebuild) as the fallback.
 * A fresh-child re-probe after each strategy is the authoritative success check — never
 * file presence — so a stale or wrong-ABI binary is treated as unbuilt and superseded.
 */
export declare function ensureSqliteNativeModule(pluginRoot: string): SqliteBootstrapResult;
//# sourceMappingURL=sqlite-bootstrap.d.ts.map