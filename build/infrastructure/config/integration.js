"use strict";
/**
 * Configuration Integration
 *
 * Provides integration utilities for connecting Configuration to
 * HookOrchestrator, ContextManager, and other components.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrchestratorConfig = getOrchestratorConfig;
exports.watchOrchestratorConfig = watchOrchestratorConfig;
exports.getContextLimits = getContextLimits;
exports.watchContextLimits = watchContextLimits;
exports.getExecutorLimits = getExecutorLimits;
exports.watchExecutorLimits = watchExecutorLimits;
exports.getSkillLoaderLimits = getSkillLoaderLimits;
exports.watchSkillLoaderLimits = watchSkillLoaderLimits;
/**
 * Extract HookOrchestrator configuration from a Configuration instance
 * @param config - Configuration instance
 * @returns OrchestratorConfig with values from Configuration
 */
function getOrchestratorConfig(config) {
    const limits = config.getLimits();
    return {
        maxHooksPerEvent: limits.max_hooks_per_event,
        defaultTimeout: limits.hook_timeout_ms,
        continueOnError: true, // Always continue for resilience
        respectStopPropagation: true,
    };
}
/**
 * Watch Configuration changes and update orchestrator config
 * @param config - Configuration instance to watch
 * @param updateFn - Function to call with new OrchestratorConfig when limits change
 * @returns Unsubscribe function
 */
function watchOrchestratorConfig(config, updateFn) {
    return config.onChange((event) => {
        const path = event.path;
        // Check if this change affects orchestrator config
        if (path === 'framework.limits.max_hooks_per_event') {
            updateFn({ maxHooksPerEvent: event.newValue });
        }
        else if (path === 'framework.limits.hook_timeout_ms') {
            updateFn({ defaultTimeout: event.newValue });
        }
    });
}
/**
 * Extract ContextManager limits from Configuration
 * @param config - Configuration instance
 * @returns ContextLimits with values from Configuration
 */
function getContextLimits(config) {
    const limits = config.getLimits();
    return {
        maxContextSize: limits.max_context_size,
        maxWritesPerMinute: limits.max_context_writes_per_minute,
    };
}
/**
 * Watch Configuration changes and update context limits
 * @param config - Configuration instance to watch
 * @param updateFn - Function to call when context limits change
 * @returns Unsubscribe function
 */
function watchContextLimits(config, updateFn) {
    return config.onChange((event) => {
        const path = event.path;
        if (path === 'framework.limits.max_context_size') {
            updateFn({ maxContextSize: event.newValue });
        }
        else if (path === 'framework.limits.max_context_writes_per_minute') {
            updateFn({ maxWritesPerMinute: event.newValue });
        }
    });
}
/**
 * Extract HookExecutor limits from Configuration
 * @param config - Configuration instance
 * @returns ExecutorLimits with values from Configuration
 */
function getExecutorLimits(config) {
    const limits = config.getLimits();
    return {
        defaultTimeout: limits.hook_timeout_ms,
        maxRetries: limits.max_hook_retries,
    };
}
/**
 * Watch Configuration changes and update executor limits
 * @param config - Configuration instance to watch
 * @param updateFn - Function to call when executor limits change
 * @returns Unsubscribe function
 */
function watchExecutorLimits(config, updateFn) {
    return config.onChange((event) => {
        const path = event.path;
        if (path === 'framework.limits.hook_timeout_ms') {
            updateFn({ defaultTimeout: event.newValue });
        }
        else if (path === 'framework.limits.max_hook_retries') {
            updateFn({ maxRetries: event.newValue });
        }
    });
}
/**
 * Extract SkillLoader limits from Configuration
 * @param config - Configuration instance
 * @returns SkillLoaderLimits with values from Configuration
 */
function getSkillLoaderLimits(config) {
    const limits = config.getLimits();
    return {
        maxSkillSize: limits.max_skill_size,
        maxDependencies: limits.max_skill_dependencies,
        maxLoadDepth: limits.max_skill_load_depth,
        maxSkillsLoaded: limits.max_skills_loaded,
    };
}
/**
 * Watch Configuration changes and update skill loader limits
 * @param config - Configuration instance to watch
 * @param updateFn - Function to call when skill loader limits change
 * @returns Unsubscribe function
 */
function watchSkillLoaderLimits(config, updateFn) {
    return config.onChange((event) => {
        const path = event.path;
        if (path === 'framework.limits.max_skill_size') {
            updateFn({ maxSkillSize: event.newValue });
        }
        else if (path === 'framework.limits.max_skill_dependencies') {
            updateFn({ maxDependencies: event.newValue });
        }
        else if (path === 'framework.limits.max_skill_load_depth') {
            updateFn({ maxLoadDepth: event.newValue });
        }
        else if (path === 'framework.limits.max_skills_loaded') {
            updateFn({ maxSkillsLoaded: event.newValue });
        }
    });
}
//# sourceMappingURL=integration.js.map