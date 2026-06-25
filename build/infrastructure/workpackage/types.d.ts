/**
 * Workpackage Management Type Definitions
 *
 * Types for workpackage entries, dependencies, and progress tracking.
 * Based on P1.4 Feature Brief Section 5.1.
 * Updated Session 33 with Dual-ID Architecture support (P1.6).
 */
/**
 * Workpackage status
 * Note: 'deferred' added for P1.6 plan scope changes
 * Note: 'paused' and 'archived' added for P2.7 lifecycle management
 */
export type WorkpackageStatus = 'not_started' | 'in_progress' | 'paused' | 'blocked' | 'complete' | 'deferred' | 'archived';
/**
 * Dependency type: hard (must be complete) or soft (warning only)
 */
export type DependencyType = 'hard' | 'soft';
/**
 * Deliverable status
 */
export type DeliverableStatus = 'not_started' | 'in_progress' | 'complete';
/**
 * Workpackage type
 */
export type WorkpackageType = 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'infrastructure';
/**
 * Workpackage priority
 */
export type WorkpackagePriority = 'critical' | 'high' | 'medium' | 'low';
export declare const WORKPACKAGE_TYPES: WorkpackageType[];
export declare const WORKPACKAGE_PRIORITIES: WorkpackagePriority[];
/**
 * Type guard: validate a string against the WorkpackageType union.
 */
export declare function isWorkpackageType(type: string): type is WorkpackageType;
/**
 * Type guard: validate a string against the WorkpackagePriority union.
 */
export declare function isWorkpackagePriority(priority: string): priority is WorkpackagePriority;
/**
 * Dependency reference
 */
export interface Dependency {
    id: string;
    type: DependencyType;
    deliverables_needed?: string[];
    description?: string;
}
/**
 * Deliverable definition
 */
export interface Deliverable {
    id: string;
    pattern: string;
    weight: number;
    status: DeliverableStatus;
    description?: string;
    completedAt?: string;
}
/**
 * Scope definition for a workpackage
 */
export interface WorkpackageScope {
    in_scope: string[];
    out_of_scope: string[];
}
/**
 * Dependencies structure
 */
export interface WorkpackageDependencies {
    upstream: Dependency[];
    downstream?: Dependency[];
}
/**
 * Full workpackage entry (parsed from YAML)
 *
 * Dual-ID Architecture (P1.6):
 * - systemId: Immutable identifier for cross-domain references
 * - position: Order within phase, determines display ID
 * - phase: Reference to parent phase systemId
 * - id: Legacy display ID (e.g., "P1.4") - kept for backward compatibility
 *
 * Display ID is calculated as P{phase.position}.{position}
 */
export interface WorkpackageEntry {
    /** Legacy display ID (e.g., "P1.4") - kept for backward compatibility */
    id: string;
    /** Immutable system ID (e.g., "wp-a1b2c3d4") - used for cross-domain references */
    systemId?: string;
    /** Position within phase (1-based), determines display order */
    position?: number;
    /** Reference to parent phase systemId (e.g., "ph-abc123") */
    phase?: string;
    title: string;
    status: WorkpackageStatus;
    type: WorkpackageType;
    priority: WorkpackagePriority;
    description: string;
    scope: WorkpackageScope;
    dependencies: WorkpackageDependencies;
    deliverables: Deliverable[];
    acceptance_criteria: string[];
    /** Verification steps (imported from Bulwark plan or cf-plan create Track B) */
    verification?: string[];
    /** Notes with source attribution (imported from Bulwark plan or cf-plan create Track B) */
    notes?: string[];
    knowledge_required?: string[];
    /** Last-known progress (0-100). Persisted alongside status so a registry rebuild from
     *  WP YAMLs preserves progress without requiring state-machine recomputation. */
    progress?: number;
    /**
     * WP-PS7 phase_a (S188): bidirectional workpackage↔knowledge link surface.
     * Lists knowledge entry IDs (e.g., TD-001, PAT-005) that link to this WP via
     * link-cli or capture-cli --workpackage. Mirrors the .md frontmatter
     * `linked_workpackages` field on the entry side; SQLite `entries.workpackage_id`
     * remains the canonical single-value FK. Idempotent dedup on append/remove.
     */
    knowledge?: string[];
    /**
     * Non-fatal enum-validation findings surfaced by a tolerant parse. Populated
     * ONLY when the parser is invoked with `ParseOptions { tolerantEnums: true }`
     * AND the loaded YAML contains an invalid type or priority value. The
     * offending raw values are still placed on `type` / `priority` so a downstream
     * strict round-trip (e.g., pre-write check in update-cli) catches unrepaired
     * entries. Strict callers never see this field populated.
     */
    validationWarnings?: string[];
}
/**
 * Workpackage registry entry (lightweight, for listing)
 *
 * Dual-ID Architecture (P1.6): Includes both legacy id and systemId
 * P2.7 Lifecycle: Added timestamps and progress for lifecycle management
 */
