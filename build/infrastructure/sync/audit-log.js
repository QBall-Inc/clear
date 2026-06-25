"use strict";
/**
 * Audit Logger (WF-6)
 *
 * Tracks all cross-domain state changes for debugging and accountability.
 * Stores audit entries in JSONL format (one JSON per line) per session.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.8.
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
exports.AuditLogger = void 0;
exports.createAuditLogger = createAuditLogger;
exports.getCurrentSession = getCurrentSession;
exports.createSessionStartEntry = createSessionStartEntry;
exports.createWorkpackageActivationEntry = createWorkpackageActivationEntry;
exports.createKnowledgeLinkEntry = createKnowledgeLinkEntry;
exports.createSyncCompleteEntry = createSyncCompleteEntry;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const validation_1 = require("../validation");
const types_1 = require("./types");
// ==============================================================================
// CONSTANTS
// ==============================================================================
const AUDIT_DIR = '.clear/audit';
const AUDIT_INDEX_FILE = 'audit-index.json';
const DEFAULT_RETENTION_SESSIONS = 10;
const DEFAULT_MAX_FILE_SIZE_MB = 5;
// ==============================================================================
// AUDIT LOGGER
// ==============================================================================
/**
 * AuditLogger handles cross-domain audit logging for P1.6.
 *
 * Responsibilities:
 * - Write audit entries in JSONL format
 * - Manage per-session audit files
 * - Maintain audit index for quick lookup
 * - Purge old audit logs based on retention policy
 */
