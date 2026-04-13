/**
 * Parser for skill YAML frontmatter and markdown content
 */
import { SkillFrontmatter } from './types';
/**
 * Parsed skill document
 */
export interface ParsedSkillDocument {
    frontmatter: SkillFrontmatter;
    instructions: string;
}
/**
 * Parse a skill document (YAML frontmatter + markdown)
 * @param content - Full content of SKILL.md
 * @returns Parsed frontmatter and instructions
 * @throws Error if YAML parsing fails or frontmatter missing
 */
export declare function parseSkillDocument(content: string): ParsedSkillDocument;
/**
 * Serialize frontmatter back to YAML
 * @param frontmatter - Frontmatter object
 * @returns YAML string
 */
export declare function serializeFrontmatter(frontmatter: SkillFrontmatter): string;
/**
 * Create a complete skill document from frontmatter and instructions
 * @param frontmatter - Frontmatter object
 * @param instructions - Markdown instructions
 * @returns Complete SKILL.md content
 */
export declare function createSkillDocument(frontmatter: SkillFrontmatter, instructions: string): string;
//# sourceMappingURL=parser.d.ts.map