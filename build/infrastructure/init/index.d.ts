/**
 * Project Initialization Module
 *
 * Exports for the P2.1 /cf-init command implementation.
 *
 * @module infrastructure/init
 */
export type { ProjectStateType, ProjectState, InitializationType, ReinitializationEntry, ClearManifest, TokenUsageState, HandoffState, TokenThresholds, SessionStatus, SessionState, ContextWindowState, SessionHistoryEntry, SessionHistory, SyncState, KnowledgeLoadLevel, SyncFrequency, ClearConfig, HookType, HookDefinition, HookMatcher, HookEventType, HooksConfiguration, ClaudeSettings, InitStepResult, PostInitCheck, InitializationResult, InitError, InitErrorCode, SessionStartSource, SessionStartInput, SessionStartOutput, InitOptions, } from './types';
export { generateProjectId, generateInitSessionId } from './types';
export { CLEAR_VERSION, COMMAND_VERSION, MANIFEST_RELATIVE_PATH, createManifest, writeManifest, readManifest, manifestExists, getManifestPath, validateManifest, addReinitEntry, createBackup, removeExistingClear, } from './manifest';
export type { CreateManifestOptions, ManifestValidationResult } from './manifest';
export { CLAUDE_SETTINGS_PATH, getClearHooks, mergeHooks, readClaudeSettings, writeClaudeSettings, settingsExist, getSettingsPath, configureHooks, configureStatusline, verifyClearHooks, } from './hooks-config';
export { detectProjectState, createDirectoryStructure, createSession0State, createSessionHistory, createSyncState, createDefaultConfig, writeStateFiles, updateProjectClaudeMd, runPostInitChecks, initializeProject, createInitError, formatInitResult, } from './project-init';
//# sourceMappingURL=index.d.ts.map