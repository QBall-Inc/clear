"use strict";
/**
 * Plan Roll-up (WF-2a)
 *
 * Aggregates workpackage progress into plan progress.
 * Triggered by UserPromptSubmit hook when workpackage progress changes.
 *
 * Enhancement of existing P1.5 read-only pull model to push-on-change.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.2.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rollupPlanProgress = rollupPlanProgress;
exports.createPlanRollupHandler = createPlanRollupHandler;
exports.getUpcomingMilestones = getUpcomingMilestones;
const registry_1 = require("../plan/registry");
const writer_1 = require("../plan/writer");
const validation_1 = require("../validation");
const context_hub_1 = require("./context-hub");
const audit_log_1 = require("./audit-log");
// ==============================================================================
// PLAN ROLL-UP
// ==============================================================================
/**
 * Perform plan roll-up: aggregate workpackage progress into plan progress.
 *
 * Operations:
 * 1. Read workpackage completion status from registry
 * 2. Calculate phase progress: Σ(wp_weight × wp_progress) / Σ(wp_weight)
 * 3. Check milestone conditions
 * 4. If milestone achieved:
 *    - Mark milestone complete
 *    - Log audit entry
 *    - Return celebration message
 * 5. Update plan.json and sync-state.json
 *
 * @param input - Plan roll-up input
 * @returns Plan roll-up result
 */
async function rollupPlanProgress(input) {
    const { sessionId, sessionNumber, triggeredByWorkpackage } = input;
    const basePath = (0, validation_1.validateBasePath)(input.basePath);
    const timestamp = new Date().toISOString();
    try {
        // Initialize plan registry
        const clearDir = `${basePath}/.clear`;
        const planRegistry = new registry_1.PlanRegistryManager(clearDir);
        // Load plan
        const plan = planRegistry.loadPlan();
        if (!plan) {
            return {
                status: 'no_plan',
                phaseProgress: {},
                overallProgress: 0,
                milestonesAchieved: [],
                domainsUpdated: [],
                timestamp
            };
        }
        // Initialize audit logger
        const auditLogger = new audit_log_1.AuditLogger(basePath, sessionId, sessionNumber);
        // Track domains updated
        const domainsUpdated = [];
        // Calculate progress for all phases
        const phaseProgress = {};
        let totalPhaseWeight = 0;
        let weightedPhaseProgress = 0;
        for (const phase of plan.phases) {
            const result = planRegistry.calculatePhaseProgress(phase.id);
            phaseProgress[phase.id] = result.progress;
            // Weight each phase equally for overall progress (could be configurable)
            totalPhaseWeight += 1;
            weightedPhaseProgress += result.progress;
        }
        const overallProgress = totalPhaseWeight > 0
            ? weightedPhaseProgress / totalPhaseWeight
            : 0;
        // Check for milestone achievements
        const milestonesAchieved = [];
        const state = planRegistry.loadState();
        for (const milestone of plan.milestones) {
            // Skip already completed milestones
            const milestoneState = state.milestones[milestone.id];
            if (milestoneState?.status === 'complete') {
                continue;
            }
            // Check milestone status
            const checkResult = planRegistry.checkMilestoneStatus(milestone.id);
            if (checkResult.status === 'complete') {
                // Milestone just achieved!
                const achievement = {
                    milestoneId: milestone.id,
                    milestoneName: milestone.name,
                    milestoneType: milestone.type,
                    phaseId: milestone.phase,
                    completedAt: timestamp
                };
                milestonesAchieved.push(achievement);
                // Mark milestone complete
                planRegistry.markMilestoneComplete(milestone.id);
                // Log audit entry
                auditLogger.log({
                    domain: 'plan',
                    action: 'update',
                    trigger: 'auto_sync',
                    target: milestone.id,
                    targetDisplayId: milestone.name,
                    oldValue: 'in_progress',
                    newValue: 'complete',
                    metadata: {
                        event: 'milestone_complete',
                        milestoneType: milestone.type,
                        phaseId: milestone.phase,
                        triggeredByWorkpackage,
                        requirementsMet: checkResult.requirementsMet
                    }
                });
            }
        }
        // Update plan state with new progress
        state.phaseProgress = phaseProgress;
        state.lastActivity = timestamp;
        planRegistry.saveState(state);
        domainsUpdated.push('plan');
        // Fix 5: Write phase progress + derived status back to master-plan.yaml
        for (const phase of plan.phases) {
            const progress = phaseProgress[phase.id] ?? 0;
            phase.progress = progress;
            phase.status = derivePhaseStatus(progress, phase.status);
        }
        const writeResult = (0, writer_1.writeMasterPlan)(basePath, plan, { backup: true });
        if (writeResult.status === 'error') {
            console.error(`[plan-rollup] writeMasterPlan failed: ${writeResult.error}`);
        }
        // Update sync state
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        // Calculate active phase progress
        const activePhaseProgress = phaseProgress[state.activePhaseId] ?? 0;
        syncManager.updatePlanSummary({
            activePhaseSystemId: state.activePhaseSystemId ?? '',
            activePhaseDisplayId: state.activePhaseId,
            phaseProgress: activePhaseProgress,
            blockers: []
        });
        syncManager.save();
        domainsUpdated.push('sync');
        // Log roll-up completion
        auditLogger.log({
            domain: 'sync',
            action: 'create',
            trigger: 'auto_sync',
            target: `wf2a-rollup-${sessionNumber}`,
            metadata: {
                workflow: 'WF-2a',
                overallProgress,
                phasesUpdated: Object.keys(phaseProgress).length,
                milestonesAchieved: milestonesAchieved.map(m => m.milestoneId),
                triggeredByWorkpackage
            }
        });
        // Generate celebration message if milestone achieved
        let celebrationMessage;
        if (milestonesAchieved.length > 0) {
            celebrationMessage = generateCelebrationMessage(milestonesAchieved);
        }
        return {
            status: 'success',
            phaseProgress,
            overallProgress,
            milestonesAchieved,
            domainsUpdated,
            timestamp,
            celebrationMessage
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            status: 'error',
            phaseProgress: {},
            overallProgress: 0,
            milestonesAchieved: [],
            domainsUpdated: [],
            timestamp,
            error: `Plan roll-up failed: ${errorMessage}`
        };
    }
}
/**
 * Generate a celebration message for achieved milestones
 * @param achievements - List of milestone achievements
 * @returns Celebration message
 */
