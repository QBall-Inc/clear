/**
 * Cross-Domain Sync Type Definitions
 *
 * Types for the P1.6 Cross-Domain Synchronization system including:
 * - Dual-ID architecture (systemId + displayId)
 * - Shared context hub
 * - Audit logging
 * - Error handling
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 5.2.
 */
/**
 * Base interface for entities with dual-ID (systemId + displayId)
 *
 * The dual-ID architecture separates immutable references (systemId) from
 * human-readable identifiers (displayId) to enable plan evolution without
 * breaking cross-domain references.
 */
export interface DualIdEntity {
    /** Immutable identifier, generated at creation (e.g., "wp-a1b2c3d4") */
    systemId: string;
    /** Determines display order within parent container, can change on reorder */
    position: number;
}
/**
 * Workpackage with dual-ID support
 *
 * Extends the base dual-ID entity with workpackage-specific fields.
 * The displayId (e.g., "P1.4") is calculated from phase.position + wp.position.
 */
export interface WorkpackageDualId extends DualIdEntity {
    /** Immutable identifier in format "wp-{uuid}" */
    systemId: string;
    /** Reference to parent phase systemId (e.g., "ph-abc123") */
    phase: string;
    /** Position within phase (1-based), determines display order */
    position: number;
    /** Human-readable title */
    title: string;
    /** Current status */
    status: WorkpackageStatus;
}
/**
 * Phase with dual-ID support
 *
 * Extends the base dual-ID entity with phase-specific fields.
 * The displayId (e.g., "Phase-1") is calculated from position.
 */
export interface PhaseDualId extends DualIdEntity {
    /** Immutable identifier in format "ph-{uuid}" */
    systemId: string;
    /** Position within plan (1-based), determines display order */
    position: number;
    /** Human-readable name */
    name: string;
    /** Array of workpackage systemIds in this phase */
    workpackages: string[];
}
/**
 * Workpackage status (matches workpackage/types.ts)
 * P2.7 Lifecycle: Added 'paused' and 'archived'
 */
export type WorkpackageStatus = 'not_started' | 'in_progress' | 'paused' | 'blocked' | 'complete' | 'deferred' | 'archived';
/**
 * Phase status (matches existing plan/types.ts)
 */
export type PhaseStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked';
/**
 * Generate a new system ID for a workpackage
 * @returns System ID in format "wp-{uuid}"
 */
export declare function generateWorkpackageSystemId(): string;
/**
 * Generate a new system ID for a phase
 * @returns System ID in format "ph-{uuid}"
 */
export declare function generatePhaseSystemId(): string;
/**
 * Generate a system ID from a legacy display ID (for migration)
 * Uses a deterministic hash to ensure consistent migration
 * @param displayId - The legacy display ID (e.g., "P1.4" or "Phase-1")
 * @param type - The entity type ("workpackage" or "phase")
 * @returns System ID based on the display ID
 */
export declare function generateSystemIdFromLegacy(displayId: string, type: 'workpackage' | 'phase'): string;
/**
 * Calculate display ID from entity
 *
 * For workpackages: P{phasePosition}.{wpPosition} (e.g., "P1.4")
 * For phases: Phase-{position} (e.g., "Phase-1")
 *
 * @param entity - The workpackage or phase entity
 * @param phases - Map of phase systemId to phase (required for workpackages)
 * @returns The calculated display ID
 */
export declare function calculateDisplayId(entity: WorkpackageDualId | PhaseDualId, phases?: Map<string, PhaseDualId>): string;
/**
 * Check if an entity is a workpackage (has phase reference)
 */
export declare function isWorkpackage(entity: WorkpackageDualId | PhaseDualId): entity is WorkpackageDualId;
/**
 * Check if a system ID is a workpackage ID
 */
export declare function isWorkpackageSystemId(systemId: string): boolean;
/**
 * Check if a system ID is a phase ID
 */
export declare function isPhaseSystemId(systemId: string): boolean;
/**
 * Session summary for sync state
 */
export interface SessionSummary {
    /** Claude Code session GUID */
    id: string;
    /** CLEAR session number */
    number: number;
    /** Current token usage */
    tokensUsed: number;
    /** Session status */
    status: 'active' | 'ending' | 'complete';
}
/**
 * Workpackage summary for shared context
 */
export interface WorkpackageSummary {
    /** Immutable system ID reference */
    systemId: string;
    /** Calculated display ID (e.g., "P1.4") */
    displayId: string;
    /** Human-readable title */
    title: string;
    /** Progress (0-100 percentage) */
    progress: number;
    /** Current session ID */
    sessionId: string;
    /** Current workpackage status (propagated from lifecycle commands) */
    status?: WorkpackageStatus;
}
/**
 * Previous workpackage tracking for P2.7 lifecycle management (TD-050)
 *
 * Enables proper resume context when a paused WP is reactivated.
 * Stored when switching away from an active workpackage.
 */
