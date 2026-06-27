"use strict";
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
exports.CLEAR_STATUSLINE_COMMAND = exports.CLAUDE_SETTINGS_PATH = void 0;
exports.getClearHooks = getClearHooks;
exports.mergeHooks = mergeHooks;
exports.readClaudeSettings = readClaudeSettings;
exports.writeClaudeSettings = writeClaudeSettings;
exports.settingsExist = settingsExist;
exports.getSettingsPath = getSettingsPath;
exports.configureHooks = configureHooks;
exports.configureStatusline = configureStatusline;
exports.verifyClearHooks = verifyClearHooks;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ==============================================================================
// CONSTANTS
// ==============================================================================
/** Path to Claude settings file relative to project root */
exports.CLAUDE_SETTINGS_PATH = '.claude/settings.json';
/** Default hook timeout in seconds */
const DEFAULT_TIMEOUT = 60;
// ==============================================================================
// CLEAR HOOKS CONFIGURATION
// ==============================================================================
/**
 * Get CLEAR hook definitions
 *
 * These are the hooks that CLEAR installs to enable automation.
 * Uses ${CLAUDE_PLUGIN_ROOT} for plugin-relative paths.
 *
 * @returns Hook configuration for CLEAR
 */
function getClearHooks() {
    return {
        // SessionStart - single entry, source comes via stdin JSON
        // Handles: startup, resume, clear, compact
        SessionStart: [
            {
                hooks: [
                    {
                        type: 'command',
                        command: '${CLAUDE_PLUGIN_ROOT}/scripts/dispatchers/session-start.sh',
                        timeout: DEFAULT_TIMEOUT,
                    },
                ],
            },
        ],
        // PreCompact - save state before compaction
        PreCompact: [
            {
                hooks: [
                    {
                        type: 'command',
                        command: '${CLAUDE_PLUGIN_ROOT}/scripts/session/session-precompact.sh',
                        timeout: 30,
                    },
                ],
            },
        ],
        // UserPromptSubmit - token monitoring, knowledge capture detection
        UserPromptSubmit: [
            {
                hooks: [
                    {
                        type: 'command',
                        command: '${CLAUDE_PLUGIN_ROOT}/scripts/dispatchers/user-prompt.sh',
                        timeout: DEFAULT_TIMEOUT,
                    },
                ],
            },
        ],
        // Stop - repurposed in R2: pass-through until B3 adds assessment
        Stop: [
            {
                hooks: [
                    {
                        type: 'command',
                        command: '${CLAUDE_PLUGIN_ROOT}/scripts/dispatchers/session-stop.sh',
                        timeout: DEFAULT_TIMEOUT,
                    },
                ],
            },
        ],
        // SessionEnd - session finalization (R2 B1: replaces Stop for finalization)
        SessionEnd: [
            {
                hooks: [
                    {
                        type: 'command',
                        command: '${CLAUDE_PLUGIN_ROOT}/scripts/dispatchers/session-end.sh',
                        timeout: DEFAULT_TIMEOUT,
                    },
                ],
            },
        ],
    };
}
// ==============================================================================
// HOOK MERGING
// ==============================================================================
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
function mergeHooks(existing, incoming) {
    if (!existing) {
        return { ...incoming };
    }
    const merged = { ...existing };
    // Merge each event type
    for (const [eventType, incomingMatchers] of Object.entries(incoming)) {
        const event = eventType;
        const existingMatchers = merged[event];
        if (!existingMatchers) {
            // Event doesn't exist in existing config, just add it
            merged[event] = incomingMatchers;
        }
        else {
            // Concatenate arrays, avoiding duplicates based on command
            const combinedMatchers = [...existingMatchers];
            for (const incomingMatcher of incomingMatchers || []) {
                // Check if this exact hook already exists
                const isDuplicate = existingMatchers.some((existingMatcher) => areMatchersEquivalent(existingMatcher, incomingMatcher));
                if (!isDuplicate) {
                    combinedMatchers.push(incomingMatcher);
                }
            }
            merged[event] = combinedMatchers;
        }
    }
    return merged;
}
/**
 * Check if two hook matchers are equivalent
 *
 * Two matchers are equivalent if they have the same matcher pattern
 * and the same set of hook commands.
 *
 * @param a - First matcher
 * @param b - Second matcher
 * @returns True if equivalent
 */
function areMatchersEquivalent(a, b) {
    // Check matcher pattern
    if ((a.matcher || '') !== (b.matcher || '')) {
        return false;
    }
    // Check hooks array length
    if (a.hooks.length !== b.hooks.length) {
        return false;
    }
    // Check each hook
    for (let i = 0; i < a.hooks.length; i++) {
        if (!areHooksEquivalent(a.hooks[i], b.hooks[i])) {
            return false;
        }
    }
    return true;
}
/**
 * Check if two hook definitions are equivalent
 *
 * @param a - First hook
 * @param b - Second hook
 * @returns True if equivalent
 */
function areHooksEquivalent(a, b) {
    return a.type === b.type && a.command === b.command;
}
// ==============================================================================
// SETTINGS FILE OPERATIONS
// ==============================================================================
/**
 * Read Claude settings from project
 *
 * @param projectDir - Project directory
 * @returns Parsed settings or empty object if not found
 */
