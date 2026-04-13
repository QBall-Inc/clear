"use strict";
/**
 * Workpackage Status CLI (P2.7)
 *
 * Implements status viewing commands: default, show, list
 * Based on P2.7 Feature Brief Sections 2.2-2.4
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatStatus = formatStatus;
exports.formatProgress = formatProgress;
exports.formatDate = formatDate;
exports.formatDependencyStatus = formatDependencyStatus;
exports.listWorkpackages = listWorkpackages;
exports.showWorkpackage = showWorkpackage;
exports.showActiveStatus = showActiveStatus;
exports.showNoActiveWorkpackage = showNoActiveWorkpackage;
exports.runStatusCLI = runStatusCLI;
const util_1 = require("util");
const validation_1 = require("../../validation");
const registry_1 = require("../registry");
const state_machine_1 = require("../state-machine");
// ==============================================================================
// OUTPUT FORMATTING
// ==============================================================================
/**
 * Status emoji mapping
 */
const STATUS_ICONS = {
    not_started: '⬜',
    in_progress: '🔨',
    paused: '⏸️',
    blocked: '🚫',
    complete: '✅',
    deferred: '⏳',
    archived: '📦'
};
/**
 * Format a workpackage status with icon
 */
function formatStatus(status) {
    return `${STATUS_ICONS[status]} ${status}`;
}
/**
 * Format progress percentage
 */
function formatProgress(progress) {
    const pct = Math.round(progress);
    return `${pct}%`;
}
/**
 * Format a date string for display
 */
function formatDate(isoDate) {
    if (!isoDate)
        return '-';
    const date = new Date(isoDate);
    return date.toISOString().split('T')[0];
}
/**
 * Format dependency status
 */
function formatDependencyStatus(depId, status, progress) {
    const icon = status === 'complete' ? '✅' : '❌';
    const progressStr = progress !== undefined ? ` (${formatProgress(progress)})` : '';
    return `  ${icon} ${depId}${progressStr}`;
}
/**
 * List workpackages in table format
 */
function listWorkpackages(entries, options = {}, activeId) {
    // Filter entries
    let filtered = entries;
    if (!options.all) {
        filtered = filtered.filter(e => state_machine_1.DEFAULT_VISIBLE_STATUSES.includes(e.status));
    }
    if (options.phase) {
        filtered = filtered.filter(e => e.phase === options.phase);
    }
    if (options.status) {
        filtered = filtered.filter(e => e.status === options.status);
    }
    if (filtered.length === 0) {
        return 'No workpackages found matching criteria.';
    }
    // Build table
    const lines = [];
    lines.push('| ID    | Name                  | Status      | Progress | Deps |');
    lines.push('|-------|----------------------|-------------|----------|------|');
    for (const entry of filtered) {
        const isActive = entry.id === activeId || entry.systemId === activeId;
        const activeMarker = isActive ? ' ← active' : '';
        const progress = formatProgress(entry.progress ?? 0);
        const deps = entry.blocked_by?.length ?? 0;
        lines.push(`| ${entry.id.padEnd(5)} | ${entry.title.slice(0, 20).padEnd(20)} | ${entry.status.padEnd(11)} | ${progress.padStart(8)} | ${String(deps).padStart(4)} |${activeMarker}`);
    }
    // Summary
    const statusCounts = new Map();
    for (const entry of filtered) {
        statusCounts.set(entry.status, (statusCounts.get(entry.status) ?? 0) + 1);
    }
    const summaryParts = [];
    if (statusCounts.get('in_progress')) {
        summaryParts.push(`${statusCounts.get('in_progress')} in progress`);
    }
    if (statusCounts.get('complete')) {
        summaryParts.push(`${statusCounts.get('complete')} complete`);
    }
    if (statusCounts.get('not_started')) {
        summaryParts.push(`${statusCounts.get('not_started')} not started`);
    }
    if (statusCounts.get('paused')) {
        summaryParts.push(`${statusCounts.get('paused')} paused`);
    }
    lines.push('');
    lines.push(`${filtered.length} workpackages (${summaryParts.join(', ')})`);
    return lines.join('\n');
}
// ==============================================================================
// SHOW COMMAND
// ==============================================================================
/**
 * Show detailed workpackage information
 */
