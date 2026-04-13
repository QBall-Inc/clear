/**
 * Plan → Workpackage Propagation (WF-2b)
 *
 * Propagates plan scope changes to workpackages using dual-ID architecture.
 * Handles insert, defer, and reorder operations with position management.
 *
 * Key Principle: With dual-ID architecture, "renumbering" only affects position
 * fields. System IDs and all references remain unchanged.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.3.
 */
import { WorkpackageType, WorkpackagePriority } from '../workpackage/types';
import { AuditDomain, PositionUpdate } from './types';
/**
 * Input for workpackage insertion
 */
export interface InsertWorkpackageInput {
    /** Project root directory */
    basePath: string;
    /** Current Claude Code session GUID */
    sessionId: string;
    /** Current CLEAR session number */
    sessionNumber: number;
    /** Phase systemId to insert into */
    phaseSystemId: string;
    /** Position to insert at (1-based), existing WPs at/after this shift down */
    insertPosition: number;
    /** Title for new workpackage */
    title: string;
    /** Description for new workpackage */
    description?: string;
    /** Workpackage type */
    type?: WorkpackageType;
    /** Workpackage priority */
    priority?: WorkpackagePriority;
    /** Rich fields (populated by Bulwark import or cf-plan create Track B) */
    acceptance_criteria?: string[];
    verification?: string[];
    notes?: string[];
    deliverables_text?: string[];
    scope_in?: string[];
    scope_out?: string[];
}
/**
 * Input for workpackage deferral
 */
export interface DeferWorkpackageInput {
    /** Project root directory */
    basePath: string;
    /** Current Claude Code session GUID */
    sessionId: string;
    /** Current CLEAR session number */
    sessionNumber: number;
    /** Workpackage systemId or display ID to defer */
    workpackageId: string;
    /** Reason for deferral */
    reason?: string;
}
/**
 * Input for workpackage reordering
 */
export interface ReorderWorkpackageInput {
    /** Project root directory */
    basePath: string;
    /** Current Claude Code session GUID */
    sessionId: string;
    /** Current CLEAR session number */
    sessionNumber: number;
    /** Workpackage systemId to move */
    workpackageSystemId: string;
    /** New position (1-based) */
    newPosition: number;
}
/**
 * Status of propagation operation
 */
export type PropagationStatus = 'success' | 'error' | 'no_plan' | 'not_found';
/**
 * Result of insert operation
 */
export interface InsertWorkpackageResult {
    /** Operation status */
    status: PropagationStatus;
    /** New workpackage systemId */
    newSystemId?: string;
    /** New workpackage display ID */
    newDisplayId?: string;
    /** Position updates applied */
    positionUpdates?: PositionUpdate[];
    /** Display ID changes for user notification */
    displayIdChanges?: Array<{
        systemId: string;
        oldDisplayId: string;
        newDisplayId: string;
    }>;
    /** Domains updated */
    domainsUpdated: AuditDomain[];
    /** Operation timestamp */
    timestamp: string;
    /** User-friendly message */
    message?: string;
    /** Error message */
    error?: string;
}
/**
 * Result of defer operation
 */
export interface DeferWorkpackageResult {
    /** Operation status */
    status: PropagationStatus;
    /** Deferred workpackage systemId */
    deferredSystemId?: string;
    /** Deferred workpackage display ID (before deferral) */
    deferredDisplayId?: string;
    /** Position updates applied to downstream WPs */
    positionUpdates?: PositionUpdate[];
    /** Display ID changes */
    displayIdChanges?: Array<{
        systemId: string;
        oldDisplayId: string;
        newDisplayId: string;
    }>;
    /** Knowledge entries linked to deferred WP */
    linkedKnowledge?: string[];
    /** Domains updated */
    domainsUpdated: AuditDomain[];
    /** Operation timestamp */
    timestamp: string;
    /** User-friendly message */
    message?: string;
    /** Error message */
    error?: string;
}
/**
 * Result of reorder operation
 */
