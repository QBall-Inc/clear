/**
 * Audit Logger (WF-6)
 *
 * Tracks all cross-domain state changes for debugging and accountability.
 * Stores audit entries in JSONL format (one JSON per line) per session.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.8.
 */
import { AuditEntry, AuditIndex, AuditDomain, AuditAction, AuditTrigger, AuditConfig } from './types';
/**
 * AuditLogger handles cross-domain audit logging for P1.6.
 *
 * Responsibilities:
 * - Write audit entries in JSONL format
 * - Manage per-session audit files
 * - Maintain audit index for quick lookup
 * - Purge old audit logs based on retention policy
 */
export declare class AuditLogger {
    private basePath;
    private config;
    private currentSessionId;
    private currentSessionNumber;
    private entriesWritten;
    private correlationIdCounter;
    /**
     * Create a new AuditLogger
     * @param basePath - Project root directory
     * @param sessionId - Current Claude Code session GUID
     * @param sessionNumber - Current CLEAR session number
     * @param config - Optional audit configuration
     */
    constructor(basePath: string, sessionId: string, sessionNumber: number, config?: Partial<AuditConfig>);
    /**
     * Get the current session ID
     */
    getSessionId(): string;
    /**
     * Get the audit directory path
     */
    private getAuditDir;
    /**
     * Get the path to a session's audit file
     */
    private getSessionAuditPath;
    /**
     * Get the path to the audit index file
     */
    private getIndexPath;
    /**
     * Ensure the audit directory exists
     */
    private ensureAuditDir;
    /**
     * Log an audit entry
     * @param entry - Partial audit entry (timestamp, sessionId, sessionNumber auto-filled)
     * @returns The complete audit entry that was logged
     */
    log(entry: Omit<AuditEntry, 'timestamp' | 'sessionId' | 'sessionNumber'>): AuditEntry;
    /**
     * Log a domain update
     * @param domain - Domain being updated
     * @param action - Action performed
     * @param target - Target of the action (systemId for entities)
     * @param options - Additional options (oldValue, newValue, trigger, etc.)
     */
    logUpdate(domain: AuditDomain, action: AuditAction, target: string, options?: {
        targetDisplayId?: string;
        oldValue?: unknown;
        newValue?: unknown;
        trigger?: AuditTrigger;
        correlationId?: string;
        metadata?: Record<string, unknown>;
    }): AuditEntry;
    /**
     * Generate a correlation ID for grouping related changes
     * @returns A unique correlation ID
     */
    generateCorrelationId(): string;
    /**
     * Log multiple entries with the same correlation ID
     * @param entries - Array of partial entries
     * @returns Array of complete entries
     */
    logCorrelated(entries: Array<Omit<AuditEntry, 'timestamp' | 'sessionId' | 'sessionNumber' | 'correlationId'>>): AuditEntry[];
    /**
     * Check if rotation is needed and perform it
     */
    private checkRotation;
    /**
     * Rotate the current session's audit file
     * Creates a numbered backup and starts a fresh file
     */
    private rotateCurrentSession;
    /**
     * Load the audit index
     * @returns The audit index
     */
    loadIndex(): AuditIndex;
    /**
     * Save the audit index
     */
    saveIndex(index: AuditIndex): void;
    /**
     * Update the index for the current session
     */
    updateIndex(): void;
    /**
     * Read all entries from a session's audit file
     * @param sessionNumber - Session number to read
     * @returns Array of audit entries
     */
    readSessionEntries(sessionNumber: number): AuditEntry[];
    /**
     * Read entries from the current session
     * @returns Array of audit entries
     */
    readCurrentSessionEntries(): AuditEntry[];
    /**
     * Read entries from the current and previous session (for debugging)
     * @returns Array of audit entries from both sessions
     */
    readRecentEntries(): AuditEntry[];
    /**
     * Query entries by domain
     * @param domain - Domain to filter by
     * @param sessionNumber - Optional session number (defaults to current)
     * @returns Filtered entries
     */
    queryByDomain(domain: AuditDomain, sessionNumber?: number): AuditEntry[];
    /**
     * Query entries by target
     * @param target - Target to filter by (systemId)
     * @param sessionNumber - Optional session number (defaults to current)
     * @returns Filtered entries
     */
    queryByTarget(target: string, sessionNumber?: number): AuditEntry[];
    /**
     * Query entries by correlation ID
     * @param correlationId - Correlation ID to filter by
     * @param sessionNumber - Optional session number (defaults to current)
     * @returns Filtered entries
     */
    queryByCorrelation(correlationId: string, sessionNumber?: number): AuditEntry[];
    /**
     * Purge old audit logs based on retention policy
     * @returns Number of files purged
     */
    purgeOldLogs(): number;
    /**
     * Extract session number from filename
     */
    private extractSessionNumber;
    /**
     * Get audit statistics for current session
     */
    getSessionStats(): {
        entriesWritten: number;
        entriesInFile: number;
        fileSizeBytes: number;
        domains: AuditDomain[];
    };
    /**
     * Get overall audit statistics
     */
    getOverallStats(): {
        totalSessions: number;
        currentSession: number;
        totalEntries: number;
        oldestSession: number | null;
    };
}
/**
 * Create an AuditLogger instance
 * @param basePath - Project root directory
 * @param sessionId - Current Claude Code session GUID
 * @param sessionNumber - Current CLEAR session number
 * @param config - Optional audit configuration
 * @returns AuditLogger instance
 */
