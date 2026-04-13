"use strict";
/**
 * Hook registrar
 *
 * Manages registration of hooks in settings.json with atomic updates,
 * duplicate prevention, and priority-based sorting.
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
exports.HookRegistrar = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const types_1 = require("./types");
/**
 * Registers hooks in plugin settings
 */
class HookRegistrar {
    constructor(settingsPath) {
        // Default to src/infrastructure/plugin/settings.json during development
        this.settingsPath =
            settingsPath ||
                path.join(__dirname, '..', 'plugin', 'settings.json');
    }
    /**
     * Register a hook in settings.json
     * @param declaration - Hook declaration from skill
     * @param scriptPath - Path to generated script
     * @param skillName - Name of skill declaring this hook
     */
    async registerHook(declaration, scriptPath, skillName) {
        try {
            // Load current settings with lock
            const settings = await this.loadSettings();
            // Check for duplicate namespace
            const existing = settings.hooks.find((h) => h.namespace === declaration.namespace);
            if (existing) {
                throw new types_1.HookRegistrationError(`Hook namespace already registered: ${declaration.namespace}`, declaration.namespace, {
                    existing,
                    scriptPath,
                });
            }
            // Create registration
            const registration = {
                event: declaration.event,
                command: 'bash',
                args: [scriptPath],
                priority: declaration.priority,
                namespace: declaration.namespace,
                timeout: declaration.timeout || 1000,
                skillName,
            };
            // Add to hooks array
            settings.hooks.push(registration);
            // Sort by priority (lower numbers first)
            settings.hooks.sort((a, b) => a.priority - b.priority);
            // Save atomically
            await this.saveSettings(settings);
        }
        catch (error) {
            if (error instanceof types_1.HookRegistrationError) {
                throw error;
            }
            throw new types_1.HookRegistrationError(`Failed to register hook: ${declaration.namespace}`, declaration.namespace, {
                error: error.message,
                scriptPath,
            });
        }
    }
    /**
     * Register multiple hooks
     * @param declarations - Array of hook declarations
     * @param scriptPaths - Map of namespace to script path
     * @param skillName - Name of skill declaring these hooks
     */
    async registerHooks(declarations, scriptPaths, skillName) {
        for (const declaration of declarations) {
            const scriptPath = scriptPaths.get(declaration.namespace);
            if (!scriptPath) {
                throw new types_1.HookRegistrationError(`No script path found for hook: ${declaration.namespace}`, declaration.namespace, { availablePaths: Array.from(scriptPaths.keys()) });
            }
            await this.registerHook(declaration, scriptPath, skillName);
        }
    }
    /**
     * Unregister a hook by namespace
     * @param namespace - Hook namespace to remove
     */
    async unregisterHook(namespace) {
        try {
            const settings = await this.loadSettings();
            const index = settings.hooks.findIndex((h) => h.namespace === namespace);
            if (index === -1) {
                throw new types_1.HookRegistrationError(`Hook not found: ${namespace}`, namespace, { registeredHooks: settings.hooks.map((h) => h.namespace) });
            }
            // Remove hook
            settings.hooks.splice(index, 1);
            // Save atomically
            await this.saveSettings(settings);
        }
        catch (error) {
            if (error instanceof types_1.HookRegistrationError) {
                throw error;
            }
            throw new types_1.HookRegistrationError(`Failed to unregister hook: ${namespace}`, namespace, { error: error.message });
        }
    }
    /**
     * Unregister all hooks for a skill
     * @param skillName - Name of skill
     */
    async unregisterSkillHooks(skillName) {
        try {
            const settings = await this.loadSettings();
            const before = settings.hooks.length;
            // Filter out hooks from this skill
            settings.hooks = settings.hooks.filter((h) => h.skillName !== skillName);
            const removed = before - settings.hooks.length;
            if (removed > 0) {
                await this.saveSettings(settings);
            }
            return removed;
        }
        catch (error) {
            throw new types_1.HookRegistrationError(`Failed to unregister skill hooks: ${skillName}`, skillName, { error: error.message });
        }
    }
    /**
     * Get all registered hooks
     */
    async getRegisteredHooks() {
        const settings = await this.loadSettings();
        return settings.hooks;
    }
    /**
     * Get hooks for a specific event
     * @param event - Event name
     */
    async getHooksForEvent(event) {
        const settings = await this.loadSettings();
        return settings.hooks.filter((h) => h.event === event);
    }
    /**
     * Check if a namespace is registered
     * @param namespace - Hook namespace
     */
    async isRegistered(namespace) {
        const settings = await this.loadSettings();
        return settings.hooks.some((h) => h.namespace === namespace);
    }
    /**
     * Load settings.json with error handling
     */
    async loadSettings() {
        try {
            // Ensure settings file exists
            await this.ensureSettingsFile();
            const content = await fs.readFile(this.settingsPath, 'utf-8');
            const settings = JSON.parse(content);
            // Ensure hooks array exists
            if (!settings.hooks) {
                settings.hooks = [];
            }
            // Ensure version exists
            if (!settings.version) {
                settings.version = '1.0.0';
            }
            return settings;
        }
        catch (error) {
            throw new types_1.HookRegistrationError('Failed to load settings.json', 'settings', {
                settingsPath: this.settingsPath,
                error: error.message,
            });
        }
    }
    /**
     * Save settings.json atomically
     */
    async saveSettings(settings) {
        try {
            // Ensure directory exists
            await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
            // Write to temporary file first
            const tempPath = `${this.settingsPath}.tmp`;
            await fs.writeFile(tempPath, JSON.stringify(settings, null, 2), 'utf-8');
            // Atomic rename
            await fs.rename(tempPath, this.settingsPath);
        }
        catch (error) {
            throw new types_1.HookRegistrationError('Failed to save settings.json', 'settings', {
                settingsPath: this.settingsPath,
                error: error.message,
            });
        }
    }
    /**
     * Ensure settings.json exists with default structure
     */
    async ensureSettingsFile() {
        try {
            await fs.access(this.settingsPath);
        }
        catch (error) {
            // File doesn't exist, create it
            const defaultSettings = {
                hooks: [],
                version: '1.0.0',
            };
            await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
            await fs.writeFile(this.settingsPath, JSON.stringify(defaultSettings, null, 2), 'utf-8');
        }
    }
    /**
     * Get the settings file path
     */
    getSettingsPath() {
        return this.settingsPath;
    }
    /**
     * Set the settings file path
     */
    setSettingsPath(path) {
        this.settingsPath = path;
    }
}
exports.HookRegistrar = HookRegistrar;
//# sourceMappingURL=registrar.js.map