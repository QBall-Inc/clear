/**
 * Sync State Manager (WF-4)
 *
 * Central aggregation point for cross-domain state. Maintains the
 * sync-state.json file with summaries from all domains and
 * provides change detection for efficient sync operations.
 *
 * Note: Renamed from "SharedContextHub" to "SyncStateManager" to avoid
 * collision with src/infrastructure/context/manager.ts (hook contributions).
 * The SyncStateManager aggregates data FROM the context manager plus
 * workpackage.json, plan.json, knowledge DB, etc.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.6.
 */
import { SyncState, SessionSummary, WorkpackageSummary, PlanSummary, KnowledgeSummary, CrossDomainLinks, StateHashes, ChangeDetectionResult, SyncConfig, KnowledgeLink } from './types';
/**
 * SyncStateManager handles the sync state hub for cross-domain sync.
 *
 * Responsibilities:
 * - Read/write sync-state.json
 * - Aggregate state from all domains
 * - Change detection (checksums + mtime)
 * - Update individual domain summaries
 *
 * Note: This is separate from ContextManager (hook contributions).
 * SyncStateManager aggregates data FROM ContextManager plus other sources.
 */
export declare class SyncStateManager {
    private basePath;
    private state;
    private config;
    private dirty;
    /**
     * Create a new SyncStateManager
     * @param basePath - Project root directory
     * @param config - Sync configuration
     */
    constructor(basePath: string, config?: Partial<SyncConfig>);
    /**
     * Get the full path to the sync state file
     */
    private getSyncStatePath;
    /**
     * Get the full path to a state file
     */
    private getStatePath;
    /**
     * Ensure the state directory exists
     */
    private ensureStateDir;
    /**
     * Load sync state from file
     * @returns True if loaded successfully, false if using defaults
     */
    load(): boolean;
    /**
     * Save sync state to file
     * @returns True if saved successfully
     */
    save(): boolean;
    /**
     * Check if there are unsaved changes
     */
    isDirty(): boolean;
    /**
     * Calculate SHA-256 hash of a file's contents
     * @param filePath - Path to file
     * @returns Hash string or empty string if file doesn't exist
     */
    private calculateFileHash;
    /**
     * Calculate hashes for all domain state files
     * @returns StateHashes object with current hashes
     */
    calculateStateHashes(): StateHashes;
    /**
     * Detect changes across all domains
     * @returns ChangeDetectionResult with details about changes
     */
    detectChanges(): ChangeDetectionResult;
    /**
     * Get file modification time
     * @param filePath - Path to file
     * @returns Modification time in milliseconds, or 0 if file doesn't exist
     */
    private getFileMtime;
    /**
     * Check if sync is needed based on configuration
     * @returns True if sync should be performed
     */
    shouldSync(): boolean;
    /**
     * Get the current sync state
     */
    getState(): SyncState;
    /**
     * Get session summary
     */
    getSessionSummary(): SessionSummary;
    /**
     * Get workpackage summary
     */
    getWorkpackageSummary(): WorkpackageSummary;
    /**
     * Get plan summary
     */
    getPlanSummary(): PlanSummary;
    /**
     * Get knowledge summary
     */
    getKnowledgeSummary(): KnowledgeSummary;
    /**
     * Get cross-domain links
     */
    getLinks(): CrossDomainLinks;
    /**
     * Get prompts since last sync
     */
    getPromptsSinceSync(): number;
    /**
     * Update session summary
     * @param session - New session summary
     */
    updateSessionSummary(session: Partial<SessionSummary>): void;
    /**
     * Update workpackage summary
     * @param workpackage - New workpackage summary
     */
    updateWorkpackageSummary(workpackage: Partial<WorkpackageSummary>): void;
    /**
     * Update plan summary
     * @param plan - New plan summary
     */
    updatePlanSummary(plan: Partial<PlanSummary>): void;
    /**
     * Update knowledge summary
     * @param knowledge - New knowledge summary
     */
    updateKnowledgeSummary(knowledge: Partial<KnowledgeSummary>): void;
    /**
     * Add a knowledge link
     * @param workpackageId - Workpackage systemId
     * @param link - Knowledge link to add
     */
    addKnowledgeLink(workpackageId: string, link: KnowledgeLink): void;
    /**
     * Remove a knowledge link
     * @param workpackageId - Workpackage systemId
     * @param knowledgeId - Knowledge entry ID to remove
     */
    removeKnowledgeLink(workpackageId: string, knowledgeId: string): void;
    /**
     * Update a knowledge link status
     * @param workpackageId - Workpackage systemId
     * @param knowledgeId - Knowledge entry ID
     * @param status - New status
     */
    updateKnowledgeLinkStatus(workpackageId: string, knowledgeId: string, status: KnowledgeLink['status']): void;
    /**
     * Get all knowledge links for a workpackage
     * @param workpackageId - Workpackage systemId
     * @returns Array of knowledge links
     */
    getKnowledgeLinksForWorkpackage(workpackageId: string): KnowledgeLink[];
    /**
     * Update state hashes after sync
     * @param hashes - New state hashes
     */
    updateStateHashes(hashes: StateHashes): void;
    /**
     * Record a full sync
     */
    recordFullSync(): void;
    /**
     * Increment prompts since sync counter
     */
    incrementPromptCounter(): void;
    /**
     * Add a deprecated reference warning
     * @param knowledgeId - Knowledge entry ID that has deprecated reference
     */
    addDeprecatedReference(knowledgeId: string): void;
    /**
     * Remove a deprecated reference warning
     * @param knowledgeId - Knowledge entry ID
     */
    removeDeprecatedReference(knowledgeId: string): void;
    /**
     * Add a recent knowledge entry
     * @param knowledgeId - Knowledge entry ID
     * @param maxRecent - Maximum recent entries to keep (default 10)
     */
    addRecentKnowledgeEntry(knowledgeId: string, maxRecent?: number): void;
    /**
     * Validate sync state integrity
     * @returns Array of validation error messages (empty if valid)
     */
    validate(): string[];
    /**
     * Reset sync state to defaults
     */
    reset(): void;
    /**
     * Clear all knowledge links
     */
    clearKnowledgeLinks(): void;
    /**
     * Clear deprecated references
     */
    clearDeprecatedReferences(): void;
}
/**
 * Create a SyncStateManager instance
 * @param basePath - Project root directory
 * @param config - Optional sync configuration
 * @returns SyncStateManager instance
 */
export declare function createSyncStateManager(basePath: string, config?: Partial<SyncConfig>): SyncStateManager;
//# sourceMappingURL=context-hub.d.ts.map