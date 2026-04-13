/**
 * WF-5: Error Handling with Retry/Repair
 *
 * Provides graceful degradation with user control for cross-domain sync errors.
 * Implements retry mechanism with exponential backoff and user options flow.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.7.
 *
 * @module infrastructure/sync/error-handler
 */
import { ErrorCategory, ErrorContext, ErrorHandlingConfig } from './types';
import { AuditLogger } from './audit-log';
/**
 * Sync error with category and context
 */
export declare class SyncError extends Error {
    readonly category: ErrorCategory;
    readonly context: ErrorContext;
    readonly retryCount: number;
    constructor(message: string, category: ErrorCategory, context?: Partial<ErrorContext>, retryCount?: number);
}
/**
 * Standard user options for error recovery
 */
export declare const USER_OPTIONS: {
    readonly AUTO_REPAIR: {
        readonly key: "A";
        readonly label: "Auto-repair";
        readonly description: "Apply suggested fixes automatically";
    };
    readonly MANUAL_STEPS: {
        readonly key: "B";
        readonly label: "Manual steps";
        readonly description: "Show exact commands/edits needed to fix manually";
    };
    readonly CONTINUE_ANYWAY: {
        readonly key: "C";
        readonly label: "Continue anyway";
        readonly description: "Proceed with partial sync (may cause inconsistencies)";
    };
    readonly INVESTIGATE: {
        readonly key: "D";
        readonly label: "Investigate";
        readonly description: "Launch debug mode with audit logs to investigate the issue";
    };
};
/**
 * Retry state for tracking retry attempts
 */
export interface RetryState {
    /** Current attempt number (0-indexed) */
    attempt: number;
    /** Maximum attempts allowed */
    maxAttempts: number;
    /** Delay before next retry in ms */
    nextDelayMs: number;
    /** Total time spent in retries */
    totalDelayMs: number;
    /** Errors from each attempt */
    errors: Error[];
}
/**
 * Result of a retry operation — discriminated union on status field
 */
export type RetryResult<T> = {
    status: 'success';
    success: true;
    value: T;
    retryState: RetryState;
} | {
    status: 'error';
    success: false;
    error: SyncError;
    retryState: RetryState;
};
/**
 * Calculate exponential backoff delay
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @returns Delay in milliseconds with exponential backoff
 */
export declare function calculateBackoff(attempt: number, baseDelayMs: number): number;
/**
 * Sleep for specified duration
 * @param ms - Duration in milliseconds
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Execute an operation with retry logic
 *
 * @param operation - Async function to execute
 * @param category - Error category for classification
 * @param config - Error handling configuration
 * @param auditLogger - Optional audit logger for tracking retries
 * @returns Retry result with success/failure and retry state
 */
export declare function withRetry<T>(operation: () => Promise<T>, category: ErrorCategory, config?: ErrorHandlingConfig, auditLogger?: AuditLogger): Promise<RetryResult<T>>;
/**
 * Analyze an error and determine its category
 * @param error - Error to analyze
 * @returns Error category
 */
export declare function categorizeError(error: Error): ErrorCategory;
/**
 * Build error context from an error
 * @param error - Error to analyze
 * @param repairAction - Optional repair action function
 * @returns Error context
 */
export declare function buildErrorContext(error: Error, repairAction?: () => Promise<void>): ErrorContext;
/**
 * User choice result
 */
export interface UserChoice {
    /** Selected option key */
    key: string;
    /** Whether to proceed */
    proceed: boolean;
    /** Whether to attempt repair */
    attemptRepair: boolean;
    /** Whether to show manual steps */
    showManualSteps: boolean;
    /** Whether to investigate */
    investigate: boolean;
}
/**
 * Parse user choice from key
 * @param key - User input key (A/B/C/D)
 * @returns Parsed user choice
 */
export declare function parseUserChoice(key: string): UserChoice;
/**
 * Format error message for user display
 * @param error - Error to format
 * @param context - Error context
 * @returns Formatted error message with options
 */
export declare function formatErrorForUser(error: Error, context: ErrorContext): string;
/**
 * Get manual repair steps for an error category
 * @param category - Error category
 * @param context - Additional context
 * @returns Array of manual repair steps
 */
export declare function getManualRepairSteps(category: ErrorCategory, context?: Record<string, unknown>): string[];
/**
 * Error handling result
 */
export interface ErrorHandlingResult {
    /** Whether the error was handled successfully */
    handled: boolean;
    /** Whether to proceed with the operation */
    proceed: boolean;
    /** Whether repair was attempted */
    repairAttempted: boolean;
    /** Whether repair succeeded */
    repairSucceeded: boolean;
    /** User choice if interaction occurred */
    userChoice?: UserChoice;
    /** Error message to display */
    message: string;
}
/**
 * Error handler for cross-domain sync operations
 */
export declare class ErrorHandlerService {
    private config;
    private auditLogger?;
    constructor(config?: ErrorHandlingConfig, auditLogger?: AuditLogger);
    /**
     * Handle an error with retry, auto-repair, and user options
     * @param error - Error to handle
     * @param repairAction - Optional repair action function
     * @param userChoiceKey - Pre-selected user choice (for non-interactive mode)
     * @returns Error handling result
     */
    handleError(error: Error, repairAction?: () => Promise<void>, userChoiceKey?: string): Promise<ErrorHandlingResult>;
    /**
     * Process user choice for error handling
     */
    private processUserChoice;
    /**
     * Option A: Attempt auto-repair via the provided repair action
     */
    private handleAutoRepair;
    /**
     * Option B: Return manual repair steps for the error category
     */
    private handleManualSteps;
    /**
     * Option C: Skip the error and continue with partial sync
     */
    private handleContinueAnyway;
    /**
     * Option D: Direct user to debug mode for investigation
     */
    private handleInvestigate;
    /**
     * Execute an operation with full error handling (retry + repair + user options)
     * @param operation - Async function to execute
     * @param category - Error category for classification
     * @param repairAction - Optional repair action function
     * @param userChoiceKey - Pre-selected user choice (for non-interactive mode)
     * @returns Operation result or error handling result
     */
    executeWithErrorHandling<T>(operation: () => Promise<T>, category: ErrorCategory, repairAction?: () => Promise<void>, userChoiceKey?: string): Promise<{
        success: true;
        value: T;
    } | {
        success: false;
        result: ErrorHandlingResult;
    }>;
}
/**
 * Create an error handler service
 * @param config - Error handling configuration
 * @param auditLogger - Optional audit logger
 * @returns Error handler service instance
 */
export declare function createErrorHandler(config?: ErrorHandlingConfig, auditLogger?: AuditLogger): ErrorHandlerService;
//# sourceMappingURL=error-handler.d.ts.map