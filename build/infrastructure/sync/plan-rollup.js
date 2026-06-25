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
exports.formatBlockerForSyncState = formatBlockerForSyncState;
exports.rollupPlanProgress = rollupPlanProgress;
exports.writePhaseProgressLockstep = writePhaseProgressLockstep;
exports.createPlanRollupHandler = createPlanRollupHandler;
exports.getUpcomingMilestones = getUpcomingMilestones;
const registry_1 = require("../plan/registry");
const writer_1 = require("../plan/writer");
const validation_1 = require("../validation");
const context_hub_1 = require("./context-hub");
const audit_log_1 = require("./audit-log");
/**
 * WP-DF3 AC5 (S167 G8 fix): convert a persisted Blocker (from plan.json) into
 * a human-readable string for sync-state.plan.blockers. Sync-state carries the
 * lighter `string[]` shape; plan.json owns the structured form. Prefers the
 * blocker's own `description` (trimmed) if set; otherwise builds a fallback
 * from type + blocking/blocked/milestone identifiers.
 *
 * Exported so the reconcile-plan Check 3 session-start safety net in
 * sync-bridge-cli.ts can use the same conversion. Eliminates the trim/no-trim
 * divergence flagged by Stage 3a STD-001 + LINT-03 cross-role dup.
 */
