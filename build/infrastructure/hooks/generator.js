"use strict";
/**
 * Hook script generator
 *
 * Generates executable bash scripts from hook declarations in skill YAML frontmatter.
 * Uses Handlebars templates with proper JSON handling via jq.
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
exports.HookScriptGenerator = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const handlebars_1 = __importDefault(require("handlebars"));
const types_1 = require("./types");
/**
 * Generates hook scripts from declarations
 */
class HookScriptGenerator {
    constructor(templateDir, outputDir) {
        this.templates = new Map();
        // Default to src/infrastructure/hooks/templates during development
        this.templateDir =
            templateDir || path.join(__dirname, 'templates');
        // Default to src/infrastructure/hooks/generated during development
        this.outputDir =
            outputDir || path.join(path.dirname(__dirname), 'hooks', 'generated');
    }
    /**
     * Initialize the generator by loading templates
     */
    async initialize() {
        // Register custom helpers
        this.registerHelpers();
        // Load both templates
        await this.loadTemplate('hook-basic.sh');
        await this.loadTemplate('hook-with-validation.sh');
    }
    /**
     * Register Handlebars helpers
     */
    registerHelpers() {
        // Helper to convert object to JSON string
        handlebars_1.default.registerHelper('json', (context) => {
            return JSON.stringify(context);
        });
        // Helper to check if value exists
        handlebars_1.default.registerHelper('exists', (value) => {
            return value !== undefined && value !== null;
        });
    }
    /**
     * Load and compile a template
     * @param templateName - Name of template file (e.g., 'hook-basic.sh')
     */
    async loadTemplate(templateName) {
        const templatePath = path.join(this.templateDir, templateName);
        try {
            const content = await fs.readFile(templatePath, 'utf-8');
            const compiled = handlebars_1.default.compile(content, {
                noEscape: true, // Don't escape HTML entities in bash scripts
                strict: true, // Throw on missing properties
            });
            this.templates.set(templateName, compiled);
        }
        catch (error) {
            throw new types_1.HookGenerationError(`Failed to load template: ${templateName}`, templateName, { templatePath, error: error.message });
        }
    }
    /**
     * Generate a hook script from a declaration
     * @param hook - Hook declaration from skill frontmatter
     * @param skillName - Name of the skill declaring this hook
     * @param options - Generation options
     * @returns Path to generated script
     */
    async generateHookScript(hook, skillName, options = {}) {
        // Validate hook declaration
        this.validateHookDeclaration(hook);
        // Select appropriate template
        const templateName = this.selectTemplate(hook);
        // Prepare template data
        const data = {
            namespace: hook.namespace,
            event: hook.event,
            priority: hook.priority,
            skillName,
            timeout: hook.timeout || 1000,
            trigger: hook.trigger,
            inputSchema: hook.input_schema,
        };
        // Render script
        const script = await this.renderScript(templateName, data);
        // Determine output path
        const outputDir = options.outputDir || this.outputDir;
        const scriptPath = path.join(outputDir, `${hook.namespace.replace(/\./g, '-')}.sh`);
        // Check if script already exists
        if (!options.overwrite) {
            try {
                await fs.access(scriptPath);
                throw new types_1.HookGenerationError(`Script already exists: ${scriptPath}`, hook.namespace, { scriptPath, overwrite: false });
            }
            catch (error) {
                // File doesn't exist - this is good
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }
        }
        // Ensure output directory exists
        await fs.mkdir(outputDir, { recursive: true });
        // Write script to file
        await fs.writeFile(scriptPath, script, { mode: 0o755 }); // Make executable
        return scriptPath;
    }
    /**
     * Validate hook declaration
     */
    validateHookDeclaration(hook) {
        const errors = [];
        if (!hook.event || typeof hook.event !== 'string') {
            errors.push('Hook event is required and must be a string');
        }
        if (typeof hook.priority !== 'number') {
            errors.push('Hook priority is required and must be a number');
        }
        if (!hook.namespace || typeof hook.namespace !== 'string') {
            errors.push('Hook namespace is required and must be a string');
        }
        if (!hook.trigger || typeof hook.trigger !== 'string') {
            errors.push('Hook trigger description is required and must be a string');
        }
        // Validate namespace format (should be dotted notation)
        // Allow lowercase letters, numbers, dots, and hyphens
        if (hook.namespace && !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(hook.namespace)) {
            errors.push(`Invalid namespace format: ${hook.namespace}. Must be dotted notation (e.g., 'clear.session.init')`);
        }
        if (errors.length > 0) {
            throw new types_1.HookGenerationError('Invalid hook declaration', hook.namespace || 'unknown', { errors });
        }
    }
    /**
     * Select appropriate template based on hook features
     */
    selectTemplate(hook) {
        if (hook.input_schema) {
            return 'hook-with-validation.sh';
        }
        return 'hook-basic.sh';
    }
    /**
     * Render script using template
     */
    async renderScript(templateName, data) {
        const template = this.templates.get(templateName);
        if (!template) {
            throw new types_1.HookGenerationError(`Template not loaded: ${templateName}`, data.namespace, { templateName, availableTemplates: Array.from(this.templates.keys()) });
        }
        try {
            return template(data);
        }
        catch (error) {
            throw new types_1.HookGenerationError(`Failed to render template: ${templateName}`, data.namespace, { templateName, error: error.message });
        }
    }
    /**
     * Generate scripts for all hooks in a skill
     * @param hooks - Array of hook declarations
     * @param skillName - Name of the skill
     * @param options - Generation options
     * @returns Array of generated script paths
     */
    async generateSkillHooks(hooks, skillName, options = {}) {
        const scriptPaths = [];
        for (const hook of hooks) {
            try {
                const scriptPath = await this.generateHookScript(hook, skillName, options);
                scriptPaths.push(scriptPath);
            }
            catch (error) {
                // Log error but continue with other hooks
                console.error(`Failed to generate hook ${hook.namespace}:`, error.message);
                // Re-throw if we want to fail fast
                if (!options.validate) {
                    throw error;
                }
            }
        }
        return scriptPaths;
    }
    /**
     * Get the output directory for generated scripts
     */
    getOutputDir() {
        return this.outputDir;
    }
    /**
     * Set the output directory for generated scripts
     */
    setOutputDir(dir) {
        this.outputDir = dir;
    }
}
exports.HookScriptGenerator = HookScriptGenerator;
//# sourceMappingURL=generator.js.map