function generateCelebrationMessage(achievements) {
    if (achievements.length === 0) {
        return '';
    }
    if (achievements.length === 1) {
        const m = achievements[0];
        const prefix = m.milestoneType === 'major' ? 'MAJOR MILESTONE' : 'Milestone';
        return `${prefix} achieved: ${m.milestoneName}!`;
    }
    const majorCount = achievements.filter(m => m.milestoneType === 'major').length;
    const minorCount = achievements.length - majorCount;
    const parts = [];
    if (majorCount > 0) {
        parts.push(`${majorCount} major milestone${majorCount > 1 ? 's' : ''}`);
    }
    if (minorCount > 0) {
        parts.push(`${minorCount} minor milestone${minorCount > 1 ? 's' : ''}`);
    }
    return `Milestones achieved: ${parts.join(' and ')}! (${achievements.map(m => m.milestoneName).join(', ')})`;
}
// ==============================================================================
// STATUS DERIVATION
// ==============================================================================
/**
 * Derive phase status from calculated progress.
 * Preserves manually-set statuses (blocked, deferred) that should not be
 * overridden by progress-based derivation.
 *
 * @param progress - Calculated progress (0-1)
 * @param currentStatus - Current phase status
 * @returns Derived phase status
 */
function derivePhaseStatus(progress, currentStatus) {
    // Don't override manually-set statuses
    if (currentStatus === 'blocked' || currentStatus === 'deferred') {
        return currentStatus;
    }
    if (progress >= 1) {
        return 'complete';
    }
    if (progress > 0) {
        return 'in_progress';
    }
    return 'not_started';
}
// ==============================================================================
// CONVENIENCE FUNCTIONS
// ==============================================================================
/**
 * Create a plan roll-up handler for use with hooks
 * @param basePath - Project root directory
 * @returns Function that performs plan roll-up
 */
function createPlanRollupHandler(basePath) {
    return async (sessionId, sessionNumber, triggeredByWorkpackage) => {
        return rollupPlanProgress({
            basePath,
            sessionId,
            sessionNumber,
            triggeredByWorkpackage
        });
    };
}
/**
 * Quick check if any milestones are close to completion
 * @param basePath - Project root directory
 * @returns List of milestones that are close (>80% requirements met)
 */
function getUpcomingMilestones(basePath) {
    try {
        const clearDir = `${basePath}/.clear`;
        const planRegistry = new registry_1.PlanRegistryManager(clearDir);
        const plan = planRegistry.loadPlan();
        if (!plan) {
            return [];
        }
        const upcoming = [];
        const state = planRegistry.loadState();
        for (const milestone of plan.milestones) {
            // Skip completed milestones
            if (state.milestones[milestone.id]?.status === 'complete') {
                continue;
            }
            const checkResult = planRegistry.checkMilestoneStatus(milestone.id);
            const totalReqs = checkResult.requirementsMet.length + checkResult.requirementsPending.length;
            const percentComplete = totalReqs > 0
                ? checkResult.requirementsMet.length / totalReqs
                : 0;
            // Include if >80% complete
            if (percentComplete >= 0.8 && checkResult.requirementsPending.length > 0) {
                upcoming.push({
                    milestoneId: milestone.id,
                    milestoneName: milestone.name,
                    percentComplete,
                    remainingRequirements: checkResult.requirementsPending
                });
            }
        }
        return upcoming;
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=plan-rollup.js.map