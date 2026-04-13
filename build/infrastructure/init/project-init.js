"use strict";
/**
 * Core Project Initialization Logic
 *
 * Orchestrates the complete /cf-init flow:
 * 1. Project detection
 * 2. Directory scaffolding
 * 3. Manifest creation
 * 4. Session 0 initialization
 * 5. Hook configuration
 * 6. CLAUDE.md update (for user's project)
 * 7. Post-init checks
 *
 * Based on P2.1 Feature Brief v1.1.0.
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
exports.detectProjectState = detectProjectState;
exports.createDirectoryStructure = createDirectoryStructure;
exports.createSession0State = createSession0State;
exports.createSessionHistory = createSessionHistory;
exports.createSyncState = createSyncState;
exports.createDefaultConfig = createDefaultConfig;
exports.writeStateFiles = writeStateFiles;
exports.updateProjectClaudeMd = updateProjectClaudeMd;
exports.runPostInitChecks = runPostInitChecks;
exports.initializeProject = initializeProject;
exports.createInitError = createInitError;
exports.formatInitResult = formatInitResult;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("yaml"));
const types_1 = require("./types");
const manifest_1 = require("./manifest");
const hooks_config_1 = require("./hooks-config");
// ==============================================================================
// DIRECTORY STRUCTURE
// ==============================================================================
/** Directories to create under .clear/ */
const CLEAR_DIRECTORIES = [
    'config',
    'state',
    'sessions',
    'knowledge',
    'workpackages',
    'plans',
    'audit',
];
/** Files to create with .gitkeep */
const GITKEEP_DIRS = ['sessions', 'knowledge', 'workpackages', 'plans', 'audit'];
// ==============================================================================
// PROJECT DETECTION
// ==============================================================================
/**
 * Detect the current state of a project
 *
 * @param projectDir - Project directory to check
 * @returns Project state with details
 */
function detectProjectState(projectDir) {
    const clearDir = path.join(projectDir, '.clear');
    // Check if .clear/ exists
    if (!fs.existsSync(clearDir)) {
        return { state: 'greenfield' };
    }
    // Check if manifest exists
    if ((0, manifest_1.manifestExists)(projectDir)) {
        const manifest = (0, manifest_1.readManifest)(projectDir);
        if (manifest) {
            return {
                state: 'initialized',
                manifest,
                requiresForce: true,
            };
        }
        // Manifest file exists but couldn't be parsed
        return {
            state: 'unknown',
            error: 'Manifest file exists but could not be parsed',
        };
    }
    // .clear/ exists but no manifest
    return {
        state: 'unknown',
        error: 'Unrecognized .clear/ directory exists (no manifest file)',
    };
}
// ==============================================================================
// DIRECTORY SCAFFOLDING
// ==============================================================================
/**
 * Create the .clear/ directory structure
 *
 * @param projectDir - Project directory
 * @throws Error if creation fails
 */
function createDirectoryStructure(projectDir) {
    const clearDir = path.join(projectDir, '.clear');
    // Create all directories
    for (const dir of CLEAR_DIRECTORIES) {
        const fullPath = path.join(clearDir, dir);
        fs.mkdirSync(fullPath, { recursive: true });
    }
    // Create .gitkeep files
    for (const dir of GITKEEP_DIRS) {
        const gitkeepPath = path.join(clearDir, dir, '.gitkeep');
        fs.writeFileSync(gitkeepPath, '', 'utf-8');
    }
}
// ==============================================================================
// SESSION 0 INITIALIZATION
// ==============================================================================
/**
 * Create Session 0 state (initialization session)
 *
 * @param sessionId - Generated init session ID
 * @returns Session state object
 */
