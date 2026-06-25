#!/usr/bin/env npx ts-node
"use strict";
/**
 * Workpackage Load CLI Tool
 *
 * Loads active workpackage at session start, validates dependencies.
 * Called by workpackage-load.sh bash wrapper.
 *
 * Usage: npx ts-node load-cli.ts --clear-dir=<path> [--workpackage=<id>] [--session-id=<id>]
 */
Object.defineProperty(exports, "__esModule", { value: true });
const registry_1 = require("../registry");
const parse_args_1 = require("../../cli/parse-args");
const audit_log_1 = require("../../sync/audit-log");
const validation_1 = require("../../validation");
/**
 * Parse command line arguments
 *
 * Session-id default resolves through `getCurrentSession` from canonical sync
 * state (`<clearDir>/state/session.json`) instead of a synthetic
 * `session-${Date.now()}`. Synthetic IDs corrupt audit-log correlation since
 * every emit gets a fresh timestamp suffix. Explicit `--session-id=` overrides
 * still win via parseCliArgs.
 */
function parseArgs() {
    let clearDir = './.clear';
    for (const arg of process.argv.slice(2)) {
        if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.substring('--clear-dir='.length);
            break;
        }
    }
    // validateBasePath rejects traversal-shaped paths before getCurrentSession
    // touches the filesystem to read session.json.
    const sessionDefault = (0, audit_log_1.getCurrentSession)((0, validation_1.resolveClearDir)((0, validation_1.validateBasePath)(clearDir)).clearSubdir).sessionId;
    return (0, parse_args_1.parseCliArgs)({ clearDir: './.clear', sessionId: sessionDefault }, [
        { prefix: '--workpackage=', apply: (v, o) => { o.workpackageId = v; } },
        { prefix: '--session-id=', apply: (v, o) => { o.sessionId = v; } }
    ]);
}
/**
 * Format workpackage for context output
 */
function formatWorkpackageContext(workpackage, validation, progress) {
    const lines = [];
    lines.push(`Starting workpackage ${workpackage.id}: ${workpackage.title}`);
    // Dependency status
    if (validation.valid) {
        const depIds = workpackage.dependencies.upstream.map(d => d.id);
        if (depIds.length > 0) {
            lines.push(`✅ Dependencies satisfied: ${depIds.join(', ')}`);
        }
    }
    // Soft dependency warnings
    if (validation.softBlocked.length > 0) {
        lines.push(`⚠️ Soft dependencies incomplete: ${validation.softBlocked.join(', ')}`);
    }
    // Deliverables count
    const deliverableCount = workpackage.deliverables.length;
    lines.push(`Deliverables: ${deliverableCount} items`);
    // Progress if resuming
    if (progress > 0) {
        lines.push(`Progress: ${Math.round(progress)}%`);
    }
    return lines.join('\n');
}
/**
 * Format blocked message
 */
function formatBlockedContext(workpackage, validation, alternatives) {
    const lines = [];
    lines.push(`❌ Cannot start ${workpackage.id}: Dependencies not satisfied`);
    for (const depId of validation.blockedBy) {
        lines.push(`❌ ${depId} - Incomplete`);
    }
    // Show missing deliverables if any
    for (const [depId, deliverables] of Object.entries(validation.missingDeliverables)) {
        lines.push(`  Missing from ${depId}: ${deliverables.join(', ')}`);
    }
    if (alternatives.length > 0) {
        lines.push('');
        lines.push('Alternatives:');
        for (const alt of alternatives) {
            lines.push(`- ${alt} (no blockers)`);
        }
    }
    return lines.join('\n');
}
/**
 * Main load operation
 */
function loadWorkpackage(options) {
    const registry = new registry_1.WorkpackageRegistryManager((0, validation_1.resolveClearDir)(options.clearDir).clearSubdir);
    // Determine which workpackage to load
    let workpackageId = options.workpackageId;
    if (!workpackageId) {
        // Check for active workpackage in state
        workpackageId = registry.getActiveWorkpackageId() ?? undefined;
    }
    if (!workpackageId) {
        // Fallback: scan registry for any in_progress workpackage
        const allEntries = registry.getAllWorkpackages();
        const inProgress = allEntries.find(entry => {
            const normalizedStatus = entry.status.toLowerCase().replace(/\s+/g, '_');
            return normalizedStatus === 'in_progress';
        });
        if (inProgress) {
            workpackageId = inProgress.id;
        }
    }
    if (!workpackageId) {
        // No workpackage specified or active
        return {
            additionalContext: '[CLEAR Workpackage] No active workpackage. Use /cf-workpackage to select one.',
            workpackageId: null,
            progress: 0,
            status: 'no_workpackage'
        };
    }
    // Load the workpackage
    const workpackage = registry.getWorkpackage(workpackageId);
    if (!workpackage) {
        return {
            additionalContext: `[CLEAR Workpackage] Workpackage ${workpackageId} not found.`,
            workpackageId: null,
            progress: 0,
            status: 'error',
            error: 'Workpackage not found'
        };
    }
    // Validate dependencies
    const validation = registry.validateDependencies(workpackageId);
    if (!validation.valid) {
        const alternatives = registry.getAlternatives(workpackageId);
        return {
            additionalContext: formatBlockedContext(workpackage, validation, alternatives),
            workpackageId,
            progress: 0,
            status: 'blocked',
            blockedBy: validation.blockedBy,
            alternatives
        };
    }
    // Check for circular dependencies
    const circular = registry.detectCircularDependencies(workpackageId);
    if (circular.hasCircular) {
        return {
            additionalContext: `🔄 Circular dependency detected!\n\nCycle: ${circular.cycle.join(' → ')}`,
            workpackageId,
            progress: 0,
            status: 'error',
            error: 'Circular dependency'
        };
    }
    // Set as active and calculate progress
    registry.setActiveWorkpackage(workpackageId, options.sessionId);
    const progressResult = registry.calculateProgress(workpackageId);
    return {
        additionalContext: formatWorkpackageContext(workpackage, validation, progressResult.progress),
        workpackageId,
        progress: progressResult.progress,
        status: 'success'
    };
}
// Main execution — only run when invoked directly
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: load-cli.js [options]',
                '',
                'Loads a workpackage and outputs its context for Claude.',
                '',
                'Options:',
                '  --clear-dir=<path>           Path to .clear directory (default: .clear)',
                '  --workpackage=<id>           Workpackage ID to load (required)',
                '  --session-id=<id>            Current session identifier',
            ].join('\n')
        }));
        process.exit(0);
    }
    try {
        const options = parseArgs();
        const result = loadWorkpackage(options);
        console.log(JSON.stringify(result));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
            workpackageId: null,
            progress: 0,
            status: 'error',
            error: errorMessage
        };
        console.log(JSON.stringify(result));
    }
}
//# sourceMappingURL=load-cli.js.map