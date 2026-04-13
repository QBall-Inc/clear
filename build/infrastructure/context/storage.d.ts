/**
 * Context Storage
 *
 * Handles file-based persistence of shared context with atomic writes and locking.
 * Implements file locking compatible with bash scripts using flock pattern.
 */
import { FullSharedContext, ContextLogger } from './types';
/**
 * Storage options
 */
export interface StorageOptions {
    /** Path to context file (default: context/shared-context.json) */
    contextPath?: string;
    /** Lock timeout in milliseconds (default: 10000) */
    lockTimeout?: number;
    /** Whether to create parent directories (default: true) */
    createDirs?: boolean;
    /** Logger for storage operations (default: console logger) */
    logger?: ContextLogger;
}
/**
 * Lock release function
 */
type ReleaseLock = () => Promise<void>;
/**
 * Manages persistent storage of shared context with file locking
 */
export declare class ContextStorage {
    private contextPath;
    private lockPath;
    private lockTimeout;
    private createDirs;
    private lockFd;
    private logger;
    /**
     * Creates a new ContextStorage instance
     * @param options - Storage configuration options
     */
    constructor(options?: StorageOptions);
    /**
     * Acquire exclusive lock on context file
     * Handles stale locks by checking lock file age and force-unlocking if necessary
     * @returns Function to release the lock
     * @throws ContextLockError if lock cannot be acquired within timeout
     */
    acquireLock(): Promise<ReleaseLock>;
    /**
     * Check if current lock is stale and handle it
     * @returns True if stale lock was found and removed
     * @private
     */
    private checkAndHandleStaleLock;
    /**
     * Force unlock a stale lock file
     * @returns True if lock was successfully removed
     * @private
     */
    private forceUnlockStaleLock;
    /**
     * Release the lock
     * @private
     */
    private releaseLock;
    /**
     * Load context from file
     * Handles corrupted files by backing up and creating fresh context
     * Handles version compatibility checking
     * @returns The loaded context, or a new context if file doesn't exist or was corrupted
     */
    load(): Promise<FullSharedContext>;
    /**
     * Backup a corrupted context file
     * @private
     */
    private backupCorruptedFile;
    /**
     * Handle version compatibility
     * @param context - Loaded context to check
     * @returns Context with version handling applied
     * @throws ContextError if version is incompatible
     * @private
     */
    private handleVersionCompatibility;
    /**
     * Save context to file atomically
     * @param context - Context to save
     * @throws ContextError if save fails
     */
    save(context: FullSharedContext): Promise<void>;
    /**
     * Initialize context file if it doesn't exist
     * @returns True if new context was created, false if already exists
     */
    initialize(): Promise<boolean>;
    /**
     * Check if context file exists
     * @returns True if context file exists
     */
    exists(): Promise<boolean>;
    /**
     * Delete context file (for testing)
     * @throws ContextError if deletion fails
     */
    delete(): Promise<void>;
    /**
     * Get path to context file
     * @returns Absolute path to context file
     */
    getContextPath(): string;
    /**
     * Create a new empty context
     * @returns New context with defaults
     * @private
     */
    private createNewContext;
    /**
     * Create empty derived context
     * @returns Empty derived context with defaults
     * @private
     */
    private createEmptyDerived;
    /**
     * Validate context structure
     * @param context - Context to validate
     * @throws ContextError if validation fails
     * @private
     */
    private validateContext;
    /**
     * Ensure directory exists, creating if necessary
     * @param dirPath - Directory path
     * @private
     */
    private ensureDirectoryExists;
    /**
     * Sleep for specified milliseconds
     * @param ms - Milliseconds to sleep
     * @private
     */
    private sleep;
}
export {};
//# sourceMappingURL=storage.d.ts.map