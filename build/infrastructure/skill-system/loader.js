"use strict";
/**
 * Skill loader with dependency resolution and circular dependency detection
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
exports.SkillLoader = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const types_1 = require("./types");
const parser_1 = require("./parser");
/**
 * Skill loader implementation
 */
class SkillLoader {
    constructor(registry, validator) {
        this.loadedSkills = new Set();
        this.loadingStack = []; // Track loading stack for cycle detection
        this.registry = registry;
        this.validator = validator;
    }
    /**
     * Load core skills in priority order
     * @throws SkillLoadError if any core skill fails to load
     */
    async loadCoreSkills() {
        const coreSkills = this.registry.getLoadOrder('core');
        for (const skillName of coreSkills) {
            await this.loadSkillWithDependencies(skillName);
        }
    }
    /**
     * Load a skill with all its dependencies
     * @param skillName - Name of the skill to load
     * @returns Loaded skill
     * @throws CircularDependencyError if circular dependency detected
     * @throws SkillLoadError if skill not found or loading fails
     */
    async loadSkillWithDependencies(skillName) {
        // If already loaded, return from cache
        if (this.loadedSkills.has(skillName)) {
            const metadata = this.registry.get(skillName);
            if (!metadata) {
                throw new types_1.SkillLoadError(`Skill '${skillName}' marked as loaded but not in registry`, skillName);
            }
            // Return a minimal skill object (already loaded)
            return {
                name: skillName,
                frontmatter: metadata.frontmatter,
                instructions: '',
                loaded: true
            };
        }
        // Check for circular dependencies using loading stack
        const cycle = this.detectCircularDependencyInStack(skillName);
        if (cycle) {
            throw new types_1.CircularDependencyError(`Circular dependency detected: ${cycle.join(' -> ')}`, cycle);
        }
        // Add to loading stack
        this.loadingStack.push(skillName);
        try {
            // Get metadata from registry
            const metadata = this.registry.get(skillName);
            if (!metadata) {
                throw new types_1.SkillLoadError(`Skill '${skillName}' not found in registry. Register it before loading.`, skillName);
            }
            // Load dependencies first (depth-first)
            const dependencies = metadata.dependencies || [];
            for (const dep of dependencies) {
                await this.loadSkillWithDependencies(dep);
            }
            // Load the skill itself
            const skill = await this.loadSkill(skillName, metadata.path);
            // Mark as loaded
            this.loadedSkills.add(skillName);
            return skill;
        }
        finally {
            // Always remove from loading stack
            this.loadingStack.pop();
        }
    }
    /**
     * Load a single skill from filesystem
     * @param skillName - Name of the skill
     * @param skillPath - Absolute path to skill directory
     * @returns Loaded skill
     * @throws SkillLoadError if loading fails
     */
    async loadSkill(skillName, skillPath) {
        const startTime = Date.now();
        try {
            // Validate the skill first
            const validation = await this.validator.validateSkill(skillPath);
            if (!validation.valid) {
                throw new types_1.SkillLoadError(`Skill validation failed for '${skillName}'`, skillName, { errors: validation.errors, path: skillPath });
            }
            // Read SKILL.md
            const skillFile = path.join(skillPath, 'SKILL.md');
            const content = await fs.readFile(skillFile, 'utf-8');
            // Parse frontmatter and instructions
            const { frontmatter, instructions } = (0, parser_1.parseSkillDocument)(content);
            // Verify name matches
            if (frontmatter.name !== skillName) {
                throw new types_1.SkillLoadError(`Skill name mismatch: expected '${skillName}' but frontmatter declares '${frontmatter.name}'`, skillName, { path: skillPath });
            }
            // Load optional resources
            const resources = await this.loadResources(skillPath);
            const loadTime = Date.now() - startTime;
            const skill = {
                name: skillName,
                frontmatter,
                instructions,
                resources,
                loaded: true
            };
            // Update registry metadata with loaded frontmatter
            const metadata = this.registry.get(skillName);
            if (metadata) {
                metadata.frontmatter = frontmatter;
                metadata.loaded = true;
            }
            console.log(`Loaded skill '${skillName}' in ${loadTime}ms`);
            return skill;
        }
        catch (error) {
            if (error instanceof types_1.SkillLoadError) {
                throw error;
            }
            throw new types_1.SkillLoadError(`Failed to load skill '${skillName}': ${error instanceof Error ? error.message : 'Unknown error'}`, skillName, { path: skillPath, originalError: error });
        }
    }
    /**
     * Load optional resources from skill directory
     * @param skillPath - Path to skill directory
     * @returns Map of resource paths to contents
     */
    async loadResources(skillPath) {
        const resources = new Map();
        // Check for common resource directories
        const resourceDirs = ['resources', 'templates', 'examples', 'scripts', 'docs'];
        for (const dir of resourceDirs) {
            const dirPath = path.join(skillPath, dir);
            try {
                const stats = await fs.stat(dirPath);
                if (stats.isDirectory()) {
                    // List files in directory
                    const files = await fs.readdir(dirPath);
                    for (const file of files) {
                        const filePath = path.join(dirPath, file);
                        const fileStats = await fs.stat(filePath);
                        if (fileStats.isFile()) {
                            // Read file content
                            const content = await fs.readFile(filePath, 'utf-8');
                            resources.set(`${dir}/${file}`, content);
                        }
                    }
                }
            }
            catch {
                // Directory doesn't exist, skip
                continue;
            }
        }
        return resources;
    }
    /**
     * Detect circular dependency using the loading stack
     * This is the fast check that runs during loading
     * @param skillName - Skill to check
     * @returns Cycle path if found, null otherwise
     */
    detectCircularDependencyInStack(skillName) {
        const index = this.loadingStack.indexOf(skillName);
        if (index !== -1) {
            // Found in stack - circular dependency
            return [...this.loadingStack.slice(index), skillName];
        }
        return null;
    }
    /**
     * Check if a skill is already loaded
     * @param skillName - Name of the skill
     * @returns True if loaded
     */
    isLoaded(skillName) {
        return this.loadedSkills.has(skillName);
    }
    /**
     * Get all loaded skill names
     * @returns Array of loaded skill names
     */
    getLoadedSkills() {
        return Array.from(this.loadedSkills);
    }
    /**
     * Clear all loaded skills (useful for testing)
     */
    clearLoaded() {
        this.loadedSkills.clear();
        this.loadingStack = [];
    }
    /**
     * Get current loading stack (useful for debugging)
     * @returns Current loading stack
     */
    getLoadingStack() {
        return [...this.loadingStack];
    }
}
exports.SkillLoader = SkillLoader;
//# sourceMappingURL=loader.js.map