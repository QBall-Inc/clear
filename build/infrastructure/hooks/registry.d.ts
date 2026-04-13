/**
 * Hook Registry
 *
 * Manages loading, caching, and querying of hook registrations from settings.json.
 * Provides efficient lookup of hooks by event type for orchestrator execution.
 */
import { HookRegistration } from './types';
/**
 * Registry for managing hook definitions loaded from settings.json
 */
export declare class HookRegistry {
    private settingsPath;
    private hooks;
    private allHooks;
    private loaded;
    private lastLoadTime;
    /**
     * Creates a new HookRegistry
     * @param settingsPath - Path to settings.json file
     */
    constructor(settingsPath?: string);
    /**
     * Load hooks from settings.json and build the registry
     * @param force - Force reload even if already loaded
     * @throws HookError if settings file cannot be read or parsed
     */
    load(force?: boolean): Promise<void>;
    /**
     * Get all hooks registered for a specific event
     * @param event - Event name to query
     * @returns Array of hooks for the event, sorted by priority
     */
    getHooksForEvent(event: string): Promise<HookRegistration[]>;
    /**
     * Get all registered hooks across all events
     * @returns Array of all hooks
     */
    getAllHooks(): Promise<HookRegistration[]>;
    /**
     * Get a specific hook by namespace
     * @param namespace - Hook namespace to find
     * @returns Hook registration or undefined if not found
     */
    getHookByNamespace(namespace: string): Promise<HookRegistration | undefined>;
    /**
     * Check if a hook exists for a given namespace
     * @param namespace - Hook namespace to check
     * @returns True if hook exists
     */
    hasHook(namespace: string): Promise<boolean>;
    /**
     * Get list of all events that have registered hooks
     * @returns Array of event names
     */
    getEvents(): Promise<string[]>;
    /**
     * Get count of hooks registered for a specific event
     * @param event - Event name to count
     * @returns Number of hooks registered for the event
     */
    getEventHookCount(event: string): Promise<number>;
    /**
     * Get total number of registered hooks
     * @returns Total hook count
     */
    getTotalHookCount(): Promise<number>;
    /**
     * Reload hooks from settings.json
     * Useful when settings file is updated externally
     */
    reload(): Promise<void>;
    /**
     * Clear the registry cache
     */
    clear(): void;
    /**
     * Get registry statistics
     * @returns Statistics about the registry
     */
    getStats(): Promise<{
        totalHooks: number;
        events: number;
        loaded: boolean;
        lastLoadTime: number;
    }>;
    /**
     * Ensure registry is loaded before operations
     * @private
     */
    private ensureLoaded;
}
//# sourceMappingURL=registry.d.ts.map