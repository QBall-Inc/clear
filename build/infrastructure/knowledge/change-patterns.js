"use strict";
/**
 * Change Pattern Loader and Matcher
 *
 * Loads change detection patterns from YAML configuration, supports user
 * override merging, and evaluates file lists against Level A/B patterns.
 *
 * Used by:
 * - session-stop.sh (via change-pattern-cli.ts) for Level B assessment
 * - PostToolUse accumulator for exclusion filtering
 *
 * Follows patterns.ts architecture: YAML load → cache → user merge → evaluate.
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
exports.loadChangePatterns = loadChangePatterns;
exports.clearChangePatternCache = clearChangePatternCache;
exports.matchChangePatterns = matchChangePatterns;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const NO_MATCH = {
    matched: false,
    level: 'C',
    patternId: '',
    message: '',
};
// ==============================================================================
// CACHE
// ==============================================================================
let cachedConfig = null;
/**
 * Find project root by looking for package.json.
 * Works from both src/ and build/ directories.
 */
function findProjectRoot() {
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    return path.resolve(__dirname, '../../..');
}
const DEFAULT_CONFIG_PATH = path.join(findProjectRoot(), 'src/infrastructure/knowledge/config/knowledge-change-patterns.yaml');
// ==============================================================================
// LOADING
// ==============================================================================
/**
 * Load change patterns configuration.
 *
 * Loads defaults from shipped YAML, then checks for user override at
 * `.clear/config/knowledge-change-patterns.yaml`. User patterns are
 * APPENDED (not replaced). Result is cached.
 *
 * @param cwd - Project working directory (for user overrides)
 * @param configPath - Override default config path (for testing)
 */
function loadChangePatterns(cwd, configPath) {
    if (cachedConfig) {
        return cachedConfig;
    }
    const effectivePath = configPath || DEFAULT_CONFIG_PATH;
    let config;
    try {
        const content = fs.readFileSync(effectivePath, 'utf-8');
        config = yaml.load(content, { schema: yaml.JSON_SCHEMA });
    }
    catch (error) {
        throw new Error(`Failed to load change patterns config: ${error.message}`);
    }
    // Check for user overrides
    if (cwd) {
        const userPath = path.join(cwd, '.clear/config/knowledge-change-patterns.yaml');
        if (fs.existsSync(userPath)) {
            try {
                const userContent = fs.readFileSync(userPath, 'utf-8');
                const userConfig = yaml.load(userContent, { schema: yaml.JSON_SCHEMA });
                config = mergeConfigs(config, userConfig);
            }
            catch {
                process.stderr.write('[change-patterns] Warning: malformed user config, using defaults\n');
            }
        }
    }
    cachedConfig = config;
    return config;
}
/**
 * Merge user config into defaults. Patterns and exclusions are appended.
 */
function mergeConfigs(defaults, user) {
    return {
        version: defaults.version,
        change_patterns: [
            ...defaults.change_patterns,
            ...(user.change_patterns || []),
        ],
        exclusions: [
            ...defaults.exclusions,
            ...(user.exclusions || []),
        ],
    };
}
/**
 * Clear cached config. Exposed for testing.
 */
function clearChangePatternCache() {
    cachedConfig = null;
}
// ==============================================================================
// MATCHING
// ==============================================================================
/**
 * Match a list of changed files against change patterns.
 *
 * Evaluation order:
 * 1. Filter out excluded paths
 * 2. Evaluate Level A patterns (first match wins)
 * 3. Evaluate Level B patterns (first match wins)
 * 4. No match → Level C
 *
 * @param files - Array of changed file paths (relative to project root)
 * @param cwd - Project working directory (for user overrides)
 * @param toolFilter - If provided, only match patterns with matching tool_filter
 * @param configPath - Override default config path (for testing)
 */
