"use strict";
/**
 * Configuration Loader
 *
 * Handles loading, validation, and persistence of configuration files.
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
exports.ConfigurationLoader = exports.DEFAULT_CONFIG_PATH = exports.ConfigValidationError = exports.ConfigLoadError = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const yaml_1 = require("yaml");
const types_1 = require("./types");
const defaults_1 = require("./defaults");
const schema_1 = require("./schema");
/**
 * Error thrown when configuration loading fails
 */
class ConfigLoadError extends Error {
    constructor(message, cause, path) {
        super(message);
        this.cause = cause;
        this.path = path;
        this.name = 'ConfigLoadError';
    }
}
exports.ConfigLoadError = ConfigLoadError;
/**
 * Error thrown when configuration validation fails
 */
class ConfigValidationError extends Error {
    constructor(message, errors) {
        super(message);
        this.errors = errors;
        this.name = 'ConfigValidationError';
    }
}
exports.ConfigValidationError = ConfigValidationError;
/**
 * Default configuration file path
 */
exports.DEFAULT_CONFIG_PATH = '.clear/config/clear-config.yaml';
/**
 * Configuration Loader class
 *
 * Responsible for:
 * - Loading configuration from YAML files
 * - Validating configuration against schema
 * - Applying defaults for missing values
 * - Saving configuration changes
 */
class ConfigurationLoader {
    constructor(options = {}) {
        this.cachedConfig = null;
        this.configPath = options.configPath || exports.DEFAULT_CONFIG_PATH;
        this.logger = types_1.defaultConfigLogger;
    }
    /**
     * Set a custom logger
     */
    setLogger(logger) {
        this.logger = logger;
    }
    /**
     * Get the configuration file path
     */
    getConfigPath() {
        return this.configPath;
    }
    /**
     * Check if configuration file exists
     */
    async exists() {
        try {
            await fs.access(this.configPath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Load configuration from file
     *
     * @returns Validated configuration with defaults applied
     * @throws ConfigLoadError if file cannot be read
     * @throws ConfigValidationError if configuration is invalid
     */
    async load() {
        const exists = await this.exists();
        if (!exists) {
            this.logger.info('No configuration file found, using defaults', {
                path: this.configPath,
            });
            this.cachedConfig = defaults_1.DEFAULT_CONFIG;
            return defaults_1.DEFAULT_CONFIG;
        }
        try {
            const raw = await fs.readFile(this.configPath, 'utf-8');
            const parsed = (0, yaml_1.parse)(raw);
            // Apply defaults for missing values
            const config = (0, defaults_1.applyDefaults)(parsed || {});
            // Validate against schema
            const validation = this.validate(config);
            if (!validation.valid) {
                throw new ConfigValidationError(`Invalid configuration: ${validation.errors.join(', ')}`, validation.errors);
            }
            this.logger.info('Configuration loaded successfully', {
                path: this.configPath,
            });
            this.cachedConfig = config;
            return config;
        }
        catch (error) {
            if (error instanceof ConfigValidationError) {
                throw error;
            }
            throw new ConfigLoadError(`Failed to load configuration from ${this.configPath}`, error instanceof Error ? error : undefined, this.configPath);
        }
    }
    /**
     * Load configuration, falling back to defaults on any error
     *
     * @returns Configuration (either loaded or defaults)
     */
    async loadOrDefault() {
        try {
            return await this.load();
        }
        catch (error) {
            this.logger.warn('Failed to load configuration, using defaults', {
                error: error instanceof Error ? error.message : String(error),
                path: this.configPath,
            });
            this.cachedConfig = defaults_1.DEFAULT_CONFIG;
            return defaults_1.DEFAULT_CONFIG;
        }
    }
    /**
     * Validate a configuration object
     */
    validate(config) {
        const validator = (0, schema_1.getSchemaValidator)();
        return validator.validate(config);
    }
    /**
     * Save configuration to file
     *
     * @param config - Configuration to save
     * @throws ConfigValidationError if configuration is invalid
     * @throws ConfigLoadError if file cannot be written
     */
    async save(config) {
        // Validate before saving
        const validation = this.validate(config);
        if (!validation.valid) {
            throw new ConfigValidationError(`Cannot save invalid configuration: ${validation.errors.join(', ')}`, validation.errors);
        }
        try {
            // Ensure directory exists
            const dir = path.dirname(this.configPath);
            await fs.mkdir(dir, { recursive: true });
            // Convert to YAML and save
            const yaml = (0, yaml_1.stringify)(config, {
                indent: 2,
                lineWidth: 0, // No line wrapping
            });
            await fs.writeFile(this.configPath, yaml, 'utf-8');
            this.logger.info('Configuration saved successfully', {
                path: this.configPath,
            });
            this.cachedConfig = config;
        }
        catch (error) {
            throw new ConfigLoadError(`Failed to save configuration to ${this.configPath}`, error instanceof Error ? error : undefined, this.configPath);
        }
    }
    /**
     * Get the cached configuration if available
     */
    getCached() {
        return this.cachedConfig;
    }
    /**
     * Clear the cached configuration
     */
    clearCache() {
        this.cachedConfig = null;
    }
    /**
     * Create a default configuration file if none exists
     *
     * @returns true if file was created, false if it already exists
     */
    async createDefaultIfMissing() {
        const exists = await this.exists();
        if (exists) {
            return false;
        }
        await this.save(defaults_1.DEFAULT_CONFIG);
        return true;
    }
    /**
     * Convert configuration to YAML string
     */
    toYaml(config) {
        return (0, yaml_1.stringify)(config, {
            indent: 2,
            lineWidth: 0,
        });
    }
    /**
     * Parse YAML string to configuration
     *
     * @throws ConfigValidationError if configuration is invalid
     */
    fromYaml(yaml) {
        const parsed = (0, yaml_1.parse)(yaml);
        const config = (0, defaults_1.applyDefaults)(parsed || {});
        const validation = this.validate(config);
        if (!validation.valid) {
            throw new ConfigValidationError(`Invalid configuration: ${validation.errors.join(', ')}`, validation.errors);
        }
        return config;
    }
}
exports.ConfigurationLoader = ConfigurationLoader;
//# sourceMappingURL=loader.js.map