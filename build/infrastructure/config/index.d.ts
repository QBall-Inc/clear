/**
 * Configuration System Public API
 *
 * Provides a flexible, schema-validated configuration system for the CLEAR Framework.
 */
export type { ResourceLimits, TokenThresholds, SessionManagementConfig, ProgressiveDisclosureConfig, FrameworkConfig, ClearConfig, ValidationResult, ConfigurationLoaderOptions, ConfigurationOptions, ConfigLogger, ConfigChangeEvent, ConfigChangeListener, } from './types';
export { defaultConfigLogger } from './types';
export { DEFAULT_LIMITS, DEFAULT_TOKEN_THRESHOLDS, DEFAULT_FRAMEWORK_CONFIG, DEFAULT_CONFIG, deepMerge, applyDefaults, } from './defaults';
export { CONFIG_SCHEMA, ConfigSchemaValidator, getSchemaValidator, } from './schema';
export { ConfigurationLoader, ConfigLoadError, ConfigValidationError, DEFAULT_CONFIG_PATH, } from './loader';
export { Configuration } from './config';
export { getOrchestratorConfig, watchOrchestratorConfig, getContextLimits, watchContextLimits, getExecutorLimits, watchExecutorLimits, getSkillLoaderLimits, watchSkillLoaderLimits, } from './integration';
export type { ContextLimits, ExecutorLimits, SkillLoaderLimits, } from './integration';
//# sourceMappingURL=index.d.ts.map