"use strict";
/**
 * Template Engine
 *
 * Handlebars-based template loading, compilation, and rendering for
 * CLEAR framework resources (workpackages, knowledge bases, plans, handoffs).
 *
 * @module infrastructure/templates/engine
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
exports.TemplateEngine = exports.TemplateEngineError = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const handlebars_1 = __importDefault(require("handlebars"));
const types_1 = require("./types");
const validator_1 = require("./validator");
/**
 * Template metadata definitions
 */
const TEMPLATE_METADATA = {
    'session-handoff': {
        name: 'session-handoff',
        version: '1.0.0',
        category: 'session',
        description: 'Session handoff documentation for continuity between sessions',
        requiredFields: ['sessionNumber', 'date', 'workpackage', 'tokensEnd', 'status', 'summary', 'completed', 'nextSteps'],
        optionalFields: ['technicalDecisions', 'patternsEstablished', 'blockers', 'questions', 'metrics'],
    },
    'workpackage': {
        name: 'workpackage',
        version: '1.0.0',
        category: 'workpackage',
        description: 'Workpackage definition for focused execution units',
        requiredFields: ['id', 'title', 'status', 'type', 'priority', 'description', 'successCriteria'],
        optionalFields: ['dependencies', 'estimatedTokens', 'actualTokens', 'assignedTo', 'relatedResources'],
    },
    'technical-decision': {
        name: 'technical-decision',
        version: '1.0.0',
        category: 'knowledge',
        description: 'Technical decision documentation with rationale and alternatives',
        requiredFields: ['id', 'sessionId', 'title', 'date', 'status', 'category', 'impact', 'context', 'decision', 'rationale'],
        optionalFields: ['alternatives', 'tradeoffs', 'implementationNotes', 'relatedDecisions'],
    },
    'business-rule': {
        name: 'business-rule',
        version: '1.0.0',
        category: 'knowledge',
        description: 'Business rule documentation with logic and validation',
        requiredFields: ['id', 'sessionId', 'name', 'category', 'priority', 'effectiveDate', 'authority', 'ruleStatement', 'logic', 'validations'],
        optionalFields: ['expiryDate', 'exceptions', 'examples'],
    },
    'architectural-pattern': {
        name: 'architectural-pattern',
        version: '1.0.0',
        category: 'knowledge',
        description: 'Architectural pattern documentation with context and consequences',
        requiredFields: ['id', 'sessionId', 'name', 'type', 'scope', 'maturity', 'context', 'problem', 'solution'],
        optionalFields: ['structure', 'implementation', 'consequences', 'knownUses', 'relatedPatterns', 'antiPatterns'],
    },
    'lessons-learned': {
        name: 'lessons-learned',
        version: '1.0.0',
        category: 'knowledge',
        description: 'Lessons learned documentation with root cause and recommendations',
        requiredFields: ['id', 'sessionId', 'title', 'dateOccurred', 'dateDocumented', 'severity', 'category', 'projectPhase', 'situation', 'action', 'result', 'recommendation'],
        optionalFields: ['rootCause', 'preventiveMeasures', 'appliesWhen', 'doesNotApplyWhen'],
    },
    'master-plan': {
        name: 'master-plan',
        version: '1.0.0',
        category: 'plan',
        description: 'Master plan documentation for project roadmap',
        requiredFields: ['version', 'projectName', 'status', 'owner', 'summary', 'businessObjectives', 'phases', 'milestones'],
        optionalFields: ['technicalObjectives', 'risks'],
    },
    'sprint-plan': {
        name: 'sprint-plan',
        version: '1.0.0',
        category: 'plan',
        description: 'Sprint plan documentation for focused execution periods',
        requiredFields: ['sprintNumber', 'startDate', 'endDate', 'durationDays', 'phase', 'status', 'primaryGoal', 'workpackages'],
        optionalFields: ['secondaryGoals', 'stretchWorkpackages', 'tokenBudget', 'blockers', 'retrospective'],
    },
};
/**
 * Error thrown when template operations fail
 */
class TemplateEngineError extends Error {
    constructor(message, templateName, context) {
        super(message);
        this.templateName = templateName;
        this.context = context;
        this.name = 'TemplateEngineError';
    }
}
exports.TemplateEngineError = TemplateEngineError;
/**
 * Template engine for CLEAR framework resources
 */
