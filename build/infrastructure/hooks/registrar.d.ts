/**
 * Hook registrar
 *
 * Manages registration of hooks in settings.json with atomic updates,
 * duplicate prevention, and priority-based sorting.
 */
import { HookDeclaration, HookRegistration } from './types';
/**
 * Registers hooks in plugin settings
 */
export declare class HookRegistrar {
    private settingsPath;
    constructor(settingsPath?: string);
    /**
     * Register a hook in settings.json
     * @param declaration - Hook declaration from skill
     * @param scriptPath - Path to generated script
     * @param skillName - Name of skill declaring this hook
     */
    registerHook(declaration: HookDeclaration, scriptPath: string, skillName?: string): Promise<void>;
    /**
     * Register multiple hooks
     * @param declarations - Array of hook declarations
     * @param scriptPaths - Map of namespace to script path
     * @param skillName - Name of skill declaring these hooks
     */
    registerHooks(declarations: HookDeclaration[], scriptPaths: Map<string, string>, skillName?: string): Promise<void>;
    /**
     * Unregister a hook by namespace
     * @param namespace - Hook namespace to remove
     */
    unregisterHook(namespace: string): Promise<void>;
    /**
     * Unregister all hooks for a skill
     * @param skillName - Name of skill
     */
    unregisterSkillHooks(skillName: string): Promise<number>;
    /**
     * Get all registered hooks
     */
    getRegisteredHooks(): Promise<HookRegistration[]>;
    /**
     * Get hooks for a specific event
     * @param event - Event name
     */
    getHooksForEvent(event: string): Promise<HookRegistration[]>;
    /**
     * Check if a namespace is registered
     * @param namespace - Hook namespace
     */
    isRegistered(namespace: string): Promise<boolean>;
    /**
     * Load settings.json with error handling
     */
    private loadSettings;
    /**
     * Save settings.json atomically
     */
    private saveSettings;
    /**
     * Ensure settings.json exists with default structure
     */
    private ensureSettingsFile;
    /**
     * Get the settings file path
     */
    getSettingsPath(): string;
    /**
     * Set the settings file path
     */
    setSettingsPath(path: string): void;
}
//# sourceMappingURL=registrar.d.ts.map