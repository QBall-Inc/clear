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
 * The CLEAR statusline command, written verbatim into .claude/settings.json.
 *
 * `${CLAUDE_PROJECT_DIR}` is a Claude Code variable substituted at statusline-render
 * time to the project root, so the command stays valid across plugin updates — a
 * version-baked absolute path under the plugin root drifts the moment the plugin's
 * version directory changes. The referenced script is copied into the consumer's
 * .clear/statusline.sh by ensureClearStatusline() (project-init.ts), so this
 * project-relative path resolves to a real, self-contained script.
 *
 * Empirically proven by Bulwark's statusLine (skills/bulwark-statusline/SKILL.md:95),
 * which has used `${CLAUDE_PROJECT_DIR}` across 6 months / multiple plugin versions.
 */
export declare const CLEAR_STATUSLINE_COMMAND = "${CLAUDE_PROJECT_DIR}/.clear/statusline.sh";
/**
 * Configure CLEAR's statusline command in the consumer's .claude/settings.json.
 *
 * Writes the version-agnostic placeholder (CLEAR_STATUSLINE_COMMAND). The referenced
 * script is provisioned separately by ensureClearStatusline() (project-init.ts) — this
 * function owns the settings.json statusLine key only.
 *
 * Existing-statusline classification:
 *   - already the placeholder       → idempotent no-op (no restart needed)
 *   - a legacy version-baked CLEAR   → MIGRATE to the placeholder WITHOUT preserving it as
 *     command (old scripts/ path)       CLEAR_ORIGINAL_STATUSLINE (AC3: it is CLEAR's own
 *                                        stale command, not a third-party statusline — else
 *                                        the dead plugin-root path is re-invoked via
 *                                        passthrough)
 *   - any other existing command    → a genuine third-party statusline: preserve it as
 *                                        CLEAR_ORIGINAL_STATUSLINE for passthrough
 *   - none                          → set CLEAR's statusline
 *
 * Note: an already-preserved third-party CLEAR_ORIGINAL_STATUSLINE in env is left intact
 * on the legacy-migration path (we never touch env there), so passthrough survives the
 * old-baked → placeholder migration.
 *
 * @param projectDir - Project (consumer repo) root
 * @returns Object with `needsRestart` flag and optional `originalStatusline`
 */
export declare function configureStatusline(projectDir: string): {
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