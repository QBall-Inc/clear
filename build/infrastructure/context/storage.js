"use strict";
/**
 * Context Storage
 *
 * Handles file-based persistence of shared context with atomic writes and locking.
 * Implements file locking compatible with bash scripts using flock pattern.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextStorage = void 0;
const fs = __importStar(require("fs/promises"));
const fsSync = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
/**
 * Extract error message from unknown error
 * Note: Uses duck-typing because errors from different realms (e.g., Jest) may not pass instanceof
 */
function getErrorMessage(error) {
    if (error && typeof error === 'object' && 'message' in error) {
        return String(error.message);
    }
    return String(error);
}
/**
 * Extract error code from unknown error (if Node.js error)
 * Note: Uses duck-typing because errors from different realms (e.g., Jest) may not pass instanceof
 */
function getErrorCode(error) {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = error.code;
        return typeof code === 'string' ? code : undefined;
    }
    return undefined;
}
/**
 * Manages persistent storage of shared context with file locking
 */
class ContextStorage {
    /**
     * Creates a new ContextStorage instance
     * @param options - Storage configuration options
     */
    constructor(options = {}) {
        this.lockFd = null;
        this.contextPath = options.contextPath || path.join('context', 'shared-context.json');
        this.lockPath = `${this.contextPath}.lock`;
        this.lockTimeout = options.lockTimeout ?? 10000;
        this.createDirs = options.createDirs ?? true;
        this.logger = options.logger ?? types_1.defaultLogger;
    }
    /**
     * Acquire exclusive lock on context file
     * Handles stale locks by checking lock file age and force-unlocking if necessary
     * @returns Function to release the lock
     * @throws ContextLockError if lock cannot be acquired within timeout
     */
    async acquireLock() {
        const startTime = Date.now();
        let staleLockChecked = false;
        // Ensure lock directory exists
        if (this.createDirs) {
            await this.ensureDirectoryExists(path.dirname(this.lockPath));
        }
        // Try to acquire lock with timeout
        while (Date.now() - startTime < this.lockTimeout) {
            try {
                // Try to open lock file exclusively (fails if exists)
                this.lockFd = fsSync.openSync(this.lockPath, 'wx');
                // Write process info for debugging
                fsSync.writeSync(this.lockFd, JSON.stringify({
                    pid: process.pid,
                    acquired: new Date().toISOString()
                }));
                // Return release function
                return async () => {
                    await this.releaseLock();
                };
            }
            catch (error) {
                // Lock file exists, check if it's stale
                if (getErrorCode(error) === 'EEXIST') {
                    // Only check for stale lock once to avoid repeated force-unlocks
                    if (!staleLockChecked) {
                        const isStale = await this.checkAndHandleStaleLock();
                        staleLockChecked = true;
                        if (isStale) {
                            // Stale lock was removed, try again immediately
                            continue;
                        }
                    }
                    await this.sleep(50); // Wait 50ms before retry
                    continue;
                }
                // Other errors are critical
                throw new types_1.ContextError(`Failed to create lock file: ${getErrorMessage(error)}`, 'acquireLock', { lockPath: this.lockPath, error: getErrorCode(error) });
            }
        }
        // Timeout reached - try one more force unlock as last resort
        this.logger.warn('Lock acquisition timeout, attempting force unlock', {
            lockPath: this.lockPath,
            timeout: this.lockTimeout
        });
        const forceUnlocked = await this.forceUnlockStaleLock();
        if (forceUnlocked) {
            // Try one more time after force unlock
            try {
                this.lockFd = fsSync.openSync(this.lockPath, 'wx');
                fsSync.writeSync(this.lockFd, JSON.stringify({
                    pid: process.pid,
                    acquired: new Date().toISOString(),
                    forceAcquired: true
                }));
                return async () => {
                    await this.releaseLock();
                };
            }
            catch (error) {
                // Still can't acquire - give up
                this.logger.error('Failed to acquire lock even after force unlock', {
                    lockPath: this.lockPath,
                    error: getErrorMessage(error)
                });
            }
        }
        // Timeout reached
        throw new types_1.ContextLockError(`Failed to acquire lock within ${this.lockTimeout}ms`, this.lockPath, this.lockTimeout);
    }
    /**
     * Check if current lock is stale and handle it
     * @returns True if stale lock was found and removed
     * @private
     */
    async checkAndHandleStaleLock() {
        try {
            // Read lock file to check its age
            const content = await fs.readFile(this.lockPath, 'utf-8');
            const lockInfo = JSON.parse(content);
            if (lockInfo.acquired) {
                const lockAge = Date.now() - new Date(lockInfo.acquired).getTime();
                // If lock is older than timeout, it's likely stale
                if (lockAge > this.lockTimeout) {
                    this.logger.warn('Stale lock detected, forcing unlock', {
                        lockPath: this.lockPath,
                        lockAge: lockAge,
                        lockPid: lockInfo.pid,
                        timeout: this.lockTimeout
                    });
                    return await this.forceUnlockStaleLock();
                }
            }
        }
        catch (error) {
            // Can't read lock file - might be corrupted, try to remove
            if (getErrorCode(error) !== 'ENOENT') {
                this.logger.debug('Could not read lock file, may be corrupted', {
                    lockPath: this.lockPath,
                    error: getErrorMessage(error)
                });
                return await this.forceUnlockStaleLock();
            }
        }
        return false;
    }
    /**
     * Force unlock a stale lock file
     * @returns True if lock was successfully removed
     * @private
     */
    async forceUnlockStaleLock() {
        try {
            await fs.unlink(this.lockPath);
            this.logger.info('Stale lock forcibly removed', { lockPath: this.lockPath });
            return true;
        }
        catch (error) {
            if (getErrorCode(error) === 'ENOENT') {
                // Lock already gone, that's fine
                return true;
            }
            this.logger.error('Failed to remove stale lock', {
                lockPath: this.lockPath,
                error: getErrorMessage(error)
            });
            return false;
        }
    }
    /**
     * Release the lock
     * @private
     */
    async releaseLock() {
        if (this.lockFd !== null) {
            try {
                fsSync.closeSync(this.lockFd);
                this.lockFd = null;
            }
            catch (error) {
                // Log but don't throw - we want to remove lock file anyway
                console.warn(`Error closing lock file descriptor: ${getErrorMessage(error)}`);
            }
            try {
                await fs.unlink(this.lockPath);
            }
            catch (error) {
                // Lock file might already be deleted, ignore ENOENT
                if (getErrorCode(error) !== 'ENOENT') {
                    console.warn(`Error removing lock file: ${getErrorMessage(error)}`);
                }
            }
        }
    }
    /**
     * Load context from file
     * Handles corrupted files by backing up and creating fresh context
     * Handles version compatibility checking
     * @returns The loaded context, or a new context if file doesn't exist or was corrupted
     */
    async load() {
        try {
            // Check if file exists
            await fs.access(this.contextPath);
            // Read and parse
            const content = await fs.readFile(this.contextPath, 'utf-8');
            let context;
            try {
                context = JSON.parse(content);
            }
            catch (parseError) {
                // JSON is corrupted - backup and start fresh
                this.logger.warn('Corrupted context file detected, creating backup', {
                    contextPath: this.contextPath,
                    error: parseError.message
                });
                await this.backupCorruptedFile();
                return this.createNewContext();
            }
            // Check and handle version compatibility
            try {
                context = await this.handleVersionCompatibility(context);
            }
            catch (versionError) {
                // Version error that can't be recovered - throw
                throw versionError;
            }
            // Validate structure
            try {
                this.validateContext(context);
            }
            catch (validationError) {
                // Invalid structure - backup and start fresh
                this.logger.warn('Invalid context structure, creating backup', {
                    contextPath: this.contextPath,
                    error: validationError.message
                });
                await this.backupCorruptedFile();
                return this.createNewContext();
            }
            return context;
        }
        catch (error) {
            // File doesn't exist - return new context
            if (getErrorCode(error) === 'ENOENT') {
                return this.createNewContext();
            }
            // Re-throw ContextErrors as-is
            if (error instanceof types_1.ContextError) {
                throw error;
            }
            // Other errors
            throw new types_1.ContextError(`Failed to read context file: ${getErrorMessage(error)}`, 'load', { contextPath: this.contextPath, error: getErrorCode(error) });
        }
    }
    /**
     * Backup a corrupted context file
     * @private
     */
    async backupCorruptedFile() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = `${this.contextPath}.backup-${timestamp}`;
            await fs.copyFile(this.contextPath, backupPath);
            this.logger.info('Corrupted context file backed up', { backupPath });
        }
        catch (error) {
            // Log but don't fail if backup fails
            this.logger.error('Failed to backup corrupted file', {
                contextPath: this.contextPath,
                error: getErrorMessage(error)
            });
        }
    }
    /**
     * Handle version compatibility
     * @param context - Loaded context to check
     * @returns Context with version handling applied
     * @throws ContextError if version is incompatible
     * @private
     */
    async handleVersionCompatibility(context) {
        // Handle missing version (pre-1.0.0 context)
        if (!context.version) {
            this.logger.info('Migrating pre-1.0.0 context to current version', {
                currentVersion: types_1.CONTEXT_VERSION
            });
            // Attempt to migrate old structure
            return {
                version: types_1.CONTEXT_VERSION,
                created: context.created || new Date().toISOString(),
                contributions: Array.isArray(context.contributions) ? context.contributions : [],
                derived: context.derived || this.createEmptyDerived()
            };
        }
        // Parse versions for comparison
        const [currentMajor, currentMinor] = types_1.CONTEXT_VERSION.split('.').map(Number);
        const [fileMajor, fileMinor] = context.version.split('.').map(Number);
        // Check for future version (incompatible)
        if (fileMajor > currentMajor || (fileMajor === currentMajor && fileMinor > currentMinor)) {
            throw new types_1.ContextError(`Context file version ${context.version} is newer than supported version ${types_1.CONTEXT_VERSION}. ` +
                `Please upgrade CLEAR framework to read this context file.`, 'load', { fileVersion: context.version, supportedVersion: types_1.CONTEXT_VERSION });
        }
        // Same or older version - compatible
        if (context.version !== types_1.CONTEXT_VERSION) {
            this.logger.debug('Loading context with older version', {
                fileVersion: context.version,
                currentVersion: types_1.CONTEXT_VERSION
            });
        }
        return context;
    }
    /**
     * Save context to file atomically
     * @param context - Context to save
     * @throws ContextError if save fails
     */
    async save(context) {
        try {
            // Ensure directory exists
            if (this.createDirs) {
                await this.ensureDirectoryExists(path.dirname(this.contextPath));
            }
            // Validate before saving
            this.validateContext(context);
            // Atomic write using temp file + rename
            const tempPath = `${this.contextPath}.tmp`;
            const content = JSON.stringify(context, null, 2);
            await fs.writeFile(tempPath, content, 'utf-8');
            await fs.rename(tempPath, this.contextPath);
        }
        catch (error) {
            throw new types_1.ContextError(`Failed to save context: ${getErrorMessage(error)}`, 'save', { contextPath: this.contextPath });
        }
    }
    /**
     * Initialize context file if it doesn't exist
     * @returns True if new context was created, false if already exists
     */
    async initialize() {
        try {
            await fs.access(this.contextPath);
            return false; // Already exists
        }
        catch (error) {
            if (getErrorCode(error) === 'ENOENT') {
                // Create new context
                const newContext = this.createNewContext();
                await this.save(newContext);
                return true;
            }
            throw new types_1.ContextError(`Failed to check context file: ${getErrorMessage(error)}`, 'initialize', { contextPath: this.contextPath });
        }
    }
    /**
     * Check if context file exists
     * @returns True if context file exists
     */
    async exists() {
        try {
            await fs.access(this.contextPath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Delete context file (for testing)
     * @throws ContextError if deletion fails
     */
    async delete() {
        try {
            await fs.unlink(this.contextPath);
        }
        catch (error) {
            if (getErrorCode(error) !== 'ENOENT') {
                throw new types_1.ContextError(`Failed to delete context: ${getErrorMessage(error)}`, 'delete', { contextPath: this.contextPath });
            }
        }
    }
    /**
     * Get path to context file
     * @returns Absolute path to context file
     */
    getContextPath() {
        return path.resolve(this.contextPath);
    }
    /**
     * Create a new empty context
     * @returns New context with defaults
     * @private
     */
    createNewContext() {
        return {
            version: types_1.CONTEXT_VERSION,
            created: new Date().toISOString(),
            contributions: [],
            derived: this.createEmptyDerived()
        };
    }
    /**
     * Create empty derived context
     * @returns Empty derived context with defaults
     * @private
     */
    createEmptyDerived() {
        return {
            session: {
                id: '',
                startTime: '',
                tokensUsed: 0
            },
            workpackage: {}
        };
    }
    /**
     * Validate context structure
     * @param context - Context to validate
     * @throws ContextError if validation fails
     * @private
     */
    validateContext(context) {
        if (!context.version || typeof context.version !== 'string') {
            throw new types_1.ContextError('Invalid context: missing or invalid version', 'validate');
        }
        if (!context.created || typeof context.created !== 'string') {
            throw new types_1.ContextError('Invalid context: missing or invalid created timestamp', 'validate');
        }
        if (!Array.isArray(context.contributions)) {
            throw new types_1.ContextError('Invalid context: contributions must be an array', 'validate');
        }
        if (!context.derived || typeof context.derived !== 'object') {
            throw new types_1.ContextError('Invalid context: missing or invalid derived context', 'validate');
        }
    }
    /**
     * Ensure directory exists, creating if necessary
     * @param dirPath - Directory path
     * @private
     */
    async ensureDirectoryExists(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        }
        catch (error) {
            // Ignore if directory already exists
            if (getErrorCode(error) !== 'EEXIST') {
                throw error;
            }
        }
    }
    /**
     * Sleep for specified milliseconds
     * @param ms - Milliseconds to sleep
     * @private
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.ContextStorage = ContextStorage;
//# sourceMappingURL=storage.js.map