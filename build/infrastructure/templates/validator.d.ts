/**
 * Template Validator
 *
 * JSON Schema validation for template data using ajv.
 * Ensures template data meets required structure before rendering.
 *
 * @module infrastructure/templates/validator
 */
import { ValidateFunction } from 'ajv';
import { TemplateName, TemplateValidationResult, TemplateLogger, TemplateDataMap } from './types';
/**
 * Options for template validator
 */
export interface TemplateValidatorOptions {
    /** Path to schema files */
    schemasPath?: string;
    /** Whether to cache compiled schemas */
    cacheSchemas?: boolean;
}
/**
 * Error thrown when validation operations fail
 */
export declare class TemplateValidationError extends Error {
    templateName?: TemplateName | undefined;
    validationErrors?: string[] | undefined;
    constructor(message: string, templateName?: TemplateName | undefined, validationErrors?: string[] | undefined);
}
/**
 * Template data validator using JSON Schema
 */
export declare class TemplateValidator {
    private ajv;
    private validators;
    private schemasPath;
    private cacheSchemas;
    private logger;
    private initialized;
    constructor(options?: TemplateValidatorOptions);
    /**
     * Set custom logger
     * @param logger - Logger implementation
     */
    setLogger(logger: TemplateLogger): void;
    /**
     * Register custom ajv formats
     */
    private registerCustomFormats;
    /**
     * Initialize the validator by pre-loading schemas
     */
    initialize(): Promise<void>;
    /**
     * Get schema file path
     */
    private getSchemaPath;
    /**
     * Load and compile a schema
     * @param name - Template name
     */
    loadSchema(name: TemplateName): Promise<ValidateFunction>;
    /**
     * Validate template data against schema
     * @param name - Template name
     * @param data - Data to validate
     */
    validate<T extends TemplateName>(name: T, data: TemplateDataMap[T]): Promise<TemplateValidationResult>;
    /**
     * Format ajv errors into readable messages
     */
    private formatErrors;
    /**
     * Extract warnings from validation (non-critical issues)
     */
    private extractWarnings;
    /**
     * Validate required fields only (quick check)
     * @param name - Template name
     * @param data - Data to validate
     */
    validateRequiredFields<T extends TemplateName>(name: T, data: Partial<TemplateDataMap[T]>): TemplateValidationResult;
    /**
     * Get required fields for a template
     */
    getRequiredFields(name: TemplateName): string[];
    /**
     * Check if a schema exists
     */
    hasSchema(name: TemplateName): Promise<boolean>;
    /**
     * Clear schema cache
     */
    clearCache(): void;
}
//# sourceMappingURL=validator.d.ts.map