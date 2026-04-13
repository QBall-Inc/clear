#!/usr/bin/env npx ts-node
"use strict";
/**
 * Plan Next CLI Tool
 *
 * Suggests the next workpackage to work on based on dependencies and status.
 * Called by /cf-plan next command.
 *
 * Usage: npx ts-node next-cli.ts --clear-dir=<path>
 */
Object.defineProperty(exports, "__esModule", { value: true });
const registry_1 = require("../registry");
const registry_2 = require("../../workpackage/registry");
const parse_args_1 = require("../../cli/parse-args");
/** Sort key for workpackages without a position (sorts to end) */
const UNPHASED_SORT_KEY = 999;
/**
 * Parse command line arguments
 */
function parseArgs() {
    return (0, parse_args_1.parseCliArgs)({ clearDir: '.clear' }, []);
}
/**
 * Format the next recommendation message
 */
function formatNextRecommendation(nextDisplayId, nextName, currentDisplayId) {
    const lines = [];
    lines.push('Next Step Recommendation');
    lines.push('========================');
    lines.push('');
    if (currentDisplayId) {
        lines.push(`Current: ${currentDisplayId} (complete or not started)`);
        lines.push('');
    }
    lines.push(`Recommended next: ${nextDisplayId} - ${nextName}`);
    lines.push('');
    lines.push('To start this workpackage:');
    lines.push(`  /cf-workpackage start ${nextDisplayId}`);
    return lines.join('\n');
}
/**
 * Format "continue current" message
 */
function formatContinueCurrent(displayId, name, progress) {
    const lines = [];
    lines.push('Next Step Recommendation');
    lines.push('========================');
    lines.push('');
    lines.push(`Current workpackage: ${displayId} - ${name}`);
    lines.push(`Progress: ${Math.round(progress * 100)}%`);
    lines.push('');
    lines.push('Recommendation: Continue with current workpackage');
    lines.push('');
    lines.push('Commands:');
    lines.push('  /cf-workpackage progress    View/update progress');
    lines.push('  /cf-workpackage complete    Mark as complete when done');
    return lines.join('\n');
}
/**
 * Build the response when no available (unblocked, not_started) workpackages exist.
 * Checks whether the phase is fully complete, has blocked items, or is otherwise busy.
 */
function buildNoNextResponse(wpRegistry, activePhaseId, phaseName) {
    // Check if phase is complete
    const registry = wpRegistry.loadRegistry();
    const phaseWps = registry.workpackages.filter((wp) => wp.phase === activePhaseId || !wp.phase);
    const incompleteCount = phaseWps.filter((wp) => wp.status !== 'complete' && wp.status !== 'deferred').length;
    if (incompleteCount === 0) {
        return {
            status: 'no_next',
            additionalContext: `Phase "${phaseName}" is complete!\n\nAll workpackages finished. Consider moving to the next phase.`
        };
    }
    // Some are blocked or in progress
    const blockedWps = registry.workpackages.filter((wp) => wp.status === 'blocked');
    if (blockedWps.length > 0) {
        const blockedNames = blockedWps.map((wp) => wp.id).join(', ');
        return {
            status: 'no_next',
            additionalContext: `No unblocked workpackages available.\n\nBlocked workpackages: ${blockedNames}\n\nRun /cf-plan blockers to see blocking dependencies.`
        };
    }
    return {
        status: 'no_next',
        additionalContext: 'No available workpackages to start. All are either in progress or complete.'
    };
}
/**
 * Main next operation
 */
function findNext(options) {
    const planRegistry = new registry_1.PlanRegistryManager(options.clearDir);
    const wpRegistry = new registry_2.WorkpackageRegistryManager(options.clearDir);
    // Load plan
    const plan = planRegistry.loadPlan();
    if (!plan) {
        return {
            status: 'no_plan',
            additionalContext: 'No development plan found. Use /cf-init to create one.'
        };
    }
    // Get active phase
    const activePhase = planRegistry.getActivePhase();
    if (!activePhase) {
        return {
            status: 'error',
            error: 'No active phase found in plan'
        };
    }
    // Check for current active workpackage
    const currentWp = wpRegistry.getActiveWorkpackage();
    const currentWpId = plan.activeWorkpackage;
    // If current is in_progress, recommend continuing
    if (currentWp && currentWp.status === 'in_progress') {
        // Calculate progress from deliverables
        const totalWeight = currentWp.deliverables.reduce((sum, d) => sum + d.weight, 0);
        const completedWeight = currentWp.deliverables
            .filter(d => d.status === 'complete')
            .reduce((sum, d) => sum + d.weight, 0);
        const progress = totalWeight > 0 ? completedWeight / totalWeight : 0;
        return {
            status: 'current_incomplete',
            currentWorkpackage: currentWp.id,
            additionalContext: formatContinueCurrent(currentWp.id, currentWp.title, progress)
        };
    }
    // Get unblocked workpackages (already filtered by dependency validation)
    const unblockedWps = wpRegistry.getUnblockedWorkpackages();
    // Filter to active phase and not_started status
    const activePhaseId = activePhase.systemId || activePhase.id;
    const availableWps = unblockedWps
        .filter((wp) => {
        // Must be not_started
        if (wp.status !== 'not_started')
            return false;
        // Must be in active phase
        if (wp.phase) {
            return wp.phase === activePhaseId;
        }
        // Fallback: check if id starts with phase position
        return true; // Include if no phase specified
    })
        .sort((a, b) => (a.position ?? UNPHASED_SORT_KEY) - (b.position ?? UNPHASED_SORT_KEY));
    if (availableWps.length === 0) {
        return buildNoNextResponse(wpRegistry, activePhaseId, activePhase.name);
    }
    // Return the first available (highest priority by position)
    const nextWp = availableWps[0];
    return {
        status: 'success',
        nextWorkpackage: nextWp.id,
        nextWorkpackageName: nextWp.title,
        nextWorkpackageSystemId: nextWp.systemId,
        currentWorkpackage: currentWpId,
        additionalContext: formatNextRecommendation(nextWp.id, nextWp.title, currentWpId)
    };
}
// Main execution — only run when invoked directly
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: next-cli.js [options]',
                '',
                'Recommends the next workpackage to work on based on dependency',
                'resolution and phase ordering.',
                '',
                'Options:',
                '  --clear-dir=<path>           Path to .clear directory (default: .clear)',
            ].join('\n')
        }));
        process.exit(0);
    }
    try {
        const options = parseArgs();
        const result = findNext(options);
        console.log(JSON.stringify(result));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
            status: 'error',
            error: errorMessage
        };
        console.log(JSON.stringify(result));
    }
}
//# sourceMappingURL=next-cli.js.map