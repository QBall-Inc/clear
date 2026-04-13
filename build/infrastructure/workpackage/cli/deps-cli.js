#!/usr/bin/env npx ts-node
"use strict";
/**
 * Workpackage Dependencies CLI Tool
 *
 * Validates dependencies, detects circular dependencies, finds alternatives.
 * Called by workpackage-deps.sh bash wrapper.
 *
 * Usage: npx ts-node deps-cli.ts --clear-dir=<path> --workpackage=<id> [--check-deliverables]
 */
Object.defineProperty(exports, "__esModule", { value: true });
const registry_1 = require("../registry");
const parse_args_1 = require("../../cli/parse-args");
/**
 * Parse command line arguments
 */
function parseArgs() {
    return (0, parse_args_1.parseCliArgs)({ clearDir: '.clear', workpackageId: '', checkDeliverables: false }, [
        { prefix: '--workpackage=', apply: (v, o) => { o.workpackageId = v; } },
        { flag: '--check-deliverables', apply: (_v, o) => { o.checkDeliverables = true; } }
    ]);
}
/**
 * Get status icon for workpackage status
 */
function getStatusIcon(status) {
    switch (status) {
        case 'complete':
            return '✅';
        case 'in_progress':
            return '🔄';
        case 'blocked':
            return '❌';
        case 'not_started':
            return '⏳';
        default:
            return '❓';
    }
}
/**
 * Format ready message
 */
function formatReadyContext(workpackageId, dependencies) {
    const lines = [];
    lines.push(`✅ ${workpackageId} ready to start`);
    lines.push('');
    lines.push('Dependencies:');
    for (const dep of dependencies) {
        const icon = getStatusIcon(dep.status);
        const typeLabel = dep.type === 'soft' ? ' (soft)' : '';
        lines.push(`${icon} ${dep.id} - ${capitalize(dep.status)}${typeLabel}`);
    }
    return lines.join('\n');
}
/**
 * Format blocked message
 */
function formatBlockedContext(workpackageId, blockedBy, dependencies, alternatives) {
    const lines = [];
    lines.push(`❌ ${workpackageId} blocked`);
    lines.push('');
    for (const dep of dependencies) {
        const icon = getStatusIcon(dep.status);
        const progress = dep.progress !== undefined ? ` (${Math.round(dep.progress * 100)}%)` : '';
        lines.push(`${icon} ${dep.id} - ${capitalize(dep.status)}${progress}`);
    }
    if (alternatives.length > 0) {
        lines.push('');
        lines.push('Suggestions:');
        lines.push(`1. Complete ${blockedBy[0]} first`);
        lines.push(`2. Choose alternative: ${alternatives.join(', ')}`);
    }
    return lines.join('\n');
}
/**
 * Format circular dependency message
 */
function formatCircularContext(_workpackageId, cycle) {
    const lines = [];
    lines.push('🔄 Circular dependency detected!');
    lines.push('');
    lines.push(`Cycle: ${cycle.join(' → ')}`);
    lines.push('');
    lines.push('Resolution:');
    lines.push(`1. Remove one of the dependencies in the cycle`);
    lines.push('2. Extract shared code to a new workpackage');
    return lines.join('\n');
}
/**
 * Capitalize first letter
 */
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}
/**
 * Main dependency validation operation
 */
function validateDependencies(options) {
    if (!options.workpackageId) {
        return {
            additionalContext: 'Error: No workpackage ID specified',
            workpackageId: '',
            dependencies: [],
            status: 'error',
            error: 'Missing workpackage ID'
        };
    }
    const registry = new registry_1.WorkpackageRegistryManager(options.clearDir);
    // Load the workpackage
    const workpackage = registry.getWorkpackage(options.workpackageId);
    if (!workpackage) {
        return {
            additionalContext: `Error: Workpackage ${options.workpackageId} not found`,
            workpackageId: options.workpackageId,
            dependencies: [],
            status: 'error',
            error: 'Workpackage not found'
        };
    }
    // Check for circular dependencies first
    const circular = registry.detectCircularDependencies(options.workpackageId);
    if (circular.hasCircular) {
        return {
            additionalContext: formatCircularContext(options.workpackageId, circular.cycle),
            workpackageId: options.workpackageId,
            dependencies: [],
            status: 'circular',
            cycle: circular.cycle
        };
    }
    // Build dependency status list
    const dependencies = [];
    for (const dep of workpackage.dependencies.upstream) {
        const status = registry.getWorkpackageStatus(dep.id);
        const progressResult = registry.calculateProgress(dep.id);
        dependencies.push({
            id: dep.id,
            status: status || 'not_started',
            type: dep.type,
            progress: progressResult.progress
        });
    }
    // Validate dependencies
    const validation = registry.validateDependencies(options.workpackageId);
    if (validation.valid) {
        return {
            additionalContext: formatReadyContext(options.workpackageId, dependencies),
            workpackageId: options.workpackageId,
            dependencies,
            status: 'ready'
        };
    }
    else {
        const alternatives = registry.getAlternatives(options.workpackageId);
        return {
            additionalContext: formatBlockedContext(options.workpackageId, validation.blockedBy, dependencies, alternatives),
            workpackageId: options.workpackageId,
            dependencies,
            status: 'blocked',
            blockedBy: validation.blockedBy,
            alternatives
        };
    }
}
// Main execution — only run when invoked directly
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: deps-cli.js [options]',
                '',
                'Validates workpackage dependencies and reports blockers.',
                '',
                'Options:',
                '  --clear-dir=<path>           Path to .clear directory (default: .clear)',
                '  --workpackage=<id>           Workpackage ID to check (required)',
                '  --check-deliverables         Also validate deliverable completeness',
            ].join('\n')
        }));
        process.exit(0);
    }
    try {
        const options = parseArgs();
        const result = validateDependencies(options);
        console.log(JSON.stringify(result));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
            workpackageId: '',
            dependencies: [],
            status: 'error',
            error: errorMessage
        };
        console.log(JSON.stringify(result));
    }
}
//# sourceMappingURL=deps-cli.js.map