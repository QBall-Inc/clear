/**
 * Hook Configuration Management
 *
 * Handles merging CLEAR hooks into existing .claude/settings.json.
 * Preserves user's existing settings while adding CLEAR automation.
 *
 * Based on P2.1 Feature Brief v1.1.0 Section 6.
 *
 * IMPORTANT: Per Claude Code documentation, SessionStart does NOT use matchers.
 * The source value (startup/resume/clear/compact) is provided via stdin JSON.
 */
import { ClaudeSettings, HooksConfiguration } from './types';
/** Path to Claude settings file relative to project root */
export declare const CLAUDE_SETTINGS_PATH = ".claude/settings.json";
/**
 * Get CLEAR hook definitions
 *
 * These are the hooks that CLEAR installs to enable automation.
 * Uses ${CLAUDE_PLUGIN_ROOT} for plugin-relative paths.
 *
 * @returns Hook configuration for CLEAR
 */
export declare function getClearHooks(): HooksConfiguration;
/**
 * Deep merge two hook configurations
 *
 * For each event type:
 * - If only one has it, use that one
 * - If both have it, concatenate the arrays
 *
 * @param existing - Existing hooks from user's settings
 * @param incoming - New CLEAR hooks to add
 * @returns Merged hooks configuration
 */
export declare function mergeHooks(existing: HooksConfiguration | undefined, incoming: HooksConfiguration): HooksConfiguration;
/**
 * Read Claude settings from project
 *
 * @param projectDir - Project directory
 * @returns Parsed settings or empty object if not found
 */
export declare function readClaudeSettings(projectDir: string): ClaudeSettings;
/**
 * Write Claude settings to project
 *
 * @param settings - Settings to write
 * @param projectDir - Project directory
 * @throws Error if write fails
 */
export declare function writeClaudeSettings(settings: ClaudeSettings, projectDir: string): void;
/**
 * Check if Claude settings file exists
 *
 * @param projectDir - Project directory
 * @returns True if settings file exists
 */
export declare function settingsExist(projectDir: string): boolean;
/**
 * Get settings file path
 *
 * @param projectDir - Project directory
 * @returns Full path to settings file
 */
export declare function getSettingsPath(projectDir: string): string;
/**
 * Configure CLEAR settings in project
 *
 * Writes CLEAR env vars (kill switches, timeouts) to .claude/settings.json.
 * Does NOT write hooks — plugin hooks live in hooks/hooks.json and are
 * loaded automatically by Claude Code when the plugin is installed.
 * Writing hooks to settings.json would create duplicates (plugin + settings)
 * and stale references on plugin version updates.
 *
 * @param projectDir - Project directory
 * @returns Updated settings
 * @throws Error if operation fails
 */
export declare function configureHooks(projectDir: string): ClaudeSettings;
/**
 * Configure CLEAR statusline in project settings.
 *
 * If no statusline exists: sets CLEAR's statusline.
 * If a statusline already exists: preserves it as CLEAR_ORIGINAL_STATUSLINE
 * env var, then sets CLEAR's statusline (passthrough mode).
 *
 * @param projectDir - Project directory
 * @param pluginRoot - Plugin root directory (for statusline.sh path)
 * @returns Object with `needsRestart` flag and optional `originalStatusline`
 */
export declare function configureStatusline(projectDir: string, pluginRoot: string): {
    needsRestart: boolean;
    originalStatusline: string | null;
};
/**
 * Verify CLEAR env vars are properly configured in settings.
 *
 * Hooks are verified via plugin hooks.json (not settings.json).
 * This function checks that required env vars (kill switches, timeouts)
 * are present in .claude/settings.json.
 *
 * @param projectDir - Project directory
 * @returns True if all CLEAR env vars are present
 */
export declare function verifyClearHooks(projectDir: string): boolean;
//# sourceMappingURL=hooks-config.d.ts.map