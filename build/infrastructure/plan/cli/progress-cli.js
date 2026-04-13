#!/usr/bin/env npx ts-node
"use strict";
/**
 * Plan Progress CLI Tool
 *
 * Calculates multi-signal progress and updates plan state.
 * Called by plan-progress.sh bash wrapper.
 *
 * Usage: npx ts-node progress-cli.ts --clear-dir=<path>
 */
Object.defineProperty(exports, "__esModule", { value: true });
const registry_1 = require("../registry");
const parse_args_1 = require("../../cli/parse-args");
/**
 * Parse command line arguments
 */
function parseArgs() {
    return (0, parse_args_1.parseCliArgs)({ clearDir: '.clear' }, [
        { prefix: '--user-prompt=', apply: (v, o) => { o.userPrompt = v; } }
    ]);
}
/**
 * Format progress change message
 */
function formatProgressChange(phaseId, oldProgress, newProgress, multiSignal) {
    const lines = [];
    // Phase progress change
    const oldPct = Math.round(oldProgress * 100);
    const newPct = Math.round(newProgress * 100);
    if (oldPct !== newPct) {
        lines.push(`[Plan Progress] ${phaseId}: ${oldPct}% → ${newPct}%`);
    }
    // Multi-signal breakdown
    const wpPct = Math.round(multiSignal.workpackages * 100);
    const commitPct = Math.round(multiSignal.commits * 100);
    const testPct = Math.round(multiSignal.tests * 100);
    lines.push(`Multi-signal: WP ${wpPct}% | Commits ${commitPct}% | Tests ${testPct}%`);
    return lines.join('\n');
}
/**
 * Format milestone completion message
 */
function formatMilestoneComplete(milestoneName, phaseProgress) {
    return `🎉 [Plan] Milestone '${milestoneName}' complete!\nPhase: ${Math.round(phaseProgress * 100)}% complete`;
}
/**
 * Main progress operation
 */
function calculateProgress(options) {
    const registry = new registry_1.PlanRegistryManager(options.clearDir);
    // Load plan
    const plan = registry.loadPlan();
    if (!plan) {
        return {
            progress: 0,
            status: 'error',
            error: 'No plan found'
        };
    }
    // Load current state
    const state = registry.loadState();
    const oldProgress = state.phaseProgress[plan.activePhase] ?? 0;
    // Calculate multi-signal progress
    const multiSignalResult = registry.calculateMultiSignalProgress();
    const phaseProgress = registry.calculatePhaseProgress(plan.activePhase);
    // Check for newly completed milestones
    let milestoneComplete;
    for (const milestone of plan.milestones) {
        if (milestone.phase !== plan.activePhase)
            continue;
        const existingState = state.milestones[milestone.id];
        if (existingState?.status === 'complete')
            continue;
        const check = registry.checkMilestoneStatus(milestone.id);
        if (check.status === 'complete') {
            registry.markMilestoneComplete(milestone.id);
            milestoneComplete = milestone.name;
            break; // Only report one milestone per call
        }
    }
    // Update state
    state.phaseProgress[plan.activePhase] = phaseProgress.progress;
    state.multiSignalData = multiSignalResult.signals;
    state.lastActivity = new Date().toISOString();
    registry.saveState(state);
    // Determine if we should output context
    const progressChanged = Math.round(oldProgress * 100) !== Math.round(phaseProgress.progress * 100);
    if (milestoneComplete) {
        return {
            additionalContext: formatMilestoneComplete(milestoneComplete, phaseProgress.progress),
            milestoneComplete,
            phaseProgress: { [plan.activePhase]: phaseProgress.progress },
            multiSignal: multiSignalResult.signals,
            progress: phaseProgress.progress,
            status: 'success'
        };
    }
    if (progressChanged) {
        return {
            additionalContext: formatProgressChange(plan.activePhase, oldProgress, phaseProgress.progress, multiSignalResult.signals),
            phaseProgress: { [plan.activePhase]: phaseProgress.progress },
            multiSignal: multiSignalResult.signals,
            progress: phaseProgress.progress,
            status: 'success'
        };
    }
    // No change - silent return
    return {
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
                'Usage: progress-cli.js [options]',
                '',
                'Options:',
                '  --clear-dir=<path>           Path to .clear directory (default: .clear)',
                '  --user-prompt=<text>         User prompt context for progress detection',
            ].join('\n')
        }));
        process.exit(0);
    }
    try {
        const options = parseArgs();
        const result = calculateProgress(options);
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
//# sourceMappingURL=progress-cli.js.map