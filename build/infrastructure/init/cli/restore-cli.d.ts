/**
 * Restore CLI (WP-PS1 Phase B — AC6, AC7)
 *
 * Restores a .clear/ directory from a `.clear.backup.<ts>/` snapshot created by
 * /cf-init --reinit-clean (or the deprecated --force alias).
 *
 * All filesystem mutations use fs.cpSync / fs.rmSync / fs.renameSync — these
 * primitives are invisible to the PreToolUse hook guard (same invariant as
 * init-cli.ts:6), so the restore CLI works regardless of POST-68/WP-PS2 hook
 * fix status. No bypass exception path needed.
 *
 * Surface: invoked indirectly via /cf-init --restore-from-backup; init-cli.ts
 * dispatches when that flag is present so the user-facing entry stays /cf-init.
 */
interface RestoreCliOptions {
    clearDir: string;
    cwd: string;
    backupPath: string;
}
export interface RestoreCliOutput {
    status: 'success' | 'error';
    backupPath?: string;
    restoredFrom?: string;
    preRestoreSnapshot?: string;
    error?: string;
}
/**
 * Run the restore flow.
 *
 * Order of operations:
 *   1. Resolve backup source (explicit --backup-path= or scan-most-recent)
 *   2. Validate backup is a `.clear.backup.*` directory and exists
 *   3. Validate manifest compatibility (CLEAR_VERSION major check)
 *   4. If .clear/ exists at projectDir, rename to .clear.pre-restore.<ts>/
 *      (preserves current state without nesting inside .clear/)
 *   5. fs.cpSync from backup → .clear/ (recursive, no filter)
 */
export declare function runRestoreCLI(options: RestoreCliOptions): Promise<RestoreCliOutput>;
export {};
//# sourceMappingURL=restore-cli.d.ts.map