export interface PreviousWorkpackage {
    /** System ID of the paused workpackage */
    systemId: string;
    /** Display ID for user-facing output */
    displayId: string;
    /** When the workpackage was paused */
    pausedAt: string;
    /** Progress percentage at time of pause (0-100) */
    progressAtPause: number;
    /** Reason for pause */
    reason: PauseReason;
}
/**
 * Reason why a workpackage was paused
 */
export type PauseReason = 'switched_to_new_wp' | 'user_explicit_pause' | 'session_end';
/**
 * Plan summary for shared context
 */
export interface PlanSummary {
    /** Active phase system ID */
    activePhaseSystemId: string;
    /** Active phase display ID (e.g., "Phase-1") */
    activePhaseDisplayId: string;
    /** Active-phase progress (0-100 percentage) */
    phaseProgress: number;
    /** Whole-plan progress (0-100 percentage) — weighted average across all phases. Written by rollupPlanProgress. */
    planProgress?: number;
    /** Current blockers */
    blockers: string[];
}
/**
 * Knowledge summary for shared context
 */
export interface KnowledgeSummary {
    /** Recently accessed/created knowledge entry IDs */
    recentEntries: string[];
    /** Number of pending captures */
    pendingCaptures: number;
    /** Knowledge entries with deprecated references */
    deprecatedReferences: string[];
}
/**
 * Cross-domain links in shared context
 */
export interface CrossDomainLinks {
    /** Map of workpackage systemId to linked knowledge entries */
    workpackageKnowledge: Record<string, KnowledgeLink[]>;
}
/**
 * Sync state hub structure
 *
 * Central aggregation point for cross-domain state.
 * Stored in .clear/state/sync-state.json
 *
 * Note: Renamed from "SharedContext" to avoid collision with
 * src/infrastructure/context/types.ts (hook contributions).
 */
export interface SyncState {
    /** Schema version */
    version: string;
    /** Last update timestamp */
    lastUpdated: string;
    /** Last full sync timestamp */
    lastFullSync: string;
    /** Session state summary */
    session: SessionSummary;
    /** Active workpackage summary */
    workpackage: WorkpackageSummary;
    /** Previous workpackage info for resume context (P2.7 TD-050) */
    previousWorkpackage?: PreviousWorkpackage;
    /** Plan state summary */
    plan: PlanSummary;
    /** Knowledge state summary */
    knowledge: KnowledgeSummary;
    /** Cross-domain links */
    links: CrossDomainLinks;
}
/**
 * Create a fresh default sync state with current timestamps.
 * Replaces the old const to avoid stale `new Date()` evaluated at module load.
 * Returns deep copies of all nested objects.
 */
export declare function createDefaultSyncState(): SyncState;
/** @deprecated Use createDefaultSyncState() for fresh timestamps */
export declare const DEFAULT_SYNC_STATE: SyncState;
/**
 * Knowledge link entry
 *
 * Represents a bidirectional link between a knowledge entry and a
 * workpackage/phase using systemId references for stability.
 */
export interface KnowledgeLink {
    /** Knowledge entry ID (e.g., "TD-025") */
    id: string;
    /** Workpackage systemId reference (NOT display ID) */
    workpackageId: string;
    /** Phase systemId reference (NOT display ID) */
    phaseId: string;
    /** One-liner description */
    title: string;
    /** When the link was created */
    linkedAt: string;
    /** Who/what created the link ("auto" | "manual" | session ID) */
    linkedBy: string;
    /** Link status */
    status: KnowledgeLinkStatus;
    /** Deprecation type when status is deprecated/superseded */
    deprecation_type: 'obsolete' | 'superseded' | null;
}
/**
 * Knowledge link status
 */
export type KnowledgeLinkStatus = 'active' | 'deprecated' | 'superseded' | 'archived';
/**
 * Domain categories for audit entries
 */
export type AuditDomain = 'session' | 'workpackage' | 'plan' | 'knowledge' | 'sync';
/**
 * Domain categories for the debug validator (/cf-debug).
 *
 * Superset of AuditDomain that adds 'install' — the Claude Code install-wiring
 * health check (.claude/settings.json statusLine + env vars + plugin statusline.sh).
 * Kept distinct from AuditDomain so the audit-log domain set (which backs a
 * Record<AuditDomain, string> state-file map in context-hub) is unaffected — the
 * install domain has no .clear/ state file.
 */
