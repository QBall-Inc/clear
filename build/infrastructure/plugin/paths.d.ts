/**
 * Path resolution utility for development vs runtime environments
 * See feature brief Appendix A for complete strategy
 */
/**
 * Path resolver singleton for consistent path resolution
 */
export declare class PathResolver {
    private static _instance;
    private pluginRoot;
    private constructor();
    /**
     * Get the singleton instance
     */
    static getInstance(): PathResolver;
    /**
     * Resolve path relative to plugin root
     * @param parts - Path components to join
     * @returns Absolute path
     */
    resolve(...parts: string[]): string;
    /**
     * Get the plugin root directory
     * @returns Absolute path to plugin root
     */
    getPluginRoot(): string;
    /**
     * Get path to shared context file
     * @returns Absolute path to context file
     */
    contextFile(): string;
    /**
     * Get path to configuration file
     * @returns Absolute path to config file
     */
    configFile(): string;
    /**
     * Get path to a hook script
     * @param namespace - Hook namespace (e.g., 'clear.session.init')
     * @returns Absolute path to hook script
     */
    hookScript(namespace: string): string;
    /**
     * Get path to a skill directory
     * @param type - Skill type (core, development, community, project)
     * @param name - Skill name
     * @returns Absolute path to skill directory
     */
    skillPath(type: string, name: string): string;
    /**
     * Get path to plugin manifest
     * @returns Absolute path to manifest.json
     */
    manifestFile(): string;
    /**
     * Get path to hook settings
     * @returns Absolute path to settings.json
     */
    settingsFile(): string;
    /**
     * Reset the singleton (useful for testing)
     */
    static reset(): void;
}
/**
 * Get the default path resolver instance
 */
export declare function getPathResolver(): PathResolver;
//# sourceMappingURL=paths.d.ts.map