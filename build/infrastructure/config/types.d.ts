/**
 * Configuration System Types
 *
 * Defines all interfaces for the CLEAR Framework configuration system.
 * Resource limits are critical for stability - see Appendix B of feature brief.
 */
/**
 * Resource limits configuration for preventing resource exhaustion
 */
export interface ResourceLimits {
    /** Maximum total shared context size in bytes (default: 10MB) */
    max_context_size: number;
    /** Maximum individual skill document size in bytes (default: 100KB) */
    max_skill_size: number;
    /** Maximum individual template size in bytes (default: 50KB) */
    max_template_size: number;
    /** Maximum hooks that can be registered for a single event (default: 50) */
    max_hooks_per_event: number;
    /** Maximum concurrent hook executions (default: 5) */
    max_parallel_hooks: number;
    /** Default hook execution timeout in milliseconds (default: 1000) */
    hook_timeout_ms: number;
    /** Maximum retry attempts for failed hooks (default: 3) */
    max_hook_retries: number;
    /** Maximum dependencies per skill (default: 10) */
    max_skill_dependencies: number;
    /** Maximum dependency resolution depth (default: 20) */
    max_skill_load_depth: number;
    /** Maximum total skills loaded in memory (default: 100) */
    max_skills_loaded: number;
    /** Maximum events processed per minute (default: 1000) */
    max_events_per_minute: number;
    /** Maximum context writes per minute (default: 100) */
    max_context_writes_per_minute: number;
    /** Maximum pending events in queue (default: 1000) */
    max_event_queue_size: number;
    /** Maximum pending hooks in queue (default: 5000) */
    max_hook_queue_size: number;
}
/**
 * Token threshold configuration for session management
 */
export interface TokenThresholds {
    /** Warning threshold as decimal (0-1), default: 0.65 */
    warning: number;
    /** Critical threshold as decimal (0-1), default: 0.75 */
    critical: number;
}
/**
 * Session management configuration
 */
export interface SessionManagementConfig {
    /** Token usage thresholds for warnings and critical alerts */
    token_thresholds: TokenThresholds;
}
/**
 * Progressive disclosure configuration
 */
export interface ProgressiveDisclosureConfig {
    /** Whether progressive disclosure is enabled */
    enabled: boolean;
    /** Maximum context size for progressive disclosure in bytes */
    max_context_size: number;
}
/**
 * Framework configuration root
 */
export interface FrameworkConfig {
    /** Session management settings */
    session_management: SessionManagementConfig;
    /** Progressive disclosure settings */
    progressive_disclosure: ProgressiveDisclosureConfig;
    /** Resource limits */
    limits: ResourceLimits;
}
/**
 * Root configuration object
 */
export interface ClearConfig {
    /** Framework configuration */
    framework: FrameworkConfig;
}
/**
 * Configuration validation result
 */
export interface ValidationResult {
    /** Whether configuration is valid */
    valid: boolean;
    /** Validation error messages if invalid */
    errors: string[];
}
/**
 * Options for ConfigurationLoader
 */
export interface ConfigurationLoaderOptions {
    /** Path to configuration file */
    configPath?: string;
    /** Whether to watch for file changes */
    watchChanges?: boolean;
}
/**
 * Options for Configuration class
 */
export interface ConfigurationOptions {
    /** Optional custom logger */
    logger?: ConfigLogger;
}
/**
 * Logger interface for configuration system
 */
export interface ConfigLogger {
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
}
/**
 * Default logger implementation using console
 */
export declare const defaultConfigLogger: ConfigLogger;
/**
 * Change event payload
 */
export interface ConfigChangeEvent {
    /** Path to the changed value (dot notation) */
    path: string;
    /** Previous value */
    oldValue: unknown;
    /** New value */
    newValue: unknown;
}
/**
 * Configuration change listener function
 */
export type ConfigChangeListener = (event: ConfigChangeEvent) => void;
//# sourceMappingURL=types.d.ts.map