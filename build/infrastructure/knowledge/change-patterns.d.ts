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
export interface ChangePattern {
    id: string;
    paths: string[];
    type: string;
    level: 'A' | 'B';
    action: 'block' | 'evaluate';
    min_files?: number;
    same_directory?: boolean;
    tool_filter?: string;
    requires_also?: string[];
    description: string;
    message_template: string;
}
export interface ChangePatternsConfig {
    version: string;
    change_patterns: ChangePattern[];
    exclusions: string[];
}
export interface ChangePatternMatch {
    matched: boolean;
    level: 'A' | 'B' | 'C';
    patternId: string;
    message: string;
}
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
export declare function loadChangePatterns(cwd?: string, configPath?: string): ChangePatternsConfig;
/**
 * Clear cached config. Exposed for testing.
 */
export declare function clearChangePatternCache(): void;
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
export declare function matchChangePatterns(files: string[], cwd?: string, toolFilter?: string, configPath?: string): ChangePatternMatch;
//# sourceMappingURL=change-patterns.d.ts.map