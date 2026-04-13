"use strict";
/**
 * Configuration Class
 *
 * Provides type-safe accessors and change notification for configuration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Configuration = void 0;
const types_1 = require("./types");
const defaults_1 = require("./defaults");
const yaml_1 = require("yaml");
/**
 * Configuration class with type-safe accessors
 *
 * Provides:
 * - Type-safe get() method with dot notation paths
 * - getLimit() for quick access to resource limits
 * - onChange() for configuration change notifications
 * - toObject() and toYaml() for serialization
 */
class Configuration {
    constructor(config, options = {}) {
        this.listeners = new Set();
        // Deep clone to prevent external mutations
        this.config = JSON.parse(JSON.stringify(config));
        this.logger = options.logger || types_1.defaultConfigLogger;
    }
    /**
     * Get the complete framework configuration
     */
    getFramework() {
        return this.config.framework;
    }
    /**
     * Get the resource limits configuration
     */
    getLimits() {
        return this.config.framework.limits;
    }
    /**
     * Get a specific limit value by key
     * @param key - The limit key (e.g., 'max_context_size')
     * @returns The limit value
     */
    getLimit(key) {
        return this.config.framework.limits[key];
    }
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
    get(path) {
        const parts = path.split('.');
        let current = this.config;
        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }
            if (typeof current !== 'object') {
                return undefined;
            }
            current = current[part];
        }
        return current;
    }
    /**
     * Get a configuration value with a default fallback
     *
     * @param path - Dot-notation path
     * @param defaultValue - Value to return if path not found
     * @returns The value at the path, or the default value
     */
    getOrDefault(path, defaultValue) {
        const value = this.get(path);
        return value !== undefined ? value : defaultValue;
    }
    /**
     * Check if a configuration path exists
     */
    has(path) {
        return this.get(path) !== undefined;
    }
    /**
     * Update the configuration with new values
     *
     * @param updates - Partial configuration to merge
     * @returns New Configuration instance with updates applied
     */
    update(updates) {
        const oldConfig = this.config;
        const newConfig = (0, defaults_1.deepMerge)(this.config, updates);
        this.config = newConfig;
        // Emit change events for each changed path
        this.emitChanges(oldConfig, newConfig, '');
        return this;
    }
    /**
     * Update a specific limit value
     *
     * @param key - The limit key
     * @param value - The new value
     * @returns This configuration instance
     */
    setLimit(key, value) {
        const oldValue = this.config.framework.limits[key];
        if (oldValue !== value) {
            this.config.framework.limits[key] = value;
            this.notifyListeners({
                path: `framework.limits.${key}`,
                oldValue,
                newValue: value,
            });
        }
        return this;
    }
    /**
     * Register a change listener
     *
     * @param listener - Function to call when configuration changes
     * @returns Unsubscribe function
     */
    onChange(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    /**
     * Remove all change listeners
     */
    removeAllListeners() {
        this.listeners.clear();
    }
    /**
     * Get the number of registered listeners
     */
    getListenerCount() {
        return this.listeners.size;
    }
    /**
     * Convert to a plain object
     */
    toObject() {
        // Deep clone to prevent external mutations
        return JSON.parse(JSON.stringify(this.config));
    }
    /**
     * Convert to YAML string
     */
    toYaml() {
        return (0, yaml_1.stringify)(this.config, {
            indent: 2,
            lineWidth: 0,
        });
    }
    /**
     * Create a Configuration from the default values
     */
    static fromDefaults() {
        return new Configuration(defaults_1.DEFAULT_CONFIG);
    }
    /**
     * Create a Configuration with custom limits
     */
    static withLimits(limits) {
        const config = {
            ...defaults_1.DEFAULT_CONFIG,
            framework: {
                ...defaults_1.DEFAULT_CONFIG.framework,
                limits: {
                    ...defaults_1.DEFAULT_LIMITS,
                    ...limits,
                },
            },
        };
        return new Configuration(config);
    }
    /**
     * Notify all listeners of a change
     */
    notifyListeners(event) {
        const listeners = Array.from(this.listeners);
        for (const listener of listeners) {
            try {
                listener(event);
            }
            catch (error) {
                this.logger.error('Change listener error', {
                    path: event.path,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }
    /**
     * Recursively emit change events for all changed values
     */
    emitChanges(oldObj, newObj, prefix) {
        const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
        for (const key of allKeys) {
            const path = prefix ? `${prefix}.${key}` : key;
            const oldValue = oldObj[key];
            const newValue = newObj[key];
            if (oldValue === newValue) {
                continue;
            }
            if (typeof oldValue === 'object' &&
                oldValue !== null &&
                typeof newValue === 'object' &&
                newValue !== null &&
                !Array.isArray(oldValue) &&
                !Array.isArray(newValue)) {
                // Recurse into nested objects
                this.emitChanges(oldValue, newValue, path);
            }
            else {
                // Emit leaf change
                this.notifyListeners({
                    path,
                    oldValue,
                    newValue,
                });
            }
        }
    }
}
exports.Configuration = Configuration;
//# sourceMappingURL=config.js.map