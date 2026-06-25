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
const validation_1 = require("../../validation");
const plan_rollup_1 = require("../../sync/plan-rollup");
/**
 * Parse command line arguments
 */
function parseArgs() {
    return (0, parse_args_1.parseCliArgs)({ clearDir: './.clear' }, [
        { prefix: '--user-prompt=', apply: (v, o) => { o.userPrompt = v; } }
    ]);
}
/**
 * Format progress change message
 */
function formatProgressChange(phaseId, oldProgress, newProgress, multiSignal) {
    const lines = [];
    // Phase progress change (inputs are 0-100 per the calculateProgress contract)
    const oldPct = Math.round(oldProgress);
    const newPct = Math.round(newProgress);
    if (oldPct !== newPct) {
        lines.push(`[Plan Progress] ${phaseId}: ${oldPct}% → ${newPct}%`);
    }
    // Multi-signal breakdown — all signals are 0-100 percentage
    const wpPct = Math.round(multiSignal.workpackages);
    const commitPct = Math.round(multiSignal.commits);
    const testPct = Math.round(multiSignal.tests);
    lines.push(`Multi-signal: WP ${wpPct}% | Commits ${commitPct}% | Tests ${testPct}%`);
    return lines.join('\n');
}
/**
 * Format milestone completion message. phaseProgress is 0-100 percentage.
 */
function formatMilestoneComplete(milestoneName, phaseProgress) {
    return `🎉 [Plan] Milestone '${milestoneName}' complete!\nPhase: ${Math.round(phaseProgress)}% complete`;
}
/**
 * Main progress operation
 */
function calculateProgress(options) {
    const { projectRoot, clearSubdir } = (0, validation_1.resolveClearDir)(options.clearDir);
    const registry = new registry_1.PlanRegistryManager(clearSubdir);
    // Load plan
    const plan = registry.loadPlan();
    if (!plan) {
        const text = 'No plan found';
        return {
            success: false,
            message: text,
            additionalContext: text,
            progress: 0,
            status: 'error',
            error: text
        };
    }
    // Resolve plan.activePhase to its canonical display ID once at entry so
    // every downstream state-key read/write + output label uses the canonical
    // form even when activePhase is in legacy snake_case ("phase_5" via plan
    // import / hand-edit / plan-write-cli rewrite). Falls through to the raw
    // string when the phase doesn't resolve at all — the not-found case still
    // returns 0% via calculatePhaseProgress, and using the raw label in output
    // preserves diagnostic value (operator sees what's in their plan file).
    const canonicalActivePhase = registry.resolvePhase(plan.activePhase)?.id ?? plan.activePhase;
    // Load current state
    let state = registry.loadState();
    const oldProgress = state.phaseProgress[canonicalActivePhase] ?? 0;
    // Calculate multi-signal progress
    const multiSignalResult = registry.calculateMultiSignalProgress();
    const phaseProgress = registry.calculatePhaseProgress(canonicalActivePhase);
    // Check for newly completed milestones
    let milestoneComplete;
    for (const milestone of plan.milestones) {
        if (milestone.phase !== canonicalActivePhase)
            continue;
        const existingState = state.milestones[milestone.id];
        if (existingState?.status === 'complete')
            continue;
        const check = registry.checkMilestoneStatus(milestone.id);
        if (check.status === 'complete') {
            registry.setMilestoneStatus(milestone.id, 'complete');
            milestoneComplete = milestone.name;
            break; // Only report one milestone per call
        }
    }
    // Re-read state if a milestone was just persisted by setMilestoneStatus inside
    // the loop: that lockstep writer does its own loadState/saveState, so our
    // pre-loop snapshot predates it and would clobber the milestone status out of
    // plan.json on the save below (leaving master-plan.yaml ahead — INV-2 drift).
    if (milestoneComplete) {
        state = registry.loadState();
    }
    // Update state — canonical key only, no orphan legacy entries.
    state.phaseProgress[canonicalActivePhase] = phaseProgress.progress;
    state.multiSignalData = multiSignalResult.signals;
    state.lastActivity = new Date().toISOString();
    // Lockstep: persist plan.json AND mirror phaseProgress into master-plan.yaml
    // so the two never diverge (this path previously wrote plan.json only).
    (0, plan_rollup_1.writePhaseProgressLockstep)(registry, plan, state, projectRoot);
    // Determine if we should output context (values are 0-100 per the
    // calculateProgress contract; round-equality is the unit-correct check).
    const progressChanged = Math.round(oldProgress) !== Math.round(phaseProgress.progress);
    if (milestoneComplete) {
        const text = formatMilestoneComplete(milestoneComplete, phaseProgress.progress);
        return {
            success: true,
            message: text,
            additionalContext: text,
            milestoneComplete,
            phaseProgress: { [canonicalActivePhase]: phaseProgress.progress },
            multiSignal: multiSignalResult.signals,
            progress: phaseProgress.progress,
            status: 'success'
        };
    }
    if (progressChanged) {
        const text = formatProgressChange(canonicalActivePhase, oldProgress, phaseProgress.progress, multiSignalResult.signals);
        return {
            success: true,
            message: text,
            additionalContext: text,
            phaseProgress: { [canonicalActivePhase]: phaseProgress.progress },
            multiSignal: multiSignalResult.signals,
            progress: phaseProgress.progress,
            status: 'success'
        };
    }
    // No change - silent return (no text payload to surface)
    return {
        success: true,
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
            success: false,
            message: errorMessage,
            additionalContext: errorMessage,
            progress: 0,
            status: 'error',
            error: errorMessage
        };
        console.log(JSON.stringify(result));
    }
}
//# sourceMappingURL=progress-cli.js.map