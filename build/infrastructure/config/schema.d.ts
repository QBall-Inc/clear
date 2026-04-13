/**
 * JSON Schema for Configuration Validation
 *
 * Uses ajv for runtime validation of configuration files.
 */
import type { ValidationResult } from './types';
/**
 * Complete JSON Schema for ClearConfig
 */
export declare const CONFIG_SCHEMA: {
    $schema: string;
    type: "object";
    properties: {
        framework: {
            type: "object";
            properties: {
                session_management: {
                    type: "object";
                    properties: {
                        token_thresholds: {
                            type: "object";
                            properties: {
                                warning: {
                                    type: "number";
                                    minimum: number;
                                    maximum: number;
                                };
                                critical: {
                                    type: "number";
                                    minimum: number;
                                    maximum: number;
                                };
                            };
                            required: string[];
                            additionalProperties: boolean;
                        };
                    };
                    required: string[];
                    additionalProperties: boolean;
                };
                progressive_disclosure: {
                    type: "object";
                    properties: {
                        enabled: {
                            type: "boolean";
                        };
                        max_context_size: {
                            type: "integer";
                            minimum: number;
                        };
                    };
                    required: string[];
                    additionalProperties: boolean;
                };
                limits: {
                    type: "object";
                    properties: {
                        max_context_size: {
                            type: "integer";
                            minimum: number;
                        };
                        max_skill_size: {
                            type: "integer";
                            minimum: number;
                        };
                        max_template_size: {
                            type: "integer";
                            minimum: number;
                        };
                        max_hooks_per_event: {
                            type: "integer";
                            minimum: number;
                            maximum: number;
                        };
                        max_parallel_hooks: {
                            type: "integer";
                            minimum: number;
                            maximum: number;
                        };
                        hook_timeout_ms: {
                            type: "integer";
                            minimum: number;
                            maximum: number;
                        };
                        max_hook_retries: {
                            type: "integer";
                            minimum: number;
                            maximum: number;
                        };
                        max_skill_dependencies: {
                            type: "integer";
                            minimum: number;
                            maximum: number;
                        };
                        max_skill_load_depth: {
                            type: "integer";
                            minimum: number;
                            maximum: number;
                        };
                        max_skills_loaded: {
                            type: "integer";
                            minimum: number;
                            maximum: number;
                        };
                        max_events_per_minute: {
                            type: "integer";
                            minimum: number;
                        };
                        max_context_writes_per_minute: {
                            type: "integer";
                            minimum: number;
                        };
                        max_event_queue_size: {
                            type: "integer";
                            minimum: number;
                        };
                        max_hook_queue_size: {
                            type: "integer";
                            minimum: number;
                        };
                    };
                    required: string[];
                    additionalProperties: boolean;
                };
            };
            required: string[];
            additionalProperties: boolean;
        };
    };
    required: string[];
    additionalProperties: boolean;
};
/**
 * Schema validator class
 */
export declare class ConfigSchemaValidator {
    private ajv;
    private validateFn;
    constructor();
    /**
     * Validate a configuration object against the schema
     * @param config - Configuration object to validate
     * @returns Validation result with errors if invalid
     */
    validate(config: unknown): ValidationResult;
    /**
     * Validate specific limits values
     * @param limits - Partial limits to validate
     * @returns Validation result
     */
    validateLimits(limits: unknown): ValidationResult;
    /**
     * Get the raw schema object
     */
    getSchema(): typeof CONFIG_SCHEMA;
}
/**
 * Get the singleton schema validator
 */
export declare function getSchemaValidator(): ConfigSchemaValidator;
//# sourceMappingURL=schema.d.ts.map