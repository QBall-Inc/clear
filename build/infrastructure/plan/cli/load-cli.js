#!/usr/bin/env npx ts-node
"use strict";
/**
 * Plan Load CLI Tool
 *
 * Loads plan context at session start using tiered progressive disclosure.
 * Called by plan-load.sh bash wrapper.
 *
 * Usage: npx ts-node load-cli.ts --clear-dir=<path> [--session-id=<id>]
 */
Object.defineProperty(exports, "__esModule", { value: true });
const registry_1 = require("../registry");
const parse_args_1 = require("../../cli/parse-args");
/**
 * Parse command line arguments
 */
function parseArgs() {
    return (0, parse_args_1.parseCliArgs)({ clearDir: '.clear', sessionId: `session-${Date.now()}` }, [
        { prefix: '--session-id=', apply: (v, o) => { o.sessionId = v; } }
    ]);
}
/**
 * Format plan context for Claude output
 */
function formatPlanContext(plan, activePhase, progress, milestonesComplete, milestonesAtRisk) {
    const lines = [];
    // Header with progress
    lines.push(`[Plan] ${plan.projectName}`);
    lines.push(`Phase: ${activePhase?.name ?? plan.activePhase} (${Math.round(progress * 100)}% complete)`);
    // Active workpackage
    if (plan.activeWorkpackage) {
        lines.push(`Active: ${plan.activeWorkpackage}`);
    }
    // Milestone status
    if (milestonesComplete.length > 0) {
        lines.push(`✅ Milestones achieved: ${milestonesComplete.join(', ')}`);
    }
    if (milestonesAtRisk.length > 0) {
        lines.push(`⚠️ At risk: ${milestonesAtRisk.join(', ')}`);
    }
    // Remaining workpackages in phase
    if (activePhase) {
        const registry = new registry_1.PlanRegistryManager(parseArgs().clearDir);
        const phaseProgress = registry.calculatePhaseProgress(activePhase.id);
        if (phaseProgress.pendingWorkpackages.length > 0) {
            lines.push(`Remaining in phase: ${phaseProgress.pendingWorkpackages.length} workpackages`);
        }
    }
    return lines.join('\n');
}
/**
 * Main load operation
 */
function loadPlan(options) {
    const registry = new registry_1.PlanRegistryManager(options.clearDir);
    // Try to load the plan
    const plan = registry.loadPlan();
    if (!plan) {
        return {
            additionalContext: '[Plan] No development plan found. Use /cf-init to create one.',
            progress: 0,
            status: 'no_plan'
        };
    }
    // Initialize state
    registry.initializeState(options.sessionId);
    // Get active phase — fall back to first not_started phase if none set
    let activePhase = registry.getActivePhase();
    if (!activePhase && plan.phases.length > 0) {
        // Find first phase that isn't complete
        activePhase = plan.phases.find(p => p.status !== 'complete') ?? plan.phases[0];
        plan.activePhase = activePhase.id;
    }
    // Calculate progress
    const phaseProgress = registry.calculatePhaseProgress(plan.activePhase);
    // Check milestones
    const milestonesComplete = [];
    const milestonesAtRisk = [];
    for (const milestone of plan.milestones) {
        if (milestone.phase !== plan.activePhase)
            continue;
        const check = registry.checkMilestoneStatus(milestone.id);
        if (check.status === 'complete') {
            milestonesComplete.push(milestone.name);
        }
        else if (check.atRisk) {
            milestonesAtRisk.push(milestone.name);
        }
    }
    // Update state with calculated progress
    const state = registry.loadState();
    state.phaseProgress[plan.activePhase] = phaseProgress.progress;
    state.lastActivity = new Date().toISOString();
    registry.saveState(state);
    return {
        additionalContext: formatPlanContext(plan, activePhase, phaseProgress.progress, milestonesComplete, milestonesAtRisk),
        planId: 'master-plan',
        activePhase: plan.activePhase,
        activeWorkpackage: plan.activeWorkpackage,
        progress: phaseProgress.progress,
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
                'Options:',
                '  --clear-dir=<path>           Path to .clear directory (default: .clear)',
                '  --session-id=<id>            Current session identifier',
            ].join('\n')
        }));
        process.exit(0);
    }
    try {
        const options = parseArgs();
        const result = loadPlan(options);
        console.log(JSON.stringify(result));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
            progress: 0,
            status: 'error',
            error: errorMessage
        };
        console.log(JSON.stringify(result));
    }
}
//# sourceMappingURL=load-cli.js.map