function readClaudeSettings(projectDir) {
    const settingsPath = path.join(projectDir, exports.CLAUDE_SETTINGS_PATH);
    if (!fs.existsSync(settingsPath)) {
        return {};
    }
    try {
        const content = fs.readFileSync(settingsPath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        // Throw with context so caller can handle appropriately
        throw new Error(`Failed to parse ${exports.CLAUDE_SETTINGS_PATH}: Invalid JSON`);
    }
}
/**
 * Write Claude settings to project
 *
 * @param settings - Settings to write
 * @param projectDir - Project directory
 * @throws Error if write fails
 */
function writeClaudeSettings(settings, projectDir) {
    const settingsPath = path.join(projectDir, exports.CLAUDE_SETTINGS_PATH);
    const settingsDir = path.dirname(settingsPath);
    // Ensure .claude directory exists
    if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
    }
    const content = JSON.stringify(settings, null, 2);
    fs.writeFileSync(settingsPath, content, 'utf-8');
}
/**
 * Check if Claude settings file exists
 *
 * @param projectDir - Project directory
 * @returns True if settings file exists
 */
function settingsExist(projectDir) {
    const settingsPath = path.join(projectDir, exports.CLAUDE_SETTINGS_PATH);
    return fs.existsSync(settingsPath);
}
/**
 * Get settings file path
 *
 * @param projectDir - Project directory
 * @returns Full path to settings file
 */
function getSettingsPath(projectDir) {
    return path.join(projectDir, exports.CLAUDE_SETTINGS_PATH);
}
// ==============================================================================
// ENV VAR PROVISIONING
// ==============================================================================
/**
 * CLEAR environment variables provisioned into .claude/settings.json env key.
 * All values are strings per Claude Code settings.json schema.
 */
const CLEAR_ENV_VARS = {
    CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS: '5000',
    CLEAR_HOOKS_ENABLED: '1',
    CLEAR_STOP_ENABLED: '1',
    CLEAR_SESSIONEND_ENABLED: '1',
    CLEAR_POSTTOOL_ENABLED: '1',
    CLEAR_PRETOOL_ENABLED: '1',
};
/**
 * Merge CLEAR env vars into settings, preserving existing entries.
 *
 * @param settings - Current settings (mutated in place)
 * @returns The mutated settings
 */
function mergeEnvVars(settings) {
    const existingEnv = settings.env ?? {};
    settings.env = { ...existingEnv, ...CLEAR_ENV_VARS };
    return settings;
}
// ==============================================================================
// HIGH-LEVEL OPERATIONS
// ==============================================================================
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
function configureHooks(projectDir) {
    // Read existing settings (empty if none)
    let existingSettings;
    try {
        existingSettings = settingsExist(projectDir)
            ? readClaudeSettings(projectDir)
            : {};
    }
    catch (error) {
        throw new Error(`SETTINGS_MERGE_FAIL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    // Preserve existing settings, add env vars only (no hook writing)
    const newSettings = {
        ...existingSettings,
    };
    mergeEnvVars(newSettings);
    // Write settings
    try {
        writeClaudeSettings(newSettings, projectDir);
    }
    catch (error) {
        throw new Error(`SETTINGS_WRITE_FAIL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    return newSettings;
}
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
exports.CLEAR_STATUSLINE_COMMAND = '${CLAUDE_PROJECT_DIR}/.clear/statusline.sh';
/**
 * True when `command` is a CLEAR-OWNED statusline command that must be MIGRATED to the
 * current placeholder form — NOT preserved as a third-party CLEAR_ORIGINAL_STATUSLINE.
 * Covers the legacy version-baked form: an absolute path ending in `scripts/statusline.sh`
 * (the pre-1.0.2 `path.join(pluginRoot, 'scripts', 'statusline.sh')` output, any version).
 * Separators are normalized so the check holds on both POSIX and Windows consumers.
 */
function isLegacyClearStatuslineCommand(command) {
    const normalized = command.replace(/\\/g, '/');
    return path.isAbsolute(command) && normalized.endsWith('/scripts/statusline.sh');
}
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
function configureStatusline(projectDir) {
    let existingSettings;
    try {
        existingSettings = settingsExist(projectDir)
            ? readClaudeSettings(projectDir)
            : {};
    }
    catch (error) {
        throw new Error(`SETTINGS_MERGE_FAIL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    // Clone to avoid mutating the original (F1 fix)
    const settings = { ...existingSettings };
    const existingStatusline = settings.statusLine;
    const existingCommand = existingStatusline?.command;
    let originalStatusline = null;
    // Already on the placeholder form → idempotent no-op.
    if (existingCommand === exports.CLEAR_STATUSLINE_COMMAND) {
        return { needsRestart: false, originalStatusline: null };
    }
    // Preserve a GENUINE third-party statusline for passthrough. A legacy version-baked
    // CLEAR command is NOT third-party — migrate it silently (do not preserve), else the
    // dead plugin-root path is re-invoked via the CLEAR_ORIGINAL_STATUSLINE passthrough.
    if (existingCommand && !isLegacyClearStatuslineCommand(existingCommand)) {
        originalStatusline = existingCommand;
        const env = { ...(settings.env ?? {}) };
        env['CLEAR_ORIGINAL_STATUSLINE'] = originalStatusline;
        settings.env = env;
    }
    // Set CLEAR's statusline (placeholder form).
    settings.statusLine = {
        type: 'command',
        command: exports.CLEAR_STATUSLINE_COMMAND,
    };
    try {
        writeClaudeSettings(settings, projectDir);
    }
    catch (error) {
        throw new Error(`SETTINGS_WRITE_FAIL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    return {
        needsRestart: true,
        originalStatusline,
    };
}
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
function verifyClearHooks(projectDir) {
    if (!settingsExist(projectDir)) {
        return false;
    }
    try {
        const settings = readClaudeSettings(projectDir);
        const env = settings.env;
        if (!env) {
            return false;
        }
        // Check required env vars are present
        const requiredVars = Object.keys(CLEAR_ENV_VARS);
        return requiredVars.every(key => key in env);
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=hooks-config.js.map