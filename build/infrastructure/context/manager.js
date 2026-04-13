"use strict";
/**
 * Context Manager
 *
 * Manages shared context with append-only contributions, derivation engine,
 * and query interface. Provides thread-safe access via file locking.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextManager = void 0;
const storage_1 = require("./storage");
const types_1 = require("./types");
/**
 * Manages shared context with persistence, locking, and derivation
 */
class ContextManager {
    /**
     * Creates a new ContextManager
     * @param options - Configuration options
     */
    constructor(options = {}) {
        this.initialized = false;
        this.storage = new storage_1.ContextStorage(options);
        this.autoInitialize = options.autoInitialize ?? true;
        this.autoDerive = options.autoDerive ?? true;
        this.logger = options.logger ?? types_1.defaultLogger;
    }
    /**
     * Contribute data to shared context (append-only)
     * @param namespace - Namespace of the contributor (e.g., 'clear.session.init')
     * @param data - Data to contribute (will be sanitized and deep frozen)
     * @returns Result indicating success/failure and any warnings
     */
    async contribute(namespace, data) {
        try {
            // Validate namespace
            if (!namespace || typeof namespace !== 'string') {
                this.logger.warn('Invalid namespace provided', { namespace });
                return {
                    success: false,
                    error: 'Invalid namespace: must be a non-empty string'
                };
            }
            // Sanitize data before storing
            const { sanitized, warning } = this.sanitize(data);
            if (warning) {
                this.logger.warn(`Data sanitized for namespace ${namespace}`, { warning });
            }
            // Ensure initialized
            await this.ensureInitialized();
            // Acquire lock for exclusive access
            const release = await this.storage.acquireLock();
            try {
                // Load current context
                const context = await this.storage.load();
                // Create immutable contribution
                const contribution = {
                    timestamp: new Date().toISOString(),
                    namespace,
                    data: this.deepFreeze(sanitized),
                    frozen: true
                };
                // Append contribution (never modify existing)
                context.contributions.push(contribution);
                // Update derived context if auto-derive enabled
                if (this.autoDerive) {
                    context.derived = this.derive(context.contributions);
                }
                // Save atomically
                await this.storage.save(context);
                return {
                    success: true,
                    warning
                };
            }
            finally {
                // Always release lock
                await release();
            }
        }
        catch (error) {
            // Never let contribution errors crash the framework
            // Note: Uses duck-typing because errors from different realms (e.g., Jest) may not pass instanceof
            const errorMessage = error && typeof error === 'object' && 'message' in error
                ? String(error.message)
                : String(error);
            const errorStack = error && typeof error === 'object' && 'stack' in error
                ? String(error.stack)
                : undefined;
            this.logger.error(`Contribution failed for namespace ${namespace}`, {
                error: errorMessage,
                stack: errorStack
            });
            return {
                success: false,
                error: errorMessage
            };
        }
    }
    /**
     * Get current context snapshot (for debugging/testing)
     * @returns Current context state
     */
    async getSnapshot() {
        await this.ensureInitialized();
        return await this.storage.load();
    }
    /**
     * Query derived context using dot notation
     * @param path - Dot-notation path (e.g., 'session.id', 'workpackage.active')
     * @returns Value at path, or undefined if not found
     * @throws ContextError if query fails
     */
    async query(path) {
        await this.ensureInitialized();
        try {
            const context = await this.storage.load();
            return this.queryPath(context.derived, path);
        }
        catch (error) {
            // Note: Uses duck-typing because errors from different realms (e.g., Jest) may not pass instanceof
            const errorMessage = error && typeof error === 'object' && 'message' in error
                ? String(error.message)
                : String(error);
            throw new types_1.ContextError(`Failed to query context: ${errorMessage}`, 'query', { path });
        }
    }
    /**
     * Get all contributions for a specific namespace
     * @param namespace - Namespace to filter by
     * @returns Array of contributions from this namespace
     */
    async getContributions(namespace) {
        await this.ensureInitialized();
        const context = await this.storage.load();
        return context.contributions.filter(c => c.namespace === namespace);
    }
    /**
     * Get all contributions
     * @returns Array of all contributions
     */
    async getAllContributions() {
        await this.ensureInitialized();
        const context = await this.storage.load();
        return context.contributions;
    }
    /**
     * Manually trigger derivation (if auto-derive is disabled)
     * @throws ContextError if derivation fails
     */
    async rederive() {
        await this.ensureInitialized();
        const release = await this.storage.acquireLock();
        try {
            const context = await this.storage.load();
            context.derived = this.derive(context.contributions);
            await this.storage.save(context);
        }
        finally {
            await release();
        }
    }
    /**
     * Initialize context if needed
     * @returns True if new context was created
     */
    async initialize() {
        const created = await this.storage.initialize();
        this.initialized = true;
        return created;
    }
    /**
     * Check if context exists
     * @returns True if context file exists
     */
    async exists() {
        return await this.storage.exists();
    }
    /**
     * Clear all context (for testing only)
     * @throws ContextError if clear fails
     */
    async clear() {
        const release = await this.storage.acquireLock();
        try {
            await this.storage.delete();
            await this.storage.initialize();
            this.initialized = true;
        }
        finally {
            await release();
        }
    }
    /**
     * Get path to context file
     * @returns Absolute path to context file
     */
    getContextPath() {
        return this.storage.getContextPath();
    }
    /**
     * Ensure context is initialized
     * @private
     */
    async ensureInitialized() {
        if (!this.initialized && this.autoInitialize) {
            await this.initialize();
        }
        if (!this.initialized) {
            throw new types_1.ContextError('Context not initialized. Call initialize() first.', 'ensureInitialized');
        }
    }
    /**
     * Deep freeze an object to make it immutable
     * @param obj - Object to freeze
     * @returns Frozen object
     * @private
     */
    deepFreeze(obj) {
        // Handle primitives and null
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        // Freeze the object itself
        Object.freeze(obj);
        // Recursively freeze all properties
        Object.getOwnPropertyNames(obj).forEach((prop) => {
            const value = obj[prop];
            if (value !== null &&
                (typeof value === 'object' || typeof value === 'function') &&
                !Object.isFrozen(value)) {
                this.deepFreeze(value);
            }
        });
        return obj;
    }
    /**
     * Sanitize data to ensure it's JSON-serializable
     * Handles circular references, functions, symbols, undefined values
     * @param data - Data to sanitize
     * @returns Sanitized data and optional warning message
     * @private
     */
    sanitize(data) {
        const warnings = [];
        // Handle null and undefined
        if (data === null) {
            return { sanitized: null };
        }
        if (data === undefined) {
            warnings.push('undefined value replaced with null');
            return { sanitized: null, warning: warnings.join('; ') };
        }
        // Handle primitives
        if (typeof data !== 'object' && typeof data !== 'function') {
            // Check for special number values
            if (typeof data === 'number' && !Number.isFinite(data)) {
                warnings.push(`non-finite number (${data}) replaced with null`);
                return { sanitized: null, warning: warnings.join('; ') };
            }
            // Handle symbols
            if (typeof data === 'symbol') {
                warnings.push('symbol replaced with string representation');
                return { sanitized: data.toString(), warning: warnings.join('; ') };
            }
            return { sanitized: data };
        }
        // Handle functions
        if (typeof data === 'function') {
            warnings.push('function replaced with null');
            return { sanitized: null, warning: warnings.join('; ') };
        }
        // Check for circular references and sanitize recursively
        const seen = new WeakSet();
        const sanitized = this.sanitizeValue(data, seen, warnings, '');
        return {
            sanitized,
            warning: warnings.length > 0 ? warnings.join('; ') : undefined
        };
    }
    /**
     * Recursively sanitize a value, tracking seen objects for circular detection
     * @param value - Value to sanitize
     * @param seen - Set of already-seen objects
     * @param warnings - Array to collect warning messages
     * @param path - Current path for error reporting
     * @returns Sanitized value
     * @private
     */
    sanitizeValue(value, seen, warnings, path) {
        // Handle null
        if (value === null) {
            return null;
        }
        // Handle undefined
        if (value === undefined) {
            warnings.push(`undefined at ${path || 'root'} replaced with null`);
            return null;
        }
        // Handle primitives
        if (typeof value !== 'object' && typeof value !== 'function') {
            // Check for special number values
            if (typeof value === 'number' && !Number.isFinite(value)) {
                warnings.push(`non-finite number at ${path || 'root'} replaced with null`);
                return null;
            }
            // Handle symbols
            if (typeof value === 'symbol') {
                warnings.push(`symbol at ${path || 'root'} replaced with string`);
                return value.toString();
            }
            // Handle BigInt
            if (typeof value === 'bigint') {
                warnings.push(`BigInt at ${path || 'root'} converted to string`);
                return value.toString();
            }
            return value;
        }
        // Handle functions
        if (typeof value === 'function') {
            warnings.push(`function at ${path || 'root'} replaced with null`);
            return null;
        }
        // Check for circular reference
        if (seen.has(value)) {
            warnings.push(`circular reference at ${path || 'root'} replaced with null`);
            return null;
        }
        // Mark as seen
        seen.add(value);
        // Handle arrays
        if (Array.isArray(value)) {
            return value.map((item, index) => this.sanitizeValue(item, seen, warnings, `${path}[${index}]`));
        }
        // Handle Date objects
        if (value instanceof Date) {
            return value.toISOString();
        }
        // Handle RegExp
        if (value instanceof RegExp) {
            return value.toString();
        }
        // Handle Map
        if (value instanceof Map) {
            warnings.push(`Map at ${path || 'root'} converted to object`);
            const obj = {};
            value.forEach((v, k) => {
                const key = String(k);
                obj[key] = this.sanitizeValue(v, seen, warnings, `${path}.${key}`);
            });
            return obj;
        }
        // Handle Set
        if (value instanceof Set) {
            warnings.push(`Set at ${path || 'root'} converted to array`);
            return Array.from(value).map((item, index) => this.sanitizeValue(item, seen, warnings, `${path}[${index}]`));
        }
        // Handle plain objects
        const sanitized = {};
        for (const key of Object.keys(value)) {
            // Skip symbol keys
            if (typeof key === 'symbol') {
                warnings.push(`symbol key at ${path} skipped`);
                continue;
            }
            sanitized[key] = this.sanitizeValue(value[key], seen, warnings, path ? `${path}.${key}` : key);
        }
        return sanitized;
    }
    /**
     * Derive context from contributions
     * @param contributions - All contributions to process
     * @returns Derived context
     * @private
     */
    derive(contributions) {
        const derived = {
            session: {
                id: '',
                startTime: '',
                tokensUsed: 0
            },
            workpackage: {}
        };
        // Process contributions in order to build derived state
        for (const contrib of contributions) {
            switch (contrib.namespace) {
                case 'clear.session.init':
                    if (contrib.data.session_id) {
                        derived.session.id = contrib.data.session_id;
                    }
                    if (contrib.data.timestamp || contrib.timestamp) {
                        derived.session.startTime = contrib.data.timestamp || contrib.timestamp;
                    }
                    break;
                case 'clear.session.start':
                    if (contrib.data.session_id) {
                        derived.session.id = contrib.data.session_id;
                    }
                    derived.session.startTime = contrib.timestamp;
                    break;
                case 'clear.token.monitor':
                case 'clear.tokens.update':
                    if (contrib.data.tokens_used !== undefined) {
                        derived.session.tokensUsed = contrib.data.tokens_used;
                    }
                    if (contrib.data.tokensUsed !== undefined) {
                        derived.session.tokensUsed = contrib.data.tokensUsed;
                    }
                    break;
                case 'clear.workpackage.active':
                case 'clear.workpackage.start':
                    if (contrib.data.workpackage_id) {
                        derived.workpackage.active = contrib.data.workpackage_id;
                    }
                    if (contrib.data.id) {
                        derived.workpackage.active = contrib.data.id;
                    }
                    break;
                case 'clear.workpackage.progress':
                    if (contrib.data.progress !== undefined) {
                        derived.workpackage.progress = contrib.data.progress;
                    }
                    break;
                // Extensible - other namespaces can add to derived context
                default:
                    // Store under namespace key for custom derivations
                    if (contrib.namespace.startsWith('clear.')) {
                        const parts = contrib.namespace.split('.');
                        if (parts.length >= 3) {
                            const category = parts[1]; // e.g., 'session', 'workpackage'
                            const key = parts.slice(2).join('_'); // e.g., 'custom_data'
                            if (!derived[category]) {
                                derived[category] = {};
                            }
                            if (typeof derived[category] === 'object') {
                                derived[category][key] = contrib.data;
                            }
                        }
                    }
                    break;
            }
        }
        return derived;
    }
    /**
     * Query a value using dot notation path
     * @param obj - Object to query
     * @param path - Dot-notation path
     * @returns Value at path, or undefined
     * @private
     */
    queryPath(obj, path) {
        if (!path) {
            return obj;
        }
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }
            if (typeof current !== 'object') {
                return undefined;
            }
            current = current[part];
        }
        return current;
    }
}
exports.ContextManager = ContextManager;
//# sourceMappingURL=manager.js.map