/**
 * Workpackage Registry
 *
 * Manages workpackage loading, dependency resolution, and progress tracking.
 * Updated Session 33 with Dual-ID Architecture support (P1.6).
 */
import { WorkpackageEntry, WorkpackageRegistry, WorkpackageRegistryEntry, WorkpackageState, WorkpackageStatus, DependencyValidationResult, CircularDependencyResult, ProgressResult, ScopeValidationResult } from './types';
/**
 * Error thrown during registry operations
 */
export declare class WorkpackageRegistryError extends Error {
    readonly workpackageId?: string | undefined;
    readonly details?: Record<string, unknown> | undefined;
    constructor(message: string, workpackageId?: string | undefined, details?: Record<string, unknown> | undefined);
}
/**
 * Workpackage Registry Manager
 *
 * Dual-ID Architecture (P1.6): Supports both legacy display IDs and systemIds.
 * - Use getWorkpackage() for legacy id lookup (backward compatible)
 * - Use getWorkpackageBySystemId() for systemId lookup (preferred)
 * - Use resolveWorkpackage() to auto-detect ID type
 */
export declare class WorkpackageRegistryManager {
    private clearDir;
    private registry;
    /** Cache by legacy display ID */
    private workpackageCache;
    /** Cache by systemId (P1.6) */
    private systemIdCache;
    /** Map systemId → displayId for quick lookup */
    private systemIdToDisplayId;
    constructor(clearDir: string);
    /**
     * Get path to registry file
     */
    private get registryPath();
    /**
     * Get path to state file
     */
    private get statePath();
    /**
     * Load the registry
     */
    loadRegistry(): WorkpackageRegistry;
    /**
     * Get all workpackages from registry
     */
    getAllWorkpackages(): WorkpackageRegistryEntry[];
    /**
     * Get a workpackage by legacy display ID (loads full definition)
     * @param id - Legacy display ID (e.g., "P1.4")
     * @returns Workpackage entry or null
     */
    getWorkpackage(id: string): WorkpackageEntry | null;
    /**
     * Get a workpackage by systemId (P1.6 Dual-ID Architecture)
     * @param systemId - System ID (e.g., "wp-a1b2c3d4")
     * @returns Workpackage entry or null
     */
    getWorkpackageBySystemId(systemId: string): WorkpackageEntry | null;
    /**
     * Resolve a workpackage by either systemId or legacy display ID
     * Automatically detects which type of ID was provided
     * @param id - Either systemId (wp-*) or legacy display ID (P1.4)
     * @returns Workpackage entry or null
     */
    resolveWorkpackage(id: string): WorkpackageEntry | null;
    /**
     * Get the display ID for a systemId
     * @param systemId - System ID (e.g., "wp-a1b2c3d4")
     * @returns Display ID (e.g., "P1.4") or null if not found
     */
    getDisplayIdForSystemId(systemId: string): string | null;
    /**
     * Get the systemId for a display ID
     * @param displayId - Display ID (e.g., "P1.4")
     * @returns System ID or null if not found/not migrated
     */
    getSystemIdForDisplayId(displayId: string): string | null;
    /**
     * Get workpackage status from registry
     */
    getWorkpackageStatus(id: string): WorkpackageStatus | null;
    /**
     * Load current state
     */
    loadState(): WorkpackageState;
    /**
     * Save state
     */
    saveState(state: WorkpackageState): void;
    /**
     * Get active workpackage ID
     */
    getActiveWorkpackageId(): string | null;
    /**
     * Get active workpackage (full definition)
     */
    getActiveWorkpackage(): WorkpackageEntry | null;
    /**
     * Set active workpackage
     * @param id - Either systemId (wp-*) or legacy display ID (P1.4)
     * @param sessionId - Current session ID
     * @returns Updated workpackage state
     */
    setActiveWorkpackage(id: string, sessionId: string): WorkpackageState;
    /**
     * Validate dependencies for a workpackage
     * @param id - Workpackage ID
     * @returns Validation result
     */
    validateDependencies(id: string): DependencyValidationResult;
    /**
     * Detect circular dependencies using DFS
     * @param id - Starting workpackage ID
     * @returns Detection result with cycle path if found
     */
    detectCircularDependencies(id: string): CircularDependencyResult;
    /**
     * Get workpackages that are ready to start (not blocked)
     */
    getUnblockedWorkpackages(): WorkpackageRegistryEntry[];
    /**
     * Get alternative workpackages when blocked
     */
    getAlternatives(blockedId: string): string[];
    /**
     * Resolve dependencies in topological order
     * @param id - Workpackage ID
     * @returns Ordered list of dependency IDs (dependencies first)
     */
    resolveDependencyOrder(id: string): string[];
    /**
     * Calculate weighted progress for a workpackage
     * @param id - Workpackage ID
     * @returns Progress result
     */
    /** Weight multiplier for in_progress deliverables (50% contribution) */
    private static readonly IN_PROGRESS_WEIGHT_FACTOR;
    calculateProgress(id: string): ProgressResult;
    /**
     * Update a deliverable's status and recalculate progress.
     * Saves state twice: once to persist the status change, once with recalculated progress.
     * @param deliverableId - Deliverable ID
     * @param newState - New deliverable state to set
     * @returns Updated progress (0-1 scale)
     */
    private updateDeliverableAndRecalculate;
    /**
     * Mark a deliverable as in_progress (auto-triggered by PostToolUse hook on first file write).
     * No-op if already in_progress or complete.
     * @param deliverableId - Deliverable ID
     * @returns Updated progress (0-1 scale)
     */
    markDeliverableInProgress(deliverableId: string): number;
    /**
     * Mark a deliverable as complete
     * @param deliverableId - Deliverable ID
     * @returns Updated progress (0-1 scale)
     */
    markDeliverableComplete(deliverableId: string): number;
    /**
     * Validate if a file is within workpackage scope
     * @param filePath - File path to check
     * @returns Scope validation result
     */
    validateScope(filePath: string): ScopeValidationResult;
    /**
     * Match a file path against a glob-like pattern
     */
    private matchesPattern;
    /**
     * Match a file against deliverable patterns
     * @param filePath - File path to check
     * @returns Matching deliverable ID or null
     */
    matchFileToDeliverable(filePath: string): string | null;
    /**
     * Extract a file path hint from a deliverable description.
     * Convention: description starts with a file path followed by ' — ', ' - ', or end of string.
     * @param description - Deliverable description text
     * @returns Extracted path or null
     */
    private extractPathFromDescription;
    /**
     * Update a workpackage's status in registry.yaml on disk.
     * Reads the registry file, updates the matching entry's status, and writes back.
     *
     * @param id - Workpackage display ID or systemId
     * @param newStatus - New status to set
     * @throws WorkpackageRegistryError if workpackage not found in registry file
     */
    updateRegistryEntryStatus(id: string, newStatus: WorkpackageStatus): void;
    /**
     * Clear all caches
     */
    clearCache(): void;
    /**
     * Check if all workpackages in registry have systemIds
     * @returns true if all workpackages have systemIds
     */
    allWorkpackagesHaveSystemIds(): boolean;
    /**
     * Get workpackages missing systemIds (for migration)
     * @returns Array of workpackage display IDs that need migration
     */
    getWorkpackagesMissingSystemIds(): string[];
    /**
     * Generate a systemId for a workpackage from its display ID
     * Uses deterministic hash for consistent migration
     * @param displayId - Display ID (e.g., "P1.4")
     * @returns Generated systemId
     */
    generateMigrationSystemId(displayId: string): string;
}
//# sourceMappingURL=registry.d.ts.map