"use strict";
/**
 * Template Validator
 *
 * JSON Schema validation for template data using ajv.
 * Ensures template data meets required structure before rendering.
 *
 * @module infrastructure/templates/validator
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateValidator = exports.TemplateValidationError = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const ajv_1 = __importDefault(require("ajv"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
const types_1 = require("./types");
/**
 * Error thrown when validation operations fail
 */
class TemplateValidationError extends Error {
    constructor(message, templateName, validationErrors) {
        super(message);
        this.templateName = templateName;
        this.validationErrors = validationErrors;
        this.name = 'TemplateValidationError';
    }
}
exports.TemplateValidationError = TemplateValidationError;
/**
 * Template data validator using JSON Schema
 */
class TemplateValidator {
    constructor(options = {}) {
        this.validators = new Map();
        this.initialized = false;
        this.schemasPath = options.schemasPath || path.join(__dirname, 'files', 'schemas');
        this.cacheSchemas = options.cacheSchemas ?? true;
        this.logger = types_1.defaultTemplateLogger;
        // Initialize ajv with formats support
        this.ajv = new ajv_1.default({
            allErrors: true, // Collect all errors, not just first
            verbose: true, // Include data in errors
            strict: false, // Allow additional properties
        });
        (0, ajv_formats_1.default)(this.ajv);
        // Register custom formats
        this.registerCustomFormats();
    }
    /**
     * Set custom logger
     * @param logger - Logger implementation
     */
    setLogger(logger) {
        this.logger = logger;
    }
    /**
     * Register custom ajv formats
     */
    registerCustomFormats() {
        // Workpackage ID format (e.g., A1, B2.3, C4.1.2)
        this.ajv.addFormat('workpackage-id', /^[A-Z][0-9]+(\.[0-9]+)*$/);
        // Technical decision ID format (e.g., TD-0042)
        this.ajv.addFormat('td-id', /^TD-\d{4}$/);
        // Business rule ID format (e.g., BR-0156)
        this.ajv.addFormat('br-id', /^BR-\d{4}$/);
        // Architectural pattern ID format (e.g., AP-0023)
        this.ajv.addFormat('ap-id', /^AP-\d{4}$/);
        // Lessons learned ID format (e.g., LL-0089)
        this.ajv.addFormat('ll-id', /^LL-\d{4}$/);
        // Semantic version format
        this.ajv.addFormat('semver', /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/);
    }
    /**
     * Initialize the validator by pre-loading schemas
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        this.logger.info('Initializing template validator', { schemasPath: this.schemasPath });
        // Pre-load all schemas if caching enabled
        if (this.cacheSchemas) {
            const templateNames = [
                'workpackage',
                'technical-decision',
                'business-rule',
                'architectural-pattern',
                'lessons-learned',
                'master-plan',
                'sprint-plan',
            ];
            for (const name of templateNames) {
                try {
                    await this.loadSchema(name);
                }
                catch (error) {
                    this.logger.warn(`Failed to pre-load schema: ${name}`, {
                        error: error.message,
                    });
                }
            }
        }
        this.initialized = true;
        this.logger.info('Template validator initialized');
    }
    /**
     * Get schema file path
     */
    getSchemaPath(name) {
        return path.join(this.schemasPath, `${name}.schema.json`);
    }
    /**
     * Load and compile a schema
     * @param name - Template name
     */
    async loadSchema(name) {
        // Return cached if available
        if (this.cacheSchemas && this.validators.has(name)) {
            return this.validators.get(name);
        }
        const schemaPath = this.getSchemaPath(name);
        try {
            const schemaContent = await fs.readFile(schemaPath, 'utf-8');
            const schema = JSON.parse(schemaContent);
            const validate = this.ajv.compile(schema);
            if (this.cacheSchemas) {
                this.validators.set(name, validate);
            }
            this.logger.debug(`Loaded schema: ${name}`, { schemaPath });
            return validate;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new TemplateValidationError(`Schema not found: ${name}`, name);
            }
            throw new TemplateValidationError(`Failed to load schema: ${name}`, name, [error.message]);
        }
    }
    /**
     * Validate template data against schema
     * @param name - Template name
     * @param data - Data to validate
     */
    async validate(name, data) {
        try {
            const validate = await this.loadSchema(name);
            const valid = validate(data);
            if (valid) {
                return {
                    valid: true,
                    errors: [],
                    warnings: [],
                };
            }
            // Format errors
            const errors = this.formatErrors(validate.errors || []);
            const warnings = this.extractWarnings(validate.errors || []);
            this.logger.debug(`Validation failed for ${name}`, {
                errorCount: errors.length,
                errors,
            });
            return {
                valid: false,
                errors,
                warnings,
            };
        }
        catch (error) {
            if (error instanceof TemplateValidationError) {
                return {
                    valid: false,
                    errors: [error.message],
                    warnings: [],
                };
            }
            return {
                valid: false,
                errors: [error.message],
                warnings: [],
            };
        }
    }
    /**
     * Format ajv errors into readable messages
     */
    formatErrors(errors) {
        return errors.map((error) => {
            const path = error.instancePath || 'root';
            const message = error.message || 'Unknown validation error';
            switch (error.keyword) {
                case 'required':
                    return `Missing required field: ${error.params.missingProperty}`;
                case 'type':
                    return `${path}: Expected ${error.params.type}, got ${typeof error.data}`;
                case 'enum':
                    return `${path}: Must be one of: ${error.params.allowedValues.join(', ')}`;
                case 'format':
                    return `${path}: Invalid format (expected ${error.params.format})`;
                case 'minLength':
                    return `${path}: Must be at least ${error.params.limit} characters`;
                case 'maxLength':
                    return `${path}: Must be at most ${error.params.limit} characters`;
                case 'minimum':
                    return `${path}: Must be >= ${error.params.limit}`;
                case 'maximum':
                    return `${path}: Must be <= ${error.params.limit}`;
                case 'pattern':
                    return `${path}: Does not match required pattern`;
                case 'additionalProperties':
                    return `${path}: Unknown property "${error.params.additionalProperty}"`;
                default:
                    return `${path}: ${message}`;
            }
        });
    }
    /**
     * Extract warnings from validation (non-critical issues)
     */
    extractWarnings(errors) {
        // Currently treating additionalProperties as warnings rather than errors
        return errors
            .filter((e) => e.keyword === 'additionalProperties')
            .map((e) => `Unknown property "${e.params.additionalProperty}" will be ignored`);
    }
    /**
     * Validate required fields only (quick check)
     * @param name - Template name
     * @param data - Data to validate
     */
    validateRequiredFields(name, data) {
        const requiredFields = this.getRequiredFields(name);
        const errors = [];
        for (const field of requiredFields) {
            if (!(field in data) || data[field] === undefined) {
                errors.push(`Missing required field: ${field}`);
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings: [],
        };
    }
    /**
     * Get required fields for a template
     */
    getRequiredFields(name) {
        const requiredByTemplate = {
            'workpackage': ['id', 'title', 'status', 'type', 'priority', 'description', 'successCriteria'],
            'technical-decision': ['id', 'sessionId', 'title', 'date', 'status', 'category', 'impact', 'context', 'decision', 'rationale'],
            'business-rule': ['id', 'sessionId', 'name', 'category', 'priority', 'effectiveDate', 'authority', 'ruleStatement', 'logic', 'validations'],
            'architectural-pattern': ['id', 'sessionId', 'name', 'type', 'scope', 'maturity', 'context', 'problem', 'solution'],
            'lessons-learned': ['id', 'sessionId', 'title', 'dateOccurred', 'dateDocumented', 'severity', 'category', 'projectPhase', 'situation', 'action', 'result', 'recommendation'],
            'master-plan': ['version', 'projectName', 'status', 'owner', 'summary', 'businessObjectives', 'phases', 'milestones'],
            'sprint-plan': ['sprintNumber', 'startDate', 'endDate', 'durationDays', 'phase', 'status', 'primaryGoal', 'workpackages'],
        };
        return requiredByTemplate[name] || [];
    }
    /**
     * Check if a schema exists
     */
    async hasSchema(name) {
        try {
            await fs.access(this.getSchemaPath(name));
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Clear schema cache
     */
    clearCache() {
        this.validators.clear();
        this.logger.debug('Schema cache cleared');
    }
}
exports.TemplateValidator = TemplateValidator;
//# sourceMappingURL=validator.js.map