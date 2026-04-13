/**
 * Configuration Loader
 *
 * Handles loading, validation, and persistence of configuration files.
 */
import type { ClearConfig, ConfigurationLoaderOptions, ValidationResult, ConfigLogger } from './types';
/**
 * Error thrown when configuration loading fails
 */
export declare class ConfigLoadError extends Error {
    readonly cause?: Error | undefined;
    readonly path?: string | undefined;
    constructor(message: string, cause?: Error | undefined, path?: string | undefined);
}
/**
 * Error thrown when configuration validation fails
 */
export declare class ConfigValidationError extends Error {
    readonly errors: string[];
    constructor(message: string, errors: string[]);
}
/**
 * Default configuration file path
 */
export declare const DEFAULT_CONFIG_PATH = ".clear/config/clear-config.yaml";
/**
 * Configuration Loader class
 *
 * Responsible for:
 * - Loading configuration from YAML files
 * - Validating configuration against schema
 * - Applying defaults for missing values
 * - Saving configuration changes
 */
export declare class ConfigurationLoader {
    private configPath;
    private logger;
    private cachedConfig;
    constructor(options?: ConfigurationLoaderOptions);
    /**
     * Set a custom logger
     */
    setLogger(logger: ConfigLogger): void;
    /**
     * Get the configuration file path
     */
    getConfigPath(): string;
    /**
     * Check if configuration file exists
     */
    exists(): Promise<boolean>;
    /**
     * Load configuration from file
     *
     * @returns Validated configuration with defaults applied
     * @throws ConfigLoadError if file cannot be read
     * @throws ConfigValidationError if configuration is invalid
     */
    load(): Promise<ClearConfig>;
    /**
     * Load configuration, falling back to defaults on any error
     *
     * @returns Configuration (either loaded or defaults)
     */
    loadOrDefault(): Promise<ClearConfig>;
    /**
     * Validate a configuration object
     */
    validate(config: unknown): ValidationResult;
    /**
     * Save configuration to file
     *
     * @param config - Configuration to save
     * @throws ConfigValidationError if configuration is invalid
     * @throws ConfigLoadError if file cannot be written
     */
    save(config: ClearConfig): Promise<void>;
    /**
     * Get the cached configuration if available
     */
    getCached(): ClearConfig | null;
    /**
     * Clear the cached configuration
     */
    clearCache(): void;
    /**
     * Create a default configuration file if none exists
     *
     * @returns true if file was created, false if it already exists
     */
    createDefaultIfMissing(): Promise<boolean>;
    /**
     * Convert configuration to YAML string
     */
    toYaml(config: ClearConfig): string;
    /**
     * Parse YAML string to configuration
     *
     * @throws ConfigValidationError if configuration is invalid
     */
    fromYaml(yaml: string): ClearConfig;
}
//# sourceMappingURL=loader.d.ts.map