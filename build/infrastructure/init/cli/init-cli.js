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
// ==============================================================================
// MAIN
// ==============================================================================
async function runInitCLI(options) {
    const { cwd, pluginRoot, force, skipStatusline } = options;
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
        });
    }
    catch (error) {
        return {
            status: 'error',
            error: `INIT_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
    if (!initResult.success) {
        return {
            status: 'error',
            init: mapInitResult(initResult),
            error: initResult.error,
        };
    }
    // Step 2: Configure statusline (separate from initializeProject)
    // skipStatusline=true → statusline key absent from output
    if (skipStatusline) {
        return {
            status: 'success',
            init: mapInitResult(initResult),
        };
    }
    try {
        const statuslineResult = (0, hooks_config_1.configureStatusline)(cwd, pluginRoot);
        return {
            status: 'success',
            init: mapInitResult(initResult),
            statusline: statuslineResult,
        };
    }
    catch (error) {
        // Statusline failure is non-fatal — init succeeded, report as partial
        return {
            status: 'partial',
            init: mapInitResult(initResult),
            error: `STATUSLINE_FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
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
        skipStatusline: false,
    }, [
        { prefix: '--cwd=', apply: (v, o) => { o.cwd = v; } },
        { prefix: '--plugin-root=', apply: (v, o) => { o.pluginRoot = v; } },
        { flag: '--force', apply: (_v, o) => { o.force = true; } },
        { flag: '--skip-statusline', apply: (_v, o) => { o.skipStatusline = true; } },
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
                '  --force                      Force re-initialization over existing .clear/',
                '  --skip-statusline            Skip statusline configuration',
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