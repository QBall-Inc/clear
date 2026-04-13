"use strict";
/**
 * Configuration System Public API
 *
 * Provides a flexible, schema-validated configuration system for the CLEAR Framework.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchSkillLoaderLimits = exports.getSkillLoaderLimits = exports.watchExecutorLimits = exports.getExecutorLimits = exports.watchContextLimits = exports.getContextLimits = exports.watchOrchestratorConfig = exports.getOrchestratorConfig = exports.Configuration = exports.DEFAULT_CONFIG_PATH = exports.ConfigValidationError = exports.ConfigLoadError = exports.ConfigurationLoader = exports.getSchemaValidator = exports.ConfigSchemaValidator = exports.CONFIG_SCHEMA = exports.applyDefaults = exports.deepMerge = exports.DEFAULT_CONFIG = exports.DEFAULT_FRAMEWORK_CONFIG = exports.DEFAULT_TOKEN_THRESHOLDS = exports.DEFAULT_LIMITS = exports.defaultConfigLogger = void 0;
var types_1 = require("./types");
Object.defineProperty(exports, "defaultConfigLogger", { enumerable: true, get: function () { return types_1.defaultConfigLogger; } });
// Defaults
var defaults_1 = require("./defaults");
Object.defineProperty(exports, "DEFAULT_LIMITS", { enumerable: true, get: function () { return defaults_1.DEFAULT_LIMITS; } });
Object.defineProperty(exports, "DEFAULT_TOKEN_THRESHOLDS", { enumerable: true, get: function () { return defaults_1.DEFAULT_TOKEN_THRESHOLDS; } });
Object.defineProperty(exports, "DEFAULT_FRAMEWORK_CONFIG", { enumerable: true, get: function () { return defaults_1.DEFAULT_FRAMEWORK_CONFIG; } });
Object.defineProperty(exports, "DEFAULT_CONFIG", { enumerable: true, get: function () { return defaults_1.DEFAULT_CONFIG; } });
Object.defineProperty(exports, "deepMerge", { enumerable: true, get: function () { return defaults_1.deepMerge; } });
Object.defineProperty(exports, "applyDefaults", { enumerable: true, get: function () { return defaults_1.applyDefaults; } });
// Schema
var schema_1 = require("./schema");
Object.defineProperty(exports, "CONFIG_SCHEMA", { enumerable: true, get: function () { return schema_1.CONFIG_SCHEMA; } });
Object.defineProperty(exports, "ConfigSchemaValidator", { enumerable: true, get: function () { return schema_1.ConfigSchemaValidator; } });
Object.defineProperty(exports, "getSchemaValidator", { enumerable: true, get: function () { return schema_1.getSchemaValidator; } });
// Loader
var loader_1 = require("./loader");
Object.defineProperty(exports, "ConfigurationLoader", { enumerable: true, get: function () { return loader_1.ConfigurationLoader; } });
Object.defineProperty(exports, "ConfigLoadError", { enumerable: true, get: function () { return loader_1.ConfigLoadError; } });
Object.defineProperty(exports, "ConfigValidationError", { enumerable: true, get: function () { return loader_1.ConfigValidationError; } });
Object.defineProperty(exports, "DEFAULT_CONFIG_PATH", { enumerable: true, get: function () { return loader_1.DEFAULT_CONFIG_PATH; } });
// Configuration class
var config_1 = require("./config");
Object.defineProperty(exports, "Configuration", { enumerable: true, get: function () { return config_1.Configuration; } });
// Integration utilities
var integration_1 = require("./integration");
Object.defineProperty(exports, "getOrchestratorConfig", { enumerable: true, get: function () { return integration_1.getOrchestratorConfig; } });
Object.defineProperty(exports, "watchOrchestratorConfig", { enumerable: true, get: function () { return integration_1.watchOrchestratorConfig; } });
Object.defineProperty(exports, "getContextLimits", { enumerable: true, get: function () { return integration_1.getContextLimits; } });
Object.defineProperty(exports, "watchContextLimits", { enumerable: true, get: function () { return integration_1.watchContextLimits; } });
Object.defineProperty(exports, "getExecutorLimits", { enumerable: true, get: function () { return integration_1.getExecutorLimits; } });
Object.defineProperty(exports, "watchExecutorLimits", { enumerable: true, get: function () { return integration_1.watchExecutorLimits; } });
Object.defineProperty(exports, "getSkillLoaderLimits", { enumerable: true, get: function () { return integration_1.getSkillLoaderLimits; } });
Object.defineProperty(exports, "watchSkillLoaderLimits", { enumerable: true, get: function () { return integration_1.watchSkillLoaderLimits; } });
//# sourceMappingURL=index.js.map