export declare function createAuditLogger(basePath: string, sessionId: string, sessionNumber: number, config?: Partial<AuditConfig>): AuditLogger;
/**
 * Resolve the current session identity for audit-emit contexts.
 *
 * Precedence:
 *   1. Explicit overrides from caller (typically `--session-id` / `--session-number`
 *      argv values parsed by a CLI entry point).
 *   2. Canonical values read from `<clearDir>/state/session.json` (the
 *      sync-state authority — populated by knowledge-capture.sh, session-init,
 *      etc.).
 *   3. Synthetic fallback `session-${Date.now()}` + sessionNumber 0 — used only
 *      when no state file exists (e.g., first-ever invocation in a fresh
 *      project, or unit-test fixtures without session state).
 *
 * Returns deterministic values for a given input — same `clearDir` + same
 * `overrides` => same output across same-millisecond invocations.
 *
 * Use at CLI entry points that construct `AuditLogger` and currently default
 * to `session-${Date.now()}`. The synthetic-only path corrupts audit-log
 * correlation across the session because every entry gets a fresh timestamp
 * suffix, breaking downstream cross-domain join queries.
 *
 * @param clearDir - .clear directory path (e.g., `.clear`)
 * @param overrides - Optional explicit sessionId / sessionNumber from argv
 *                    (caller's existing override takes precedence over the
 *                    state file)
 */
export declare function getCurrentSession(clearDir: string, overrides?: {
    sessionId?: string;
    sessionNumber?: number;
}): {
    sessionId: string;
    sessionNumber: number;
};
/**
 * Create a session start audit entry
 */
export declare function createSessionStartEntry(sessionId: string, sessionNumber: number): Omit<AuditEntry, 'timestamp' | 'sessionId' | 'sessionNumber'>;
/**
 * Create a workpackage activation audit entry
 */
export declare function createWorkpackageActivationEntry(workpackageSystemId: string, workpackageDisplayId: string, previousSystemId?: string): Omit<AuditEntry, 'timestamp' | 'sessionId' | 'sessionNumber'>;
/**
 * Create a knowledge link audit entry
 */
export declare function createKnowledgeLinkEntry(knowledgeId: string, workpackageSystemId: string, phaseSystemId: string): Omit<AuditEntry, 'timestamp' | 'sessionId' | 'sessionNumber'>;
/**
 * Create a sync completion audit entry
 */
export declare function createSyncCompleteEntry(domainsUpdated: AuditDomain[], durationMs: number): Omit<AuditEntry, 'timestamp' | 'sessionId' | 'sessionNumber'>;
//# sourceMappingURL=audit-log.d.ts.map