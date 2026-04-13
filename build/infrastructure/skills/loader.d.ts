/**
 * Skill loader with dependency resolution and circular dependency detection
 */
import { ISkillLoader, ISkillRegistry, ISkillValidator, Skill } from './types';
/**
 * Skill loader implementation
 */
export declare class SkillLoader implements ISkillLoader {
    private registry;
    private validator;
    private loadedSkills;
    private loadingStack;
    constructor(registry: ISkillRegistry, validator: ISkillValidator);
    /**
     * Load core skills in priority order
     * @throws SkillLoadError if any core skill fails to load
     */
    loadCoreSkills(): Promise<void>;
    /**
     * Load a skill with all its dependencies
     * @param skillName - Name of the skill to load
     * @returns Loaded skill
     * @throws CircularDependencyError if circular dependency detected
     * @throws SkillLoadError if skill not found or loading fails
     */
    loadSkillWithDependencies(skillName: string): Promise<Skill>;
    /**
     * Load a single skill from filesystem
     * @param skillName - Name of the skill
     * @param skillPath - Absolute path to skill directory
     * @returns Loaded skill
     * @throws SkillLoadError if loading fails
     */
    private loadSkill;
    /**
     * Load optional resources from skill directory
     * @param skillPath - Path to skill directory
     * @returns Map of resource paths to contents
     */
    private loadResources;
    /**
     * Detect circular dependency using the loading stack
     * This is the fast check that runs during loading
     * @param skillName - Skill to check
     * @returns Cycle path if found, null otherwise
     */
    private detectCircularDependencyInStack;
    /**
     * Check if a skill is already loaded
     * @param skillName - Name of the skill
     * @returns True if loaded
     */
    isLoaded(skillName: string): boolean;
    /**
     * Get all loaded skill names
     * @returns Array of loaded skill names
     */
    getLoadedSkills(): string[];
    /**
     * Clear all loaded skills (useful for testing)
     */
    clearLoaded(): void;
    /**
     * Get current loading stack (useful for debugging)
     * @returns Current loading stack
     */
    getLoadingStack(): string[];
}
//# sourceMappingURL=loader.d.ts.map