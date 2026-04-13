"use strict";
/**
 * Hook Orchestrator
 *
 * Manages deterministic execution of hooks in response to Claude Code events.
 * Ensures strict priority ordering, proper timeout handling, and graceful error recovery.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HookOrchestrator = exports.HookOrchestrationError = void 0;
const registry_1 = require("./registry");
const executor_1 = require("./executor");
const manager_1 = require("../context/manager");
/**
 * Custom error for orchestration failures
 */
class HookOrchestrationError extends Error {
    constructor(message, event, context) {
        super(message);
        this.event = event;
        this.context = context;
        this.name = 'HookOrchestrationError';
        Object.setPrototypeOf(this, HookOrchestrationError.prototype);
    }
}
exports.HookOrchestrationError = HookOrchestrationError;
/**
 * Orchestrator for managing hook execution
 */
class HookOrchestrator {
    /**
     * Creates a new HookOrchestrator
     * @param registry - Hook registry for loading hooks
     * @param executor - Hook executor for running scripts
     * @param context - Shared context for hook coordination (optional, uses ContextManager if not provided)
     * @param config - Orchestrator configuration
     */
    constructor(registry, executor, context, config) {
        this.registry = registry || new registry_1.HookRegistry();
        this.executor = executor || new executor_1.HookExecutor();
        this.context = context || new manager_1.ContextManager();
        // Set default configuration
        this.config = {
            maxHooksPerEvent: config?.maxHooksPerEvent ?? 50,
            defaultTimeout: config?.defaultTimeout ?? 1000,
            continueOnError: config?.continueOnError ?? true,
            respectStopPropagation: config?.respectStopPropagation ?? true
        };
        // Configure executor with default timeout
        this.executor.setDefaultTimeout(this.config.defaultTimeout);
    }
    /**
     * Handle a Claude Code event by executing all registered hooks
     * @param event - Event name (e.g., 'Start', 'FileCreated')
     * @param payload - Event payload data
     * @returns Results from all executed hooks
     * @throws HookOrchestrationError if orchestration fails critically
     */
    async handleEvent(event, payload = {}) {
        // Get hooks for this event
        const hooks = await this.registry.getHooksForEvent(event);
        if (hooks.length === 0) {
            return {
                event,
                results: []
            };
        }
        // Enforce hook limit
        let hooksToExecute = hooks;
        if (hooks.length > this.config.maxHooksPerEvent) {
            console.warn(`Event '${event}' has ${hooks.length} hooks registered, ` +
                `limiting to ${this.config.maxHooksPerEvent}`);
            hooksToExecute = hooks.slice(0, this.config.maxHooksPerEvent);
        }
        // Execute hooks sequentially in priority order
        const results = [];
        for (const hook of hooksToExecute) {
            try {
                const result = await this.executeHook(hook, event, payload);
                results.push(result);
                // Contribute hook result to shared context (A1.3 will provide full implementation)
                if (result.status === 'success' && result.output) {
                    await this.context.contribute(hook.namespace, result.output);
                }
                // Check for stop propagation
                if (this.config.respectStopPropagation && result.output?.stopPropagation) {
                    console.log(`Hook ${hook.namespace} requested stop propagation`);
                    break;
                }
            }
            catch (error) {
                // Create error result
                // Note: Uses duck-typing because errors from different realms (e.g., Jest) may not pass instanceof
                const errorMessage = error && typeof error === 'object' && 'message' in error
                    ? String(error.message)
                    : String(error);
                const errorResult = {
                    namespace: hook.namespace,
                    status: 'error',
                    error: errorMessage || 'Unknown error'
                };
                results.push(errorResult);
                // Check if we should continue
                if (!this.config.continueOnError || this.isCriticalError(error)) {
                    console.error(`Critical error in hook ${hook.namespace}, stopping execution`);
                    break;
                }
            }
        }
        return {
            event,
            results
        };
    }
    /**
     * Execute a single hook with proper input preparation
     * @param hook - Hook to execute
     * @param event - Event name
     * @param payload - Event payload
     * @returns Hook execution result
     * @private
     */
    async executeHook(hook, event, payload) {
        // Prepare input with metadata
        const input = {
            ...payload,
            _metadata: {
                event,
                namespace: hook.namespace,
                timestamp: new Date().toISOString(),
                priority: hook.priority
            }
        };
        // Execute the hook
        return await this.executor.execute(hook, input);
    }
    /**
     * Check if an error is critical and should stop execution
     * @param error - Error to check
     * @returns True if error is critical
     * @private
     */
    isCriticalError(error) {
        // Timeouts and execution errors are not critical by default
        if (error instanceof executor_1.HookExecutionError) {
            return false;
        }
        // System-level errors are critical
        // Note: Uses duck-typing because errors from different realms (e.g., Jest) may not pass instanceof
        if (error && typeof error === 'object' && 'code' in error) {
            const errorCode = error.code;
            if (errorCode === 'EMFILE' || errorCode === 'ENOMEM') {
                return true;
            }
        }
        return false;
    }
    /**
     * Get statistics about hook execution
     * @param event - Optional event to get stats for
     * @returns Statistics object
     */
    async getStats(event) {
        if (event) {
            const eventHooks = await this.registry.getEventHookCount(event);
            return {
                totalHooks: await this.registry.getTotalHookCount(),
                eventHooks
            };
        }
        return {
            totalHooks: await this.registry.getTotalHookCount(),
            events: (await this.registry.getEvents()).length
        };
    }
    /**
     * Reload hooks from settings.json
     * Useful when settings are updated externally
     */
    async reload() {
        await this.registry.reload();
    }
    /**
     * Update orchestrator configuration
     * @param config - Partial configuration to update
     */
    updateConfig(config) {
        this.config = {
            ...this.config,
            ...config
        };
        // Update executor timeout if changed
        if (config.defaultTimeout !== undefined) {
            this.executor.setDefaultTimeout(config.defaultTimeout);
        }
    }
    /**
     * Get current configuration
     * @returns Current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Get the registry instance
     * @returns Hook registry
     */
    getRegistry() {
        return this.registry;
    }
    /**
     * Get the executor instance
     * @returns Hook executor
     */
    getExecutor() {
        return this.executor;
    }
    /**
     * Get the shared context instance
     * @returns Shared context
     */
    getContext() {
        return this.context;
    }
}
exports.HookOrchestrator = HookOrchestrator;
//# sourceMappingURL=orchestrator.js.map