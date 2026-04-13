"use strict";
/**
 * Pattern Loader for Knowledge Capture and Search
 *
 * Loads patterns from YAML configuration file, compiles regex patterns,
 * and provides detection functions for search intent and capture triggers.
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
exports.loadPatternsConfig = loadPatternsConfig;
exports.detectSearchIntent = detectSearchIntent;
exports.detectCaptureTrigger = detectCaptureTrigger;
exports.detectConfirmation = detectConfirmation;
exports.inferTags = inferTags;
exports.getPendingCaptureConfig = getPendingCaptureConfig;
exports.generateSuggestedTitle = generateSuggestedTitle;
exports.clearPatternsCache = clearPatternsCache;
exports.getSearchPatterns = getSearchPatterns;
exports.getCapturePatterns = getCapturePatterns;
exports.getTagInferenceMap = getTagInferenceMap;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
/**
 * Find project root by looking for package.json
 * Works from both src/ and build/ directories
 */
function findProjectRoot() {
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    // Fallback: assume we're in infrastructure/knowledge relative to root
    return path.resolve(__dirname, '../../..');
}
// Default patterns config path (shipped with plugin)
// Uses src/ path - YAML files are not compiled
const DEFAULT_PATTERNS_PATH = path.join(findProjectRoot(), 'src/infrastructure/knowledge/config/knowledge-patterns.yaml');
/**
 * Compiled patterns cache for performance
 */
let compiledSearchPatterns = null;
let compiledCapturePatterns = null;
let compiledConfirmationPatterns = null;
let patternsConfig = null;
/**
 * Load patterns configuration from YAML file
 * @param cwd - Project working directory (for user overrides)
 * @returns Parsed patterns configuration
 */
function loadPatternsConfig(cwd) {
    // Return cached if available
    if (patternsConfig) {
        return patternsConfig;
    }
    let config;
    // Load default patterns
    try {
        const defaultContent = fs.readFileSync(DEFAULT_PATTERNS_PATH, 'utf-8');
        config = yaml.load(defaultContent, { schema: yaml.JSON_SCHEMA });
    }
    catch (error) {
        throw new Error(`Failed to load default patterns config: ${error.message}`);
    }
    // Check for user overrides
    if (cwd) {
        const userPatternsPath = path.join(cwd, '.clear/config/knowledge-patterns.yaml');
        if (fs.existsSync(userPatternsPath)) {
            try {
                const userContent = fs.readFileSync(userPatternsPath, 'utf-8');
                const userConfig = yaml.load(userContent, { schema: yaml.JSON_SCHEMA });
                // Merge user config over defaults
                config = mergePatternConfigs(config, userConfig);
            }
            catch (error) {
                // Log warning but continue with defaults
                console.error(`Warning: Failed to load user patterns config: ${error.message}`);
            }
        }
    }
    patternsConfig = config;
    return config;
}
/**
 * Merge user pattern config over default config
 * User patterns are appended, not replaced
 */
function mergePatternConfigs(defaults, user) {
    const merged = { ...defaults };
    // Merge search patterns (append user patterns)
    if (user.search?.intent_patterns) {
        merged.search = {
            intent_patterns: [
                ...defaults.search.intent_patterns,
                ...user.search.intent_patterns
            ]
        };
    }
    // Merge capture patterns (append user patterns)
    if (user.capture) {
        merged.capture = {
            decision_patterns: user.capture.decision_patterns
                ? [...defaults.capture.decision_patterns, ...user.capture.decision_patterns]
                : defaults.capture.decision_patterns,
            confirmation_patterns: user.capture.confirmation_patterns
                ? [...defaults.capture.confirmation_patterns, ...user.capture.confirmation_patterns]
                : defaults.capture.confirmation_patterns,
            pending_capture: user.capture.pending_capture || defaults.capture.pending_capture
        };
    }
    // Merge tag inference (merge maps)
    if (user.tag_inference) {
        merged.tag_inference = { ...defaults.tag_inference };
        for (const [tag, keywords] of Object.entries(user.tag_inference)) {
            if (merged.tag_inference[tag]) {
                // Append unique keywords
                merged.tag_inference[tag] = [
                    ...new Set([...merged.tag_inference[tag], ...keywords])
                ];
            }
            else {
                merged.tag_inference[tag] = keywords;
            }
        }
    }
    return merged;
}
/** Maximum allowed regex pattern length to mitigate ReDoS risk */
const MAX_PATTERN_LENGTH = 500;
/** Maximum length for suggested knowledge titles */
const MAX_TITLE_LENGTH = 80;
/**
 * Safely compile a regex pattern with length validation.
 * Rejects patterns that exceed MAX_PATTERN_LENGTH to mitigate ReDoS risk
 * from user-supplied patterns in .clear/config/knowledge-patterns.yaml.
 *
 * @param pattern - Regex pattern string
 * @param flags - Regex flags
 * @returns Compiled RegExp
 * @throws Error if pattern exceeds length limit or is invalid
 */
function safeCompileRegex(pattern, flags) {
    if (pattern.length > MAX_PATTERN_LENGTH) {
        throw new Error(`Pattern exceeds maximum length of ${MAX_PATTERN_LENGTH} characters (got ${pattern.length}). ` +
            `This limit exists to prevent ReDoS attacks.`);
    }
    return new RegExp(pattern, flags);
}
/**
 * Compile search intent patterns to RegExp objects
 */
