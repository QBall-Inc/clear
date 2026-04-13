"use strict";
/**
 * Shared Context Types
 *
 * Type definitions for the shared context system that flows through
 * hook executions and skill operations.
 *
 * Note: Full implementation in A1.3, this provides integration interface for A1.2
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StubSharedContext = exports.CONTEXT_VERSION = exports.defaultLogger = exports.ContextLockError = exports.ContextError = void 0;
/**
 * Base error for context operations
 */
class ContextError extends Error {
    constructor(message, operation, context) {
        super(message);
        this.operation = operation;
        this.context = context;
        this.name = 'ContextError';
        Object.setPrototypeOf(this, ContextError.prototype);
    }
}
exports.ContextError = ContextError;
/**
 * Error for lock-related failures
 */
class ContextLockError extends ContextError {
    constructor(message, lockFile, timeout) {
        super(message, 'lock', { lockFile, timeout });
        this.lockFile = lockFile;
        this.timeout = timeout;
        this.name = 'ContextLockError';
        Object.setPrototypeOf(this, ContextLockError.prototype);
    }
}
exports.ContextLockError = ContextLockError;
/**
 * Default console logger implementation
 */
exports.defaultLogger = {
    error: (message, context) => console.error(`[CONTEXT ERROR] ${message}`, context || ''),
    warn: (message, context) => console.warn(`[CONTEXT WARN] ${message}`, context || ''),
    info: (message, context) => console.info(`[CONTEXT INFO] ${message}`, context || ''),
    debug: (message, context) => console.debug(`[CONTEXT DEBUG] ${message}`, context || '')
};
/**
 * Version constants for context schema
 */
exports.CONTEXT_VERSION = '1.0.0';
/**
 * Stub implementation of SharedContext for A1.2
 * Real implementation will be provided in A1.3
 */
class StubSharedContext {
    constructor() {
        this.contributions = [];
    }
    /**
     * Stub contribute - stores in memory only
     * A1.3 will provide persistent, file-backed implementation
     */
    async contribute(namespace, data) {
        const contribution = {
            timestamp: new Date().toISOString(),
            namespace,
            data,
            frozen: true
        };
        this.contributions.push(contribution);
    }
    /**
     * Get current contributions (for testing/debugging)
     */
    async getSnapshot() {
        return {
            contributions: this.contributions,
            derived: {} // A1.3 will compute derived context
        };
    }
    /**
     * Clear contributions (for testing)
     */
    clear() {
        this.contributions = [];
    }
}
exports.StubSharedContext = StubSharedContext;
//# sourceMappingURL=types.js.map