export type DebugDomain = AuditDomain | 'install';
/**
 * Audit action types
 * P2.7: Added 'pause', 'resume', 'archive' for lifecycle management
 */
export type AuditAction = 'create' | 'update' | 'delete' | 'link' | 'unlink' | 'deprecate' | 'supersede' | 'purge' | 'reorder' | 'defer' | 'migrate' | 'repair' | 'pause' | 'resume' | 'archive' | 'ack';
/**
 * Audit trigger sources
 */
export type AuditTrigger = 'user_prompt' | 'auto_sync' | 'manual' | 'session_start' | 'session_end' | 'scope_change' | 'error_repair';
/**
 * Audit entry structure
 *
 * Represents a single state change event for cross-domain auditing.
 * Stored in JSONL format (one JSON per line) in .clear/audit/session_N.jsonl
 */
export interface AuditEntry {
    /** ISO 8601 timestamp */
    timestamp: string;
    /** Claude Code session GUID */
    sessionId: string;
    /** CLEAR session number */
    sessionNumber: number;
    /** Domain that was modified */
    domain: AuditDomain;
    /** Action performed */
    action: AuditAction;
    /** Target of the action (systemId for workpackages/phases) */
    target: string;
    /** Optional display ID for human readability */
    targetDisplayId?: string;
    /** Previous value (for updates) */
    oldValue?: unknown;
    /** New value (for creates/updates) */
    newValue?: unknown;
    /** What triggered the action */
    trigger: AuditTrigger;
    /** Correlation ID to group related changes */
    correlationId?: string;
    /** Additional context */
    metadata?: Record<string, unknown>;
}
/**
 * Audit index entry for quick lookup
 */
export interface AuditIndexEntry {
    /** Session number */
    sessionNumber: number;
    /** File path */
    file: string;
    /** Number of entries */
    entryCount: number;
    /** First entry timestamp */
    firstEntry: string;
    /** Last entry timestamp */
    lastEntry: string;
    /** Domains affected */
    domains: AuditDomain[];
}
/**
 * Audit index structure
 *
 * Quick lookup index for audit logs.
 * Stored in .clear/audit/audit-index.json
 */
export interface AuditIndex {
    /** Schema version */
    version: string;
    /** Last updated timestamp */
    lastUpdated: string;
    /** Sessions indexed */
    sessions: AuditIndexEntry[];
}
/**
 * Create a fresh default audit index with current timestamp.
 * Replaces the old const to avoid stale `new Date()` evaluated at module load.
 */
export declare function createDefaultAuditIndex(): AuditIndex;
/** @deprecated Use createDefaultAuditIndex() for fresh timestamps */
export declare const DEFAULT_AUDIT_INDEX: AuditIndex;
/**
 * Audit configuration
 */
export interface AuditConfig {
    /** Keep last N session logs */
    retentionSessions: number;
    /** Rotate within session if exceeded (MB) */
    maxFileSizeMb: number;
    /** Log format */
    logFormat: 'jsonl';
}
/**
 * Error handling configuration
 */
export interface ErrorHandlingConfig {
    /** Maximum retry attempts */
    maxRetries: number;
    /** Initial retry backoff in milliseconds */
    retryBackoffMs: number;
    /** Attempt auto-repair before asking user */
    autoRepair: boolean;
}
/**
 * Knowledge linking configuration
 */
export interface KnowledgeLinkingConfig {
    /** Auto-link knowledge to active workpackage on capture */
    autoLinkWorkpackage: boolean;
    /** Auto-link knowledge to active phase on capture */
    autoLinkPhase: boolean;
    /** Propagate deprecation warnings to linked items */
    propagateDeprecation: boolean;
    /** Auto-migrate superseded references */
    autoMigrateSuperseded: boolean;
}
/**
 * Full cross-domain sync configuration
 *
 * Stored in .clear/config/sync.yaml
 */
export interface CrossDomainSyncConfig {
    /** Audit log settings */
    audit: AuditConfig;
    /** Error handling settings */
    errorHandling: ErrorHandlingConfig;
    /** Knowledge linking settings */
    knowledgeLinking: KnowledgeLinkingConfig;
}
/**
 * Default cross-domain sync configuration
 */
export declare const DEFAULT_SYNC_CONFIG: CrossDomainSyncConfig;
/**
 * Error category for cross-domain sync
 */
export type ErrorCategory = 'parse_error' | 'file_missing' | 'corrupt' | 'reference_invalid' | 'permission' | 'schema_migration' | 'systemid_missing' | 'position_invalid' | 'circular_reference';
/**
 * User option for error recovery
 */
export interface UserOption {
    /** Option key (e.g., "A", "B", "C") */
    key: string;
    /** Short label */
    label: string;
    /** Full description */
    description: string;
}
/**
 * Error handler definition
 */