function compileSearchPatterns(config) {
    if (compiledSearchPatterns) {
        return compiledSearchPatterns;
    }
    compiledSearchPatterns = config.search.intent_patterns.map(def => ({
        regex: safeCompileRegex(def.pattern, def.flags),
        definition: def
    }));
    return compiledSearchPatterns;
}
/**
 * Compile capture detection patterns to RegExp objects
 */
function compileCapturePatterns(config) {
    if (compiledCapturePatterns) {
        return compiledCapturePatterns;
    }
    compiledCapturePatterns = config.capture.decision_patterns.map(def => ({
        regex: safeCompileRegex(def.pattern, def.flags),
        definition: def
    }));
    return compiledCapturePatterns;
}
/**
 * Compile confirmation patterns to RegExp objects
 */
function compileConfirmationPatterns(config) {
    if (compiledConfirmationPatterns) {
        return compiledConfirmationPatterns;
    }
    compiledConfirmationPatterns = config.capture.confirmation_patterns.map(def => ({
        regex: safeCompileRegex(def.pattern, def.flags),
        definition: def
    }));
    return compiledConfirmationPatterns;
}
/**
 * Detect search intent in user text
 * @param text - User prompt text
 * @param cwd - Project working directory
 * @returns Search intent result with extracted query
 */
function detectSearchIntent(text, cwd) {
    const config = loadPatternsConfig(cwd);
    const patterns = compileSearchPatterns(config);
    for (const { regex, definition } of patterns) {
        const match = text.match(regex);
        if (match) {
            const captureGroup = definition.capture_group ?? 1;
            const query = match[captureGroup]?.trim() || match[0].trim();
            return {
                matched: true,
                query,
                pattern: definition
            };
        }
    }
    return { matched: false };
}
/**
 * Detect capture trigger in user text
 * @param text - User prompt text
 * @param cwd - Project working directory
 * @returns Capture detection result with extracted text and type
 */
function detectCaptureTrigger(text, cwd) {
    const config = loadPatternsConfig(cwd);
    const patterns = compileCapturePatterns(config);
    for (const { regex, definition } of patterns) {
        const match = text.match(regex);
        if (match) {
            const captureGroup = definition.capture_group ?? 1;
            // For capture_group 0, use full match; otherwise use the specified group
            const extractedText = captureGroup === 0
                ? match[0].trim()
                : (match[captureGroup]?.trim() || match[0].trim());
            return {
                matched: true,
                extractedText,
                suggestedType: definition.type,
                pattern: definition,
                isExplicit: definition.explicit ?? false
            };
        }
    }
    return { matched: false };
}
/**
 * Detect confirmation response in user text
 * @param text - User prompt text (typically short response)
 * @param cwd - Project working directory
 * @returns Confirmation result
 */
function detectConfirmation(text, cwd) {
    const config = loadPatternsConfig(cwd);
    const patterns = compileConfirmationPatterns(config);
    // Trim and check against confirmation patterns
    const trimmedText = text.trim();
    for (const { regex, definition } of patterns) {
        if (regex.test(trimmedText)) {
            return {
                detected: true,
                response: definition.response
            };
        }
    }
    return { detected: false };
}
/**
 * Infer tags from text based on keyword mappings
 * @param text - Text to analyze for keywords
 * @param cwd - Project working directory
 * @returns Array of inferred tags
 */
function inferTags(text, cwd) {
    const config = loadPatternsConfig(cwd);
    const textLower = text.toLowerCase();
    const inferredTags = new Set();
    for (const [tag, keywords] of Object.entries(config.tag_inference)) {
        for (const keyword of keywords) {
            // Match whole word or hyphenated term
            const keywordLower = keyword.toLowerCase();
            // Use word boundary check
            const regex = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'i');
            if (regex.test(textLower)) {
                inferredTags.add(tag);
                break; // Found match for this tag, move to next tag
            }
        }
    }
    return Array.from(inferredTags).sort();
}
/**
 * Escape special regex characters in a string
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Get pending capture configuration
 * @param cwd - Project working directory
 * @returns Pending capture timeout configuration
 */
function getPendingCaptureConfig(cwd) {
    const config = loadPatternsConfig(cwd);
    return config.capture.pending_capture;
}
/**
 * Generate a suggested title from extracted text
 * @param text - Extracted text from capture pattern
 * @param _type - Knowledge type (reserved for future type-specific formatting)
 * @returns Suggested title (capitalized, truncated if needed)
 */
function generateSuggestedTitle(text) {
    // Clean up the text
    let title = text.trim();
    // Remove trailing punctuation
    title = title.replace(/[.,;:!?]+$/, '');
    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);
    // Truncate if too long
    if (title.length > MAX_TITLE_LENGTH) {
        title = title.substring(0, MAX_TITLE_LENGTH - 3) + '...';
    }
    return title;
}
/**
 * Clear cached patterns (useful for testing or config reload)
 */
function clearPatternsCache() {
    compiledSearchPatterns = null;
    compiledCapturePatterns = null;
    compiledConfirmationPatterns = null;
    patternsConfig = null;
}
/**
 * Get all search patterns (for testing/debugging)
 */
function getSearchPatterns(cwd) {
    const config = loadPatternsConfig(cwd);
    return config.search.intent_patterns;
}
/**
 * Get all capture patterns (for testing/debugging)
 */
function getCapturePatterns(cwd) {
    const config = loadPatternsConfig(cwd);
    return config.capture.decision_patterns;
}
/**
 * Get tag inference map (for testing/debugging)
 */
function getTagInferenceMap(cwd) {
    const config = loadPatternsConfig(cwd);
    return config.tag_inference;
}
//# sourceMappingURL=patterns.js.map