export interface WorkpackageRegistryEntry {
    /** Legacy display ID (e.g., "P1.4") - kept for backward compatibility */
    id: string;
    /** Immutable system ID (e.g., "wp-a1b2c3d4") - used for cross-domain references */
    systemId?: string;
    /** Position within phase (1-based) */
    position?: number;
    /** Reference to parent phase systemId */
    phase?: string;
    title: string;
    status: WorkpackageStatus;
    file: string;
    blocked_by?: string[];
    /** When the workpackage was started (first activation) */
    startedAt?: string;
    /** When the workpackage was completed */
    completedAt?: string;
    /** When the workpackage was archived (soft deleted) */
    archivedAt?: string;
    /** Progress percentage (0-100) */
    progress?: number;
    /** Linked knowledge entry IDs (TD-*, PAT-*, etc.) */
    linkedKnowledge?: string[];
}
/**
 * Workpackage registry (from registry.yaml)
 */
export interface WorkpackageRegistry {
    workpackages: WorkpackageRegistryEntry[];
}
/**
 * Deliverable state in active workpackage
 */
export interface DeliverableState {
    status: DeliverableStatus;
    completedAt?: string;
}
/**
 * Active workpackage state (stored in .clear/state/workpackage.json)
 *
 * Dual-ID Architecture (P1.6):
 * - activeWorkpackage: Legacy display ID for backward compatibility
 * - activeWorkpackageSystemId: Preferred systemId for cross-domain references
 * - activePhaseSystemId: Reference to current phase
 */
export interface WorkpackageState {
    /** Legacy display ID of active workpackage (e.g., "P1.4") */
    activeWorkpackage: string | null;
    /** System ID of active workpackage (e.g., "wp-a1b2c3d4") - preferred for cross-domain refs */
    activeWorkpackageSystemId?: string | null;
    /** System ID of active phase (e.g., "ph-abc123") */
    activePhaseSystemId?: string | null;
    startedAt: string | null;
    lastActivity: string;
    /** Active workpackage progress (0-100 percentage). Sole writer is calculateProgress via updateDeliverableAndRecalculate or progress-cli state.progress write. */
    progress: number;
    deliverables: Record<string, DeliverableState>;
    scopeWarnings: string[];
    sessionId: string;
}
/**
 * Create a fresh default workpackage state with current timestamp.
 * Replaces the old const to avoid stale `new Date()` evaluated at module load.
 */
export declare function createDefaultWorkpackageState(): WorkpackageState;
/** @deprecated Use createDefaultWorkpackageState() for fresh timestamps */
export declare const DEFAULT_WORKPACKAGE_STATE: WorkpackageState;
/**
 * Workpackage configuration
 */
export interface WorkpackageConfig {
    registry: {
        location: string;
        auto_discover: boolean;
        validate_on_load: boolean;
    };
    dependencies: {
        strict_validation: boolean;
        check_deliverables: boolean;
        allow_soft_dependencies: boolean;
        max_depth: number;
    };
    progress: {
        auto_tracking: boolean;
        tracking_granularity: 'file' | 'function' | 'line';
        weighted_progress: boolean;
        include_tests: boolean;
    };
    scope: {
        enforce_boundaries: boolean;
        warn_on_creep: boolean;
        allow_expansion: boolean;
    };
    completion: {
        require_all_deliverables: boolean;
        require_tests_pass: boolean;
        min_coverage: number;
        auto_unblock: boolean;
    };
    context: {
        max_percentage: number;
        load_knowledge: boolean;
        load_dependencies: boolean;
    };
}
/**
 * Default workpackage configuration
 */
export declare const DEFAULT_WORKPACKAGE_CONFIG: WorkpackageConfig;
/**
 * Load CLI input (from stdin via bash wrapper)
 */
export interface LoadInput {
    cwd: string;
    session_id?: string;
    workpackage_id?: string;
}
/**
 * Load CLI output
 */
export interface LoadOutput {
    additionalContext?: string;
    workpackageId: string | null;
    progress: number;
    status: 'success' | 'blocked' | 'no_workpackage' | 'error';
    blockedBy?: string[];
    alternatives?: string[];
    error?: string;
}
/**
 * Progress CLI input (from stdin via bash wrapper)
 */
