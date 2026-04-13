/**
 * Type definitions for CLEAR hook infrastructure
 *
 * Hooks are event-driven automation mechanisms that allow skills to respond
 * to Claude Code events by generating and executing bash scripts.
 */
/**
 * Hook declaration from skill YAML frontmatter
 */
export interface HookDeclaration {
    /** Claude Code event to respond to (e.g., 'Start', 'FileCreated') */
    event: string;
    /** Execution priority (lower numbers execute first) */
    priority: number;
    /** Unique identifier for this hook (e.g., 'clear.session.init') */
    namespace: string;
    /** Human-readable description of what this hook does */
    trigger: string;
    /** Maximum execution time in milliseconds (default: 1000) */
    timeout?: number;
    /** Optional JSON schema for input validation */
    input_schema?: {
        type: string;
        properties?: Record<string, any>;
        required?: string[];
    };
}
/**
 * Hook registration in settings.json
 */
export interface HookRegistration {
    /** Claude Code event */
    event: string;
    /** Command to execute (always 'bash' for CLEAR) */
    command: string;
    /** Arguments to pass to command (script path) */
    args: string[];
    /** Execution priority */
    priority: number;
    /** Unique namespace */
    namespace: string;
    /** Timeout in milliseconds */
    timeout: number;
    /** Source skill that declared this hook */
    skillName?: string;
}
/**
 * Settings.json structure
 */
export interface PluginSettings {
    /** Array of registered hooks */
    hooks: HookRegistration[];
    /** Settings version */
    version: string;
}
/**
 * Result from hook execution
 */
export interface HookResult {
    /** Hook namespace */
    namespace: string;
    /** Execution status */
    status: 'success' | 'error' | 'timeout';
    /** Parsed JSON output from hook script */
    output?: any;
    /** Error message if status is 'error' */
    error?: string;
    /** Execution time in milliseconds */
    executionTime?: number;
}
/**
 * Results from multiple hook executions
 */
export interface HookResults {
    /** Event that triggered these hooks */
    event: string;
    /** Results from each hook */
    results: HookResult[];
}
/**
 * Template data for script generation
 */
export interface TemplateData {
    /** Hook namespace */
    namespace: string;
    /** Event name */
    event: string;
    /** Priority */
    priority: number;
    /** Source skill name */
    skillName: string;
    /** Timeout in milliseconds */
    timeout: number;
    /** Trigger description */
    trigger: string;
    /** Input schema (if any) */
    inputSchema?: {
        type: string;
        properties?: Record<string, any>;
        required?: string[];
    };
}
/**
 * Validation result for generated scripts
 */
export interface ScriptValidationResult {
    /** Whether the script is valid */
    valid: boolean;
    /** Error messages if invalid */
    errors: string[];
    /** Warnings (non-fatal issues) */
    warnings?: string[];
}
/**
 * Hook generation options
 */
export interface HookGenerationOptions {
    /** Output directory for generated scripts */
    outputDir?: string;
    /** Whether to validate scripts after generation */
    validate?: boolean;
    /** Whether to register hooks in settings.json */
    register?: boolean;
    /** Whether to overwrite existing scripts */
    overwrite?: boolean;
}
/**
 * Custom error for hook-related failures
 */
export declare class HookError extends Error {
    readonly namespace: string;
    readonly context?: Record<string, any> | undefined;
    constructor(message: string, namespace: string, context?: Record<string, any> | undefined);
}
/**
 * Error during script generation
 */
export declare class HookGenerationError extends HookError {
    constructor(message: string, namespace: string, context?: Record<string, any>);
}
/**
 * Error during hook registration
 */
export declare class HookRegistrationError extends HookError {
    constructor(message: string, namespace: string, context?: Record<string, any>);
}
/**
 * Error during script validation
 */
export declare class HookValidationError extends HookError {
    constructor(message: string, namespace: string, context?: Record<string, any>);
}
//# sourceMappingURL=types.d.ts.map