/**
 * Context Manager
 *
 * Manages shared context with append-only contributions, derivation engine,
 * and query interface. Provides thread-safe access via file locking.
 */
import { StorageOptions } from './storage';
import { SharedContext, ContextContribution, FullSharedContext, ContextLogger, ContributeResult } from './types';
/**
 * Context manager configuration
 */
export interface ContextManagerOptions extends StorageOptions {
    /** Whether to automatically initialize context file (default: true) */
    autoInitialize?: boolean;
    /** Whether to enable auto-derivation after contributions (default: true) */
    autoDerive?: boolean;
    /** Logger for context operations (default: console logger) */
    logger?: ContextLogger;
}
/**
 * Manages shared context with persistence, locking, and derivation
 */
export declare class ContextManager implements SharedContext {
    private storage;
    private autoInitialize;
    private autoDerive;
    private initialized;
    private logger;
    /**
     * Creates a new ContextManager
     * @param options - Configuration options
     */
    constructor(options?: ContextManagerOptions);
    /**
     * Contribute data to shared context (append-only)
     * @param namespace - Namespace of the contributor (e.g., 'clear.session.init')
     * @param data - Data to contribute (will be sanitized and deep frozen)
     * @returns Result indicating success/failure and any warnings
     */
    contribute(namespace: string, data: any): Promise<ContributeResult>;
    /**
     * Get current context snapshot (for debugging/testing)
     * @returns Current context state
     */
    getSnapshot(): Promise<FullSharedContext>;
    /**
     * Query derived context using dot notation
     * @param path - Dot-notation path (e.g., 'session.id', 'workpackage.active')
     * @returns Value at path, or undefined if not found
     * @throws ContextError if query fails
     */
    query(path: string): Promise<any>;
    /**
     * Get all contributions for a specific namespace
     * @param namespace - Namespace to filter by
     * @returns Array of contributions from this namespace
     */
    getContributions(namespace: string): Promise<ContextContribution[]>;
    /**
     * Get all contributions
     * @returns Array of all contributions
     */
    getAllContributions(): Promise<ContextContribution[]>;
    /**
     * Manually trigger derivation (if auto-derive is disabled)
     * @throws ContextError if derivation fails
     */
    rederive(): Promise<void>;
    /**
     * Initialize context if needed
     * @returns True if new context was created
     */
    initialize(): Promise<boolean>;
    /**
     * Check if context exists
     * @returns True if context file exists
     */
    exists(): Promise<boolean>;
    /**
     * Clear all context (for testing only)
     * @throws ContextError if clear fails
     */
    clear(): Promise<void>;
    /**
     * Get path to context file
     * @returns Absolute path to context file
     */
    getContextPath(): string;
    /**
     * Ensure context is initialized
     * @private
     */
    private ensureInitialized;
    /**
     * Deep freeze an object to make it immutable
     * @param obj - Object to freeze
     * @returns Frozen object
     * @private
     */
    private deepFreeze;
    /**
     * Sanitize data to ensure it's JSON-serializable
     * Handles circular references, functions, symbols, undefined values
     * @param data - Data to sanitize
     * @returns Sanitized data and optional warning message
     * @private
     */
    private sanitize;
    /**
     * Recursively sanitize a value, tracking seen objects for circular detection
     * @param value - Value to sanitize
     * @param seen - Set of already-seen objects
     * @param warnings - Array to collect warning messages
     * @param path - Current path for error reporting
     * @returns Sanitized value
     * @private
     */
    private sanitizeValue;
    /**
     * Derive context from contributions
     * @param contributions - All contributions to process
     * @returns Derived context
     * @private
     */
    private derive;
    /**
     * Query a value using dot notation path
     * @param obj - Object to query
     * @param path - Dot-notation path
     * @returns Value at path, or undefined
     * @private
     */
    private queryPath;
}
//# sourceMappingURL=manager.d.ts.map