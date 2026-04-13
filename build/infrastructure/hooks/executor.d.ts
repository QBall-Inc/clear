/**
 * Hook Executor
 *
 * Executes hook bash scripts with proper timeout handling, JSON I/O,
 * and error recovery. Manages process lifecycle and resource cleanup.
 */
import { HookRegistration, HookResult } from './types';
/**
 * Custom error for hook execution failures
 */
export declare class HookExecutionError extends Error {
    readonly namespace: string;
    readonly exitCode?: number | undefined;
    readonly signal?: string | undefined;
    readonly stderr?: string | undefined;
    constructor(message: string, namespace: string, exitCode?: number | undefined, signal?: string | undefined, stderr?: string | undefined);
}
/**
 * Executor for running hook bash scripts
 */
export declare class HookExecutor {
    private defaultTimeout;
    private killGracePeriod;
    /**
     * Creates a new HookExecutor
     * @param defaultTimeout - Default timeout in milliseconds
     */
    constructor(defaultTimeout?: number);
    /**
     * Execute a hook script with JSON input
     * @param hook - Hook registration to execute
     * @param input - JSON input data for the hook
     * @returns Hook execution result
     * @throws HookExecutionError if execution fails
     */
    execute(hook: HookRegistration, input: any): Promise<HookResult>;
    /**
     * Execute a bash script with stdin/stdout handling
     * @param scriptPath - Path to bash script
     * @param input - JSON string to pipe to stdin
     * @param timeout - Timeout in milliseconds
     * @param namespace - Hook namespace for error reporting
     * @returns Script stdout output
     * @throws HookExecutionError on execution failure
     * @private
     */
    private executeScript;
    /**
     * Execute multiple hooks sequentially
     * @param hooks - Array of hooks to execute
     * @param input - JSON input data for all hooks
     * @returns Array of hook results
     */
    executeSequential(hooks: HookRegistration[], input: any): Promise<HookResult[]>;
    /**
     * Set default timeout for hook execution
     * @param timeout - Timeout in milliseconds
     */
    setDefaultTimeout(timeout: number): void;
    /**
     * Get current default timeout
     * @returns Default timeout in milliseconds
     */
    getDefaultTimeout(): number;
}
//# sourceMappingURL=executor.d.ts.map