function createSession0State(sessionId) {
    const now = new Date().toISOString();
    return {
        sessionId,
        clearSessionNumber: 0,
        startTime: now,
        lastActivity: now,
        status: 'initializing',
        note: 'Session 0: CLEAR initialization session',
        tokenUsage: {
            estimate: 0,
            promptCount: 0,
            method: 'pending',
            consecutiveFailures: 0,
            cacheReadTokens: 0,
            warningShown: false,
            criticalShown: false,
            emergencyShown: false,
        },
        handoff: {
            prepared: false,
            documentPath: null,
        },
        thresholds: {
            warning: 0.60,
            critical: 0.75,
            emergency: 0.85,
        },
        contextWindow: {
            size: 200000,
            source: 'default',
            detectedModel: null,
            lastUpdated: null,
        },
    };
}
/**
 * Create initial session history
 *
 * @param sessionId - Session ID
 * @param startTime - Session start time
 * @returns Session history object
 */
function createSessionHistory(sessionId, startTime) {
    const date = startTime.slice(0, 10).replace(/-/g, '');
    return {
        lastSessionNumber: 0,
        sessions: [
            {
                sessionId,
                clearSessionNumber: 0,
                startTime,
                date,
                status: 'init',
                note: 'CLEAR initialized',
            },
        ],
    };
}
/**
 * Create initial sync state
 *
 * @param sessionId - Session ID
 * @returns Sync state object
 */
function createSyncState(sessionId) {
    const now = new Date().toISOString();
    return {
        version: '1.0',
        lastUpdated: now,
        lastFullSync: null,
        promptsSinceSync: 0,
        session: {
            id: sessionId,
            number: 0,
            tokensUsed: 0,
            status: 'initializing',
        },
        workpackage: null,
        plan: null,
        knowledge: {
            recentEntries: [],
            totalCount: 0,
        },
    };
}
/**
 * Create default configuration
 *
 * @returns Default configuration object
 */
function createDefaultConfig() {
    return {
        session: {
            token_thresholds: {
                warning: 0.60,
                critical: 0.75,
                emergency: 0.85,
            },
        },
        knowledge: {
            load_level: 'balanced',
        },
        sync: {
            frequency: 'on_change',
        },
    };
}
/**
 * Write all initial state files
 *
 * @param projectDir - Project directory
 * @param sessionId - Generated session ID
 */
function writeStateFiles(projectDir, sessionId) {
    const stateDir = path.join(projectDir, '.clear', 'state');
    const configDir = path.join(projectDir, '.clear', 'config');
    // Create session state
    const sessionState = createSession0State(sessionId);
    fs.writeFileSync(path.join(stateDir, 'session.json'), JSON.stringify(sessionState, null, 2), 'utf-8');
    // Create session history
    const sessionHistory = createSessionHistory(sessionId, sessionState.startTime);
    fs.writeFileSync(path.join(stateDir, 'session-history.json'), JSON.stringify(sessionHistory, null, 2), 'utf-8');
    // Create sync state
    const syncState = createSyncState(sessionId);
    fs.writeFileSync(path.join(stateDir, 'sync-state.json'), JSON.stringify(syncState, null, 2), 'utf-8');
    // Create default config
    const config = createDefaultConfig();
    const configContent = `# CLEAR Configuration
# Edit this file to customize CLEAR behavior

${yaml.stringify(config)}`;
    fs.writeFileSync(path.join(configDir, 'clear-config.yaml'), configContent, 'utf-8');
}
// ==============================================================================
// CLAUDE.MD UPDATE
// ==============================================================================
/** Session resume instructions to add to project CLAUDE.md */
const CLAUDE_MD_SECTION = `
## CLEAR Framework Session Resume

When a CLEAR session starts or resumes (indicated by session context in additionalContext),
greet the user with a brief summary:

1. Session number and project name
2. Active workpackage (if any)
3. Last session's final state (1-2 sentences)
4. Top 2-3 next priorities

Example:
"Resuming Session 42 for MyProject.

Active: P2.1 - /cf-init Implementation
Last session: Completed project detection logic, started hook configuration.

Next priorities:
1. Finish hook merge strategy
2. Add E2E tests for initialization flow

Ready to continue. What would you like to work on?"
`;
/**
 * Update project's CLAUDE.md with session resume instructions
 *
 * Note: This updates the USER'S project CLAUDE.md, not clear-framework's.
 *
 * @param projectDir - Project directory
 */
