#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge CLI Router
 *
 * Routes /cf-knowledge subcommands to appropriate CLI handlers.
 * Provides unified entry point for all knowledge operations.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/router.ts [subcommand] [args] --clear-dir=/path/.clear
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRouterArgs = parseRouterArgs;
exports.routeCommand = routeCommand;
const validation_1 = require("../../validation");
const status_cli_1 = require("./status-cli");
const show_cli_1 = require("./show-cli");
const link_cli_1 = require("./link-cli");
const deprecate_cli_1 = require("./deprecate-cli");
const supersede_cli_1 = require("./supersede-cli");
const capture_cli_1 = require("./capture-cli");
const delete_cli_1 = require("./delete-cli");
const dismiss_cli_1 = require("./dismiss-cli");
/**
 * Check if a string looks like a knowledge ID
 */
function isKnowledgeId(value) {
    return /^(TD|PAT|BR|LES|IW|SH|PROC)-\d+$/i.test(value);
}
/**
 * Parse command line arguments. Extracts router-level flags (--clear-dir,
 * --session-id, --session-number) and returns the remaining tokens as the
 * subcommand + subArgs. Session flags are router-level rather than per-handler
 * so every handler receives consistent session context without each having to
 * reimplement the parse.
 */
function parseRouterArgs(args) {
    let clearDir = '';
    let sessionId;
    let sessionNumber;
    const filteredArgs = [];
    for (const arg of args) {
        if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.substring('--clear-dir='.length);
        }
        else if (arg.startsWith('--session-id=')) {
            sessionId = arg.substring('--session-id='.length);
        }
        else if (arg.startsWith('--session-number=')) {
            const raw = arg.substring('--session-number='.length);
            const parsed = parseInt(raw, 10);
            if (Number.isNaN(parsed)) {
                process.stderr.write(`[CLEAR] Warning: --session-number=${raw} is not numeric; audit log entry will be skipped for this invocation\n`);
            }
            else {
                sessionNumber = parsed;
            }
        }
        else {
            filteredArgs.push(arg);
        }
    }
    if (clearDir) {
        clearDir = (0, validation_1.validateBasePath)(clearDir);
    }
    const subcommand = filteredArgs[0] || 'status';
    const subArgs = filteredArgs.slice(1);
    return { subcommand, subArgs, clearDir, session: { sessionId, sessionNumber } };
}
/**
 * Handle status subcommand (default)
 */
async function handleStatus(_args, clearDir, _session) {
    const result = await (0, status_cli_1.runStatusCLI)(clearDir);
    return {
        success: result.success,
        output: result.output,
        subcommand: 'status'
    };
}
/**
 * Handle show subcommand
 */
async function handleShow(args, clearDir, _session) {
    const entryId = args[0];
    if (!entryId) {
        return {
            success: false,
            output: 'Error: Entry ID required. Usage: /cf-knowledge show <id>',
            subcommand: 'show'
        };
    }
    const result = await (0, show_cli_1.runShowCLI)(clearDir, entryId);
    return {
        success: result.success,
        output: result.output,
        subcommand: 'show'
    };
}
/**
 * Handle link subcommand
 */
async function handleLink(args, clearDir, _session) {
    const entryId = args[0];
    let workpackageId = '';
    // Parse --to flag
    for (let i = 1; i < args.length; i++) {
        if (args[i].startsWith('--to=')) {
            workpackageId = args[i].split('=')[1];
        }
        else if (args[i] === '--to' && args[i + 1]) {
            workpackageId = args[i + 1];
            i++;
        }
    }
    if (!entryId) {
        return {
            success: false,
            output: 'Error: Entry ID required. Usage: /cf-knowledge link <id> --to <wp>',
            subcommand: 'link'
        };
    }
    if (!workpackageId) {
        return {
            success: false,
            output: 'Error: Workpackage ID required. Usage: /cf-knowledge link <id> --to <wp>',
            subcommand: 'link'
        };
    }
    const result = await (0, link_cli_1.runLinkCLI)(clearDir, entryId, workpackageId);
    return {
        success: result.success,
        output: result.output,
        subcommand: 'link'
    };
}
/**
 * Handle unlink subcommand
 */
