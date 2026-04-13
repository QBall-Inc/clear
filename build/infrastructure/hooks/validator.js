"use strict";
/**
 * Hook script validator
 *
 * Validates generated bash scripts for syntax, proper jq usage,
 * and correct JSON I/O handling.
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
exports.HookScriptValidator = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs/promises"));
/**
 * Validates hook scripts
 */
class HookScriptValidator {
    /**
     * Validate a hook script file
     * @param scriptPath - Path to the script to validate
     * @returns Validation result
     */
    async validateScript(scriptPath) {
        const errors = [];
        const warnings = [];
        try {
            // Check file exists
            await fs.access(scriptPath);
            // Read script content
            const content = await fs.readFile(scriptPath, 'utf-8');
            // Validate shebang
            if (!content.startsWith('#!/bin/bash')) {
                errors.push('Script must start with #!/bin/bash shebang');
            }
            // Validate bash syntax
            const syntaxCheck = await this.validateBashSyntax(scriptPath);
            if (!syntaxCheck.valid) {
                errors.push(...syntaxCheck.errors);
            }
            // Validate jq usage (must use jq, not grep)
            if (!content.includes('jq')) {
                warnings.push('Script does not use jq for JSON parsing');
            }
            // Check for grep usage on JSON (anti-pattern)
            if (content.includes('grep') && content.includes('json')) {
                warnings.push('Script may be using grep for JSON parsing - should use jq instead');
            }
            // Validate error handling
            if (!content.includes('set -euo pipefail')) {
                errors.push('Script must include "set -euo pipefail" for strict error handling');
            }
            // Validate file locking for context updates
            if (content.includes('CONTEXT_FILE') && !content.includes('flock')) {
                warnings.push('Script updates context but does not use flock for concurrency control');
            }
            // Validate JSON output
            const outputCheck = await this.validateJsonOutput(content);
            if (!outputCheck.valid) {
                warnings.push(...(outputCheck.warnings || []));
            }
            return {
                valid: errors.length === 0,
                errors,
                warnings,
            };
        }
        catch (error) {
            return {
                valid: false,
                errors: [`Failed to validate script: ${error.message}`],
                warnings,
            };
        }
    }
    /**
     * Validate bash syntax using bash -n
     */
    async validateBashSyntax(scriptPath) {
        return new Promise((resolve) => {
            const bash = (0, child_process_1.spawn)('bash', ['-n', scriptPath]);
            let stderr = '';
            bash.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            bash.on('close', (code) => {
                if (code === 0) {
                    resolve({ valid: true, errors: [] });
                }
                else {
                    resolve({
                        valid: false,
                        errors: [`Bash syntax error: ${stderr.trim()}`],
                    });
                }
            });
            bash.on('error', (error) => {
                resolve({
                    valid: false,
                    errors: [`Failed to run bash syntax check: ${error.message}`],
                });
            });
        });
    }
    /**
     * Validate that script outputs valid JSON
     */
    validateJsonOutput(content) {
        const warnings = [];
        // Check if script uses jq to generate output
        if (!content.includes('jq -n')) {
            warnings.push('Script should use "jq -n" to generate JSON output for reliability');
        }
        // Check for manual JSON construction (error-prone)
        if (content.match(/echo\s+['"]?\{/)) {
            warnings.push('Script may be constructing JSON manually with echo - use jq instead');
        }
        return {
            valid: true,
            errors: [],
            warnings,
        };
    }
    /**
     * Test script execution with sample input
     * @param scriptPath - Path to script
     * @param input - JSON input to pass to script
     * @param timeout - Timeout in milliseconds (default 5000)
     * @returns Validation result with output
     */
    async testScriptExecution(scriptPath, input, timeout = 5000) {
        return new Promise((resolve) => {
            const bash = (0, child_process_1.spawn)('bash', [scriptPath]);
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            // Set timeout
            const timer = setTimeout(() => {
                timedOut = true;
                bash.kill('SIGTERM');
                setTimeout(() => bash.kill('SIGKILL'), 100);
            }, timeout);
            // Send JSON input
            bash.stdin.write(JSON.stringify(input));
            bash.stdin.end();
            bash.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            bash.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            bash.on('close', (code) => {
                clearTimeout(timer);
                if (timedOut) {
                    resolve({
                        valid: false,
                        errors: [`Script timed out after ${timeout}ms`],
                    });
                    return;
                }
                if (code !== 0) {
                    resolve({
                        valid: false,
                        errors: [
                            `Script exited with code ${code}`,
                            stderr.trim() || 'No error message',
                        ],
                    });
                    return;
                }
                // Try to parse JSON output
                try {
                    const output = JSON.parse(stdout.trim());
                    resolve({
                        valid: true,
                        errors: [],
                        output,
                    });
                }
                catch (error) {
                    resolve({
                        valid: false,
                        errors: [
                            'Script did not output valid JSON',
                            `Output: ${stdout.trim()}`,
                        ],
                    });
                }
            });
            bash.on('error', (error) => {
                clearTimeout(timer);
                resolve({
                    valid: false,
                    errors: [`Failed to execute script: ${error.message}`],
                });
            });
        });
    }
    /**
     * Validate multiple scripts
     * @param scriptPaths - Array of script paths
     * @returns Map of script path to validation result
     */
    async validateScripts(scriptPaths) {
        const results = new Map();
        for (const scriptPath of scriptPaths) {
            try {
                const result = await this.validateScript(scriptPath);
                results.set(scriptPath, result);
            }
            catch (error) {
                results.set(scriptPath, {
                    valid: false,
                    errors: [`Validation failed: ${error.message}`],
                });
            }
        }
        return results;
    }
}
exports.HookScriptValidator = HookScriptValidator;
//# sourceMappingURL=validator.js.map