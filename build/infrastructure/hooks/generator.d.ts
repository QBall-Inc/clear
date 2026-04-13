/**
 * Hook script generator
 *
 * Generates executable bash scripts from hook declarations in skill YAML frontmatter.
 * Uses Handlebars templates with proper JSON handling via jq.
 */
import { HookDeclaration, HookGenerationOptions } from './types';
/**
 * Generates hook scripts from declarations
 */
export declare class HookScriptGenerator {
    private templates;
    private templateDir;
    private outputDir;
    constructor(templateDir?: string, outputDir?: string);
    /**
     * Initialize the generator by loading templates
     */
    initialize(): Promise<void>;
    /**
     * Register Handlebars helpers
     */
    private registerHelpers;
    /**
     * Load and compile a template
     * @param templateName - Name of template file (e.g., 'hook-basic.sh')
     */
    private loadTemplate;
    /**
     * Generate a hook script from a declaration
     * @param hook - Hook declaration from skill frontmatter
     * @param skillName - Name of the skill declaring this hook
     * @param options - Generation options
     * @returns Path to generated script
     */
    generateHookScript(hook: HookDeclaration, skillName: string, options?: HookGenerationOptions): Promise<string>;
    /**
     * Validate hook declaration
     */
    private validateHookDeclaration;
    /**
     * Select appropriate template based on hook features
     */
    private selectTemplate;
    /**
     * Render script using template
     */
    private renderScript;
    /**
     * Generate scripts for all hooks in a skill
     * @param hooks - Array of hook declarations
     * @param skillName - Name of the skill
     * @param options - Generation options
     * @returns Array of generated script paths
     */
    generateSkillHooks(hooks: HookDeclaration[], skillName: string, options?: HookGenerationOptions): Promise<string[]>;
    /**
     * Get the output directory for generated scripts
     */
    getOutputDir(): string;
    /**
     * Set the output directory for generated scripts
     */
    setOutputDir(dir: string): void;
}
//# sourceMappingURL=generator.d.ts.map