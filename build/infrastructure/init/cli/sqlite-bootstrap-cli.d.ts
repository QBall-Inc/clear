/**
 * SQLite native-module bootstrap CLI (standalone heal entrypoint).
 *
 * Thin wrapper over ensureSqliteNativeModule(pluginRoot) (see ../sqlite-bootstrap).
 * Lets the better-sqlite3 native binding be healed OUTSIDE cf-init — specifically
 * from the session-start dispatcher — so an already-initialized project recovers
 * the knowledge database after a binding-loss event (plugin restage that ships
 * without the compiled addon, a WSL2<->Windows ABI switch, or a Node version bump)
 * without a manual /cf-init or /cf-debug.
 *
 * Single responsibility: parse --plugin-root, validate it, run the bootstrap, and
 * emit the SqliteBootstrapResult as JSON. The download/rebuild logic lives entirely
 * in sqlite-bootstrap.ts and is reused unchanged.
 *
 * Exit semantics (kept clean so the dispatcher's `|| true` is the only safety net it
 * needs): exit 0 for every benign outcome — already-built, downloaded, rebuilt,
 * not-applicable — and exit 1 ONLY on 'failed' (the binding could not be made
 * loadable) or on a missing/invalid --plugin-root argument. A non-zero exit never
 * carries state-outcome meaning here, only a genuine failure.
 *
 *   node build/infrastructure/init/cli/sqlite-bootstrap-cli.js --plugin-root=<abs path>
 */
import { type SqliteBootstrapResult } from '../sqlite-bootstrap';
export interface SqliteBootstrapCliOutput {
    status: SqliteBootstrapResult['status'] | 'error';
    message: string;
}
/**
 * Validate --plugin-root and run the native-module bootstrap. Fail fast (CS3): a
 * missing, empty, or non-absolute plugin root returns an 'error' result WITHOUT
 * throwing, so the caller decides the exit code. An absolute path is resolved (and
 * traversal-rejected) before it reaches ensureSqliteNativeModule, which uses it as a
 * child-process cwd and module-resolution root.
 */
export declare function runSqliteBootstrapCLI(pluginRoot: string): SqliteBootstrapCliOutput;
//# sourceMappingURL=sqlite-bootstrap-cli.d.ts.map