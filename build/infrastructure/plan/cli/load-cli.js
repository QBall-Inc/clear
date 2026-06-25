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
const audit_log_1 = require("../../sync/audit-log");
const validation_1 = require("../../validation");
const plan_rollup_1 = require("../../sync/plan-rollup");
/**
 * Parse command line arguments
 *
 * Session-id default resolves through `getCurrentSession` from the canonical
 * sync state (`<clearDir>/state/session.json`) rather than a synthetic
 * `session-${Date.now()}` value. Synthetic IDs corrupt audit-log correlation
 * across the session — every entry would get a fresh timestamp suffix.
 * Explicit `--session-id=` overrides still win via parseCliArgs.
 */
function parseArgs() {
    // parseCliArgs requires a sync default. Read clearDir from argv first so
    // session lookup targets the right directory; validateBasePath rejects
    // traversal-shaped paths before getCurrentSession touches the filesystem;
    // resolution falls back to the synthetic ID only when both argv override
    // and state file are absent.
    let clearDir = './.clear';
    for (const arg of process.argv.slice(2)) {
        if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.substring('--clear-dir='.length);
            break;
        }
    }
    const sessionDefault = (0, audit_log_1.getCurrentSession)((0, validation_1.resolveClearDir)((0, validation_1.validateBasePath)(clearDir)).clearSubdir).sessionId;
    return (0, parse_args_1.parseCliArgs)({ clearDir: './.clear', sessionId: sessionDefault }, [
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
    lines.push(`Phase: ${activePhase?.name ?? plan.activePhase} (${Math.round(progress)}% complete)`);
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
        const registry = new registry_1.PlanRegistryManager((0, validation_1.resolveClearDir)(parseArgs().clearDir).clearSubdir);
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
    const { projectRoot, clearSubdir } = (0, validation_1.resolveClearDir)(options.clearDir);
    const registry = new registry_1.PlanRegistryManager(clearSubdir);
    // Try to load the plan
    const plan = registry.loadPlan();
    if (!plan) {
        const text = '[Plan] No development plan found. Use /cf-init to create one.';
        return {
            success: false,
            message: text,
            additionalContext: text,
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
    }
    // Canonicalize plan.activePhase once activePhase is known. Covers three
    // cases: (a) getActivePhase succeeded with legacy snake_case input —
    // resolvePhase normalized it, write the canonical form back; (b) fallback
    // fired — store the canonical id from the resolved phase; (c) activePhase
    // unresolved entirely — plan.activePhase stays as-is for diagnostic value
    // (downstream calculatePhaseProgress returns 0% via resolvePhase fallback).
    if (activePhase) {
        plan.activePhase = activePhase.id;
    }
    // Calculate progress
    const phaseProgress = registry.calculatePhaseProgress(plan.activePhase);
    // Check milestones — milestone.phase compared against canonical activePhase
    // so legacy plan.activePhase doesn't cause silent zero-milestone results.
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
    // Update state with calculated progress — canonical key, no legacy orphans.
    const state = registry.loadState();
    state.phaseProgress[plan.activePhase] = phaseProgress.progress;
    state.lastActivity = new Date().toISOString();
    // Lockstep: persist plan.json AND mirror phaseProgress into master-plan.yaml
    // so the two never diverge (this path previously wrote plan.json only).
    (0, plan_rollup_1.writePhaseProgressLockstep)(registry, plan, state, projectRoot);
    const text = formatPlanContext(plan, activePhase, phaseProgress.progress, milestonesComplete, milestonesAtRisk);
    return {
        success: true,
        message: text,
        additionalContext: text,
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
//# sourceMappingURL=load-cli.js.map