function updateProjectClaudeMd(projectDir) {
    const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
    let content = '';
    // Read existing content if file exists
    if (fs.existsSync(claudeMdPath)) {
        content = fs.readFileSync(claudeMdPath, 'utf-8');
        // Check if section already exists
        if (content.includes('## CLEAR Framework Session Resume')) {
            return; // Already has the section
        }
    }
    // Append the section
    const newContent = content + CLAUDE_MD_SECTION;
    fs.writeFileSync(claudeMdPath, newContent, 'utf-8');
}
// ==============================================================================
// POST-INIT CHECKS
// ==============================================================================
/**
 * Run post-initialization checks
 *
 * @param projectDir - Project directory
 * @returns Array of check results
 */
function runPostInitChecks(projectDir) {
    const checks = [];
    // Check for plan
    const plansDir = path.join(projectDir, '.clear', 'plans');
    const planFiles = fs.existsSync(plansDir)
        ? fs.readdirSync(plansDir).filter((f) => f !== '.gitkeep')
        : [];
    checks.push({
        name: 'plan_exists',
        passed: planFiles.length > 0,
        message: planFiles.length > 0
            ? `Plan found: ${planFiles[0]}`
            : 'No plan found. Create a plan manually or use /cf-plan create (Phase 2.9)',
    });
    // Check for workpackages
    const wpDir = path.join(projectDir, '.clear', 'workpackages');
    const wpFiles = fs.existsSync(wpDir)
        ? fs.readdirSync(wpDir).filter((f) => f !== '.gitkeep')
        : [];
    checks.push({
        name: 'workpackages_exist',
        passed: wpFiles.length > 0,
        message: wpFiles.length > 0
            ? `${wpFiles.length} workpackage(s) found`
            : 'No workpackages found. Workpackages will be auto-generated when you create a plan',
    });
    // Check for knowledge entries
    const knowledgeDir = path.join(projectDir, '.clear', 'knowledge');
    const knowledgeFiles = fs.existsSync(knowledgeDir)
        ? fs.readdirSync(knowledgeDir).filter((f) => f !== '.gitkeep')
        : [];
    checks.push({
        name: 'knowledge_exists',
        passed: knowledgeFiles.length > 0,
        message: knowledgeFiles.length > 0
            ? `${knowledgeFiles.length} knowledge entry/entries found`
            : 'Knowledge base is empty. Use /cf-knowledge capture to add entries',
    });
    return checks;
}
// ==============================================================================
// INIT STEP HELPER
// ==============================================================================
/**
 * Execute a single initialization step with try/catch, step recording, and
 * early-return-on-failure semantics.
 *
 * On success the step is recorded and the function returns `undefined`.
 * On failure the step is recorded and an `InitializationResult` is returned
 * so the caller can propagate it immediately.
 *
 * @param stepName   - Name recorded in the steps array
 * @param action     - The work to perform (may throw)
 * @param errorCode  - InitError code used when the step fails
 * @param steps      - Mutable steps array (appended in-place)
 * @param baseResult - Partial result fields shared across all failure returns
 * @returns `undefined` on success, or an `InitializationResult` on failure
 */
function runInitStep(stepName, action, errorCode, steps, baseResult) {
    try {
        action();
        steps.push({ step: stepName, success: true });
        return undefined;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // Step 5 (configure_hooks) derives the error code from the message
        const resolvedCode = stepName === 'configure_hooks'
            ? (errorMessage.startsWith('SETTINGS_MERGE_FAIL')
                ? 'SETTINGS_MERGE_FAIL'
                : errorCode)
            : errorCode;
        steps.push({ step: stepName, success: false, error: errorMessage });
        return {
            success: false,
            projectName: baseResult.projectName,
            projectPath: baseResult.projectDir,
            projectId: baseResult.projectId,
            sessionId: baseResult.sessionId,
            steps,
            checks: [],
            error: createInitError(resolvedCode, error).message,
        };
    }
}
// ==============================================================================
// MAIN INITIALIZATION FUNCTION
// ==============================================================================
/**
 * Initialize CLEAR in a project
 *
 * @param options - Initialization options
 * @returns Initialization result
 */
