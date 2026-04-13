/**
 * Skill registry for tracking and managing skills.
 * Provides dependency resolution, load ordering, and circular dependency detection.
 */
import { ISkillRegistry, SkillMetadata, SkillType } from './types';
/**
 * In-memory registry for skill metadata
 */
export declare class SkillRegistry implements ISkillRegistry {
    private core;
    private development;
    private community;
    private project;
    /**
     * Get the appropriate map for a skill type
     */
    private getMapForType;
    /**
     * Register a skill in the registry
     * @param metadata - Skill metadata to register
     * @throws SkillError if skill with same name already registered
     */
    register(metadata: SkillMetadata): void;
    /**
     * Get skill metadata by name (searches all registries)
     * @param skillName - Name of the skill
     * @returns Skill metadata or undefined if not found
     */
    get(skillName: string): SkillMetadata | undefined;
    /**
     * Check if a skill is registered
     * @param skillName - Name of the skill
     * @returns True if registered
     */
    has(skillName: string): boolean;
    /**
     * Get all skills of a specific type
     * @param type - Skill type to filter by
     * @returns Array of skill metadata
     */
    getByType(type: SkillType): SkillMetadata[];
    /**
     * Resolve dependencies for a skill (returns flat list in load order)
     * @param skillName - Name of the skill
     * @returns Array of dependency names in load order
     * @throws SkillError if skill not found
     */
    resolveDependencies(skillName: string): string[];
    /**
     * Get load order for all skills of a type (sorted by priority)
     * @param type - Skill type
     * @returns Array of skill names in priority order (lower priority = earlier)
     */
    getLoadOrder(type: SkillType): string[];
    /**
     * Detect circular dependencies starting from a skill
     * Uses depth-first search with recursion stack
     * @param skillName - Name of the skill to check
     * @returns Array representing the circular path, or null if no cycle
     */
    detectCircularDependencies(skillName: string): string[] | null;
    /**
     * Get all registered skill names
     * @returns Array of all skill names
     */
    getAllSkillNames(): string[];
    /**
     * Clear all registered skills
     */
    clear(): void;
    /**
     * Get registry statistics
     * @returns Object with counts per type
     */
    getStats(): {
        core: number;
        development: number;
        community: number;
        project: number;
        total: number;
    };
}
//# sourceMappingURL=registry.d.ts.map