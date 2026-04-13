"use strict";
/**
 * Skill registry for tracking and managing skills.
 * Provides dependency resolution, load ordering, and circular dependency detection.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillRegistry = void 0;
const types_1 = require("./types");
/**
 * In-memory registry for skill metadata
 */
class SkillRegistry {
    constructor() {
        this.core = new Map();
        this.development = new Map();
        this.community = new Map();
        this.project = new Map();
    }
    /**
     * Get the appropriate map for a skill type
     */
    getMapForType(type) {
        switch (type) {
            case 'core':
                return this.core;
            case 'development':
                return this.development;
            case 'community':
                return this.community;
            case 'project':
                return this.project;
        }
    }
    /**
     * Register a skill in the registry
     * @param metadata - Skill metadata to register
     * @throws SkillError if skill with same name already registered
     */
    register(metadata) {
        const map = this.getMapForType(metadata.type);
        if (map.has(metadata.name)) {
            throw new types_1.SkillError(`Skill '${metadata.name}' is already registered in ${metadata.type} registry`, { existing: map.get(metadata.name), attempted: metadata });
        }
        map.set(metadata.name, metadata);
    }
    /**
     * Get skill metadata by name (searches all registries)
     * @param skillName - Name of the skill
     * @returns Skill metadata or undefined if not found
     */
    get(skillName) {
        // Search in order: core -> development -> community -> project
        return (this.core.get(skillName) ||
            this.development.get(skillName) ||
            this.community.get(skillName) ||
            this.project.get(skillName));
    }
    /**
     * Check if a skill is registered
     * @param skillName - Name of the skill
     * @returns True if registered
     */
    has(skillName) {
        return this.get(skillName) !== undefined;
    }
    /**
     * Get all skills of a specific type
     * @param type - Skill type to filter by
     * @returns Array of skill metadata
     */
    getByType(type) {
        const map = this.getMapForType(type);
        return Array.from(map.values());
    }
    /**
     * Resolve dependencies for a skill (returns flat list in load order)
     * @param skillName - Name of the skill
     * @returns Array of dependency names in load order
     * @throws SkillError if skill not found
     */
    resolveDependencies(skillName) {
        const metadata = this.get(skillName);
        if (!metadata) {
            throw new types_1.SkillError(`Cannot resolve dependencies: skill '${skillName}' not found in registry`);
        }
        if (!metadata.dependencies || metadata.dependencies.length === 0) {
            return [];
        }
        // Use topological sort to get proper load order
        const resolved = [];
        const visited = new Set();
        const visit = (name) => {
            if (visited.has(name)) {
                return;
            }
            visited.add(name);
            const skill = this.get(name);
            if (!skill) {
                throw new types_1.SkillError(`Dependency '${name}' not found in registry`);
            }
            // Visit dependencies first (depth-first)
            if (skill.dependencies) {
                for (const dep of skill.dependencies) {
                    visit(dep);
                }
            }
            // Add this skill after its dependencies
            if (name !== skillName) {
                resolved.push(name);
            }
        };
        visit(skillName);
        return resolved;
    }
    /**
     * Get load order for all skills of a type (sorted by priority)
     * @param type - Skill type
     * @returns Array of skill names in priority order (lower priority = earlier)
     */
    getLoadOrder(type) {
        const skills = this.getByType(type);
        // Sort by priority (lower number = higher priority = loaded first)
        return skills
            .sort((a, b) => a.priority - b.priority)
            .map(s => s.name);
    }
    /**
     * Detect circular dependencies starting from a skill
     * Uses depth-first search with recursion stack
     * @param skillName - Name of the skill to check
     * @returns Array representing the circular path, or null if no cycle
     */
    detectCircularDependencies(skillName) {
        const visited = new Set();
        const recursionStack = new Set();
        const path = [];
        const hasCycle = (name) => {
            if (!visited.has(name)) {
                visited.add(name);
                recursionStack.add(name);
                path.push(name);
                const metadata = this.get(name);
                if (!metadata) {
                    // Skill not found, but this isn't a cycle
                    path.pop();
                    recursionStack.delete(name);
                    return null;
                }
                const dependencies = metadata.dependencies || [];
                for (const dep of dependencies) {
                    if (!visited.has(dep)) {
                        const cycle = hasCycle(dep);
                        if (cycle) {
                            return cycle;
                        }
                    }
                    else if (recursionStack.has(dep)) {
                        // Found a cycle - build the cycle path
                        const cycleStart = path.indexOf(dep);
                        return [...path.slice(cycleStart), dep];
                    }
                }
            }
            path.pop();
            recursionStack.delete(name);
            return null;
        };
        return hasCycle(skillName);
    }
    /**
     * Get all registered skill names
     * @returns Array of all skill names
     */
    getAllSkillNames() {
        return [
            ...Array.from(this.core.keys()),
            ...Array.from(this.development.keys()),
            ...Array.from(this.community.keys()),
            ...Array.from(this.project.keys())
        ];
    }
    /**
     * Clear all registered skills
     */
    clear() {
        this.core.clear();
        this.development.clear();
        this.community.clear();
        this.project.clear();
    }
    /**
     * Get registry statistics
     * @returns Object with counts per type
     */
    getStats() {
        return {
            core: this.core.size,
            development: this.development.size,
            community: this.community.size,
            project: this.project.size,
            total: this.core.size + this.development.size + this.community.size + this.project.size
        };
    }
}
exports.SkillRegistry = SkillRegistry;
//# sourceMappingURL=registry.js.map