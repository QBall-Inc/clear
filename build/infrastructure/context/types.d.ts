/**
 * Shared Context Types
 *
 * Type definitions for the shared context system that flows through
 * hook executions and skill operations.
 *
 * Note: Full implementation in A1.3, this provides integration interface for A1.2
 */
/**
 * Context contribution from a hook or skill
 */
export interface ContextContribution {
    /** ISO timestamp when contribution was made */
    timestamp: string;
    /** Namespace of the contributing hook/skill */
    namespace: string;
    /** Contributed data (immutable once written) */
    data: any;
    /** Whether this contribution is frozen (immutable) */
    frozen: boolean;
}
/**
 * Shared context interface for hook orchestration
 *
 * Note: This is a stub interface for A1.2. Full implementation in A1.3.
 */
export interface SharedContext {
    /**
     * Contribute data to the shared context
     * @param namespace - Hook/skill namespace
     * @param data - Data to contribute
     * @returns Optional result with success/failure info
     */
    contribute(namespace: string, data: any): Promise<void | ContributeResult>;
    /**
     * Get current context snapshot
     * @returns Current context state
     */
    getSnapshot?(): Promise<any>;
}
/**
 * Derived context computed from contributions
 * These are read-only computed values extracted from the contribution stream
 */
export interface DerivedContext {
    /** Session information */
    session: {
        id: string;
        startTime: string;
        tokensUsed: number;
    };
    /** Workpackage information */
    workpackage: {
        active?: string;
        progress?: number;
    };
    /** Extensible for additional derived values */
    [key: string]: any;
}
/**
 * Full shared context structure with versioning and persistence
 * This is the complete context stored to disk
 */
export interface FullSharedContext {
    /** Schema version for migrations */
    version: string;
    /** When this context was created */
    created: string;
    /** All contributions (append-only, immutable) */
    contributions: ContextContribution[];
    /** Derived context computed from contributions */
    derived: DerivedContext;
}
/**
 * Base error for context operations
 */
export declare class ContextError extends Error {
    readonly operation: string;
    readonly context?: Record<string, any> | undefined;
    constructor(message: string, operation: string, context?: Record<string, any> | undefined);
}
/**
 * Error for lock-related failures
 */
export declare class ContextLockError extends ContextError {
    readonly lockFile: string;
    readonly timeout?: number | undefined;
    constructor(message: string, lockFile: string, timeout?: number | undefined);
}
/**
 * Logger interface for context operations
 * Allows injection of custom loggers while defaulting to console
 */
export interface ContextLogger {
    error(message: string, context?: Record<string, any>): void;
    warn(message: string, context?: Record<string, any>): void;
    info(message: string, context?: Record<string, any>): void;
    debug(message: string, context?: Record<string, any>): void;
}
/**
 * Default console logger implementation
 */
export declare const defaultLogger: ContextLogger;
/**
 * Result of a contribution attempt
 */
export interface ContributeResult {
    /** Whether the contribution was successful */
    success: boolean;
    /** Warning message if data was sanitized */
    warning?: string;
    /** Error message if contribution failed */
    error?: string;
}
/**
 * Version constants for context schema
 */
export declare const CONTEXT_VERSION = "1.0.0";
/**
 * Stub implementation of SharedContext for A1.2
 * Real implementation will be provided in A1.3
 */
export declare class StubSharedContext implements SharedContext {
    private contributions;
    /**
     * Stub contribute - stores in memory only
     * A1.3 will provide persistent, file-backed implementation
     */
    contribute(namespace: string, data: any): Promise<void>;
    /**
     * Get current contributions (for testing/debugging)
     */
    getSnapshot(): Promise<any>;
    /**
     * Clear contributions (for testing)
     */
    clear(): void;
}
//# sourceMappingURL=types.d.ts.map