export interface ReorderWorkpackageResult {
    /** Operation status */
    status: PropagationStatus;
    /** Position updates applied */
    positionUpdates?: PositionUpdate[];
    /** Display ID changes */
    displayIdChanges?: Array<{
        systemId: string;
        oldDisplayId: string;
        newDisplayId: string;
    }>;
    /** Domains updated */
    domainsUpdated: AuditDomain[];
    /** Operation timestamp */
    timestamp: string;
    /** User-friendly message */
    message?: string;
    /** Error message */
    error?: string;
}
/**
 * Update the status field inside a workpackage YAML file on disk.
 * Reads the existing YAML, modifies only the status field, and writes back
 * to preserve all other fields (NFR1: field preservation).
 *
 * @param wpFilePath - Absolute path to the workpackage YAML file
 * @param newStatus - New status value to write
 * @throws Re-throws errors so callers can log them (R4 fix: bare catch removed)
 */
export declare function updateWorkpackageFileStatus(wpFilePath: string, newStatus: string): void;
/**
 * Insert a new workpackage at a specific position within a phase.
 *
 * Operations:
 * 1. Generate new systemId
 * 2. Determine insertion position
 * 3. Increment position of downstream workpackages
 * 4. Create new workpackage definition file
 * 5. Update registry.yaml
 * 6. Log audit entry
 *
 * @param input - Insert workpackage input
 * @returns Insert result
 */
export declare function insertWorkpackage(input: InsertWorkpackageInput): Promise<InsertWorkpackageResult>;
/**
 * Defer a workpackage (mark as deferred, update positions).
 *
 * Operations:
 * 1. Mark workpackage as "deferred" (preserve systemId for audit trail)
 * 2. Decrement position of downstream workpackages
 * 3. Update registry.yaml status
 * 4. Check knowledge links and warn if found
 * 5. Log audit entry
 *
 * @param input - Defer workpackage input
 * @returns Defer result
 */
export declare function deferWorkpackage(input: DeferWorkpackageInput): Promise<DeferWorkpackageResult>;
/**
 * Reorder a workpackage within its phase.
 *
 * Operations:
 * 1. Calculate new positions for all affected workpackages
 * 2. Update position fields in registry
 * 3. Log audit entry
 *
 * @param input - Reorder workpackage input
 * @returns Reorder result
 */
export declare function reorderWorkpackage(input: ReorderWorkpackageInput): Promise<ReorderWorkpackageResult>;
/**
 * Create an insert handler for use with hooks/CLI
 * @param basePath - Project root directory
 * @returns Function that performs workpackage insertion
 */
export declare function createInsertHandler(basePath: string): (sessionId: string, sessionNumber: number, phaseSystemId: string, insertPosition: number, title: string, options?: {
    description?: string;
    type?: WorkpackageType;
    priority?: WorkpackagePriority;
}) => Promise<InsertWorkpackageResult>;
/**
 * Create a defer handler for use with hooks/CLI
 * @param basePath - Project root directory
 * @returns Function that performs workpackage deferral
 */
export declare function createDeferHandler(basePath: string): (sessionId: string, sessionNumber: number, workpackageId: string, reason?: string) => Promise<DeferWorkpackageResult>;
/**
 * Create a reorder handler for use with hooks/CLI
 * @param basePath - Project root directory
 * @returns Function that performs workpackage reordering
 */
export declare function createReorderHandler(basePath: string): (sessionId: string, sessionNumber: number, workpackageSystemId: string, newPosition: number) => Promise<ReorderWorkpackageResult>;
/**
 * Validate position within a phase
 * @param basePath - Project root directory
 * @param phaseSystemId - Phase systemId
 * @param position - Position to validate
 * @returns true if position is valid (1 to maxPosition + 1)
 */
export declare function validatePosition(basePath: string, phaseSystemId: string, position: number): boolean;
/**
 * Get the maximum position in a phase
 * @param basePath - Project root directory
 * @param phaseSystemId - Phase systemId
 * @returns Maximum position (0 if no workpackages)
 */
export declare function getMaxPosition(basePath: string, phaseSystemId: string): number;
//# sourceMappingURL=plan-propagate.d.ts.map