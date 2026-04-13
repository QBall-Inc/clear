"use strict";
/**
 * Hook Registry
 *
 * Manages loading, caching, and querying of hook registrations from settings.json.
 * Provides efficient lookup of hooks by event type for orchestrator execution.
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
exports.HookRegistry = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const types_1 = require("./types");
/**
 * Registry for managing hook definitions loaded from settings.json
 */
class HookRegistry {
    /**
     * Creates a new HookRegistry
     * @param settingsPath - Path to settings.json file
     */
    constructor(settingsPath) {
        this.hooks = new Map();
        this.allHooks = [];
        this.loaded = false;
        this.lastLoadTime = 0;
        this.settingsPath = settingsPath || path.join(__dirname, '..', '..', 'infrastructure', 'plugin', 'settings.json');
    }
    /**
     * Load hooks from settings.json and build the registry
     * @param force - Force reload even if already loaded
     * @throws HookError if settings file cannot be read or parsed
     */
    async load(force = false) {
        if (this.loaded && !force) {
            return;
        }
        try {
            const content = await fs.readFile(this.settingsPath, 'utf-8');
            const settings = JSON.parse(content);
            // Clear existing registry
            this.hooks.clear();
            this.allHooks = [];
            // Build event-based index
            for (const hook of settings.hooks) {
                if (!this.hooks.has(hook.event)) {
                    this.hooks.set(hook.event, []);
                }
                this.hooks.get(hook.event).push(hook);
                this.allHooks.push(hook);
            }
            // Sort hooks by priority within each event
            for (const eventHooks of this.hooks.values()) {
                eventHooks.sort((a, b) => a.priority - b.priority);
            }
            this.loaded = true;
            this.lastLoadTime = Date.now();
        }
        catch (error) {
            const isNodeError = error instanceof Error && 'code' in error;
            const errorCode = isNodeError ? error.code : undefined;
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorCode === 'ENOENT') {
                // Settings file doesn't exist - treat as empty registry
                this.hooks.clear();
                this.allHooks = [];
                this.loaded = true;
                this.lastLoadTime = Date.now();
                return;
            }
            throw new types_1.HookError(`Failed to load hooks from settings.json: ${errorMessage}`, 'registry.load', { path: this.settingsPath, error: errorMessage });
        }
    }
    /**
     * Get all hooks registered for a specific event
     * @param event - Event name to query
     * @returns Array of hooks for the event, sorted by priority
     */
    async getHooksForEvent(event) {
        await this.ensureLoaded();
        return this.hooks.get(event) || [];
    }
    /**
     * Get all registered hooks across all events
     * @returns Array of all hooks
     */
    async getAllHooks() {
        await this.ensureLoaded();
        return [...this.allHooks];
    }
    /**
     * Get a specific hook by namespace
     * @param namespace - Hook namespace to find
     * @returns Hook registration or undefined if not found
     */
    async getHookByNamespace(namespace) {
        await this.ensureLoaded();
        return this.allHooks.find(h => h.namespace === namespace);
    }
    /**
     * Check if a hook exists for a given namespace
     * @param namespace - Hook namespace to check
     * @returns True if hook exists
     */
    async hasHook(namespace) {
        await this.ensureLoaded();
        return this.allHooks.some(h => h.namespace === namespace);
    }
    /**
     * Get list of all events that have registered hooks
     * @returns Array of event names
     */
    async getEvents() {
        await this.ensureLoaded();
        return Array.from(this.hooks.keys());
    }
    /**
     * Get count of hooks registered for a specific event
     * @param event - Event name to count
     * @returns Number of hooks registered for the event
     */
    async getEventHookCount(event) {
        await this.ensureLoaded();
        return (this.hooks.get(event) || []).length;
    }
    /**
     * Get total number of registered hooks
     * @returns Total hook count
     */
    async getTotalHookCount() {
        await this.ensureLoaded();
        return this.allHooks.length;
    }
    /**
     * Reload hooks from settings.json
     * Useful when settings file is updated externally
     */
    async reload() {
        await this.load(true);
    }
    /**
     * Clear the registry cache
     */
    clear() {
        this.hooks.clear();
        this.allHooks = [];
        this.loaded = false;
        this.lastLoadTime = 0;
    }
    /**
     * Get registry statistics
     * @returns Statistics about the registry
     */
    async getStats() {
        await this.ensureLoaded();
        return {
            totalHooks: this.allHooks.length,
            events: this.hooks.size,
            loaded: this.loaded,
            lastLoadTime: this.lastLoadTime
        };
    }
    /**
     * Ensure registry is loaded before operations
     * @private
     */
    async ensureLoaded() {
        if (!this.loaded) {
            await this.load();
        }
    }
}
exports.HookRegistry = HookRegistry;
//# sourceMappingURL=registry.js.map