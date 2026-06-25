/**
 * Workpackage Lifecycle CLI (P2.7)
 *
 * Implements lifecycle management commands: start, pause, complete, delete
 * Based on P2.7 Feature Brief Sections 2.5-2.10
 */
import { WorkpackageRegistryManager } from '../registry';
import { WorkpackageRegistryEntry, WorkpackageStatus } from '../types';
import { AuditLogger } from '../../sync/audit-log';
import { PauseReason } from '../../sync/types';
/**
 * Error thrown when a workpackage is not found
 */
export declare class WorkpackageNotFoundError extends Error {
    readonly id: string;
    constructor(id: string);
}
/**
 * Error thrown when blocked by dependencies
 */
export declare class DependencyBlockedError extends Error {
    readonly blockers: string[];
    constructor(blockers: string[]);
}
/**
 * Error thrown when validation fails
 */
export declare class ValidationError extends Error {
    readonly issues: string[];
    constructor(message: string, issues: string[]);
}
export interface LifecycleCLIOptions {
    clearDir: string;
    basePath: string;
    sessionId: string;
    sessionNumber: number;
}
export interface StartResult {
    success: boolean;
    workpackage: WorkpackageRegistryEntry;
    previouslyPaused?: WorkpackageRegistryEntry;
    forcedStart: boolean;
    blockers?: string[];
    message: string;
}
export interface PauseResult {
    success: boolean;
    workpackage?: WorkpackageRegistryEntry;
    progressAtPause: number;
    message: string;
}
export interface CompleteResult {
    success: boolean;
    workpackage?: WorkpackageRegistryEntry;
    validationIssues?: string[];
    planProgress?: number;
    unblockedWorkpackages?: string[];
    /** Per-WP registry-walk parse failures (informational; non-fatal). */
    corruptRegistryWarnings?: CorruptRegistryWarning[];
    message: string;
}
export interface DeleteResult {
    success: boolean;
    workpackage?: WorkpackageRegistryEntry;
    /** Per-WP registry-walk parse failures (informational; non-fatal). */
    corruptRegistryWarnings?: CorruptRegistryWarning[];
    message: string;
}
/**
 * A single WP that could not be parsed during a registry walk.
 *
 * Emitted as informational warning at command exit so the user knows which
 * WPs need repair via update-cli, but does NOT abort the lifecycle operation.
 */
export interface CorruptRegistryWarning {
    /** Display ID of the affected WP (e.g., "P6.7"). */
    displayId: string;
    /** Underlying parser failure detail (e.g., "Invalid type: bug"). */
    detail: string;
}
export interface BlockerInfo {
    id: string;
    displayId: string;
    status: WorkpackageStatus;
    progress: number;
}
/**
 * Check for blocking dependencies
 */
export declare function checkBlockingDependencies(registry: WorkpackageRegistryManager, workpackageId: string): BlockerInfo[];
/**
 * Format blockers for display
 */
export declare function formatBlockers(blockers: BlockerInfo[]): string;
/**
 * Start/activate a workpackage
 *
 * @param registry - Workpackage registry manager
 * @param targetId - Workpackage ID to start (display ID or system ID)
 * @param force - Skip dependency validation
 * @param auditLogger - Audit logger instance
 * @returns Start result
 */
export declare function startCommand(registry: WorkpackageRegistryManager, targetId: string, force: boolean, auditLogger: AuditLogger, options?: LifecycleCLIOptions): Promise<StartResult>;
/**
 * Pause the current active workpackage
 *
 * @param registry - Workpackage registry manager
 * @param auditLogger - Audit logger instance
 * @param reason - Reason for pause
 * @returns Pause result
 */
export declare function pauseCommand(registry: WorkpackageRegistryManager, auditLogger: AuditLogger, reason?: PauseReason, options?: LifecycleCLIOptions): Promise<PauseResult>;
/**
 * Validation result for completion
 */
export interface CompletionValidation {
    valid: boolean;
    issues: string[];
    warnings: string[];
    progress: number;
    deliverablesComplete: number;
    deliverablesTotal: number;
    depsComplete: number;
    depsTotal: number;
}
/**
 * Validate if a workpackage can be completed
 */
export declare function validateForCompletion(registry: WorkpackageRegistryManager, workpackage: WorkpackageRegistryEntry): CompletionValidation;
/**
 * Format validation result for display
 */
export declare function formatValidation(validation: CompletionValidation, workpackageId: string): string;
/**
 * Complete a workpackage. The target is resolved by resolveCompleteTarget:
 * an explicit id when provided, else the active workpackage, else the unique
 * in_progress workpackage.
 *
 * @param registry - Workpackage registry manager
 * @param auditLogger - Audit logger instance
 * @param force - Skip validation
 * @param options - Additional options
 * @param targetId - Optional explicit workpackage id (positional); when omitted, the active / unique-in_progress fallback applies
 * @returns Complete result
 */
export declare function completeCommand(registry: WorkpackageRegistryManager, auditLogger: AuditLogger, force: boolean, options: LifecycleCLIOptions, targetId?: string): Promise<CompleteResult>;
/**
 * Delete (archive) a workpackage
 *
 * @param registry - Workpackage registry manager
 * @param targetId - Workpackage ID to delete
 * @param confirmed - Skip confirmation
 * @param auditLogger - Audit logger instance
 * @returns Delete result
 */
export declare function deleteCommand(registry: WorkpackageRegistryManager, targetId: string, confirmed: boolean, auditLogger: AuditLogger, options?: {
    basePath: string;
    sessionId: string;
    sessionNumber: number;
}): Promise<DeleteResult>;
/**
 * Run lifecycle CLI command
 */
export declare function runLifecycleCLI(subcommand: string, args: string[], options: LifecycleCLIOptions, auditLogger: AuditLogger): Promise<string>;
//# sourceMappingURL=lifecycle-cli.d.ts.map