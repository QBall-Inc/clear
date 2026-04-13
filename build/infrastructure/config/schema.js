"use strict";
/**
 * JSON Schema for Configuration Validation
 *
 * Uses ajv for runtime validation of configuration files.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchemaValidator = exports.CONFIG_SCHEMA = void 0;
exports.getSchemaValidator = getSchemaValidator;
const ajv_1 = __importDefault(require("ajv"));
/**
 * JSON Schema for ResourceLimits
 */
const resourceLimitsSchema = {
    type: 'object',
    properties: {
        // Memory limits
        max_context_size: { type: 'integer', minimum: 1048576 }, // Min 1MB
        max_skill_size: { type: 'integer', minimum: 1024 }, // Min 1KB
        max_template_size: { type: 'integer', minimum: 1024 }, // Min 1KB
        // Execution limits
        max_hooks_per_event: { type: 'integer', minimum: 1, maximum: 1000 },
        max_parallel_hooks: { type: 'integer', minimum: 1, maximum: 100 },
        hook_timeout_ms: { type: 'integer', minimum: 100, maximum: 60000 },
        max_hook_retries: { type: 'integer', minimum: 0, maximum: 10 },
        // Skill limits
        max_skill_dependencies: { type: 'integer', minimum: 1, maximum: 100 },
        max_skill_load_depth: { type: 'integer', minimum: 1, maximum: 100 },
        max_skills_loaded: { type: 'integer', minimum: 1, maximum: 1000 },
        // Rate limits
        max_events_per_minute: { type: 'integer', minimum: 1 },
        max_context_writes_per_minute: { type: 'integer', minimum: 1 },
        // Queue limits
        max_event_queue_size: { type: 'integer', minimum: 1 },
        max_hook_queue_size: { type: 'integer', minimum: 1 },
    },
    required: [], // All optional since we apply defaults
    additionalProperties: false,
};
/**
 * JSON Schema for TokenThresholds
 */
const tokenThresholdsSchema = {
    type: 'object',
    properties: {
        warning: { type: 'number', minimum: 0, maximum: 1 },
        critical: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: [],
    additionalProperties: false,
};
/**
 * JSON Schema for SessionManagementConfig
 */
const sessionManagementSchema = {
    type: 'object',
    properties: {
        token_thresholds: tokenThresholdsSchema,
    },
    required: [],
    additionalProperties: false,
};
/**
 * JSON Schema for ProgressiveDisclosureConfig
 */
const progressiveDisclosureSchema = {
    type: 'object',
    properties: {
        enabled: { type: 'boolean' },
        max_context_size: { type: 'integer', minimum: 1048576 }, // Min 1MB
    },
    required: [],
    additionalProperties: false,
};
/**
 * JSON Schema for FrameworkConfig
 */
const frameworkConfigSchema = {
    type: 'object',
    properties: {
        session_management: sessionManagementSchema,
        progressive_disclosure: progressiveDisclosureSchema,
        limits: resourceLimitsSchema,
    },
    required: [],
    additionalProperties: false,
};
/**
 * Complete JSON Schema for ClearConfig
 */
exports.CONFIG_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
        framework: frameworkConfigSchema,
    },
    required: [], // Framework is optional since we apply defaults
    additionalProperties: false,
};
/**
 * Schema validator class
 */
class ConfigSchemaValidator {
    constructor() {
        this.ajv = new ajv_1.default({ allErrors: true, strict: false });
        this.validateFn = this.ajv.compile(exports.CONFIG_SCHEMA);
    }
    /**
     * Validate a configuration object against the schema
     * @param config - Configuration object to validate
     * @returns Validation result with errors if invalid
     */
    validate(config) {
        const valid = this.validateFn(config);
        if (valid) {
            return { valid: true, errors: [] };
        }
        const errors = (this.validateFn.errors || []).map((err) => {
            const path = err.instancePath || 'root';
            return `${path}: ${err.message}`;
        });
        return { valid: false, errors };
    }
    /**
     * Validate specific limits values
     * @param limits - Partial limits to validate
     * @returns Validation result
     */
    validateLimits(limits) {
        const tempAjv = new ajv_1.default({ allErrors: true, strict: false });
        const validateLimitsFn = tempAjv.compile(resourceLimitsSchema);
        const valid = validateLimitsFn(limits);
        if (valid) {
            return { valid: true, errors: [] };
        }
        const errors = (validateLimitsFn.errors || []).map((err) => {
            const path = err.instancePath || 'limits';
            return `${path}: ${err.message}`;
        });
        return { valid: false, errors };
    }
    /**
     * Get the raw schema object
     */
    getSchema() {
        return exports.CONFIG_SCHEMA;
    }
}
exports.ConfigSchemaValidator = ConfigSchemaValidator;
/**
 * Singleton validator instance
 */
let validatorInstance = null;
/**
 * Get the singleton schema validator
 */
function getSchemaValidator() {
    if (!validatorInstance) {
        validatorInstance = new ConfigSchemaValidator();
    }
    return validatorInstance;
}
//# sourceMappingURL=schema.js.map