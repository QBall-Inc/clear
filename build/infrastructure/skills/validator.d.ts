/**
 * Validator for skill structure, frontmatter, and instructions
 */
import { ISkillValidator, ValidationResult } from './types';
/**
 * Skill validator implementation
 */
export declare class SkillValidator implements ISkillValidator {
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
     * Validate the CLEAR section of frontmatter
     * @param clear - CLEAR metadata section
     * @returns Array of error messages
     */
    private validateClearSection;
    /**
     * Validate a hook declaration
     * @param hook - Hook declaration to validate
     * @param index - Index in hooks array (for error messages)
     * @returns Array of error messages
     */
    private validateHook;
    /**
     * Validate skill instructions (markdown content)
     * @param instructions - Markdown instructions
     * @returns Validation result
     */
    validateInstructions(instructions: string): ValidationResult;
}
//# sourceMappingURL=validator.d.ts.map