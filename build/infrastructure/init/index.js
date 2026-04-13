"use strict";
/**
 * Project Initialization Module
 *
 * Exports for the P2.1 /cf-init command implementation.
 *
 * @module infrastructure/init
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatInitResult = exports.createInitError = exports.initializeProject = exports.runPostInitChecks = exports.updateProjectClaudeMd = exports.writeStateFiles = exports.createDefaultConfig = exports.createSyncState = exports.createSessionHistory = exports.createSession0State = exports.createDirectoryStructure = exports.detectProjectState = exports.verifyClearHooks = exports.configureStatusline = exports.configureHooks = exports.getSettingsPath = exports.settingsExist = exports.writeClaudeSettings = exports.readClaudeSettings = exports.mergeHooks = exports.getClearHooks = exports.CLAUDE_SETTINGS_PATH = exports.removeExistingClear = exports.createBackup = exports.addReinitEntry = exports.validateManifest = exports.getManifestPath = exports.manifestExists = exports.readManifest = exports.writeManifest = exports.createManifest = exports.MANIFEST_RELATIVE_PATH = exports.COMMAND_VERSION = exports.CLEAR_VERSION = exports.generateInitSessionId = exports.generateProjectId = void 0;
var types_1 = require("./types");
Object.defineProperty(exports, "generateProjectId", { enumerable: true, get: function () { return types_1.generateProjectId; } });
Object.defineProperty(exports, "generateInitSessionId", { enumerable: true, get: function () { return types_1.generateInitSessionId; } });
// ==============================================================================
// MANIFEST EXPORTS
// ==============================================================================
var manifest_1 = require("./manifest");
// Constants
Object.defineProperty(exports, "CLEAR_VERSION", { enumerable: true, get: function () { return manifest_1.CLEAR_VERSION; } });
Object.defineProperty(exports, "COMMAND_VERSION", { enumerable: true, get: function () { return manifest_1.COMMAND_VERSION; } });
Object.defineProperty(exports, "MANIFEST_RELATIVE_PATH", { enumerable: true, get: function () { return manifest_1.MANIFEST_RELATIVE_PATH; } });
// Creation
Object.defineProperty(exports, "createManifest", { enumerable: true, get: function () { return manifest_1.createManifest; } });
Object.defineProperty(exports, "writeManifest", { enumerable: true, get: function () { return manifest_1.writeManifest; } });
// Reading
Object.defineProperty(exports, "readManifest", { enumerable: true, get: function () { return manifest_1.readManifest; } });
Object.defineProperty(exports, "manifestExists", { enumerable: true, get: function () { return manifest_1.manifestExists; } });
Object.defineProperty(exports, "getManifestPath", { enumerable: true, get: function () { return manifest_1.getManifestPath; } });
// Validation
Object.defineProperty(exports, "validateManifest", { enumerable: true, get: function () { return manifest_1.validateManifest; } });
// Reinitialization
Object.defineProperty(exports, "addReinitEntry", { enumerable: true, get: function () { return manifest_1.addReinitEntry; } });
Object.defineProperty(exports, "createBackup", { enumerable: true, get: function () { return manifest_1.createBackup; } });
Object.defineProperty(exports, "removeExistingClear", { enumerable: true, get: function () { return manifest_1.removeExistingClear; } });
// ==============================================================================
// HOOKS CONFIG EXPORTS
// ==============================================================================
var hooks_config_1 = require("./hooks-config");
// Constants
Object.defineProperty(exports, "CLAUDE_SETTINGS_PATH", { enumerable: true, get: function () { return hooks_config_1.CLAUDE_SETTINGS_PATH; } });
// Hook configuration
Object.defineProperty(exports, "getClearHooks", { enumerable: true, get: function () { return hooks_config_1.getClearHooks; } });
Object.defineProperty(exports, "mergeHooks", { enumerable: true, get: function () { return hooks_config_1.mergeHooks; } });
// Settings operations
Object.defineProperty(exports, "readClaudeSettings", { enumerable: true, get: function () { return hooks_config_1.readClaudeSettings; } });
Object.defineProperty(exports, "writeClaudeSettings", { enumerable: true, get: function () { return hooks_config_1.writeClaudeSettings; } });
Object.defineProperty(exports, "settingsExist", { enumerable: true, get: function () { return hooks_config_1.settingsExist; } });
Object.defineProperty(exports, "getSettingsPath", { enumerable: true, get: function () { return hooks_config_1.getSettingsPath; } });
// High-level operations
Object.defineProperty(exports, "configureHooks", { enumerable: true, get: function () { return hooks_config_1.configureHooks; } });
Object.defineProperty(exports, "configureStatusline", { enumerable: true, get: function () { return hooks_config_1.configureStatusline; } });
Object.defineProperty(exports, "verifyClearHooks", { enumerable: true, get: function () { return hooks_config_1.verifyClearHooks; } });
// ==============================================================================
// PROJECT INIT EXPORTS
// ==============================================================================
var project_init_1 = require("./project-init");
// Detection
Object.defineProperty(exports, "detectProjectState", { enumerable: true, get: function () { return project_init_1.detectProjectState; } });
// Scaffolding
Object.defineProperty(exports, "createDirectoryStructure", { enumerable: true, get: function () { return project_init_1.createDirectoryStructure; } });
// Session 0
Object.defineProperty(exports, "createSession0State", { enumerable: true, get: function () { return project_init_1.createSession0State; } });
Object.defineProperty(exports, "createSessionHistory", { enumerable: true, get: function () { return project_init_1.createSessionHistory; } });
Object.defineProperty(exports, "createSyncState", { enumerable: true, get: function () { return project_init_1.createSyncState; } });
Object.defineProperty(exports, "createDefaultConfig", { enumerable: true, get: function () { return project_init_1.createDefaultConfig; } });
Object.defineProperty(exports, "writeStateFiles", { enumerable: true, get: function () { return project_init_1.writeStateFiles; } });
// CLAUDE.md
Object.defineProperty(exports, "updateProjectClaudeMd", { enumerable: true, get: function () { return project_init_1.updateProjectClaudeMd; } });
// Post-init
Object.defineProperty(exports, "runPostInitChecks", { enumerable: true, get: function () { return project_init_1.runPostInitChecks; } });
// Main function
Object.defineProperty(exports, "initializeProject", { enumerable: true, get: function () { return project_init_1.initializeProject; } });
// Error handling
Object.defineProperty(exports, "createInitError", { enumerable: true, get: function () { return project_init_1.createInitError; } });
Object.defineProperty(exports, "formatInitResult", { enumerable: true, get: function () { return project_init_1.formatInitResult; } });
//# sourceMappingURL=index.js.map