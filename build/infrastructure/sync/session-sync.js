"use strict";
/**
 * Session-Workpackage Sync (WF-1)
 *
 * Ensures session and workpackage states are consistent.
 * Triggered by SessionStart hook to synchronize session IDs
 * and update the sync state.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.1.
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
exports.syncSession = syncSession;
exports.createSessionSyncHandler = createSessionSyncHandler;
exports.hasSessionChanged = hasSessionChanged;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const validation_1 = require("../validation");
const types_1 = require("../workpackage/types");
const parser_1 = require("../workpackage/parser");
const context_hub_1 = require("./context-hub");
const audit_log_1 = require("./audit-log");
// ==============================================================================
// CONSTANTS
// ==============================================================================
const STATE_DIR = '.clear/state';
const WORKPACKAGE_STATE_FILE = 'workpackage.json';
// ==============================================================================
// SESSION SYNC
// ==============================================================================
/**
 * Synchronize session with workpackage state.
 *
 * Operations:
 * 1. Read current session ID from input (Claude Code GUID)
 * 2. Read workpackage state
 * 3. If workpackage.sessionId differs from current:
 *    - Log audit entry for session change
 *    - Update workpackage.sessionId to current
 *    - Preserve workpackage progress (don't reset)
 * 4. Update sync-state.json
 *
 * @param input - Session sync input
 * @returns Session sync result
 */
async function syncSession(input) {
    const { sessionId, sessionNumber } = input;
    const basePath = (0, validation_1.validateBasePath)(input.basePath);
    const startTime = new Date().toISOString();
    try {
        // Load workpackage state
        const statePath = path.join(basePath, STATE_DIR, WORKPACKAGE_STATE_FILE);
        const workpackageState = loadWorkpackageState(statePath);
        const previousSessionId = workpackageState.sessionId;
        const sessionChanged = previousSessionId !== sessionId && previousSessionId !== '';
        // Initialize audit logger
        const auditLogger = new audit_log_1.AuditLogger(basePath, sessionId, sessionNumber);
        // Track which domains were updated
        const domainsUpdated = [];
        // If session changed, log and update
        if (sessionChanged) {
            // Log session change audit entry
            auditLogger.log({
                domain: 'session',
                action: 'update',
                trigger: 'session_start',
                target: sessionId,
                targetDisplayId: `session-${sessionNumber}`,
                oldValue: previousSessionId,
                newValue: sessionId,
                metadata: {
                    previousSessionId,
                    preservedProgress: workpackageState.progress,
                    activeWorkpackage: workpackageState.activeWorkpackage,
                    activeWorkpackageSystemId: workpackageState.activeWorkpackageSystemId
                }
            });
            // Update workpackage state with new session ID
            workpackageState.sessionId = sessionId;
            workpackageState.lastActivity = new Date().toISOString();
            // Save updated workpackage state
            saveWorkpackageState(statePath, workpackageState);
            domainsUpdated.push('session', 'workpackage');
        }
        else if (previousSessionId === '') {
            // First session - just set the ID without logging change
            workpackageState.sessionId = sessionId;
            workpackageState.lastActivity = new Date().toISOString();
            saveWorkpackageState(statePath, workpackageState);
            domainsUpdated.push('workpackage');
        }
        // Update sync state
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        syncManager.updateSessionSummary({
            id: sessionId,
            number: sessionNumber,
            tokensUsed: 0,
            status: 'active'
        });
        syncManager.updateWorkpackageSummary({
            systemId: workpackageState.activeWorkpackageSystemId ?? '',
            displayId: workpackageState.activeWorkpackage ?? '',
            title: '',
            progress: workpackageState.progress,
            sessionId
        });
        syncManager.save();
        domainsUpdated.push('sync');
        // Log successful sync
        auditLogger.log({
            domain: 'sync',
            action: 'create',
            trigger: 'session_start',
            target: `wf1-sync-${sessionNumber}`,
            metadata: {
                workflow: 'WF-1',
                sessionChanged,
                activeWorkpackage: workpackageState.activeWorkpackage,
                domainsUpdated
            }
        });
        return {
            status: 'success',
            sessionChanged,
            previousSessionId: sessionChanged ? previousSessionId : undefined,
            activeWorkpackage: workpackageState.activeWorkpackage ?? undefined,
            activeWorkpackageSystemId: workpackageState.activeWorkpackageSystemId ?? undefined,
            preservedProgress: workpackageState.progress,
            domainsUpdated,
            timestamp: startTime
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            status: 'error',
            sessionChanged: false,
            domainsUpdated: [],
            timestamp: startTime,
            error: `Session sync failed: ${errorMessage}`
        };
    }
}
/**
 * Load workpackage state from file
 * @param statePath - Path to workpackage.json
 * @returns Workpackage state (defaults if file doesn't exist)
 */
function loadWorkpackageState(statePath) {
    if (!fs.existsSync(statePath)) {
        return (0, types_1.createDefaultWorkpackageState)();
    }
    try {
        return (0, parser_1.parseStateFile)(statePath);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`[session-sync] Workpackage state file corrupted or invalid: ${message}. Using defaults.`);
        return (0, types_1.createDefaultWorkpackageState)();
    }
}
/**
 * Save workpackage state to file
 * @param statePath - Path to workpackage.json
 * @param state - State to save
 */
function saveWorkpackageState(statePath, state) {
    const dir = path.dirname(statePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    (0, parser_1.writeStateFile)(statePath, state);
}
// ==============================================================================
// CONVENIENCE FUNCTIONS
// ==============================================================================
/**
 * Create a session sync handler for use with hooks
 * @param basePath - Project root directory
 * @returns Function that performs session sync
 */
function createSessionSyncHandler(basePath) {
    return async (sessionId, sessionNumber) => {
        return syncSession({ sessionId, sessionNumber, basePath });
    };
}
/**
 * Check if a session change occurred without performing sync
 * @param basePath - Project root directory
 * @param currentSessionId - Current session ID to check against
 * @returns True if session differs from stored state
 */
function hasSessionChanged(basePath, currentSessionId) {
    const statePath = path.join(basePath, STATE_DIR, WORKPACKAGE_STATE_FILE);
    const state = loadWorkpackageState(statePath);
    return state.sessionId !== '' && state.sessionId !== currentSessionId;
}
//# sourceMappingURL=session-sync.js.map