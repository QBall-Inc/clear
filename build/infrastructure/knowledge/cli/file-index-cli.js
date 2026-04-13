#!/usr/bin/env npx ts-node
"use strict";
/**
 * File-Knowledge Reverse Index CLI
 *
 * CLI tool for building and querying the reverse file-knowledge index.
 * Maps file paths → knowledge entry IDs for PostToolUse/PreToolUse hooks.
 *
 * Usage:
 *   npx ts-node .../file-index-cli.ts --clear-dir=/path/.clear --rebuild
 *   npx ts-node .../file-index-cli.ts --clear-dir=/path/.clear --lookup=src/plan/types.ts
 *   npx ts-node .../file-index-cli.ts --clear-dir=/path/.clear --update=K-001
 */
Object.defineProperty(exports, "__esModule", { value: true });
const validation_1 = require("../../validation");
const file_index_1 = require("../file-index");
function parseArgs() {
    const args = process.argv.slice(2);
    let clearDir = '';
    let mode = null;
    let lookupPath = '';
    let updateEntryId = '';
    for (const arg of args) {
        if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.split('=').slice(1).join('=');
        }
        else if (arg === '--rebuild') {
            mode = 'rebuild';
        }
        else if (arg.startsWith('--lookup=')) {
            mode = 'lookup';
            lookupPath = arg.split('=').slice(1).join('=');
        }
        else if (arg.startsWith('--update=')) {
            mode = 'update';
            updateEntryId = arg.split('=').slice(1).join('=');
        }
    }
    if (clearDir) {
        clearDir = (0, validation_1.validateBasePath)(clearDir);
    }
    return { clearDir, mode, lookupPath, updateEntryId };
}
// ==============================================================================
// MAIN
// ==============================================================================
function main() {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        process.stdout.write(JSON.stringify({
            success: true,
            message: [
                'Usage: file-index-cli.js <mode> [options]',
                '',
                'Modes (one required):',
                '  --rebuild                    Rebuild the entire file-to-entry index',
                '  --lookup=<file-path>         Look up knowledge entry IDs for a file path',
                '  --update=<entry-id>          Update index for a specific entry',
                '',
                'Options:',
                '  --clear-dir=<path>           Path to .clear directory (required)',
            ].join('\n')
        }) + '\n');
        process.exit(0);
    }
    const args = parseArgs();
    if (!args.clearDir) {
        process.stderr.write('Error: --clear-dir is required\n');
        process.exit(1);
    }
    if (!args.mode) {
        process.stderr.write('Error: one of --rebuild, --lookup=<path>, --update=<entryId> is required\n');
        process.exit(1);
    }
    switch (args.mode) {
        case 'rebuild': {
            const index = (0, file_index_1.buildIndex)(args.clearDir);
            const output = JSON.stringify({
                status: 'rebuilt',
                entryCount: index.entryCount,
                fileCount: Object.keys(index.index).length,
            });
            process.stdout.write(output + '\n');
            break;
        }
        case 'lookup': {
            if (!args.lookupPath) {
                process.stderr.write('Error: --lookup requires a file path value\n');
                process.exit(1);
            }
            const ids = (0, file_index_1.lookupFiles)(args.clearDir, args.lookupPath);
            process.stdout.write(JSON.stringify(ids) + '\n');
            break;
        }
        case 'update': {
            if (!args.updateEntryId) {
                process.stderr.write('Error: --update requires an entry ID value\n');
                process.exit(1);
            }
            const index = (0, file_index_1.updateIndex)(args.clearDir, args.updateEntryId);
            const output = JSON.stringify({
                status: 'updated',
                entryId: args.updateEntryId,
                fileCount: Object.keys(index.index).length,
            });
            process.stdout.write(output + '\n');
            break;
        }
    }
}
main();
//# sourceMappingURL=file-index-cli.js.map