function showWorkpackage(entry, full, deps, linkedKnowledge) {
    const lines = [];
    // Header
    lines.push(`📦 Workpackage: ${entry.id} - ${entry.title}`);
    lines.push('');
    // Identity section
    lines.push('## Identity');
    lines.push(`  Display ID:  ${entry.id}`);
    if (entry.systemId) {
        lines.push(`  System ID:   ${entry.systemId}`);
    }
    if (entry.phase) {
        lines.push(`  Phase:       ${entry.phase}`);
    }
    if (entry.position !== undefined) {
        lines.push(`  Position:    ${entry.position}`);
    }
    lines.push('');
    // Status section
    lines.push('## Status');
    lines.push(`  Status:      ${formatStatus(entry.status)}`);
    lines.push(`  Progress:    ${formatProgress(entry.progress ?? 0)}`);
    if (entry.startedAt) {
        lines.push(`  Started:     ${formatDate(entry.startedAt)}`);
    }
    if (entry.completedAt) {
        lines.push(`  Completed:   ${formatDate(entry.completedAt)}`);
    }
    if (entry.archivedAt) {
        lines.push(`  Archived:    ${formatDate(entry.archivedAt)}`);
    }
    lines.push('');
    // Dependencies section
    if (deps && deps.length > 0) {
        lines.push('## Dependencies');
        for (const dep of deps) {
            lines.push(formatDependencyStatus(dep.id, dep.status, dep.progress));
        }
        lines.push('');
    }
    // Deliverables section (if full entry available)
    if (full?.deliverables && full.deliverables.length > 0) {
        lines.push('## Deliverables');
        for (const d of full.deliverables) {
            const icon = d.status === 'complete' ? '✅' : '⬜';
            lines.push(`  ${icon} ${d.id}: ${d.pattern}`);
        }
        lines.push('');
    }
    // Linked knowledge section
    if (linkedKnowledge && linkedKnowledge.length > 0) {
        lines.push('## Linked Knowledge');
        lines.push(`  ${linkedKnowledge.join(', ')}`);
        lines.push('');
    }
    // Available actions
    const actions = (0, state_machine_1.getStatusActions)(entry.status);
    if (actions.length > 0) {
        lines.push('## Available Actions');
        lines.push(`  ${actions.join(', ')}`);
    }
    return lines.join('\n');
}
// ==============================================================================
// DEFAULT COMMAND (Active WP Status)
// ==============================================================================
/**
 * Show active workpackage summary (default command)
 */
function showActiveStatus(entry, phaseName, deps, linkedKnowledge) {
    const lines = [];
    lines.push(`📦 Active Workpackage: ${entry.id} - ${entry.title}`);
    lines.push('');
    lines.push(`Status:     ${formatStatus(entry.status)}`);
    lines.push(`Progress:   ${formatProgress(entry.progress ?? 0)}`);
    if (phaseName) {
        lines.push(`Phase:      ${phaseName}`);
    }
    if (entry.startedAt) {
        lines.push(`Started:    ${formatDate(entry.startedAt)}`);
    }
    if (deps && deps.length > 0) {
        lines.push('');
        lines.push('Dependencies:');
        for (const dep of deps) {
            const icon = dep.status === 'complete' ? '✅' : '❌';
            lines.push(`  ${icon} ${dep.id} (${dep.status})`);
        }
    }
    if (linkedKnowledge && linkedKnowledge.length > 0) {
        lines.push('');
        lines.push(`Linked Knowledge: ${linkedKnowledge.join(', ')}`);
    }
    return lines.join('\n');
}
/**
 * Show message when no active workpackage
 */
function showNoActiveWorkpackage() {
    return `No active workpackage.

Use \`/cf-workpackage list\` to see available workpackages.
Use \`/cf-workpackage start <id>\` to activate one.`;
}
/**
 * Run status CLI command
 */