class AuditLogger {
    /**
     * Create a new AuditLogger
     * @param basePath - Project root directory
     * @param sessionId - Current Claude Code session GUID
     * @param sessionNumber - Current CLEAR session number
     * @param config - Optional audit configuration
     */
    constructor(basePath, sessionId, sessionNumber, config) {
        this.entriesWritten = 0;
        this.correlationIdCounter = 0;
        // Defense-in-depth: validate the path and strip any '.clear' suffix the
        // upstream caller may have conflated into basePath. validateBasePath
        // rejects '..' traversal sequences; stripClearSuffix prevents the
        // `.clear/.clear/<sub>` duplicate-hierarchy leak class. Constructors
        // are direct-call surfaces (not all callers go through CLI parseArgs),
        // so input validation belongs here as well.
        this.basePath = (0, validation_1.stripClearSuffix)((0, validation_1.validateBasePath)(basePath), 'AuditLogger');
        this.currentSessionId = sessionId;
        this.currentSessionNumber = sessionNumber;
        this.config = {
            retentionSessions: config?.retentionSessions ?? DEFAULT_RETENTION_SESSIONS,
            maxFileSizeMb: config?.maxFileSizeMb ?? DEFAULT_MAX_FILE_SIZE_MB,
            logFormat: 'jsonl'
        };
    }
    /**
     * Get the current session ID
     */
    getSessionId() {
        return this.currentSessionId;
    }
    // ============================================================================
    // DIRECTORY AND PATH MANAGEMENT
    // ============================================================================
    /**
     * Get the audit directory path
     */
    getAuditDir() {
        return path.join(this.basePath, AUDIT_DIR);
    }
    /**
     * Get the path to a session's audit file
     */
    getSessionAuditPath(sessionNumber) {
        return path.join(this.getAuditDir(), `session_${sessionNumber}.jsonl`);
    }
    /**
     * Get the path to the audit index file
     */
    getIndexPath() {
        return path.join(this.getAuditDir(), AUDIT_INDEX_FILE);
    }
    /**
     * Ensure the audit directory exists
     */
    ensureAuditDir() {
        const auditDir = this.getAuditDir();
        if (!fs.existsSync(auditDir)) {
            fs.mkdirSync(auditDir, { recursive: true });
        }
    }
    // ============================================================================
    // LOGGING OPERATIONS
    // ============================================================================
    /**
     * Log an audit entry
     * @param entry - Partial audit entry (timestamp, sessionId, sessionNumber auto-filled)
     * @returns The complete audit entry that was logged
     */
    log(entry) {
        this.ensureAuditDir();
        const fullEntry = {
            timestamp: new Date().toISOString(),
            sessionId: this.currentSessionId,
            sessionNumber: this.currentSessionNumber,
            ...entry
        };
        // Append to session file
        const sessionPath = this.getSessionAuditPath(this.currentSessionNumber);
        const line = JSON.stringify(fullEntry) + '\n';
        fs.appendFileSync(sessionPath, line, 'utf-8');
        this.entriesWritten++;
        // Check file size and rotate if needed
        this.checkRotation();
        return fullEntry;
    }
    /**
     * Log a domain update
     * @param domain - Domain being updated
     * @param action - Action performed
     * @param target - Target of the action (systemId for entities)
     * @param options - Additional options (oldValue, newValue, trigger, etc.)
     */
    logUpdate(domain, action, target, options) {
        return this.log({
            domain,
            action,
            target,
            targetDisplayId: options?.targetDisplayId,
            oldValue: options?.oldValue,
            newValue: options?.newValue,
            trigger: options?.trigger ?? 'auto_sync',
            correlationId: options?.correlationId,
            metadata: options?.metadata
        });
    }
    /**
     * Generate a correlation ID for grouping related changes
     * @returns A unique correlation ID
     */
    generateCorrelationId() {
        this.correlationIdCounter++;
        return `${this.currentSessionNumber}-${Date.now()}-${this.correlationIdCounter}`;
    }
    /**
     * Log multiple entries with the same correlation ID
     * @param entries - Array of partial entries
     * @returns Array of complete entries
     */
    logCorrelated(entries) {
        const correlationId = this.generateCorrelationId();
        return entries.map(entry => this.log({ ...entry, correlationId }));
    }
    // ============================================================================
    // FILE ROTATION
    // ============================================================================
    /**
     * Check if rotation is needed and perform it
     */
    checkRotation() {
        const sessionPath = this.getSessionAuditPath(this.currentSessionNumber);
        if (!fs.existsSync(sessionPath)) {
            return;
        }
        const stats = fs.statSync(sessionPath);
        const sizeMb = stats.size / (1024 * 1024);
        if (sizeMb >= this.config.maxFileSizeMb) {
            this.rotateCurrentSession();
        }
    }
    /**
     * Rotate the current session's audit file
     * Creates a numbered backup and starts a fresh file
     */
    rotateCurrentSession() {
        const sessionPath = this.getSessionAuditPath(this.currentSessionNumber);
        const auditDir = this.getAuditDir();
        // Find next rotation number
        let rotationNum = 1;
        while (fs.existsSync(path.join(auditDir, `session_${this.currentSessionNumber}.${rotationNum}.jsonl`))) {
            rotationNum++;
        }
        // Rename current file
        const rotatedPath = path.join(auditDir, `session_${this.currentSessionNumber}.${rotationNum}.jsonl`);
        fs.renameSync(sessionPath, rotatedPath);
        // Log rotation event to new file
        this.log({
            domain: 'sync',
            action: 'purge',
            target: `session_${this.currentSessionNumber}.jsonl`,
            trigger: 'auto_sync',
            metadata: {
                reason: 'file_size_exceeded',
                rotatedTo: path.basename(rotatedPath),
                sizeMb: this.config.maxFileSizeMb
            }
        });
    }
    // ============================================================================
    // INDEX MANAGEMENT
    // ============================================================================
    /**
     * Load the audit index
     * @returns The audit index
     */
    loadIndex() {
        const indexPath = this.getIndexPath();
        if (!fs.existsSync(indexPath)) {
            return (0, types_1.createDefaultAuditIndex)();
        }
        try {
            const content = fs.readFileSync(indexPath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return (0, types_1.createDefaultAuditIndex)();
        }
    }
    /**
     * Save the audit index
     */
    saveIndex(index) {
        this.ensureAuditDir();
        const indexPath = this.getIndexPath();
        index.lastUpdated = new Date().toISOString();
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    }
    /**
     * Update the index for the current session
     */
    updateIndex() {
        const index = this.loadIndex();
        const sessionPath = this.getSessionAuditPath(this.currentSessionNumber);
        if (!fs.existsSync(sessionPath)) {
            return;
        }
        // Read session entries to build index entry
        const entries = this.readSessionEntries(this.currentSessionNumber);
        if (entries.length === 0) {
            return;
        }
        // Find or create index entry
        let indexEntry = index.sessions.find(s => s.sessionNumber === this.currentSessionNumber);
        if (!indexEntry) {
            indexEntry = {
                sessionNumber: this.currentSessionNumber,
                file: path.basename(sessionPath),
                entryCount: 0,
                firstEntry: '',
                lastEntry: '',
                domains: []
            };
            index.sessions.push(indexEntry);
        }
        // Update index entry
        indexEntry.entryCount = entries.length;
        indexEntry.firstEntry = entries[0].timestamp;
        indexEntry.lastEntry = entries[entries.length - 1].timestamp;
        indexEntry.domains = Array.from(new Set(entries.map(e => e.domain)));
        this.saveIndex(index);
    }
    // ============================================================================
    // READING OPERATIONS
    // ============================================================================
    /**
     * Read all entries from a session's audit file
     * @param sessionNumber - Session number to read
     * @returns Array of audit entries
     */
    readSessionEntries(sessionNumber) {
        const sessionPath = this.getSessionAuditPath(sessionNumber);
        if (!fs.existsSync(sessionPath)) {
            return [];
        }
        try {
            const content = fs.readFileSync(sessionPath, 'utf-8');
            const lines = content.trim().split('\n').filter(line => line.length > 0);
            return lines
                .map(line => {
                try {
                    const parsed = JSON.parse(line);
                    return (0, types_1.isAuditEntry)(parsed) ? parsed : null;
                }
                catch {
                    return null;
                }
            })
                .filter((entry) => entry !== null);
        }
        catch {
            return [];
        }
    }
    /**
     * Read entries from the current session
     * @returns Array of audit entries
     */
    readCurrentSessionEntries() {
        return this.readSessionEntries(this.currentSessionNumber);
    }
    /**
     * Read entries from the current and previous session (for debugging)
     * @returns Array of audit entries from both sessions
     */
    readRecentEntries() {
        const current = this.readSessionEntries(this.currentSessionNumber);
        const previous = this.currentSessionNumber > 1
            ? this.readSessionEntries(this.currentSessionNumber - 1)
            : [];
        return [...previous, ...current];
    }
    /**
     * Query entries by domain
     * @param domain - Domain to filter by
     * @param sessionNumber - Optional session number (defaults to current)
     * @returns Filtered entries
     */
    queryByDomain(domain, sessionNumber) {
        const entries = this.readSessionEntries(sessionNumber ?? this.currentSessionNumber);
        return entries.filter(e => e.domain === domain);
    }
    /**
     * Query entries by target
     * @param target - Target to filter by (systemId)
     * @param sessionNumber - Optional session number (defaults to current)
     * @returns Filtered entries
     */
    queryByTarget(target, sessionNumber) {
        const entries = this.readSessionEntries(sessionNumber ?? this.currentSessionNumber);
        return entries.filter(e => e.target === target);
    }
    /**
     * Query entries by correlation ID
     * @param correlationId - Correlation ID to filter by
     * @param sessionNumber - Optional session number (defaults to current)
     * @returns Filtered entries
     */
    queryByCorrelation(correlationId, sessionNumber) {
        const entries = this.readSessionEntries(sessionNumber ?? this.currentSessionNumber);
        return entries.filter(e => e.correlationId === correlationId);
    }
    // ============================================================================
    // PURGE OPERATIONS
    // ============================================================================
    /**
     * Purge old audit logs based on retention policy
     * @returns Number of files purged
     */
    purgeOldLogs() {
        const auditDir = this.getAuditDir();
        if (!fs.existsSync(auditDir)) {
            return 0;
        }
        // Get all session audit files
        const files = fs.readdirSync(auditDir)
            .filter(f => f.startsWith('session_') && f.endsWith('.jsonl'))
            .map(f => ({
            file: f,
            sessionNum: this.extractSessionNumber(f)
        }))
            .filter(f => f.sessionNum !== null)
            .sort((a, b) => a.sessionNum - b.sessionNum);
        // Determine files to delete
        const keepCount = this.config.retentionSessions;
        const toDelete = files.length > keepCount
            ? files.slice(0, files.length - keepCount)
            : [];
        // Delete old files
        let deletedCount = 0;
        for (const { file, sessionNum } of toDelete) {
            try {
                fs.unlinkSync(path.join(auditDir, file));
                deletedCount++;
                // Log purge event
                this.log({
                    domain: 'sync',
                    action: 'purge',
                    target: file,
                    trigger: 'auto_sync',
                    metadata: {
                        reason: 'retention_policy',
                        sessionNumber: sessionNum,
                        retentionSessions: this.config.retentionSessions
                    }
                });
            }
            catch {
                // Ignore deletion errors
            }
        }
        // Update index to remove purged sessions
        if (deletedCount > 0) {
            const index = this.loadIndex();
            const purgedSessions = toDelete.map(f => f.sessionNum);
            index.sessions = index.sessions.filter(s => !purgedSessions.includes(s.sessionNumber));
            this.saveIndex(index);
        }
        return deletedCount;
    }
    /**
     * Extract session number from filename
     */
    extractSessionNumber(filename) {
        const match = filename.match(/^session_(\d+)\.jsonl$/);
        return match ? parseInt(match[1], 10) : null;
    }
    // ============================================================================
    // STATISTICS
    // ============================================================================
    /**
     * Get audit statistics for current session
     */
    getSessionStats() {
        const sessionPath = this.getSessionAuditPath(this.currentSessionNumber);
        const entries = this.readCurrentSessionEntries();
        let fileSizeBytes = 0;
        if (fs.existsSync(sessionPath)) {
            fileSizeBytes = fs.statSync(sessionPath).size;
        }
        return {
            entriesWritten: this.entriesWritten,
            entriesInFile: entries.length,
            fileSizeBytes,
            domains: Array.from(new Set(entries.map(e => e.domain)))
        };
    }
    /**
     * Get overall audit statistics
     */
    getOverallStats() {
        const index = this.loadIndex();
        const entries = this.readCurrentSessionEntries();
        return {
            totalSessions: index.sessions.length,
            currentSession: this.currentSessionNumber,
            totalEntries: entries.length,
            oldestSession: index.sessions.length > 0
                ? Math.min(...index.sessions.map(s => s.sessionNumber))
                : null
        };
    }
}
exports.AuditLogger = AuditLogger;
// ==============================================================================
// FACTORY FUNCTION
// ==============================================================================
/**
 * Create an AuditLogger instance
 * @param basePath - Project root directory
 * @param sessionId - Current Claude Code session GUID
 * @param sessionNumber - Current CLEAR session number
 * @param config - Optional audit configuration
 * @returns AuditLogger instance
 */
function createAuditLogger(basePath, sessionId, sessionNumber, config) {
    return new AuditLogger(basePath, sessionId, sessionNumber, config);
}
// ==============================================================================
// SESSION RESOLVER (for entry-point sessionId defaulting)
// ==============================================================================
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
function getCurrentSession(clearDir, overrides) {
    // Explicit argv values always win — caller knows what they passed.
    if (overrides?.sessionId && typeof overrides.sessionNumber === 'number') {
        return { sessionId: overrides.sessionId, sessionNumber: overrides.sessionNumber };
    }
    let stateSessionId;
    let stateSessionNumber;
    try {
        const sessionPath = path.join(clearDir, 'state', 'session.json');
        if (fs.existsSync(sessionPath)) {
            const content = fs.readFileSync(sessionPath, 'utf-8');
            const parsed = JSON.parse(content);
            if (typeof parsed?.sessionId === 'string' && parsed.sessionId.length > 0) {
                stateSessionId = parsed.sessionId;
            }
            // Number.isFinite rejects NaN + Infinity. `typeof === 'number'` alone
            // would accept NaN (since typeof NaN === 'number'), and a corrupt
            // session.json could then propagate NaN into audit filenames
            // (session_NaN.jsonl) and created_session frontmatter.
            if (Number.isFinite(parsed?.clearSessionNumber)) {
                stateSessionNumber = parsed.clearSessionNumber;
            }
        }
    }
    catch {
        // Fall through to synthetic — corrupt state file should not block CLI work.
    }
    return {
        sessionId: overrides?.sessionId ?? stateSessionId ?? `session-${Date.now()}`,
        sessionNumber: overrides?.sessionNumber ?? stateSessionNumber ?? 0
    };
}
// ==============================================================================
// CONVENIENCE LOGGING FUNCTIONS
// ==============================================================================
/**
 * Create a session start audit entry
 */
function createSessionStartEntry(sessionId, sessionNumber) {
    return {
        domain: 'session',
        action: 'create',
        target: sessionId,
        trigger: 'session_start',
        metadata: {
            sessionNumber,
            event: 'session_start'
        }
    };
}
/**
 * Create a workpackage activation audit entry
 */
function createWorkpackageActivationEntry(workpackageSystemId, workpackageDisplayId, previousSystemId) {
    return {
        domain: 'workpackage',
        action: 'update',
        target: workpackageSystemId,
        targetDisplayId: workpackageDisplayId,
        oldValue: previousSystemId ? { activeWorkpackage: previousSystemId } : undefined,
        newValue: { activeWorkpackage: workpackageSystemId },
        trigger: 'user_prompt'
    };
}
/**
 * Create a knowledge link audit entry
 */
function createKnowledgeLinkEntry(knowledgeId, workpackageSystemId, phaseSystemId) {
    return {
        domain: 'knowledge',
        action: 'link',
        target: knowledgeId,
        trigger: 'auto_sync',
        metadata: {
            workpackageId: workpackageSystemId,
            phaseId: phaseSystemId
        }
    };
}
/**
 * Create a sync completion audit entry
 */
function createSyncCompleteEntry(domainsUpdated, durationMs) {
    return {
        domain: 'sync',
        action: 'update',
        target: 'sync_cycle',
        trigger: 'auto_sync',
        metadata: {
            domainsUpdated,
            durationMs
        }
    };
}
//# sourceMappingURL=audit-log.js.map