async function handleUnlink(args, clearDir, _session) {
    const entryId = args[0];
    if (!entryId) {
        return {
            success: false,
            output: 'Error: Entry ID required. Usage: /cf-knowledge unlink <id>',
            subcommand: 'unlink'
        };
    }
    const result = await (0, link_cli_1.runUnlinkCLI)(clearDir, entryId);
    return {
        success: result.success,
        output: result.output,
        subcommand: 'unlink'
    };
}
/**
 * Handle deprecate subcommand
 */
async function handleDeprecate(args, clearDir, session) {
    const entryId = args[0];
    let reason = '';
    let force = false;
    // Parse flags
    for (let i = 1; i < args.length; i++) {
        if (args[i].startsWith('--reason=')) {
            reason = args[i].split('=').slice(1).join('=');
        }
        else if (args[i] === '--force') {
            force = true;
        }
    }
    if (!entryId) {
        return {
            success: false,
            output: 'Error: Entry ID required. Usage: /cf-knowledge deprecate <id>',
            subcommand: 'deprecate'
        };
    }
    const result = await (0, deprecate_cli_1.runDeprecateCLI)(clearDir, entryId, {
        reason,
        force,
        sessionId: session.sessionId,
        sessionNumber: session.sessionNumber
    });
    return {
        success: result.success,
        output: result.output,
        subcommand: 'deprecate'
    };
}
/**
 * Handle supersede subcommand
 */
async function handleSupersede(args, clearDir, session) {
    const oldEntryId = args[0];
    const newEntryId = args[1];
    let force = false;
    // Parse flags
    for (const arg of args) {
        if (arg === '--force') {
            force = true;
        }
    }
    if (!oldEntryId || !newEntryId) {
        return {
            success: false,
            output: 'Error: Both old and new entry IDs required. Usage: /cf-knowledge supersede <old> <new>',
            subcommand: 'supersede'
        };
    }
    const result = await (0, supersede_cli_1.runSupersedeCLI)(clearDir, oldEntryId, newEntryId, {
        force,
        sessionId: session.sessionId,
        sessionNumber: session.sessionNumber
    });
    return {
        success: result.success,
        output: result.output,
        subcommand: 'supersede'
    };
}
/**
 * Handle dismiss subcommand (K2.7)
 */
async function handleDismiss(args, clearDir, session) {
    const entryId = args[0];
    if (!entryId) {
        return {
            success: false,
            output: 'Error: Entry ID required. Usage: /cf-knowledge dismiss <id> [--reason="text"]',
            subcommand: 'dismiss'
        };
    }
    let reason = '';
    for (let i = 1; i < args.length; i++) {
        if (args[i].startsWith('--reason=')) {
            reason = args[i].split('=').slice(1).join('=');
        }
    }
    const result = await (0, dismiss_cli_1.runDismissCLI)(clearDir, entryId, {
        reason,
        sessionId: session.sessionId,
        sessionNumber: session.sessionNumber
    });
    return {
        success: result.success,
        output: result.output,
        subcommand: 'dismiss'
    };
}
/**
 * Handle delete subcommand
 */
async function handleDelete(args, clearDir, session) {
    const entryId = args[0];
    if (!entryId) {
        return {
            success: false,
            output: 'Error: Entry ID required. Usage: /cf-knowledge delete <id> --reason="reason" --force',
            subcommand: 'delete'
        };
    }
    let reason = '';
    let force = false;
    for (let i = 1; i < args.length; i++) {
        if (args[i].startsWith('--reason=')) {
            reason = args[i].split('=').slice(1).join('=');
        }
        else if (args[i] === '--force') {
            force = true;
        }
    }
    const result = await (0, delete_cli_1.runDeleteCLI)(clearDir, entryId, {
        reason,
        force,
        sessionId: session.sessionId,
        sessionNumber: session.sessionNumber
    });
    return {
        success: result.success,
        output: result.output,
        subcommand: 'delete'
    };
}
/**
 * Handle update subcommand
 */
