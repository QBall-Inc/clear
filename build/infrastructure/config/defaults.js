"use strict";
/**
 * Default Configuration Values
 *
 * Provides sensible defaults for all configuration options.
 * These values are derived from Appendix B of the feature brief.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = exports.DEFAULT_FRAMEWORK_CONFIG = exports.DEFAULT_TOKEN_THRESHOLDS = exports.DEFAULT_LIMITS = void 0;
exports.deepMerge = deepMerge;
exports.applyDefaults = applyDefaults;
/**
 * Default resource limits
 * See Appendix B of feature brief for rationale
 */
exports.DEFAULT_LIMITS = {
    // Memory limits
    max_context_size: 10485760, // 10MB - Total shared context size
    max_skill_size: 102400, // 100KB - Individual skill document
    max_template_size: 51200, // 50KB - Individual template
    // Execution limits
    max_hooks_per_event: 50, // Maximum hooks for single event
    max_parallel_hooks: 5, // Concurrent hook executions
    hook_timeout_ms: 1000, // Default hook timeout (1 second)
    max_hook_retries: 3, // Retry failed hooks
    // Skill limits
    max_skill_dependencies: 10, // Maximum dependencies per skill
    max_skill_load_depth: 20, // Maximum dependency depth
    max_skills_loaded: 100, // Total skills in memory
    // Rate limits
    max_events_per_minute: 1000, // Event processing rate
    max_context_writes_per_minute: 100, // Context update rate
    // Queue limits
    max_event_queue_size: 1000, // Pending events
    max_hook_queue_size: 5000, // Pending hooks
};
/**
 * Default token thresholds for session management
 */
exports.DEFAULT_TOKEN_THRESHOLDS = {
    warning: 0.65, // 65% - Begin handoff preparation
    critical: 0.75, // 75% - Stop and finalize handoff
};
/**
 * Default framework configuration
 */
exports.DEFAULT_FRAMEWORK_CONFIG = {
    session_management: {
        token_thresholds: exports.DEFAULT_TOKEN_THRESHOLDS,
    },
    progressive_disclosure: {
        enabled: true,
        max_context_size: 10485760, // 10MB
    },
    limits: exports.DEFAULT_LIMITS,
};
/**
 * Complete default configuration
 */
exports.DEFAULT_CONFIG = {
    framework: exports.DEFAULT_FRAMEWORK_CONFIG,
};
/**
 * Deep merge two objects, with source overriding target
 * @param target - Base object
 * @param source - Override object
 * @returns Merged object
 */
function deepMerge(target, source) {
    if (target === null || target === undefined) {
        return source;
    }
    if (source === null || source === undefined) {
        return target;
    }
    const result = { ...target };
    const sourceObj = source;
    const targetObj = target;
    const resultObj = result;
    for (const key of Object.keys(sourceObj)) {
        const sourceValue = sourceObj[key];
        const targetValue = targetObj[key];
        if (sourceValue !== undefined &&
            typeof sourceValue === 'object' &&
            sourceValue !== null &&
            !Array.isArray(sourceValue) &&
            typeof targetValue === 'object' &&
            targetValue !== null &&
            !Array.isArray(targetValue)) {
            // Recursively merge objects
            resultObj[key] = deepMerge(targetValue, sourceValue);
        }
        else if (sourceValue !== undefined) {
            // Direct assignment for non-objects or arrays
            resultObj[key] = sourceValue;
        }
    }
    return result;
}
/**
 * Apply defaults to a partial configuration
 * @param partial - Partial configuration to complete
 * @returns Complete configuration with defaults applied
 */
function applyDefaults(partial) {
    return deepMerge(exports.DEFAULT_CONFIG, partial);
}
//# sourceMappingURL=defaults.js.map