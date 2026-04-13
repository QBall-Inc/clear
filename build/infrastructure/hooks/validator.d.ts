/**
 * Hook script validator
 *
 * Validates generated bash scripts for syntax, proper jq usage,
 * and correct JSON I/O handling.
 */
import { ScriptValidationResult } from './types';
/**
 * Validates hook scripts
 */
export declare class HookScriptValidator {
    /**
     * Validate a hook script file
     * @param scriptPath - Path to the script to validate
     * @returns Validation result
     */
    validateScript(scriptPath: string): Promise<ScriptValidationResult>;
    /**
     * Validate bash syntax using bash -n
     */
    private validateBashSyntax;
    /**
     * Validate that script outputs valid JSON
     */
    private validateJsonOutput;
    /**
     * Test script execution with sample input
     * @param scriptPath - Path to script
     * @param input - JSON input to pass to script
     * @param timeout - Timeout in milliseconds (default 5000)
     * @returns Validation result with output
     */
    testScriptExecution(scriptPath: string, input: any, timeout?: number): Promise<ScriptValidationResult & {
        output?: any;
    }>;
    /**
     * Validate multiple scripts
     * @param scriptPaths - Array of script paths
     * @returns Map of script path to validation result
     */
    validateScripts(scriptPaths: string[]): Promise<Map<string, ScriptValidationResult>>;
}
//# sourceMappingURL=validator.d.ts.map