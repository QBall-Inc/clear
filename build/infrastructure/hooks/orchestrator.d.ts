/**
 * Hook Orchestrator
 *
 * Manages deterministic execution of hooks in response to Claude Code events.
 * Ensures strict priority ordering, proper timeout handling, and graceful error recovery.
 */
import { HookRegistry } from './registry';
import { HookExecutor } from './executor';
import { HookResults } from './types';
import { SharedContext } from '../context/types';
/**
 * Configuration options for orchestrator
 */
export interface OrchestratorConfig {
    /** Maximum hooks to execute per event (default: 50) */
    maxHooksPerEvent?: number;
    /** Default timeout for hooks without explicit timeout (default: 1000ms) */
    defaultTimeout?: number;
    /** Whether to continue executing hooks after errors (default: true) */
    continueOnError?: boolean;
    /** Whether to stop execution if a hook requests it (default: true) */
    respectStopPropagation?: boolean;
}
/**
 * Custom error for orchestration failures
 */
export declare class HookOrchestrationError extends Error {
    readonly event: string;
    readonly context?: Record<string, any> | undefined;
    constructor(message: string, event: string, context?: Record<string, any> | undefined);
}
/**
 * Orchestrator for managing hook execution
 */
export declare class HookOrchestrator {
    private registry;
    private executor;
    private context;
    private config;
    /**
     * Creates a new HookOrchestrator
     * @param registry - Hook registry for loading hooks
     * @param executor - Hook executor for running scripts
     * @param context - Shared context for hook coordination (optional, uses ContextManager if not provided)
     * @param config - Orchestrator configuration
     */
    constructor(registry?: HookRegistry, executor?: HookExecutor, context?: SharedContext, config?: OrchestratorConfig);
    /**
     * Handle a Claude Code event by executing all registered hooks
     * @param event - Event name (e.g., 'Start', 'FileCreated')
     * @param payload - Event payload data
     * @returns Results from all executed hooks
     * @throws HookOrchestrationError if orchestration fails critically
     */
    handleEvent(event: string, payload?: any): Promise<HookResults>;
    /**
     * Execute a single hook with proper input preparation
     * @param hook - Hook to execute
     * @param event - Event name
     * @param payload - Event payload
     * @returns Hook execution result
     * @private
     */
    private executeHook;
    /**
     * Check if an error is critical and should stop execution
     * @param error - Error to check
     * @returns True if error is critical
     * @private
     */
    private isCriticalError;
    /**
     * Get statistics about hook execution
     * @param event - Optional event to get stats for
     * @returns Statistics object
     */
    getStats(event?: string): Promise<{
        totalHooks: number;
        events?: number;
        eventHooks?: number;
    }>;
    /**
     * Reload hooks from settings.json
     * Useful when settings are updated externally
     */
    reload(): Promise<void>;
    /**
     * Update orchestrator configuration
     * @param config - Partial configuration to update
     */
    updateConfig(config: Partial<OrchestratorConfig>): void;
    /**
     * Get current configuration
     * @returns Current configuration
     */
    getConfig(): Required<OrchestratorConfig>;
    /**
     * Get the registry instance
     * @returns Hook registry
     */
    getRegistry(): HookRegistry;
    /**
     * Get the executor instance
     * @returns Hook executor
     */
    getExecutor(): HookExecutor;
    /**
     * Get the shared context instance
     * @returns Shared context
     */
    getContext(): SharedContext;
}
//# sourceMappingURL=orchestrator.d.ts.map