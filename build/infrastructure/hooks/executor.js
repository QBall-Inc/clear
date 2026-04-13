"use strict";
/**
 * Hook Executor
 *
 * Executes hook bash scripts with proper timeout handling, JSON I/O,
 * and error recovery. Manages process lifecycle and resource cleanup.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HookExecutor = exports.HookExecutionError = void 0;
const child_process_1 = require("child_process");
/**
 * Custom error for hook execution failures
 */
class HookExecutionError extends Error {
    constructor(message, namespace, exitCode, signal, stderr) {
        super(message);
        this.namespace = namespace;
        this.exitCode = exitCode;
        this.signal = signal;
        this.stderr = stderr;
        this.name = 'HookExecutionError';
        Object.setPrototypeOf(this, HookExecutionError.prototype);
    }
}
exports.HookExecutionError = HookExecutionError;
/**
 * Executor for running hook bash scripts
 */
class HookExecutor {
    /**
     * Creates a new HookExecutor
     * @param defaultTimeout - Default timeout in milliseconds
     */
    constructor(defaultTimeout) {
        this.defaultTimeout = 1000; // 1 second default
        this.killGracePeriod = 100; // 100ms grace period before SIGKILL
        if (defaultTimeout !== undefined) {
            this.defaultTimeout = defaultTimeout;
        }
    }
    /**
     * Execute a hook script with JSON input
     * @param hook - Hook registration to execute
     * @param input - JSON input data for the hook
     * @returns Hook execution result
     * @throws HookExecutionError if execution fails
     */
    async execute(hook, input) {
        const startTime = Date.now();
        const timeout = hook.timeout || this.defaultTimeout;
        const inputJson = typeof input === 'string' ? input : JSON.stringify(input);
        try {
            // Get script path from hook args
            const scriptPath = hook.args[0];
            if (!scriptPath) {
                throw new HookExecutionError('Hook registration missing script path in args', hook.namespace);
            }
            // Execute the script
            const output = await this.executeScript(scriptPath, inputJson, timeout, hook.namespace);
            // Parse and validate JSON output
            let parsedOutput;
            try {
                parsedOutput = JSON.parse(output);
            }
            catch (e) {
                throw new HookExecutionError(`Hook returned invalid JSON: ${output.substring(0, 100)}`, hook.namespace);
            }
            const executionTime = Date.now() - startTime;
            return {
                namespace: hook.namespace,
                status: 'success',
                output: parsedOutput,
                executionTime
            };
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            if (error instanceof HookExecutionError) {
                // Re-throw execution errors with result
                return {
                    namespace: hook.namespace,
                    status: error.message.includes('timed out') ? 'timeout' : 'error',
                    error: error.message,
                    executionTime
                };
            }
            // Wrap unexpected errors
            // Note: Uses duck-typing because errors from different realms (e.g., Jest) may not pass instanceof
            const errorMessage = error && typeof error === 'object' && 'message' in error
                ? String(error.message)
                : String(error);
            return {
                namespace: hook.namespace,
                status: 'error',
                error: errorMessage || 'Unknown error',
                executionTime
            };
        }
    }
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
    executeScript(scriptPath, input, timeout, namespace) {
        return new Promise((resolve, reject) => {
            // Spawn bash process
            const child = (0, child_process_1.spawn)('bash', [scriptPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let timer;
            // Set timeout with graceful shutdown
            timer = setTimeout(() => {
                timedOut = true;
                // Send SIGTERM first
                child.kill('SIGTERM');
                // Force kill with SIGKILL after grace period
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill('SIGKILL');
                    }
                }, this.killGracePeriod);
            }, timeout);
            // Collect stdout
            if (child.stdout) {
                child.stdout.on('data', (data) => {
                    stdout += data.toString();
                });
            }
            // Collect stderr
            if (child.stderr) {
                child.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
            }
            // Handle process exit
            child.on('exit', (code, signal) => {
                clearTimeout(timer);
                if (timedOut) {
                    reject(new HookExecutionError(`Hook timed out after ${timeout}ms`, namespace, undefined, signal || 'SIGTERM'));
                }
                else if (code !== 0) {
                    reject(new HookExecutionError(`Hook exited with code ${code}`, namespace, code || undefined, signal || undefined, stderr));
                }
                else {
                    resolve(stdout);
                }
            });
            // Handle spawn errors
            child.on('error', (err) => {
                clearTimeout(timer);
                reject(new HookExecutionError(`Failed to spawn hook process: ${err.message}`, namespace));
            });
            // Write input to stdin
            if (child.stdin) {
                try {
                    child.stdin.write(input);
                    child.stdin.end();
                }
                catch (err) {
                    clearTimeout(timer);
                    child.kill('SIGKILL');
                    reject(new HookExecutionError(`Failed to write to stdin: ${err.message}`, namespace));
                }
            }
            else {
                clearTimeout(timer);
                child.kill('SIGKILL');
                reject(new HookExecutionError('Child process stdin is not available', namespace));
            }
        });
    }
    /**
     * Execute multiple hooks sequentially
     * @param hooks - Array of hooks to execute
     * @param input - JSON input data for all hooks
     * @returns Array of hook results
     */
    async executeSequential(hooks, input) {
        const results = [];
        for (const hook of hooks) {
            const result = await this.execute(hook, input);
            results.push(result);
        }
        return results;
    }
    /**
     * Set default timeout for hook execution
     * @param timeout - Timeout in milliseconds
     */
    setDefaultTimeout(timeout) {
        this.defaultTimeout = timeout;
    }
    /**
     * Get current default timeout
     * @returns Default timeout in milliseconds
     */
    getDefaultTimeout() {
        return this.defaultTimeout;
    }
}
exports.HookExecutor = HookExecutor;
//# sourceMappingURL=executor.js.map