async function handleUpdate(args, clearDir, session) {
    const entryId = args[0];
    if (!entryId) {
        return {
            success: false,
            output: 'Error: Entry ID required. Usage: /cf-knowledge update <id> [--tags=...] [--description=...] [--add-related-file=... ...] (--add-related-file is REPEATABLE)',
            subcommand: 'update'
        };
    }
    // Parse update flags. Session context (sessionId + sessionNumber) is parsed
    // by parseRouterArgs at the router level, NOT here — handleUpdate now uses
    // the canonical --session-id + --session-number shape used by the four AC18
    // handlers (delete/deprecate/supersede/dismiss). The legacy --session=<n>
    // flag is removed; AuditLogger emission gates on both sessionId AND
    // sessionNumber being set, mirroring delete-cli.ts:174 pattern.
    let tags;
    let description;
    // WP-DF2 AC3 (S165): accumulate repeatable --add-related-file= flag occurrences.
    let addRelatedFile;
    for (let i = 1; i < args.length; i++) {
        if (args[i].startsWith('--tags=')) {
            tags = args[i].split('=').slice(1).join('=').split(',').filter(Boolean);
        }
        else if (args[i].startsWith('--description=')) {
            description = args[i].split('=').slice(1).join('=');
        }
        else if (args[i].startsWith('--add-related-file=')) {
            const v = args[i].split('=').slice(1).join('=');
            addRelatedFile = (addRelatedFile ?? []).concat([v]);
        }
    }
    const options = {
        clearDir,
        mode: 'update',
        id: entryId,
        tags,
        description,
        addRelatedFile,
        sessionId: session.sessionId,
        sessionNumber: session.sessionNumber
    };
    const result = await (0, capture_cli_1.updateEntry)(options);
    // K3.5: type-change branch returns oldId/newId/action='type-change' instead
    // of entryId/fieldsUpdated. `isTypeChangeResult` narrows the optional
    // type-change fields to `string` for safe template embedding (TS-K3.5-02).
    let output;
    if (!result.success) {
        output = `Error: ${result.error}`;
    }
    else if ((0, capture_cli_1.isTypeChangeResult)(result)) {
        const cascadeNote = result.cascadedRefs.length > 0
            ? ` (${result.cascadedRefs.length} cascaded ref${result.cascadedRefs.length === 1 ? '' : 's'}: ${result.cascadedRefs.join(', ')})`
            : '';
        output = `Type-changed ${result.oldId} -> ${result.newId}${cascadeNote}`;
    }
    else {
        output = `Updated ${result.entryId}: ${result.fieldsUpdated?.join(', ')}`;
    }
    return {
        success: result.success,
        output,
        subcommand: 'update'
    };
}
/**
 * Subcommand handlers map
 */
const subcommandHandlers = {
    'status': handleStatus,
    'show': handleShow,
    'link': handleLink,
    'unlink': handleUnlink,
    'deprecate': handleDeprecate,
    'supersede': handleSupersede,
    'update': handleUpdate,
    'delete': handleDelete,
    'dismiss': handleDismiss
};
/**
 * Route to appropriate subcommand handler
 */
async function routeCommand(args) {
    const { subcommand, subArgs, clearDir, session } = parseRouterArgs(args);
    if (!clearDir) {
        return {
            success: false,
            output: 'Error: --clear-dir is required',
            subcommand: 'unknown'
        };
    }
    // Check for direct handler match
    if (subcommand in subcommandHandlers) {
        return subcommandHandlers[subcommand](subArgs, clearDir, session);
    }
    // Check if subcommand looks like a knowledge ID (treat as show)
    if (isKnowledgeId(subcommand)) {
        return handleShow([subcommand, ...subArgs], clearDir, session);
    }
    // Unknown subcommand - show help
    return {
        success: false,
        output: `Unknown subcommand: ${subcommand}\n\n` +
            'Available subcommands:\n' +
            '  (none)            - Show knowledge base overview\n' +
            '  show <id>         - Show single entry details\n' +
            '  link <id> --to <wp> - Link entry to workpackage\n' +
            '  unlink <id>       - Remove workpackage link\n' +
            '  deprecate <id>    - Deprecate entry\n' +
            '  update <id>           - Update entry fields\n' +
            '  delete <id>           - Permanently delete entry\n' +
            '  supersede <old> <new> - Replace entry with another\n' +
            '  dismiss <id>          - Dismiss deprecation warning without superseding\n\n' +
            'Note: search, load, index, capture are handled by existing CLIs.',
        subcommand: 'help'
    };
}
// Main execution
if (require.main === module) {
    const args = process.argv.slice(2);
    routeCommand(args).then(result => {
        console.log(result.output);
        process.exit(result.success ? 0 : 1);
    });
}
//# sourceMappingURL=router.js.map