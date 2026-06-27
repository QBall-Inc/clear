"use strict";
/**
 * Init CLI (R5.4)
 *
 * Thin CLI wrapping initializeProject() + configureStatusline().
 * Called by cf-init SKILL.md instead of Write/Edit on .clear/ paths.
 * All .clear/ mutations happen via fs.writeFileSync — invisible to PreToolUse guard.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInitCLI = runInitCLI;
const project_init_1 = require("../project-init");
const hooks_config_1 = require("../hooks-config");
const parse_args_1 = require("../../cli/parse-args");
const validation_1 = require("../../validation");
const restore_cli_1 = require("./restore-cli");
const sqlite_bootstrap_1 = require("../sqlite-bootstrap");
// ==============================================================================
// HELPERS
// ==============================================================================
function mapInitResult(result) {
    return {
        success: result.success,
        projectName: result.projectName,
        projectPath: result.projectPath,
        projectId: result.projectId,
        sessionId: result.sessionId,
        steps: result.steps,
        checks: result.checks,
        error: result.error,
        backupPath: result.backupPath,
    };
}
// Attach the knowledge-bootstrap result to the init output only when it carries news for
// the operator — 'downloaded' / 'rebuilt' (informational) or 'failed' (fail loud).
// 'already-built' and 'not-applicable' are silent, so happy-path output is unchanged. A
// 'failed' bootstrap also downgrades an otherwise-successful init to 'partial': the init
// wrote .clear/ fine, but the knowledge system is non-functional, so callers reading only
// `status` still see the degradation (mirrors the statusline-failure → 'partial'
// convention). The switch is exhaustive so a future status added to the union is a compile
// error here, not a silent fall-through.
function withBootstrap(output, bootstrap) {
    if (!bootstrap) {
        return output;
    }
    switch (bootstrap.status) {
        case 'downloaded':
        case 'rebuilt':
            return { ...output, knowledgeBootstrap: bootstrap };
        case 'failed':
            return {
                ...output,
                status: output.status === 'success' ? 'partial' : output.status,
                knowledgeBootstrap: bootstrap,
            };
        case 'already-built':
        case 'not-applicable':
            return output;
        default: {
            const _exhaustive = bootstrap.status;
            return _exhaustive;
        }
    }
}
// ==============================================================================
// MAIN
// ==============================================================================
async function runInitCLI(options) {
    const { cwd, pluginRoot, force, refreshConfig, restoreFromBackup, backupPath, skipPrompt, skipStatusline, ensureGitignore, ensureStatusline } = options;
    // WP-CB-D AC2: --ensure-gitignore — session-start self-heal. Authors (or
    // idempotently ensures) .clear/.gitignore for consumers initialized before the
    // managed-gitignore shipped. Non-destructive; touches ONLY .clear/.gitignore.
    // Early-return like --refresh-config: no full init, no statusline, no bootstrap.
    if (ensureGitignore) {
        try {
            const written = (0, project_init_1.ensureClearGitignore)(cwd);
            return { status: 'success', gitignoreEnsured: written };
        }
        catch (error) {
            return {
                status: 'error',
                error: `ENSURE_GITIGNORE_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }
    // WP-P8.1 AC4/AC5: --ensure-statusline — session-start self-heal for the statusline.
    // Copies/refreshes .clear/statusline.sh from the current plugin root AND migrates the
    // settings.json statusLine command to the version-agnostic placeholder. Non-destructive;
    // touches ONLY .clear/statusline.sh + the settings.json statusLine key. Early-return like
    // --ensure-gitignore: no full init, no bootstrap. Requires --plugin-root (the copy source),
    // unlike --ensure-gitignore.
    if (ensureStatusline) {
        if (!pluginRoot) {
            return {
                status: 'error',
                error: 'MISSING_PLUGIN_ROOT: --plugin-root is required for --ensure-statusline (it is the statusline copy source).',
            };
        }
        try {
            const written = (0, project_init_1.ensureClearStatusline)(cwd, pluginRoot);
            (0, hooks_config_1.configureStatusline)(cwd);
            return { status: 'success', statuslineEnsured: written };
        }
        catch (error) {
            return {
                status: 'error',
                error: `ENSURE_STATUSLINE_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }
    // WP-PS1 AC6: --restore-from-backup — dispatch to restore-cli. Restore is its
    // own user-facing surface; init-cli is only the dispatch entry so the user-facing
    // command stays /cf-init. Restore conflicts with all destructive/refresh flags.
    if (restoreFromBackup) {
        if (force || refreshConfig) {
            return {
                status: 'error',
                error: 'CONFLICTING_FLAGS: --restore-from-backup cannot be combined with --reinit-clean, --force, or --refresh-config. Restore is exclusive.',
            };
        }
        const restoreResult = await (0, restore_cli_1.runRestoreCLI)({
            clearDir: '',
            cwd,
            backupPath,
        });
        return {
            status: restoreResult.status,
            restore: restoreResult,
            error: restoreResult.error,
        };
    }
    // WP-PS1 AC2: --refresh-config — non-destructive meta-file refresh only.
    // Invokes ONLY updateProjectClaudeMd + updateProjectRulesMd. Skips: detectProjectState,
    // createBackup, removeExistingClear, createDirectoryStructure, createManifest,
    // writeStateFiles, configureHooks, configureStatusline, runPostInitChecks.
    // Idempotent — both updateProject* functions early-return when their anchors are
    // already present (CLEAR_FRAMEWORK_H1_RE / `## CLEAR Framework Rules`).
    if (refreshConfig) {
        if (force) {
            return {
                status: 'error',
                error: 'CONFLICTING_FLAGS: --refresh-config (non-destructive) cannot be combined with --reinit-clean or --force (destructive). Choose one.',
            };
        }
        try {
            (0, project_init_1.updateProjectClaudeMd)(cwd);
            (0, project_init_1.updateProjectRulesMd)(cwd);
            return {
                status: 'success',
            };
        }
        catch (error) {
            return {
                status: 'error',
                error: `REFRESH_CONFIG_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }
    // Validate pluginRoot when statusline is needed (CS3: fail fast)
    if (!skipStatusline && !pluginRoot) {
        return {
            status: 'error',
            error: 'MISSING_PLUGIN_ROOT: --plugin-root is required when statusline is enabled. Use --skip-statusline to bypass.',
        };
    }
    // Step 1: Initialize project
    let initResult;
    try {
        initResult = await (0, project_init_1.initializeProject)({
            projectDir: cwd,
            force,
            // WP-PS1 AC9: --yes propagates as skipPrompt — initializeProject skips
            // the [y/N] gate but still emits the destruction preview to stderr.
            skipPrompt,
        });
    }
    catch (error) {
        return {
            status: 'error',
            error: `INIT_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
    // WP-PS1 AC8: cancelled BEFORE the !success branch so user-declined aborts
    // map to status='cancelled' (exit 0 in shell terms), not status='error'.
    if (initResult.cancelled) {
        return {
            status: 'cancelled',
            init: mapInitResult(initResult),
        };
    }
    if (!initResult.success) {
        return {
            status: 'error',
            init: mapInitResult(initResult),
            error: initResult.error,
        };
    }
    // Ensure the knowledge-system native module (better-sqlite3) is built. Idempotent — a
    // no-op when the addon already loads; skipped on --refresh-config (returned earlier) and
    // when no plugin root is given (the rebuild targets the plugin's own node_modules).
    const knowledgeBootstrap = pluginRoot ? (0, sqlite_bootstrap_1.ensureSqliteNativeModule)(pluginRoot) : undefined;
    if (knowledgeBootstrap?.status === 'failed') {
        // Fail loud at the CLI layer too, not only in the structured field.
        process.stderr.write(knowledgeBootstrap.message + '\n');
    }
    // Step 2: Configure statusline (separate from initializeProject)
    // skipStatusline=true → statusline key absent from output
    if (skipStatusline) {
        return withBootstrap({
            status: 'success',
            init: mapInitResult(initResult),
        }, knowledgeBootstrap);
    }
    try {
        // WP-P8.1: copy the statusline script into .clear/statusline.sh (AC2) BEFORE pointing
        // settings.json at the ${CLAUDE_PROJECT_DIR}/.clear/statusline.sh placeholder (AC1), so
        // the configured command resolves to a real file the moment it is wired.
        (0, project_init_1.ensureClearStatusline)(cwd, pluginRoot);
        const statuslineResult = (0, hooks_config_1.configureStatusline)(cwd);
        return withBootstrap({
            status: 'success',
            init: mapInitResult(initResult),
            statusline: statuslineResult,
        }, knowledgeBootstrap);
    }
    catch (error) {
        // Statusline failure is non-fatal — init succeeded, report as partial
        return withBootstrap({
            status: 'partial',
            init: mapInitResult(initResult),
            error: `STATUSLINE_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }, knowledgeBootstrap);
    }
}
// ==============================================================================
// CLI MAIN BLOCK
// ==============================================================================
function parseArgs() {
    return (0, parse_args_1.parseCliArgs)({
        clearDir: '',
        cwd: '.',
        pluginRoot: '',
        force: false,
        refreshConfig: false,
        restoreFromBackup: false,
        backupPath: '',
        skipPrompt: false,
        skipStatusline: false,
        ensureGitignore: false,
        ensureStatusline: false,
    }, [
        // CR fix-batch F-SEC-1 (security): --cwd= flows into createBackup +
        // removeExistingClear under --reinit-clean. validateBasePath() rejects
        // traversal sequences (e.g. `--cwd=../../sensitive`) before the path
        // can reach the destructive code path.
        { prefix: '--cwd=', apply: (v, o) => { o.cwd = (0, validation_1.validateBasePath)(v); } },
        // pluginRoot flows into the sqlite-bootstrap as a child-process cwd (`npm rebuild`)
        // and module-resolution root, so reject traversal sequences here as --cwd= does.
        { prefix: '--plugin-root=', apply: (v, o) => { o.pluginRoot = (0, validation_1.validateBasePath)(v); } },
        // WP-PS1 AC1: --reinit-clean is the primary destructive flag.
        { flag: '--reinit-clean', apply: (_v, o) => { o.force = true; } },
        // WP-PS1 AC1: --force retained as deprecated alias for backward compat.
        // Maps to the same destructive code path (sets force=true).
        { flag: '--force', apply: (_v, o) => {
                process.stderr.write('[CLEAR] --force is deprecated; use --reinit-clean (semantic clarity). Will be removed in CLEAR vNEXT.\n');
                o.force = true;
            } },
        // WP-PS1 AC2: --refresh-config is the non-destructive meta-refresh path.
        { flag: '--refresh-config', apply: (_v, o) => { o.refreshConfig = true; } },
        // WP-PS1 AC6: --restore-from-backup dispatches to restore-cli.
        // Accept both standalone flag (use most-recent backup) and --restore-from-backup=PATH
        // form (use explicit backup). The =PATH variant is parsed by the prefix entry below.
        //
        // CR fix-batch F-SEC-1 (security): --backup-path= and --restore-from-backup=
        // both flow into restore-cli.ts as user-supplied destination paths. Reject
        // traversal sequences at parse time — restore-cli's runRestoreCLI also
        // checks (defense-in-depth), but failing fast at the parser surface keeps
        // the bad input from threading deeper into the call graph.
        { flag: '--restore-from-backup', apply: (_v, o) => { o.restoreFromBackup = true; } },
        { prefix: '--restore-from-backup=', apply: (v, o) => {
                if (v.includes('..')) {
                    throw new Error(`--restore-from-backup=${v} contains a traversal sequence. Refusing to parse.`);
                }
                o.restoreFromBackup = true;
                o.backupPath = v;
            } },
        // WP-PS1 AC6 alt: --backup-path= can also be passed explicitly alongside --restore-from-backup.
        { prefix: '--backup-path=', apply: (v, o) => {
                if (v.includes('..')) {
                    throw new Error(`--backup-path=${v} contains a traversal sequence. Refusing to parse.`);
                }
                o.backupPath = v;
            } },
        // WP-PS1 AC9: --yes skips the destructiveness confirmation prompt.
        { flag: '--yes', apply: (_v, o) => { o.skipPrompt = true; } },
        { flag: '--skip-statusline', apply: (_v, o) => { o.skipStatusline = true; } },
        // WP-CB-D AC2: --ensure-gitignore is the non-destructive session-start
        // self-heal path. Authors .clear/.gitignore only; ignores all init flags.
        { flag: '--ensure-gitignore', apply: (_v, o) => { o.ensureGitignore = true; } },
        // WP-P8.1 AC4: --ensure-statusline is the non-destructive session-start self-heal
        // for the statusline (copy .clear/statusline.sh + migrate the settings command).
        { flag: '--ensure-statusline', apply: (_v, o) => { o.ensureStatusline = true; } },
    ]);
}
// Main execution — only run when invoked directly
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: init-cli.js [options]',
                '',
                'Initializes CLEAR framework in a project directory.',
                '',
                'Options:',
                '  --cwd=<path>                 Project directory (default: .)',
                '  --plugin-root=<path>         Plugin root path for asset resolution',
                '  --reinit-clean               DESTRUCTIVE: backs up then DELETES the',
                '                               existing .clear/ directory (knowledge,',
                '                               workpackages, sessions, audit). Prompts',
                '                               for [y/N] confirmation by default; pass',
                '                               --yes to skip. Recover with',
                '                               --restore-from-backup if invoked in error.',
                '  --refresh-config             Non-destructive: rewrites only CLAUDE.md +',
                '                               .claude/rules/rules.md from latest CLEAR',
                '                               templates. Leaves .clear/ untouched.',
                '  --restore-from-backup[=PATH] Restore .clear/ from a .clear.backup.<ts>/',
                '                               snapshot. When PATH omitted, picks the most',
                '                               recent backup in --cwd. Preserves the',
                '                               current .clear/ as .clear.pre-restore.<ts>/',
                '                               before overwriting.',
                '  --yes                        Skip the [y/N] confirmation prompt under',
                '                               --reinit-clean / --force. The destruction',
                '                               preview is still emitted to stderr for',
                '                               audit-trail visibility.',
                '  --force                      DEPRECATED alias for --reinit-clean. Will',
                '                               be removed in CLEAR vNEXT. Use',
                '                               --reinit-clean instead.',
                '  --skip-statusline            Skip statusline configuration',
                '  --ensure-gitignore           Non-destructive self-heal: creates or updates',
                '                               .clear/.gitignore so the rebuilt knowledge',
                '                               index + SQLite journals are not swept into',
                '                               commits. Leaves all other .clear/ content',
                '                               untouched. Used by session start to backfill',
                '                               pre-existing projects.',
                '  --ensure-statusline          Non-destructive self-heal: copies the CLEAR',
                '                               statusline script into .clear/statusline.sh and',
                '                               points settings.json at the version-agnostic',
                '                               ${CLAUDE_PROJECT_DIR}/.clear/statusline.sh path so',
                '                               the wiring survives plugin updates. Requires',
                '                               --plugin-root. Used by session start to migrate',
                '                               pre-existing installs.',
            ].join('\n')
        }));
        process.exit(0);
    }
    const input = parseArgs();
    runInitCLI(input)
        .then(result => {
        console.log(JSON.stringify(result));
    })
        .catch(error => {
        console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
        process.exit(1);
    });
}
//# sourceMappingURL=init-cli.js.map