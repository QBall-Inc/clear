/**
 * Plan Management Type Definitions
 *
 * Types for plan entries, phases, milestones, and progress tracking.
 * Based on P1.5 Feature Brief Section 5.2.
 */
/**
 * Phase status
 * Note: 'deferred' added for P1.6 plan scope changes
 */
export type PhaseStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked' | 'deferred';
/**
 * Milestone status
 */
export type MilestoneStatus = 'not_started' | 'in_progress' | 'complete' | 'at_risk';
/**
 * Milestone type: major (blocks phase) or minor (informational)
 */
export type MilestoneType = 'major' | 'minor' | 'gate';
/**
 * Blocker type categories
 */
export type BlockerType = 'dependency' | 'milestone_risk' | 'resource' | 'decision';
/**
 * Blocker severity levels
 */
export type BlockerSeverity = 'critical' | 'high' | 'medium' | 'low';
/**
 * Phase definition in master-plan.yaml
 *
 * Dual-ID Architecture:
 * - systemId: Immutable identifier for cross-domain references
 * - id: Stable display ID (e.g., "Phase-1"), minted at creation and preserved
 *   across add/delete — NOT recomputed from position
 * - position: Order within plan (1-based), reindexed on add/delete for display order
 *
 * `id` is a stable identifier, independent of `position`. Adding or deleting a
 * phase reindexes positions but leaves every surviving phase's display ID intact.
 */
export interface Phase {
    /** Stable display ID (e.g., "Phase-1") — minted at creation, preserved across add/delete (not recomputed from position) */
    id: string;
    /** Immutable system ID (e.g., "ph-a1b2c3d4") - used for cross-domain references */
    systemId?: string;
    /** Position within plan (1-based), determines display order */
    position?: number;
    name: string;
    status: PhaseStatus;
    /** Calculated progress (0-100 percentage), persisted for YAML round-trip fidelity */
    progress?: number;
    workpackages: string[];
    weights: Record<string, number>;
    dependencies?: string[];
    detailFile?: string;
}
/**
 * Milestone definition in master-plan.yaml
 */
export interface Milestone {
    id: string;
    name: string;
    phase: string;
    type: MilestoneType;
    requires: string[];
    status: MilestoneStatus;
    targetDate?: string;
    completedAt?: string;
}
/**
 * Master plan structure (parsed from master-plan.yaml)
 */
export interface MasterPlan {
    version: string;
    projectName: string;
    status: string;
    activePhase: string;
    activeWorkpackage: string;
    phases: Phase[];
    milestones: Milestone[];
}
/**
 * Multi-signal progress data. All signals are 0-100 percentage so the weighted
 * sum in calculateMultiSignalProgress is unit-coherent.
 *
 * Intentionally session-agnostic: do NOT add a session-count / session-identity
 * signal here. Plan progress is a function of work completed, not of how many
 * sessions it took — "the plan didn't count the session" is correct by design.
 * Session identity lives in the session state surfaces (session.json /
 * sync-state.session), not in plan progress.
 */
export interface MultiSignalData {
    /** Workpackage progress signal (0-100 percentage) */
    workpackages: number;
    /** Commit activity signal (0-100 percentage) */
    commits: number;
    /** Test status signal (0-100 percentage) */
    tests: number;
    /** Documentation coverage signal (0-100 percentage) */
    docs: number;
    /** Integration status signal (0-100 percentage) */
    integration: number;
}
/**
 * Default multi-signal data
 */
export declare const DEFAULT_MULTI_SIGNAL_DATA: MultiSignalData;
/**
 * Milestone state entry
 */
export interface MilestoneStateEntry {
    status: MilestoneStatus;
    completedAt?: string;
}
/**
 * Plan state (stored in .clear/state/plan.json)
 *
 * Dual-ID Architecture (P1.6):
 * - activePhaseId: Legacy display ID for backward compatibility
 * - activePhaseSystemId: Preferred systemId for cross-domain references
 */
export interface PlanState {
    activePlanId: string;
    /** Legacy display ID of active phase (e.g., "Phase-1") */
    activePhaseId: string;
    /** System ID of active phase (e.g., "ph-a1b2c3d4") - preferred for cross-domain refs */
    activePhaseSystemId?: string | null;
    startedAt: string;
    lastActivity: string;
    phaseProgress: Record<string, number>;
    milestones: Record<string, MilestoneStateEntry>;
    multiSignalData: MultiSignalData;
    blockers: Blocker[];
    sessionId: string;
}
/**
 * Create a fresh default plan state with current timestamps.
 * Replaces the old const to avoid stale `new Date()` evaluated at module load.
 */
export declare function createDefaultPlanState(): PlanState;
/** @deprecated Use createDefaultPlanState() for fresh timestamps */
export declare const DEFAULT_PLAN_STATE: PlanState;
/**
 * Blocker entry
 */
export interface Blocker {
    type: BlockerType;
    blocking?: string;
    blocked?: string;
    milestone?: string;
    /** Fraction of milestone timeline consumed (0-100 percentage) */
    timeConsumed?: number;
    /** Average progress across milestone requirements (0-100 percentage) */
    progress?: number;
    severity: BlockerSeverity;
    description?: string;
}
/**
 * Progress weight configuration
 */