/**
 * Parse command line arguments for standalone execution
 */
function parseStatusArgs() {
    const argv = process.argv.slice(2);
    let clearDir = '.clear';
    const positionalArgs = [];
    for (const arg of argv) {
        if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.substring('--clear-dir='.length);
        }
        else if (!arg.startsWith('--')) {
            positionalArgs.push(arg);
        }
    }
    return {
        clearDir,
        subcommand: positionalArgs[0],
        args: positionalArgs.slice(1)
    };
}
/**
 * Run status CLI command
 */
async function runStatusCLI(options) {
    const { subcommand, args = [] } = options;
    const clearDir = (0, validation_1.validateBasePath)(options.clearDir);
    const registry = new registry_1.WorkpackageRegistryManager(clearDir);
    switch (subcommand) {
        case 'list': {
            const { values } = (0, util_1.parseArgs)({
                args,
                options: {
                    all: { type: 'boolean', short: 'a' },
                    phase: { type: 'string', short: 'p' },
                    status: { type: 'string', short: 's' }
                },
                allowPositionals: false
            });
            const entries = registry.getAllWorkpackages();
            const state = registry.loadState();
            return listWorkpackages(entries, {
                all: values.all,
                phase: values.phase,
                status: values.status
            }, state.activeWorkpackage ?? undefined);
        }
        case 'show': {
            const { positionals } = (0, util_1.parseArgs)({
                args,
                options: {},
                allowPositionals: true
            });
            const id = positionals[0];
            if (!id) {
                return 'Usage: /cf-workpackage show <id>';
            }
            const entries = registry.getAllWorkpackages();
            const entry = entries.find(e => e.id === id || e.systemId === id);
            if (!entry) {
                return `Workpackage not found: ${id}`;
            }
            const full = registry.getWorkpackage(entry.id);
            // Get dependency statuses
            const deps = [];
            if (full?.dependencies.upstream) {
                for (const dep of full.dependencies.upstream) {
                    const depEntry = entries.find(e => e.id === dep.id);
                    if (depEntry) {
                        deps.push({
                            id: dep.id,
                            status: depEntry.status,
                            progress: depEntry.progress
                        });
                    }
                }
            }
            return showWorkpackage(entry, full ?? undefined, deps, entry.linkedKnowledge);
        }
        default: {
            // Default: show active workpackage
            const state = registry.loadState();
            if (!state.activeWorkpackage) {
                return showNoActiveWorkpackage();
            }
            const entries = registry.getAllWorkpackages();
            const entry = entries.find(e => e.id === state.activeWorkpackage);
            if (!entry) {
                return showNoActiveWorkpackage();
            }
            const full = registry.getWorkpackage(entry.id);
            // Get dependency statuses
            const deps = [];
            if (full?.dependencies.upstream) {
                for (const dep of full.dependencies.upstream) {
                    const depEntry = entries.find(e => e.id === dep.id);
                    if (depEntry) {
                        deps.push({ id: dep.id, status: depEntry.status });
                    }
                }
            }
            return showActiveStatus(entry, undefined, deps, entry.linkedKnowledge);
        }
    }
}
// Main execution — only run when invoked directly
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: status-cli.js [subcommand] [options]',
                '',
                'Subcommands:',
                '  list [options]               List workpackages',
                '  show <wp-id>                 Show details for a specific workpackage',
                '  (none)                       Show active workpackage status',
                '',
                'List options:',
                '  --all, -a                    Show all workpackages (including completed)',
                '  --phase, -p                  Group by phase',
                '  --status, -s                 Group by status',
                '',
                'Common:',
                '  --clear-dir=<path>           Path to .clear directory (required)',
            ].join('\n')
        }));
        process.exit(0);
    }
    try {
        const options = parseStatusArgs();
        runStatusCLI(options)
            .then(message => {
            console.log(JSON.stringify({ success: true, message }));
        })
            .catch(error => {
            console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
            process.exit(1);
        });
    }
    catch (error) {
        console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
        process.exit(1);
    }
}
//# sourceMappingURL=status-cli.js.map