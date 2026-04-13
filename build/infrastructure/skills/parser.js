"use strict";
/**
 * Parser for skill YAML frontmatter and markdown content
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
exports.parseSkillDocument = parseSkillDocument;
exports.serializeFrontmatter = serializeFrontmatter;
exports.createSkillDocument = createSkillDocument;
const yaml = __importStar(require("js-yaml"));
/**
 * Parse a skill document (YAML frontmatter + markdown)
 * @param content - Full content of SKILL.md
 * @returns Parsed frontmatter and instructions
 * @throws Error if YAML parsing fails or frontmatter missing
 */
function parseSkillDocument(content) {
    // Check for frontmatter delimiters
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
        throw new Error('Skill document missing YAML frontmatter (must be wrapped in ---)');
    }
    const [, yamlContent, instructions] = frontmatterMatch;
    // Parse YAML
    let frontmatter;
    try {
        frontmatter = yaml.load(yamlContent);
    }
    catch (error) {
        throw new Error(`Failed to parse YAML frontmatter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    if (!frontmatter || typeof frontmatter !== 'object') {
        throw new Error('Frontmatter must be a valid YAML object');
    }
    return {
        frontmatter: frontmatter,
        instructions: instructions.trim()
    };
}
/**
 * Serialize frontmatter back to YAML
 * @param frontmatter - Frontmatter object
 * @returns YAML string
 */
function serializeFrontmatter(frontmatter) {
    return yaml.dump(frontmatter, {
        indent: 2,
        lineWidth: 100,
        noRefs: true
    });
}
/**
 * Create a complete skill document from frontmatter and instructions
 * @param frontmatter - Frontmatter object
 * @param instructions - Markdown instructions
 * @returns Complete SKILL.md content
 */
function createSkillDocument(frontmatter, instructions) {
    const yamlContent = serializeFrontmatter(frontmatter);
    return `---\n${yamlContent}---\n\n${instructions}`;
}
//# sourceMappingURL=parser.js.map