async function initializeProject(options) {
    const { projectDir, force = false, clearVersion = manifest_1.CLEAR_VERSION, commandVersion = manifest_1.COMMAND_VERSION, } = options;
    const steps = [];
    const projectName = path.basename(projectDir);
    let projectId = '';
    let sessionId = '';
    let backupPath;
    // Shared base fields for failure results — kept in sync with mutable locals
    const base = () => ({ projectName, projectDir, projectId, sessionId });
    try {
        // Step 1: Detect project state
        const state = detectProjectState(projectDir);
        steps.push({ step: 'detect_state', success: true });
        // Handle state-based logic
        if (state.state === 'unknown') {
            return {
                success: false,
                projectName,
                projectPath: projectDir,
                projectId: '',
                sessionId: '',
                steps,
                checks: [],
                error: createInitError('UNKNOWN_CLEAR_STATE', state.error || '').message,
            };
        }
        if (state.state === 'initialized') {
            if (!force) {
                return {
                    success: false,
                    projectName,
                    projectPath: projectDir,
                    projectId: state.manifest?.clear.project_id || '',
                    sessionId: '',
                    steps,
                    checks: [],
                    error: createInitError('ALREADY_INITIALIZED', state.manifest).message,
                };
            }
            // Force mode: backup and remove existing
            try {
                backupPath = (0, manifest_1.createBackup)(projectDir);
                steps.push({ step: 'create_backup', success: true });
                (0, manifest_1.removeExistingClear)(projectDir);
                steps.push({ step: 'remove_existing', success: true });
            }
            catch (error) {
                steps.push({
                    step: 'create_backup',
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
                return {
                    success: false,
                    projectName,
                    projectPath: projectDir,
                    projectId: '',
                    sessionId: '',
                    steps,
                    checks: [],
                    error: createInitError('BACKUP_FAIL', error).message,
                };
            }
        }
        // Step 2: Create directory structure
        let stepResult = runInitStep('create_directories', () => createDirectoryStructure(projectDir), 'DIRECTORY_CREATE_FAIL', steps, base());
        if (stepResult)
            return stepResult;
        // Step 3: Create and write manifest
        stepResult = runInitStep('create_manifest', () => {
            const manifest = (0, manifest_1.createManifest)({
                projectDir,
                projectName,
                clearVersion,
                commandVersion,
                hooksConfigured: true,
            });
            projectId = manifest.clear.project_id;
            (0, manifest_1.writeManifest)(manifest, projectDir);
        }, 'MANIFEST_WRITE_FAIL', steps, base());
        if (stepResult)
            return stepResult;
        // Step 4: Generate Session 0 ID and write state files
        stepResult = runInitStep('create_session_0', () => {
            sessionId = (0, types_1.generateInitSessionId)();
            writeStateFiles(projectDir, sessionId);
        }, 'STATE_WRITE_FAIL', steps, base());
        if (stepResult)
            return stepResult;
        // Step 5: Configure hooks
        stepResult = runInitStep('configure_hooks', () => (0, hooks_config_1.configureHooks)(projectDir), 'SETTINGS_WRITE_FAIL', steps, base());
        if (stepResult)
            return stepResult;
        // Step 6: Update project CLAUDE.md (non-fatal)
        try {
            updateProjectClaudeMd(projectDir);
            steps.push({ step: 'update_claude_md', success: true });
        }
        catch (error) {
            // Non-fatal - log but continue
            steps.push({
                step: 'update_claude_md',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
        // Step 7: Run post-init checks
        const checks = runPostInitChecks(projectDir);
        steps.push({ step: 'post_init_checks', success: true });
        return {
            success: true,
            projectName,
            projectPath: projectDir,
            projectId,
            sessionId,
            steps,
            checks,
            backupPath,
        };
    }
    catch (error) {
        // Unexpected error
        return {
            success: false,
            projectName,
            projectPath: projectDir,
            projectId,
            sessionId,
            steps,
            checks: [],
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
// ==============================================================================
// ERROR HANDLING
// ==============================================================================
/**
 * Create a structured initialization error
 *
 * @param code - Error code
 * @param context - Additional context
 * @returns Structured error object
 */
function createInitError(code, context) {
    const errors = {
        ALREADY_INITIALIZED: {
            message: 'CLEAR is already initialized in this project.',
            recovery: [
                'To reinitialize, run: /cf-init --force',
                'Warning: This will backup and replace existing configuration.',
            ],
        },
        UNKNOWN_CLEAR_STATE: {
            message: 'Unrecognized .clear/ directory found.',
            recovery: [
                'This directory was not created by CLEAR (no manifest file).',
                'Cannot safely initialize without risking data loss.',
                'Options:',
                '  1. Remove .clear/ manually if it is not needed',
                '  2. Investigate contents: ls -la .clear/',
            ],
        },
        PERMISSION_DENIED: {
            message: 'Permission denied when writing to project directory.',
            recovery: [
                'Check directory permissions',
                'Ensure you have write access to the project directory',
            ],
        },
        SETTINGS_WRITE_FAIL: {
            message: 'Failed to write .claude/settings.json.',
            recovery: ['Check file permissions', 'Ensure .claude/ directory is writable'],
        },
        SETTINGS_MERGE_FAIL: {
            message: 'Failed to parse existing .claude/settings.json.',
            recovery: [
                'The existing settings.json contains invalid JSON',
                'Fix the JSON syntax and try again',
            ],
        },
        MANIFEST_WRITE_FAIL: {
            message: 'Failed to create clear-manifest.yaml.',
            recovery: ['Check disk space', 'Verify write permissions'],
        },
        BACKUP_FAIL: {
            message: 'Failed to create backup of existing .clear/ directory.',
            recovery: [
                'Check disk space',
                'Cannot proceed with --force without successful backup',
            ],
        },
        DIRECTORY_CREATE_FAIL: {
            message: 'Failed to create .clear/ directory structure.',
            recovery: ['Check directory permissions', 'Verify disk space'],
        },
        STATE_WRITE_FAIL: {
            message: 'Failed to write state files.',
            recovery: ['Check disk space', 'Verify write permissions'],
        },
    };
    const errorDef = errors[code];
    return {
        code,
        message: errorDef.message,
        recovery: errorDef.recovery,
        context: typeof context === 'object' ? context : { detail: context },
    };
}
/**
 * Format initialization result for display
 *
 * @param result - Initialization result
 * @returns Formatted string for display
 */
function formatInitResult(result) {
    const lines = [];
    if (result.success) {
        lines.push('CLEAR initialized successfully!');
        lines.push('');
        lines.push(`Project: ${result.projectName}`);
        lines.push(`Location: ${result.projectPath}/.clear/`);
        lines.push(`Current: Session 0 (initialization session)`);
        lines.push('');
        lines.push('Status:');
        for (const step of result.steps) {
            const status = step.success ? 'OK' : 'FAIL';
            lines.push(`  [${status}] ${step.step}`);
        }
        lines.push('');
        // Show checks
        for (const check of result.checks) {
            const icon = check.passed ? 'OK' : 'WARN';
            lines.push(`[${icon}] ${check.message}`);
        }
        lines.push('');
        lines.push('Next steps:');
        lines.push('  1. Define your project plan');
        lines.push('  2. Run /cf-status to verify setup');
        lines.push('  3. Continue working - this session is now being tracked!');
        lines.push('');
        lines.push('Session 1 will begin on your next Claude Code startup.');
        if (result.backupPath) {
            lines.push('');
            lines.push(`Backup created at: ${result.backupPath}`);
        }
    }
    else {
        lines.push('CLEAR initialization failed');
        lines.push('');
        if (result.steps.length > 0) {
            lines.push('Completed:');
            for (const step of result.steps.filter((s) => s.success)) {
                lines.push(`  [OK] ${step.step}`);
            }
            lines.push('');
            lines.push('Failed:');
            for (const step of result.steps.filter((s) => !s.success)) {
                lines.push(`  [FAIL] ${step.step}: ${step.error}`);
            }
        }
        if (result.error) {
            lines.push('');
            lines.push(`Error: ${result.error}`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=project-init.js.map