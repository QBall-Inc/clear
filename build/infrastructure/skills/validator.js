"use strict";
/**
 * Validator for skill structure, frontmatter, and instructions
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
exports.SkillValidator = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const parser_1 = require("./parser");
/**
 * Skill validator implementation
 */
class SkillValidator {
    /**
     * Validate a skill at the given path
     * @param skillPath - Absolute path to skill directory
     * @returns Validation result
     */
    async validateSkill(skillPath) {
        const errors = [];
        // Check if SKILL.md exists
        const skillFile = path.join(skillPath, 'SKILL.md');
        try {
            await fs.access(skillFile);
        }
        catch {
            errors.push('SKILL.md not found in skill directory');
            return { valid: false, errors };
        }
        // Read and parse the skill document
        let content;
        let frontmatter;
        let instructions;
        try {
            content = await fs.readFile(skillFile, 'utf-8');
        }
        catch (error) {
            errors.push(`Failed to read SKILL.md: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { valid: false, errors };
        }
        try {
            const parsed = (0, parser_1.parseSkillDocument)(content);
            frontmatter = parsed.frontmatter;
            instructions = parsed.instructions;
        }
        catch (error) {
            errors.push(`Failed to parse skill document: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { valid: false, errors };
        }
        // Validate frontmatter
        const frontmatterResult = this.validateFrontmatter(frontmatter);
        if (!frontmatterResult.valid) {
            errors.push(...frontmatterResult.errors);
        }
        // Validate instructions
        const instructionsResult = this.validateInstructions(instructions);
        if (!instructionsResult.valid) {
            errors.push(...instructionsResult.errors);
        }
        // Validate resource references
        if (frontmatter.clear?.configuration?.schema) {
            const schemaPath = path.join(skillPath, frontmatter.clear.configuration.schema);
            try {
                await fs.access(schemaPath);
            }
            catch {
                errors.push(`Referenced schema not found: ${frontmatter.clear.configuration.schema}`);
            }
        }
        if (frontmatter.clear?.configuration?.defaults) {
            const defaultsPath = path.join(skillPath, frontmatter.clear.configuration.defaults);
            try {
                await fs.access(defaultsPath);
            }
            catch {
                errors.push(`Referenced defaults file not found: ${frontmatter.clear.configuration.defaults}`);
            }
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
    /**
     * Validate skill frontmatter
     * @param frontmatter - Frontmatter to validate
     * @returns Validation result
     */
    validateFrontmatter(frontmatter) {
        const errors = [];
        // Check required fields
        const requiredFields = ['name', 'version', 'description', 'author', 'tags'];
        for (const field of requiredFields) {
            if (!frontmatter[field]) {
                errors.push(`Missing required field: ${field}`);
            }
        }
        // Validate field types
        if (frontmatter.name && typeof frontmatter.name !== 'string') {
            errors.push('Field "name" must be a string');
        }
        if (frontmatter.version && typeof frontmatter.version !== 'string') {
            errors.push('Field "version" must be a string');
        }
        if (frontmatter.description && typeof frontmatter.description !== 'string') {
            errors.push('Field "description" must be a string');
        }
        if (frontmatter.author && typeof frontmatter.author !== 'string') {
            errors.push('Field "author" must be a string');
        }
        if (frontmatter.tags) {
            if (!Array.isArray(frontmatter.tags)) {
                errors.push('Field "tags" must be an array');
            }
            else if (frontmatter.tags.length === 0) {
                errors.push('Field "tags" must contain at least one tag');
            }
            else if (!frontmatter.tags.every((tag) => typeof tag === 'string')) {
                errors.push('All tags must be strings');
            }
        }
        // Validate CLEAR section if present
        if (frontmatter.clear) {
            const clearErrors = this.validateClearSection(frontmatter.clear);
            errors.push(...clearErrors);
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
    /**
     * Validate the CLEAR section of frontmatter
     * @param clear - CLEAR metadata section
     * @returns Array of error messages
     */
    validateClearSection(clear) {
        const errors = [];
        // Validate type
        const validTypes = ['core', 'development', 'community', 'project'];
        if (!clear.type) {
            errors.push('CLEAR section missing required field: type');
        }
        else if (!validTypes.includes(clear.type)) {
            errors.push(`Invalid skill type: ${clear.type}. Must be one of: ${validTypes.join(', ')}`);
        }
        // Validate priority
        if (clear.priority === undefined) {
            errors.push('CLEAR section missing required field: priority');
        }
        else if (typeof clear.priority !== 'number') {
            errors.push('Field "priority" must be a number');
        }
        else if (clear.priority < 0) {
            errors.push('Field "priority" must be non-negative');
        }
        // Validate dependencies
        if (clear.dependencies) {
            if (!Array.isArray(clear.dependencies)) {
                errors.push('Field "dependencies" must be an array');
            }
            else if (!clear.dependencies.every((dep) => typeof dep === 'string')) {
                errors.push('All dependencies must be strings (skill names)');
            }
        }
        // Validate hooks
        if (clear.hooks) {
            if (!Array.isArray(clear.hooks)) {
                errors.push('Field "hooks" must be an array');
            }
            else {
                clear.hooks.forEach((hook, index) => {
                    const hookErrors = this.validateHook(hook, index);
                    errors.push(...hookErrors);
                });
            }
        }
        // Validate context
        if (clear.context) {
            if (clear.context.provides && !Array.isArray(clear.context.provides)) {
                errors.push('Field "context.provides" must be an array');
            }
            if (clear.context.requires && !Array.isArray(clear.context.requires)) {
                errors.push('Field "context.requires" must be an array');
            }
        }
        return errors;
    }
    /**
     * Validate a hook declaration
     * @param hook - Hook declaration to validate
     * @param index - Index in hooks array (for error messages)
     * @returns Array of error messages
     */
    validateHook(hook, index) {
        const errors = [];
        const prefix = `Hook ${index}:`;
        // Required fields
        if (!hook.event) {
            errors.push(`${prefix} missing required field "event"`);
        }
        if (hook.priority === undefined) {
            errors.push(`${prefix} missing required field "priority"`);
        }
        else if (typeof hook.priority !== 'number') {
            errors.push(`${prefix} field "priority" must be a number`);
        }
        if (!hook.namespace) {
            errors.push(`${prefix} missing required field "namespace"`);
        }
        else if (typeof hook.namespace !== 'string') {
            errors.push(`${prefix} field "namespace" must be a string`);
        }
        else if (!/^[a-z0-9_.-]+$/i.test(hook.namespace)) {
            errors.push(`${prefix} invalid namespace format (use alphanumeric, dots, dashes, underscores)`);
        }
        if (!hook.trigger) {
            errors.push(`${prefix} missing required field "trigger"`);
        }
        // Optional fields
        if (hook.timeout !== undefined && typeof hook.timeout !== 'number') {
            errors.push(`${prefix} field "timeout" must be a number`);
        }
        return errors;
    }
    /**
     * Validate skill instructions (markdown content)
     * @param instructions - Markdown instructions
     * @returns Validation result
     */
    validateInstructions(instructions) {
        const errors = [];
        // Check minimum length
        if (!instructions || instructions.trim().length === 0) {
            errors.push('Skill instructions cannot be empty');
            return { valid: false, errors };
        }
        if (instructions.trim().length < 50) {
            errors.push('Skill instructions are too short (minimum 50 characters)');
        }
        // Check for vague phrases that indicate unclear instructions
        const vaguePhrases = ['somehow', 'maybe', 'possibly', 'might', 'could', 'perhaps'];
        const lowerInstructions = instructions.toLowerCase();
        for (const phrase of vaguePhrases) {
            // Use word boundaries to avoid false positives (e.g., "lighthouse" containing "might")
            const regex = new RegExp(`\\b${phrase}\\b`, 'i');
            if (regex.test(lowerInstructions)) {
                errors.push(`Instructions contain vague phrase: "${phrase}". Instructions should be specific and actionable.`);
            }
        }
        // Warn if no headers found (instructions should be structured)
        if (!instructions.includes('#')) {
            errors.push('Instructions should include section headers (##) for better organization');
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
}
exports.SkillValidator = SkillValidator;
//# sourceMappingURL=validator.js.map