export interface ProgressInput {
    cwd: string;
    user_prompt?: string;
    files_modified?: string[];
    deliverable_id?: string;
    complete?: boolean;
}
/**
 * Workpackage progress CLI output.
 *
 * Dual-mode envelope: `additionalContext` is the Claude Code hook spec;
 * `message` is the canonical CLI shape (read by skill jq queries). Both
 * carry identical human-readable text — populated by `withEnvelope` at
 * the CLI boundary.
 *
 * `systemId`/`displayId`/`title` carry the active-WP identity through
 * post-tool.sh's jq extraction into sync-bridge's handleUpdateWorkpackage.
 */
export interface ProgressOutput {
    success?: boolean;
    message?: string;
    additionalContext?: string;
    progress: number;
    status: 'success' | 'warning' | 'error';
    scopeValid?: boolean;
    error?: string;
    systemId?: string;
    displayId?: string;
    title?: string;
}
/**
 * Dependencies CLI input (from stdin via bash wrapper)
 */
export interface DepsInput {
    cwd: string;
    workpackage_id: string;
    check_deliverables?: boolean;
}
/**
 * Dependency status for output
 */
export interface DependencyStatus {
    id: string;
    status: WorkpackageStatus;
    type: DependencyType;
    progress?: number;
}
/**
 * Dependencies CLI output.
 *
 * Dual-mode envelope: `additionalContext` is the Claude Code hook spec;
 * `message` is the canonical CLI shape (read by skill jq queries). Both
 * carry identical human-readable text — populated by `withEnvelope` at
 * the CLI boundary.
 */
export interface DepsOutput {
    success?: boolean;
    message?: string;
    additionalContext?: string;
    workpackageId: string;
    dependencies: DependencyStatus[];
    status: 'ready' | 'blocked' | 'circular' | 'error';
    blockedBy?: string[];
    alternatives?: string[];
    cycle?: string[];
    error?: string;
}
/**
 * Dependency validation result
 */
export interface DependencyValidationResult {
    valid: boolean;
    blockedBy: string[];
    softBlocked: string[];
    missingDeliverables: Record<string, string[]>;
}
/**
 * Circular dependency detection result
 */
export interface CircularDependencyResult {
    hasCircular: boolean;
    cycle: string[];
}
/**
 * Progress calculation result
 */
export interface ProgressResult {
    /** Progress (0-100 percentage). Integer; rounded once in calculateProgress at the sole conversion boundary. */
    progress: number;
    completedDeliverables: string[];
    pendingDeliverables: string[];
    totalWeight: number;
    completedWeight: number;
}
/**
 * Scope validation result
 */
export interface ScopeValidationResult {
    valid: boolean;
    warnings: string[];
    outOfScopeFiles: string[];
    suggestedWorkpackage?: string;
}
export { generateWorkpackageSystemId, generateSystemIdFromLegacy, isWorkpackageSystemId } from '../sync/types';
/**
 * Check if a workpackage entry has dual-ID support
 * @param entry - Workpackage entry or registry entry
 * @returns true if systemId is present
 */
export declare function hasDualIdSupport(entry: WorkpackageEntry | WorkpackageRegistryEntry): boolean;
/**
 * Get the preferred ID for cross-domain references
 * Returns systemId if available, otherwise falls back to legacy id
 * @param entry - Workpackage entry or registry entry
 * @returns systemId or legacy id
 */
export declare function getPreferredId(entry: WorkpackageEntry | WorkpackageRegistryEntry): string;
/**
 * Check if a string looks like a legacy display ID (P1.4 format)
 * @param id - ID to check
 * @returns true if matches P{n}.{n} pattern
 */
export declare function isLegacyDisplayId(id: string): boolean;
/**
 * Format a workpackage ID for user-facing display.
 *
 * Counterpart to getPreferredId() — that helper is system-preferred for cross-domain
 * references; this one is user-preferred for messages, errors, and status output.
 *
 * Graceful degradation: when style='both' but entry.systemId is absent (undefined or
 * empty string — legacy WP entries pre-dating dual-ID support), the function returns
 * just entry.id. Callers requesting 'both' receive the richest representation
 * available without having to guard for the legacy case themselves.
 *
 * @param entry - Workpackage entry or registry entry (must carry .id; .systemId optional)
 * @param style - 'display' returns just the user-facing ID (e.g. "P5.1");
 *                'both' returns "P5.1 (wp-647a5f25)" when systemId is present,
 *                or just "P5.1" when systemId is absent (legacy fallback)
 * @returns Formatted ID string suitable for user-visible output
 */
export declare function formatWorkpackageId(entry: {
    id: string;
    systemId?: string;
}, style?: 'display' | 'both'): string;
//# sourceMappingURL=types.d.ts.map