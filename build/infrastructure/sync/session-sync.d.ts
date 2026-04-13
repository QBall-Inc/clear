/**
 * Session-Workpackage Sync (WF-1)
 *
 * Ensures session and workpackage states are consistent.
 * Triggered by SessionStart hook to synchronize session IDs
 * and update the sync state.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.1.
 */
import { AuditDomain } from './types';
/**
 * Input for session sync operation
 */
export interface SessionSyncInput {
    /** Current Claude Code session GUID */
    sessionId: string;
    /** Current CLEAR session number */
    sessionNumber: number;
    /** Project root directory */
    basePath: string;
}
/**
 * Status of session sync operation
 */
export type SessionSyncStatus = 'success' | 'error' | 'no_change';
/**
 * Result of session sync operation
 */
export interface SessionSyncResult {
    /** Operation status */
    status: SessionSyncStatus;
    /** Whether session ID changed */
    sessionChanged: boolean;
    /** Previous session ID (if changed) */
    previousSessionId?: string;
    /** Current workpackage display ID (if any) */
    activeWorkpackage?: string;
    /** Current workpackage systemId (if any) */
    activeWorkpackageSystemId?: string;
    /** Preserved progress value (0-1) */
    preservedProgress?: number;
    /** Domains that were updated */
    domainsUpdated: AuditDomain[];
    /** Operation timestamp */
    timestamp: string;
    /** Error message (if status is 'error') */
    error?: string;
}
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
export declare function syncSession(input: SessionSyncInput): Promise<SessionSyncResult>;
/**
 * Create a session sync handler for use with hooks
 * @param basePath - Project root directory
 * @returns Function that performs session sync
 */
export declare function createSessionSyncHandler(basePath: string): (sessionId: string, sessionNumber: number) => Promise<SessionSyncResult>;
/**
 * Check if a session change occurred without performing sync
 * @param basePath - Project root directory
 * @param currentSessionId - Current session ID to check against
 * @returns True if session differs from stored state
 */
export declare function hasSessionChanged(basePath: string, currentSessionId: string): boolean;
//# sourceMappingURL=session-sync.d.ts.map