/**
 * Plan Registry Manager
 *
 * Manages plan loading, multi-signal progress tracking, milestone detection,
 * and blocker identification.
 */
import { MasterPlan, Phase, Milestone, PlanState, Blocker, PhaseProgressResult, MilestoneCheckResult, MultiSignalResult, ProgressWeights, RiskThresholds } from './types';
export declare class PlanRegistryError extends Error {
    readonly planId?: string | undefined;
    readonly details?: Record<string, unknown> | undefined;
    constructor(message: string, planId?: string | undefined, details?: Record<string, unknown> | undefined);
}
/**
 * Plan Registry Manager
 *
 * Updated Session 34 with Dual-ID Architecture support (P1.6):
 * - Phases can be referenced by displayId (Phase-1) or systemId (ph-a1b2c3d4)
 * - SystemId is immutable and preferred for cross-domain references
 * - DisplayId is calculated from position for human readability
 */
export declare class PlanRegistryManager {
    private clearDir;
    private readonly projectRoot;
    private masterPlan;
    private progressWeights;
    private riskThresholds;
    private phaseByDisplayId;
    private phaseBySystemId;
    constructor(clearDir: string, weights?: ProgressWeights, thresholds?: RiskThresholds);
    private get plansDir();
    private get masterPlanYamlPath();
    private get masterPlanMdPath();
    private get statePath();
    private get workpackageStatePath();
    /**
     * Load the master plan (parsed from YAML)
     * @returns Master plan or null if not found
     */
    loadPlan(): MasterPlan | null;
    /**
     * Build phase caches for dual-ID lookups (P1.6)
     */
    private buildPhaseCaches;
    /**
     * Load the plan summary (from master-plan.md)
     * @returns Summary text or empty string
     */
    loadPlanSummary(): string;
    /**
     * Load phase detail file on-demand
     * @param phaseId - Phase ID to load
     * @returns Phase detail content or null
     */
    loadPhaseDetail(phaseId: string): string | null;
    /**
     * Get a phase by ID (legacy display ID lookup)
     */
    getPhase(phaseId: string): Phase | null;
    /**
     * Get a phase by system ID
     * @param systemId - System ID (e.g., "ph-a1b2c3d4")
     * @returns Phase or null if not found
     */
    getPhaseBySystemId(systemId: string): Phase | null;
    /**
     * Resolve a phase by either system ID or display ID
     * Auto-detects the ID type and returns the phase
     * @param id - Either a systemId (ph-xxx) or displayId (Phase-N)
     * @returns Phase or null if not found
     */
    resolvePhase(id: string): Phase | null;
    /**
     * Get display ID for a system ID
     * @param systemId - System ID to look up
     * @returns Display ID or null if not found
     */
    getDisplayIdForSystemId(systemId: string): string | null;
    /**
     * Get system ID for a display ID
     * @param displayId - Display ID to look up
     * @returns System ID or null if not found
     */
    getSystemIdForDisplayId(displayId: string): string | null;
    /**
     * Check if all phases have system IDs (for migration detection)
     * @returns true if all phases have systemId
     */
    allPhasesHaveSystemIds(): boolean;
    /**
     * Get phases missing system IDs
     * @returns Array of phases without systemId
     */
    getPhasesMissingSystemIds(): Phase[];
    /**
     * Generate a migration system ID from a legacy display ID
     * Uses deterministic hash for consistent migration
     * @param displayId - Legacy display ID (e.g., "Phase-1")
     * @returns System ID (e.g., "ph-abc12345")
     */
    generateMigrationSystemId(displayId: string): string;
    /**
     * Get a milestone by ID
     */
    getMilestone(milestoneId: string): Milestone | null;
    /**
     * Get the active phase
     */
    getActivePhase(): Phase | null;
    /**
     * Load current state
     */
    loadState(): PlanState;
    /**
     * Save state
     */
    saveState(state: PlanState): void;
    /**
     * Initialize or update state from plan
     *
     * Dual-ID Architecture (P1.6):
     * - Stores both activePhaseId (display ID) and activePhaseSystemId
     * - SystemId is preferred for cross-domain references
     */
    initializeState(sessionId: string): PlanState;
    /**
     * Get workpackage progress from P1.4 state
     * @returns Map of workpackage ID to progress (0-1)
     *
     * Data sources (in priority order):
     * 1. workpackage.json - active workpackage's current progress
     * 2. registry.yaml - historical completion status (complete/in_progress/not_started)
     *
     * Note: Both sources are read independently. registry.yaml is the authoritative
     * source for completion status, while workpackage.json provides real-time progress.
     */
    getWorkpackageProgress(): Record<string, number>;
    /**
     * Calculate phase progress from workpackage weights
     * @param phaseId - Phase ID
     * @returns Phase progress result
     */
    calculatePhaseProgress(phaseId: string): PhaseProgressResult;
    /**
     * Get commit activity since phase start
     * @returns Normalized activity score (0-1)
     */
    getCommitActivity(): number;
    /**
     * Get test status from npm test result
     * @returns Normalized test score (0-1)
     */
    getTestStatus(): number;
    /**
     * Get documentation coverage
     * @returns Normalized docs score (0-1)
     */
    getDocsCoverage(): number;
    /**
     * Get integration status
     * @returns Normalized integration score (0-1)
     */
    getIntegrationStatus(): number;
    /**
     * Calculate multi-signal progress
     * @returns Multi-signal result with weighted progress
     */
    calculateMultiSignalProgress(): MultiSignalResult;
    /**
     * Check milestone status
     * @param milestoneId - Milestone ID
     * @returns Milestone check result
     */
    checkMilestoneStatus(milestoneId: string): MilestoneCheckResult;
    /**
     * Mark a milestone as complete
     * @param milestoneId - Milestone ID
     */
    markMilestoneComplete(milestoneId: string): void;
    /**
     * Get milestone risk assessment
     * @param milestoneId - Milestone ID
     * @returns Risk data
     */
    getMilestoneRisk(milestoneId: string): {
        timeConsumed: number;
        progress: number;
    };
    /**
     * Detect blockers for a phase
     * @param phaseId - Phase ID (optional, defaults to active)
     * @returns List of blockers
     */
    detectBlockers(phaseId?: string): Blocker[];
    /**
     * Generate suggestions for resolving blockers
     * @param blockers - List of blockers
     * @returns Suggested actions
     */
    generateSuggestions(blockers: Blocker[]): string[];
    /**
     * Clear cached plan data
     */
    clearCache(): void;
}
//# sourceMappingURL=registry.d.ts.map