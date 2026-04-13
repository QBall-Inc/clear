/**
 * Core type definitions for the CLEAR skill infrastructure.
 * Skills are instruction documents (YAML frontmatter + Markdown) that tell Claude what to do.
 */
/**
 * The four skill types in CLEAR framework
 */
export type SkillType = 'core' | 'development' | 'community' | 'project';
/**
 * Hook declaration in skill frontmatter
 */
export interface HookDeclaration {
    event: string;
    priority: number;
    trigger: string;
    namespace: string;
    timeout?: number;
    input_schema?: any;
}
/**
 * Configuration section in skill frontmatter
 */
export interface SkillConfiguration {
    schema?: string;
    defaults?: string;
}
/**
 * Context requirements/contributions in skill frontmatter
 */
export interface SkillContext {
    provides?: string[];
    requires?: string[];
}
/**
 * CLEAR-specific section in skill YAML frontmatter
 */
export interface ClearMetadata {
    type: SkillType;
    priority: number;
    dependencies?: string[];
    hooks?: HookDeclaration[];
    configuration?: SkillConfiguration;
    context?: SkillContext;
}
/**
 * Complete skill YAML frontmatter structure
 */
export interface SkillFrontmatter {
    name: string;
    version: string;
    description: string;
    author: string;
    tags: string[];
    clear?: ClearMetadata;
}
/**
 * Parsed skill document
 */
export interface Skill {
    name: string;
    frontmatter: SkillFrontmatter;
    instructions: string;
    resources?: Map<string, any>;
    loaded: boolean;
}
/**
 * Metadata tracked by the registry
 */
export interface SkillMetadata {
    name: string;
    version: string;
    path: string;
    type: SkillType;
    priority: number;
    dependencies: string[];
    loaded: boolean;
    frontmatter?: SkillFrontmatter;
}
/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
/**
 * Result of loading a skill
 */
export interface SkillLoadResult {
    skill: Skill;
    loadTime: number;
    cached: boolean;
}
/**
 * Registry interface defining the contract for skill management
 */
export interface ISkillRegistry {
    /**
     * Register a skill in the registry
     * @param metadata - Skill metadata to register
     * @throws Error if skill with same name already registered
     */
    register(metadata: SkillMetadata): void;
    /**
     * Get skill metadata by name
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
     * Resolve dependencies for a skill
     * @param skillName - Name of the skill
     * @returns Array of dependency names in load order
     */
    resolveDependencies(skillName: string): string[];
    /**
     * Get load order for all skills of a type
     * @param type - Skill type
     * @returns Array of skill names in priority order
     */
    getLoadOrder(type: SkillType): string[];
    /**
     * Detect circular dependencies starting from a skill
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
}
/**
 * Loader interface for loading skills from filesystem
 */
export interface ISkillLoader {
    /**
     * Load a skill with all its dependencies
     * @param skillName - Name of the skill to load
     * @returns Loaded skill
     * @throws Error if skill not found or circular dependency detected
     */
    loadSkillWithDependencies(skillName: string): Promise<Skill>;
    /**
     * Load core skills in priority order
     * @throws Error if any core skill fails to load
     */
    loadCoreSkills(): Promise<void>;
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
}
/**
 * Validator interface for skill validation
 */
export interface ISkillValidator {
    /**
     * Validate a skill at the given path
     * @param skillPath - Absolute path to skill directory
     * @returns Validation result
     */
    validateSkill(skillPath: string): Promise<ValidationResult>;
    /**
     * Validate skill frontmatter
     * @param frontmatter - Frontmatter to validate
     * @returns Validation result
     */
    validateFrontmatter(frontmatter: any): ValidationResult;
    /**
     * Validate skill instructions
     * @param instructions - Markdown instructions
     * @returns Validation result
     */
    validateInstructions(instructions: string): ValidationResult;
}
/**
 * Error classes for skill operations
 */
export declare class SkillError extends Error {
    context?: any | undefined;
    constructor(message: string, context?: any | undefined);
}
export declare class SkillLoadError extends SkillError {
    skillName: string;
    constructor(message: string, skillName: string, context?: any);
}
export declare class SkillValidationError extends SkillError {
    errors: string[];
    constructor(message: string, errors: string[], context?: any);
}
export declare class CircularDependencyError extends SkillError {
    cycle: string[];
    constructor(message: string, cycle: string[], context?: any);
}
//# sourceMappingURL=types.d.ts.map