export interface ProgressWeights {
    workpackages: number;
    commits: number;
    tests: number;
    documentation: number;
    integration: number;
}
/**
 * Default progress weights (from plan-defaults.yaml)
 */
export declare const DEFAULT_PROGRESS_WEIGHTS: ProgressWeights;
/**
 * Milestone risk thresholds (0-100 percentage)
 */
export interface RiskThresholds {
    /** Major milestone red-flag threshold (0-100 percentage of timeline consumed) */
    majorRed: number;
    /** Major milestone yellow-flag threshold (0-100 percentage of timeline consumed) */
    majorYellow: number;
    /** Minor milestone yellow-flag threshold (0-100 percentage of timeline consumed) */
    minorYellow: number;
}
/**
 * Default risk thresholds (0-100 percentage)
 */
export declare const DEFAULT_RISK_THRESHOLDS: RiskThresholds;
/**
 * Plan configuration
 */
export interface PlanConfig {
    plan: {
        location: string;
        changeLog: string;
        autoLoad: boolean;
        validateOnLoad: boolean;
    };
    milestones: {
        riskThresholds: RiskThresholds;
        trackSuccessCriteria: boolean;
        requireCriteriaForCompletion: boolean;
    };
    progress: {
        weights: ProgressWeights;
        updateFrequency: 'on_change' | 'always';
        confidenceThreshold: number;
    };
    blockers: {
        autoDetection: boolean;
        suggestWorkarounds: boolean;
        trackResolutionTime: boolean;
    };
}
/**
 * Default plan configuration
 */
export declare const DEFAULT_PLAN_CONFIG: PlanConfig;
/**
 * Load CLI input (from stdin via bash wrapper)
 */
export interface LoadInput {
    cwd: string;
    session_id?: string;
}
/**
 * Load CLI output.
 *
 * Dual-mode envelope: `additionalContext` is the Claude Code hook spec
 * (consumed by plan-load.sh which pipes CLI stdout verbatim into the
 * SessionStart hook envelope); `message` is the canonical CLI shape (read
 * by skill jq queries). Both carry identical human-readable text so a
 * single CLI invocation serves both surfaces without translation.
 */
export interface LoadOutput {
    success?: boolean;
    message?: string;
    additionalContext?: string;
    planId?: string;
    activePhase?: string;
    activeWorkpackage?: string;
    progress: number;
    status: 'success' | 'no_plan' | 'error';
    error?: string;
}
/**
 * Progress CLI input (from stdin via bash wrapper)
 */
export interface ProgressInput {
    cwd: string;
    user_prompt?: string;
}
/**
 * Progress CLI output. Dual envelope per LoadOutput docstring.
 */
export interface ProgressOutput {
    success?: boolean;
    message?: string;
    additionalContext?: string;
    phaseProgress?: Record<string, number>;
    multiSignal?: MultiSignalData;
    milestoneComplete?: string;
    progress: number;
    status: 'success' | 'error';
    error?: string;
}
/**
 * Blockers CLI input (from stdin via bash wrapper)
 */
export interface BlockersInput {
    cwd: string;
    phase_id?: string;
}
/**
 * Blockers CLI output. Dual envelope per LoadOutput docstring.
 */
export interface BlockersOutput {
    success?: boolean;
    message?: string;
    additionalContext?: string;
    blockers: Blocker[];
    suggestions?: string[];
    status: 'blockers_found' | 'clear' | 'error';
    error?: string;
}
/**
 * Phase progress calculation result
 */
export interface PhaseProgressResult {
    phaseId: string;
    /** Aggregate phase progress (0-100 percentage) — weighted average across the phase's workpackages */
    progress: number;
    completedWorkpackages: string[];
    pendingWorkpackages: string[];
    totalWeight: number;
    completedWeight: number;
}
/**
 * Milestone check result
 */
export interface MilestoneCheckResult {
    milestoneId: string;
    status: MilestoneStatus;
    requirementsMet: string[];
    requirementsPending: string[];
    atRisk: boolean;
    riskReason?: string;
}
/**
 * Multi-signal calculation result
 */
export interface MultiSignalResult {
    /** Weighted progress across all signals (0-100 percentage) */
    weightedProgress: number;
    signals: MultiSignalData;
    /** Confidence score 0-1 — fraction of signals that produced non-zero values */
    confidence: number;
}
export { generatePhaseSystemId, generateSystemIdFromLegacy, isPhaseSystemId } from '../sync/types';
/**
 * Check if a phase entry has dual-ID support
 * @param entry - Phase entry
 * @returns true if systemId is present
 */
export declare function hasDualIdSupport(entry: Phase): boolean;
/**
 * Get the preferred ID for cross-domain references
 * Returns systemId if available, otherwise falls back to legacy id
 * @param entry - Phase entry
 * @returns systemId or legacy id
 */
export declare function getPreferredId(entry: Phase): string;
/**
 * Check if a string looks like a legacy phase display ID (Phase-N format)
 * @param id - ID to check
 * @returns true if matches Phase-{n} pattern
 */
export declare function isLegacyPhaseDisplayId(id: string): boolean;
//# sourceMappingURL=types.d.ts.map