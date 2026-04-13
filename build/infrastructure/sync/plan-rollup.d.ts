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
import { AuditDomain } from './types';
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
    /** Updated phase progress (phaseId -> progress 0-1) */
    phaseProgress: Record<string, number>;
    /** Overall plan progress (0-1) */
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