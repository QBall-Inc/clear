/**
 * Template Engine
 *
 * Handlebars-based template loading, compilation, and rendering for
 * CLEAR framework resources (workpackages, knowledge bases, plans, handoffs).
 *
 * @module infrastructure/templates/engine
 */
import { TemplateName, TemplateMetadata, CompiledTemplate, TemplateRenderResult, TemplateEngineOptions, TemplateLogger, TemplateDataMap } from './types';
import { TemplateValidator } from './validator';
/**
 * Error thrown when template operations fail
 */
export declare class TemplateEngineError extends Error {
    templateName?: TemplateName | undefined;
    context?: Record<string, unknown> | undefined;
    constructor(message: string, templateName?: TemplateName | undefined, context?: Record<string, unknown> | undefined);
}
/**
 * Template engine for CLEAR framework resources
 */
export declare class TemplateEngine {
    private templates;
    private validator;
    private templatesPath;
    private schemasPath;
    private cacheTemplates;
    private validateBeforeRender;
    private logger;
    private initialized;
    constructor(options?: TemplateEngineOptions);
    /**
     * Set custom logger
     * @param logger - Logger implementation
     */
    setLogger(logger: TemplateLogger): void;
    /**
     * Initialize the engine by loading all templates
     */
    initialize(): Promise<void>;
    /**
     * Register Handlebars helpers
     */
    private registerHelpers;
    /**
     * Get template file path
     */
    private getTemplatePath;
    /**
     * Load and compile a template
     * @param name - Template name
     */
    loadTemplate(name: TemplateName): Promise<CompiledTemplate>;
    /**
     * Get template metadata
     * @param name - Template name
     */
    getMetadata(name: TemplateName): TemplateMetadata;
    /**
     * Render a template with data
     * @param name - Template name
     * @param data - Template data
     */
    render<T extends TemplateName>(name: T, data: TemplateDataMap[T]): Promise<TemplateRenderResult>;
    /**
     * Enrich data with computed defaults
     */
    private enrichData;
    /**
     * Get all available template names
     */
    getAvailableTemplates(): TemplateName[];
    /**
     * Check if template exists
     */
    hasTemplate(name: string): name is TemplateName;
    /**
     * Clear template cache
     */
    clearCache(): void;
    /**
     * Get the validator instance
     */
    getValidator(): TemplateValidator;
}
//# sourceMappingURL=engine.d.ts.map