class TemplateEngine {
    constructor(options = {}) {
        this.templates = new Map();
        this.initialized = false;
        // Default paths relative to src/infrastructure/templates during development
        this.templatesPath = options.templatesPath || path.join(__dirname, 'files');
        this.schemasPath = options.schemasPath || path.join(__dirname, 'files', 'schemas');
        this.cacheTemplates = options.cacheTemplates ?? true;
        this.validateBeforeRender = options.validateBeforeRender ?? true;
        this.logger = types_1.defaultTemplateLogger;
        // Initialize validator
        this.validator = new validator_1.TemplateValidator({ schemasPath: this.schemasPath });
        // Register custom helpers
        this.registerHelpers(options.helpers);
    }
    /**
     * Set custom logger
     * @param logger - Logger implementation
     */
    setLogger(logger) {
        this.logger = logger;
        this.validator.setLogger(logger);
    }
    /**
     * Initialize the engine by loading all templates
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        this.logger.info('Initializing template engine', { templatesPath: this.templatesPath });
        // Initialize validator first
        await this.validator.initialize();
        // Pre-load all templates if caching enabled
        if (this.cacheTemplates) {
            const templateNames = [
                'session-handoff',
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
                    await this.loadTemplate(name);
                }
                catch (error) {
                    this.logger.warn(`Failed to pre-load template: ${name}`, {
                        error: error.message,
                    });
                }
            }
        }
        this.initialized = true;
        this.logger.info('Template engine initialized');
    }
    /**
     * Register Handlebars helpers
     */
    registerHelpers(customHelpers) {
        // Format date helper
        handlebars_1.default.registerHelper('formatDate', (dateStr) => {
            if (!dateStr)
                return '';
            const date = new Date(dateStr);
            return date.toISOString().split('T')[0];
        });
        // Format timestamp helper
        handlebars_1.default.registerHelper('formatTimestamp', (dateStr) => {
            if (!dateStr)
                return '';
            return new Date(dateStr).toISOString();
        });
        // JSON stringify helper
        handlebars_1.default.registerHelper('json', (context) => {
            return JSON.stringify(context, null, 2);
        });
        // YAML-style list helper
        handlebars_1.default.registerHelper('yamlList', (items) => {
            if (!items || !Array.isArray(items))
                return '';
            return items.map((item) => `  - ${item}`).join('\n');
        });
        // Checklist helper
        handlebars_1.default.registerHelper('checklist', (items) => {
            if (!items || !Array.isArray(items))
                return '';
            return items.map((item) => `- [ ] ${item}`).join('\n');
        });
        // Uppercase helper
        handlebars_1.default.registerHelper('uppercase', (str) => {
            return str ? str.toUpperCase() : '';
        });
        // Lowercase helper
        handlebars_1.default.registerHelper('lowercase', (str) => {
            return str ? str.toLowerCase() : '';
        });
        // Capitalize helper
        handlebars_1.default.registerHelper('capitalize', (str) => {
            if (!str)
                return '';
            return str.charAt(0).toUpperCase() + str.slice(1);
        });
        // Status badge helper
        handlebars_1.default.registerHelper('statusBadge', (status) => {
            const badges = {
                'not_started': '⬜',
                'in_progress': '🔄',
                'complete': '✅',
                'blocked': '🚫',
                'pending': '⏳',
                'achieved': '✅',
                'missed': '❌',
                'proposed': '📝',
                'accepted': '✅',
                'deprecated': '⚠️',
                'superseded': '🔄',
            };
            return badges[status] || status;
        });
        // Priority badge helper
        handlebars_1.default.registerHelper('priorityBadge', (priority) => {
            const badges = {
                'critical': '🔴',
                'high': '🟠',
                'medium': '🟡',
                'low': '🟢',
            };
            return badges[priority] || priority;
        });
        // Conditional block helper
        handlebars_1.default.registerHelper('ifNotEmpty', function (arr, options) {
            if (arr && Array.isArray(arr) && arr.length > 0) {
                return options.fn(this);
            }
            return options.inverse(this);
        });
        // Equals comparison helper
        handlebars_1.default.registerHelper('eq', (a, b) => a === b);
        // Not equals comparison helper
        handlebars_1.default.registerHelper('neq', (a, b) => a !== b);
        // Math add helper (for 1-based indexing)
        handlebars_1.default.registerHelper('add', (a, b) => a + b);
        // Math divide helper (for percentages)
        handlebars_1.default.registerHelper('divide', (a, b) => {
            if (b === 0)
                return 0;
            return Math.round((a / b) * 100);
        });
        // Register custom helpers if provided
        if (customHelpers) {
            for (const [name, helper] of Object.entries(customHelpers)) {
                handlebars_1.default.registerHelper(name, helper);
            }
        }
    }
    /**
     * Get template file path
     */
    getTemplatePath(name) {
        // Knowledge templates are in knowledge/ subdirectory
        if (['technical-decision', 'business-rule', 'architectural-pattern', 'lessons-learned'].includes(name)) {
            return path.join(this.templatesPath, 'knowledge', `${name}.hbs`);
        }
        // Plan templates are in plans/ subdirectory
        if (['master-plan', 'sprint-plan'].includes(name)) {
            return path.join(this.templatesPath, 'plans', `${name}.hbs`);
        }
        // Core templates at root
        return path.join(this.templatesPath, `${name}.hbs`);
    }
    /**
     * Load and compile a template
     * @param name - Template name
     */
    async loadTemplate(name) {
        // Return cached if available
        if (this.cacheTemplates && this.templates.has(name)) {
            return this.templates.get(name);
        }
        const templatePath = this.getTemplatePath(name);
        const metaBase = TEMPLATE_METADATA[name];
        if (!metaBase) {
            throw new TemplateEngineError(`Unknown template: ${name}`, name);
        }
        try {
            const source = await fs.readFile(templatePath, 'utf-8');
            const compiled = {
                metadata: {
                    ...metaBase,
                    schemaPath: path.join(this.schemasPath, `${name}.schema.json`),
                },
                source,
                render: handlebars_1.default.compile(source, {
                    noEscape: true, // Don't escape markdown
                    strict: false, // Allow missing optional fields
                }),
            };
            if (this.cacheTemplates) {
                this.templates.set(name, compiled);
            }
            this.logger.debug(`Loaded template: ${name}`, { templatePath });
            return compiled;
        }
        catch (error) {
            throw new TemplateEngineError(`Failed to load template: ${name}`, name, { templatePath, error: error.message });
        }
    }
    /**
     * Get template metadata
     * @param name - Template name
     */
    getMetadata(name) {
        const metaBase = TEMPLATE_METADATA[name];
        if (!metaBase) {
            throw new TemplateEngineError(`Unknown template: ${name}`, name);
        }
        return {
            ...metaBase,
            schemaPath: path.join(this.schemasPath, `${name}.schema.json`),
        };
    }
    /**
     * Render a template with data
     * @param name - Template name
     * @param data - Template data
     */
    async render(name, data) {
        const startTime = Date.now();
        try {
            // Validate data if enabled
            if (this.validateBeforeRender) {
                const validation = await this.validator.validate(name, data);
                if (!validation.valid) {
                    return {
                        success: false,
                        error: `Validation failed: ${validation.errors.join('; ')}`,
                        templateName: name,
                        renderedAt: new Date().toISOString(),
                    };
                }
            }
            // Load template
            const template = await this.loadTemplate(name);
            // Enrich data with defaults
            const enrichedData = this.enrichData(name, data);
            // Render
            const content = template.render(enrichedData);
            this.logger.debug(`Rendered template: ${name}`, {
                renderTime: Date.now() - startTime,
            });
            return {
                success: true,
                content,
                templateName: name,
                renderedAt: new Date().toISOString(),
            };
        }
        catch (error) {
            this.logger.error(`Failed to render template: ${name}`, {
                error: error.message,
            });
            return {
                success: false,
                error: error.message,
                templateName: name,
                renderedAt: new Date().toISOString(),
            };
        }
    }
    /**
     * Enrich data with computed defaults
     */
    enrichData(name, data) {
        const now = new Date().toISOString();
        return {
            ...data,
            _templateName: name,
            _templateVersion: TEMPLATE_METADATA[name].version,
            _generatedAt: now,
            createdAt: data.createdAt || now,
            updatedAt: now,
        };
    }
    /**
     * Get all available template names
     */
    getAvailableTemplates() {
        return Object.keys(TEMPLATE_METADATA);
    }
    /**
     * Check if template exists
     */
    hasTemplate(name) {
        return name in TEMPLATE_METADATA;
    }
    /**
     * Clear template cache
     */
    clearCache() {
        this.templates.clear();
        this.logger.debug('Template cache cleared');
    }
    /**
     * Get the validator instance
     */
    getValidator() {
        return this.validator;
    }
}
exports.TemplateEngine = TemplateEngine;
//# sourceMappingURL=engine.js.map