function matchChangePatterns(files, cwd, toolFilter, configPath) {
    const config = loadChangePatterns(cwd, configPath);
    // Step 1: Filter exclusions
    const filtered = files
        .map(f => f.replace(/^\.\//, ''))
        .filter(f => !isExcluded(f, config.exclusions));
    if (filtered.length === 0) {
        return NO_MATCH;
    }
    // Step 2: Level A patterns (first match wins, takes precedence)
    const levelAPatterns = config.change_patterns.filter(p => p.level === 'A');
    for (const pattern of levelAPatterns) {
        const matchingFiles = filtered.filter(f => matchesAnyGlob(f, pattern.paths));
        if (matchingFiles.length > 0) {
            return {
                matched: true,
                level: 'A',
                patternId: pattern.id,
                message: formatMessage(pattern.message_template, matchingFiles),
            };
        }
    }
    // Step 3: Level B patterns (first match wins)
    const levelBPatterns = config.change_patterns.filter(p => p.level === 'B');
    for (const pattern of levelBPatterns) {
        if (!evaluateLevelB(pattern, filtered, toolFilter)) {
            continue;
        }
        const matchingFiles = filtered.filter(f => matchesAnyGlob(f, pattern.paths));
        return {
            matched: true,
            level: 'B',
            patternId: pattern.id,
            message: formatMessage(pattern.message_template, matchingFiles, filtered),
        };
    }
    // Step 4: Level C
    return NO_MATCH;
}
/**
 * Evaluate a Level B pattern against the file list with all conditions.
 */
function evaluateLevelB(pattern, files, toolFilter) {
    // tool_filter check
    if (pattern.tool_filter && toolFilter && pattern.tool_filter !== toolFilter) {
        return false;
    }
    // Find matching files
    const matchingFiles = files.filter(f => matchesAnyGlob(f, pattern.paths));
    // min_files threshold
    const minFiles = pattern.min_files ?? 1;
    if (matchingFiles.length < minFiles) {
        return false;
    }
    // same_directory check
    if (pattern.same_directory) {
        const dirCounts = new Map();
        for (const f of matchingFiles) {
            const dir = path.dirname(f);
            dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
        }
        // At least one directory must have min_files matches
        const hasEnough = Array.from(dirCounts.values()).some(count => count >= minFiles);
        if (!hasEnough) {
            return false;
        }
    }
    // requires_also check
    if (pattern.requires_also && pattern.requires_also.length > 0) {
        const hasAlso = files.some(f => matchesAnyGlob(f, pattern.requires_also));
        if (!hasAlso) {
            return false;
        }
    }
    return true;
}
// ==============================================================================
// GLOB MATCHING
// ==============================================================================
/**
 * Check if a file path matches any of the given glob patterns.
 */
function matchesAnyGlob(filePath, patterns) {
    return patterns.some(pattern => globMatch(filePath, pattern));
}
/**
 * Simple glob matcher supporting * and ** patterns.
 *
 * - `*` matches any characters except /
 * - `**` matches any characters including /
 * - `?` matches any single character except /
 */
function globMatch(filePath, pattern) {
    // Convert glob to regex
    let regexStr = '^';
    let i = 0;
    while (i < pattern.length) {
        const char = pattern[i];
        if (char === '*') {
            if (pattern[i + 1] === '*') {
                // ** — match anything including /
                if (pattern[i + 2] === '/') {
                    regexStr += '(?:.*/)?';
                    i += 3;
                }
                else {
                    regexStr += '.*';
                    i += 2;
                }
            }
            else {
                // * — match anything except /
                regexStr += '[^/]*';
                i += 1;
            }
        }
        else if (char === '?') {
            regexStr += '[^/]';
            i += 1;
        }
        else if (char === '.') {
            regexStr += '\\.';
            i += 1;
        }
        else {
            regexStr += char;
            i += 1;
        }
    }
    regexStr += '$';
    return new RegExp(regexStr).test(filePath);
}
/**
 * Check if a file path matches any exclusion pattern.
 */
function isExcluded(filePath, exclusions) {
    return exclusions.some(pattern => globMatch(filePath, pattern));
}
// ==============================================================================
// HELPERS
// ==============================================================================
/**
 * Format a message template with file list placeholders.
 */
function formatMessage(template, matchingFiles, allFiles) {
    let msg = template;
    msg = msg.replace('{files}', matchingFiles.join(', '));
    msg = msg.replace('{count}', String(matchingFiles.length));
    if (matchingFiles.length > 0) {
        msg = msg.replace('{directory}', path.dirname(matchingFiles[0]));
    }
    if (allFiles) {
        msg = msg.replace('{all_files}', allFiles.join(', '));
    }
    return msg;
}
//# sourceMappingURL=change-patterns.js.map