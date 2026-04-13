/**
 * Configuration Class
 *
 * Provides type-safe accessors and change notification for configuration.
 */
import type { ClearConfig, FrameworkConfig, ResourceLimits, ConfigurationOptions, ConfigChangeListener } from './types';
/**
 * Configuration class with type-safe accessors
 *
 * Provides:
 * - Type-safe get() method with dot notation paths
 * - getLimit() for quick access to resource limits
 * - onChange() for configuration change notifications
 * - toObject() and toYaml() for serialization
 */
export declare class Configuration {
    private config;
    private logger;
    private listeners;
    constructor(config: ClearConfig, options?: ConfigurationOptions);
    /**
     * Get the complete framework configuration
     */
    getFramework(): FrameworkConfig;
    /**
     * Get the resource limits configuration
     */
    getLimits(): ResourceLimits;
    /**
     * Get a specific limit value by key
     * @param key - The limit key (e.g., 'max_context_size')
     * @returns The limit value
     */
    getLimit<K extends keyof ResourceLimits>(key: K): ResourceLimits[K];
    /**
     * Get a configuration value by dot-notation path
     *
     * @param path - Dot-notation path (e.g., 'framework.limits.max_context_size')
     * @returns The value at the path, or undefined if not found
     *
     * @example
     * config.get('framework.session_management.token_thresholds.warning')
     * config.get('framework.limits.hook_timeout_ms')
     */
    get<T = unknown>(path: string): T | undefined;
    /**
     * Get a configuration value with a default fallback
     *
     * @param path - Dot-notation path
     * @param defaultValue - Value to return if path not found
     * @returns The value at the path, or the default value
     */
    getOrDefault<T>(path: string, defaultValue: T): T;
    /**
     * Check if a configuration path exists
     */
    has(path: string): boolean;
    /**
     * Update the configuration with new values
     *
     * @param updates - Partial configuration to merge
     * @returns New Configuration instance with updates applied
     */
    update(updates: Partial<ClearConfig>): Configuration;
    /**
     * Update a specific limit value
     *
     * @param key - The limit key
     * @param value - The new value
     * @returns This configuration instance
     */
    setLimit<K extends keyof ResourceLimits>(key: K, value: ResourceLimits[K]): this;
    /**
     * Register a change listener
     *
     * @param listener - Function to call when configuration changes
     * @returns Unsubscribe function
     */
    onChange(listener: ConfigChangeListener): () => void;
    /**
     * Remove all change listeners
     */
    removeAllListeners(): void;
    /**
     * Get the number of registered listeners
     */
    getListenerCount(): number;
    /**
     * Convert to a plain object
     */
    toObject(): ClearConfig;
    /**
     * Convert to YAML string
     */
    toYaml(): string;
    /**
     * Create a Configuration from the default values
     */
    static fromDefaults(): Configuration;
    /**
     * Create a Configuration with custom limits
     */
    static withLimits(limits: Partial<ResourceLimits>): Configuration;
    /**
     * Notify all listeners of a change
     */
    private notifyListeners;
    /**
     * Recursively emit change events for all changed values
     */
    private emitChanges;
}
//# sourceMappingURL=config.d.ts.map