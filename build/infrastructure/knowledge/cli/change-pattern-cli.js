#!/usr/bin/env npx ts-node
"use strict";
/**
 * Change Pattern CLI
 *
 * Evaluates changed files against knowledge change patterns (Level A/B/C).
 * Used by session-stop.sh for Level B assessment (Node.js CLI invoked
 * conditionally when Level A does not match in bash).
 *
 * Usage:
 *   npx ts-node .../change-pattern-cli.ts --patterns-file=<path> --changed-files='["a.ts","b.ts"]'
 *   npx ts-node .../change-pattern-cli.ts --patterns-file=<path> --changed-files='[...]' --user-patterns=<path>
 *   npx ts-node .../change-pattern-cli.ts --patterns-file=<path> --changed-files='[...]' --tool-filter=Write
 *
 * Output (JSON):
 *   { "matched": true, "level": "B", "pattern_id": "schema-change", "message": "..." }
 */
Object.defineProperty(exports, "__esModule", { value: true });
const change_patterns_1 = require("../change-patterns");
function parseArgs() {
    const args = process.argv.slice(2);
    let patternsFile = '';
    let changedFilesRaw = '';
    let userPatterns = '';
    let toolFilter = '';
    for (const arg of args) {
        if (arg.startsWith('--patterns-file=')) {
            patternsFile = arg.split('=').slice(1).join('=');
        }
        else if (arg.startsWith('--changed-files=')) {
            changedFilesRaw = arg.split('=').slice(1).join('=');
        }
        else if (arg.startsWith('--user-patterns=')) {
            userPatterns = arg.split('=').slice(1).join('=');
        }
        else if (arg.startsWith('--tool-filter=')) {
            toolFilter = arg.split('=').slice(1).join('=');
        }
    }
    if (!patternsFile) {
        process.stderr.write('Error: --patterns-file is required\n');
        process.exit(1);
    }
    if (!changedFilesRaw) {
        process.stderr.write('Error: --changed-files is required\n');
        process.exit(1);
    }
    let changedFiles;
    try {
        changedFiles = JSON.parse(changedFilesRaw);
        if (!Array.isArray(changedFiles)) {
            throw new Error('--changed-files must be a JSON array');
        }
    }
    catch (error) {
        process.stderr.write(`Error: invalid --changed-files JSON: ${error.message}\n`);
        process.exit(1);
    }
    return { patternsFile, changedFiles, userPatterns, toolFilter };
}
// ==============================================================================
// MAIN
// ==============================================================================
function main() {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        process.stdout.write(JSON.stringify({
            success: true,
            message: [
                'Usage: change-pattern-cli.js [options]',
                '',
                'Options:',
                '  --patterns-file=<path>       Path to change-patterns.yaml (required)',
                '  --changed-files=<json>       JSON array of changed file paths (required)',
                '  --user-patterns=<path>       Path to user override patterns file',
                '  --tool-filter=<tool-name>    Filter patterns by tool name',
            ].join('\n')
        }) + '\n');
        process.exit(0);
    }
    const args = parseArgs();
    // Clear cache to ensure fresh load with specified config path
    (0, change_patterns_1.clearChangePatternCache)();
    // If user patterns provided, load with cwd that has .clear/config/ override
    // Otherwise, use the patterns-file directly via configPath parameter
    const cwd = args.userPatterns ? args.userPatterns : undefined;
    const result = (0, change_patterns_1.matchChangePatterns)(args.changedFiles, cwd, args.toolFilter || undefined, args.patternsFile);
    const output = {
        matched: result.matched,
        level: result.level,
        pattern_id: result.patternId,
        message: result.message,
    };
    process.stdout.write(JSON.stringify(output) + '\n');
}
main();
//# sourceMappingURL=change-pattern-cli.js.map