function formatBlockerForSyncState(blocker) {
    const desc = blocker.description?.trim();
    if (desc) {
        return desc;
    }
    const subject = blocker.blocking || blocker.blocked || blocker.milestone || 'unspecified';
    return `${blocker.type}: ${subject}`;
}
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
        // Math.round to integer 0-100 — symmetric with calculatePhaseProgress and the
        // WP-level calculateProgress. Every persisted progress field is integer.
        const overallProgress = totalPhaseWeight > 0
            ? Math.round(weightedPhaseProgress / totalPhaseWeight)
            : 0;
        // Check for milestone achievements
        const milestonesAchieved = [];
        let state = planRegistry.loadState();
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
        // Re-read plan state before the final write: the milestone loop above
        // persists each achievement through setMilestoneStatus (its own
        // loadState/saveState), so our pre-loop `state` snapshot predates those
        // writes and saving it as-is would clobber the milestone statuses out of
        // plan.json (leaving master-plan.yaml ahead — an INV-2 divergence).
        state = planRegistry.loadState();
        // Update plan state with new progress
        state.phaseProgress = phaseProgress;
        // Recompute the multi-signal projection alongside phaseProgress so the
        // workpackages signal stays coherent with the phase it summarizes. Without
        // this, a lifecycle change advances phaseProgress but leaves
        // multiSignalData.workpackages stale (the dashboard then shows a non-zero
        // phase percentage next to "0 workpackages done"). Reuses the same
        // calculateMultiSignalProgress() the progress CLI uses — one computation,
        // both write paths converge.
        state.multiSignalData = planRegistry.calculateMultiSignalProgress().signals;
        state.lastActivity = timestamp;
        // Single-writer lockstep: persist phaseProgress to plan.json AND mirror it
        // into master-plan.yaml phases[].progress + derived status in one operation,
        // so the two surfaces never diverge.
        writePhaseProgressLockstep(planRegistry, plan, state, basePath, { backup: true });
        domainsUpdated.push('plan');
        // Update sync state
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        // Calculate active phase progress
        const activePhaseProgress = phaseProgress[state.activePhaseId] ?? 0;
        // WP-DF3 AC5 (S167 G8 fix): mirror blockers from plan.json (state.blockers,
        // structured Blocker[]) into sync-state.plan.blockers (string[]).
        // Previously hardcoded `[]`, which left /cf-status + downstream consumers
        // showing 0 blockers regardless of detected dependencies. blockers-cli is
        // the producer; plan-rollup is the propagation point because it already
        // fires on every WP lifecycle change.
        syncManager.updatePlanSummary({
            activePhaseSystemId: state.activePhaseSystemId ?? '',
            activePhaseDisplayId: state.activePhaseId,
            phaseProgress: activePhaseProgress,
            planProgress: overallProgress,
            blockers: state.blockers.map(formatBlockerForSyncState),
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
// PHASE PROGRESS WRITE-BACK (LOCKSTEP)
// ==============================================================================
/**
 * Single-writer lockstep for phase progress — fans one already-decided
 * phaseProgress map out to BOTH persistence surfaces in one call.
 *
 * Persists `state.phaseProgress` to plan.json (saveState) AND mirrors it into
 * master-plan.yaml `phases[].progress` + derived `phases[].status`. Routing all
 * phaseProgress writers through this single function is what keeps the two
 * surfaces in step (the dashboard reads both — a plan.json-only write was the
 * source of the dual-surface progress split this fixes). NOTE: "in step" is a
 * single-writer guarantee, not crash-safety — saveState runs first, so if the
 * subsequent master-plan write fails it is logged (fire-and-log, below) and
 * plan.json is left ahead until the next write reconciles it.
 *
 * The CALLER owns the compute and any non-phaseProgress state. It writes the
 * (single) calculatePhaseProgress result onto `state.phaseProgress` — a full map
 * for the roll-up, a single active-phase key for the progress/load CLIs — and
 * sets any state fields IT is responsible for (lastActivity always; and
 * multiSignalData ONLY for callers that recompute it, i.e. the roll-up and the
 * progress CLI; the load path intentionally carries multiSignalData through
 * unchanged). This helper does NOT recompute progress and does NOT touch
 * multiSignalData.
 *
 * Master-plan phase progress is read back from `state.phaseProgress` (the single
 * source just persisted to plan.json). KEY INVARIANT: `state.phaseProgress` is
 * keyed by phase DISPLAY id — the same `phase.id` iterated here — NOT by
 * `phase.systemId`; a caller that keys it by systemId would silently zero every
 * phase. The `?? phase.progress ?? 0` fallback is intentional: a single-key
 * caller leaves phases absent from its update at their existing master-plan
 * value; a full-map caller (roll-up) populates every key so the fallback never
 * fires. plan.json is saved BEFORE master-plan (canonical projection last).
 *
 * @param planRegistry - plan registry manager (owns saveState)
 * @param plan - master plan object; `phases[].progress` + `.status` are MUTATED
 *   IN PLACE on the caller's object, then written
 * @param state - plan state, with `state.phaseProgress` already updated by the caller
 * @param basePath - PROJECT ROOT (writeMasterPlan joins `.clear/plans/master-plan.yaml`)
 * @param options.backup - back up master-plan.yaml before overwrite (default false)
 */
function writePhaseProgressLockstep(planRegistry, plan, state, basePath, options = {}) {
    // plan.json first.
    planRegistry.saveState(state);
    // master-plan.yaml: mirror phase progress + derived status from the SAME
    // state.phaseProgress map that was just persisted to plan.json.
    for (const phase of plan.phases) {
        const progress = state.phaseProgress[phase.id] ?? phase.progress ?? 0;
        phase.progress = progress;
        phase.status = derivePhaseStatus(progress, phase.status);
    }
    const writeResult = (0, writer_1.writeMasterPlan)(basePath, plan, { backup: options.backup ?? false });
    if (writeResult.status === 'error') {
        console.error(`[plan-rollup] writeMasterPlan failed: ${writeResult.error}`);
    }
}
// ==============================================================================
// STATUS DERIVATION
// ==============================================================================
/**
 * Derive phase status from calculated progress.
 * Preserves manually-set statuses (blocked, deferred) that should not be
 * overridden by progress-based derivation.
 *
 * @param progress - Calculated progress (0-100 percentage)
 * @param currentStatus - Current phase status
 * @returns Derived phase status
 */
function derivePhaseStatus(progress, currentStatus) {
    // Don't override manually-set statuses
    if (currentStatus === 'blocked' || currentStatus === 'deferred') {
        return currentStatus;
    }
    if (progress >= 100) {
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