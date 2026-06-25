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
import { PlanRegistryManager } from '../plan/registry';
import { Blocker, MasterPlan, PlanState } from '../plan/types';
import { AuditDomain } from './types';
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
export declare function formatBlockerForSyncState(blocker: Blocker): string;
/**
 * Input for plan roll-up operation
 */
export interface PlanRollupInput {
    /** Project root directory */
    basePath: string;
    /** Current Claude Code session GUID */
    sessionId: string;
    /** Current CLEAR session number */
    sessionNumber: number;
    /** Workpackage that triggered the roll-up (optional) */
    triggeredByWorkpackage?: string;
}
/**
 * Status of plan roll-up operation
 */
export type PlanRollupStatus = 'success' | 'error' | 'no_plan';
/**
 * Milestone achievement detected during roll-up
 */
export interface MilestoneAchievement {
    /** Milestone ID */
    milestoneId: string;
    /** Milestone name */
    milestoneName: string;
    /** Milestone type (major/minor/gate) */
    milestoneType: 'major' | 'minor' | 'gate';
    /** Phase ID where milestone was achieved */
    phaseId: string;
    /** Completion timestamp */
    completedAt: string;
}
/**
 * Result of plan roll-up operation
 */
export interface PlanRollupResult {
    /** Operation status */
    status: PlanRollupStatus;
    /** Updated phase progress (phaseId -> progress 0-100 percentage) */
    phaseProgress: Record<string, number>;
    /** Overall plan progress (0-100 percentage) */
    overallProgress: number;
    /** Milestones achieved during this roll-up */
    milestonesAchieved: MilestoneAchievement[];
    /** Domains that were updated */
    domainsUpdated: AuditDomain[];
    /** Operation timestamp */
    timestamp: string;
    /** Celebration message (if milestone achieved) */
    celebrationMessage?: string;
    /** Error message (if status is 'error') */
    error?: string;
}
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
export declare function rollupPlanProgress(input: PlanRollupInput): Promise<PlanRollupResult>;
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
export declare function writePhaseProgressLockstep(planRegistry: PlanRegistryManager, plan: MasterPlan, state: PlanState, basePath: string, options?: {
    backup?: boolean;
}): void;
/**
 * Create a plan roll-up handler for use with hooks
 * @param basePath - Project root directory
 * @returns Function that performs plan roll-up
 */
export declare function createPlanRollupHandler(basePath: string): (sessionId: string, sessionNumber: number, triggeredByWorkpackage?: string) => Promise<PlanRollupResult>;
/**
 * Quick check if any milestones are close to completion
 * @param basePath - Project root directory
 * @returns List of milestones that are close (>80% requirements met)
 */
export declare function getUpcomingMilestones(basePath: string): Array<{
    milestoneId: string;
    milestoneName: string;
    percentComplete: number;
    remainingRequirements: string[];
}>;
//# sourceMappingURL=plan-rollup.d.ts.map