export interface ErrorHandler {
    /** Whether the error is retryable */
    retryable: boolean;
    /** Maximum retry attempts (if retryable) */
    maxRetries?: number;
    /** Whether auto-repair is possible */
    autoRepairPossible: boolean;
    /** Description of repair action */
    repairAction?: string;
}
/**
 * Error context for recovery
 */
export interface ErrorContext {
    /** Error category */
    category: ErrorCategory;
    /** Whether retryable */
    retryable: boolean;
    /** Whether auto-repair is possible */
    autoRepairPossible: boolean;
    /** Repair action function */
    repairAction?: () => Promise<void>;
    /** Options to present to user */
    userOptions: UserOption[];
    /** Original error */
    originalError?: Error;
    /** Additional context */
    metadata?: Record<string, unknown>;
}
/**
 * Error handlers by category
 */
export declare const ERROR_HANDLERS: Record<ErrorCategory, ErrorHandler>;
/**
 * Sync result status
 */
export type SyncStatus = 'success' | 'partial' | 'failed' | 'skipped';
/**
 * Domain sync result
 */
export interface DomainSyncResult {
    /** Domain name */
    domain: AuditDomain;
    /** Sync status */
    status: SyncStatus;
    /** Changes detected */
    changesDetected: boolean;
    /** Changes applied */
    changesApplied: number;
    /** Errors encountered */
    errors: string[];
    /** Duration in milliseconds */
    durationMs: number;
}
/**
 * Full sync result
 */
export interface SyncResult {
    /** Overall status */
    status: SyncStatus;
    /** Start timestamp */
    startedAt: string;
    /** End timestamp */
    completedAt: string;
    /** Total duration in milliseconds */
    durationMs: number;
    /** Results per domain */
    domains: DomainSyncResult[];
    /** Audit entries created */
    auditEntriesCreated: number;
    /** Any error messages */
    errors: string[];
}
/**
 * Position update operation
 */
export interface PositionUpdate {
    /** Entity systemId */
    systemId: string;
    /** Old position */
    oldPosition: number;
    /** New position */
    newPosition: number;
}
/**
 * Insert operation result
 */
export interface InsertResult {
    /** New entity systemId */
    newSystemId: string;
    /** Position assigned */
    position: number;
    /** Position updates for downstream entities */
    positionUpdates: PositionUpdate[];
    /** Display IDs affected */
    displayIdChanges: Array<{
        systemId: string;
        oldDisplayId: string;
        newDisplayId: string;
    }>;
}
/**
 * Reorder operation result
 */
export interface ReorderResult {
    /** Position updates applied */
    positionUpdates: PositionUpdate[];
    /** Display IDs affected */
    displayIdChanges: Array<{
        systemId: string;
        oldDisplayId: string;
        newDisplayId: string;
    }>;
}
/**
 * Validation issue severity
 */
export type IssueSeverity = 'error' | 'warning' | 'info';
/**
 * Validation issue
 */
export interface ValidationIssue {
    /** Issue severity */
    severity: IssueSeverity;
    /** Domain affected */
    domain: DebugDomain;
    /** Issue description */
    message: string;
    /** Entity systemId (if applicable) */
    systemId?: string;
    /** Suggested fix */
    suggestion?: string;
    /** Whether auto-repair is possible */
    autoRepairable: boolean;
}
/**
 * Debug report
 */
export interface DebugReport {
    /** Report generation timestamp */
    timestamp: string;
    /** Session info */
    session: {
        id: string;
        number: number;
    };
    /** Issues found */
    issues: ValidationIssue[];
    /** Summary counts */
    summary: {
        errors: number;
        warnings: number;
        info: number;
        autoRepairable: number;
    };
    /** Audit log status */
    auditStatus: {
        currentSession: number;
        entriesInSession: number;
        totalSessions: number;
    };
    /**
     * Native-dependency health. Surfaces whether the better-sqlite3 native binding
     * actually loads in this process, so an un-adopted code fix (e.g. a rebuilt
     * binding that never reached the local install) is visible at a glance — even on
     * a fresh project before any index exists.
     */
    dependencies: {
        sqliteBinding: 'ok' | 'missing';
    };
}
/**
 * Type guard for AuditEntry
 */
export declare function isAuditEntry(obj: unknown): obj is AuditEntry;
/**
 * Type guard for SyncState
 */
export declare function isSyncState(obj: unknown): obj is SyncState;
/**
 * Type guard for KnowledgeLink
 */
export declare function isKnowledgeLink(obj: unknown): obj is KnowledgeLink;
//# sourceMappingURL=types.d.ts.map