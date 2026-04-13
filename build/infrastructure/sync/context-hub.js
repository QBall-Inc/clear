"use strict";
/**
 * Sync State Manager (WF-4)
 *
 * Central aggregation point for cross-domain state. Maintains the
 * sync-state.json file with summaries from all domains and
 * provides change detection for efficient sync operations.
 *
 * Note: Renamed from "SharedContextHub" to "SyncStateManager" to avoid
 * collision with src/infrastructure/context/manager.ts (hook contributions).
 * The SyncStateManager aggregates data FROM the context manager plus
 * workpackage.json, plan.json, knowledge DB, etc.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.6.
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
exports.SyncStateManager = void 0;
exports.createSyncStateManager = createSyncStateManager;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const types_1 = require("./types");
// ==============================================================================
// CONSTANTS
// ==============================================================================
const SYNC_STATE_FILE = 'sync-state.json';
const STATE_DIR = '.clear/state';
// State file names for hash calculation
const STATE_FILES = {
    session: 'session.json',
    workpackage: 'workpackage.json',
    plan: 'plan.json',
    knowledge: 'knowledge.json',
    sync: 'sync-state.json'
};
// ==============================================================================
// SYNC STATE MANAGER
// ==============================================================================
/**
 * SyncStateManager handles the sync state hub for cross-domain sync.
 *
 * Responsibilities:
 * - Read/write sync-state.json
 * - Aggregate state from all domains
 * - Change detection (checksums + mtime)
 * - Update individual domain summaries
 *
 * Note: This is separate from ContextManager (hook contributions).
 * SyncStateManager aggregates data FROM ContextManager plus other sources.
 */
class SyncStateManager {
    /**
     * Create a new SyncStateManager
     * @param basePath - Project root directory
     * @param config - Sync configuration
     */
    constructor(basePath, config) {
        this.dirty = false;
        this.basePath = basePath;
        this.config = {
            mode: config?.mode ?? 'on_change',
            safetyInterval: config?.safetyInterval ?? 5,
            changeDetection: {
                useChecksums: config?.changeDetection?.useChecksums ?? true,
                useMtime: config?.changeDetection?.useMtime ?? true
            }
        };
        this.state = (0, types_1.createDefaultSyncState)();
    }
    // ============================================================================
    // FILE OPERATIONS
    // ============================================================================
    /**
     * Get the full path to the sync state file
     */
    getSyncStatePath() {
        return path.join(this.basePath, STATE_DIR, SYNC_STATE_FILE);
    }
    /**
     * Get the full path to a state file
     */
    getStatePath(domain) {
        return path.join(this.basePath, STATE_DIR, STATE_FILES[domain]);
    }
    /**
     * Ensure the state directory exists
     */
    ensureStateDir() {
        const stateDir = path.join(this.basePath, STATE_DIR);
        if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
        }
    }
    /**
     * Load sync state from file
     * @returns True if loaded successfully, false if using defaults
     */
    load() {
        const statePath = this.getSyncStatePath();
        if (!fs.existsSync(statePath)) {
            this.state = (0, types_1.createDefaultSyncState)();
            return false;
        }
        try {
            const content = fs.readFileSync(statePath, 'utf-8');
            const parsed = JSON.parse(content);
            if (!(0, types_1.isSyncState)(parsed)) {
                console.warn('SyncState: Invalid format, using defaults');
                this.state = (0, types_1.createDefaultSyncState)();
                return false;
            }
            this.state = parsed;
            this.dirty = false;
            return true;
        }
        catch (error) {
            console.error('SyncState: Failed to load', error);
            this.state = (0, types_1.createDefaultSyncState)();
            return false;
        }
    }
    /**
     * Save sync state to file
     * @returns True if saved successfully
     */
    save() {
        try {
            this.ensureStateDir();
            const statePath = this.getSyncStatePath();
            this.state.lastUpdated = new Date().toISOString();
            fs.writeFileSync(statePath, JSON.stringify(this.state, null, 2), 'utf-8');
            this.dirty = false;
            return true;
        }
        catch (error) {
            console.error('SyncState: Failed to save', error);
            return false;
        }
    }
    /**
     * Check if there are unsaved changes
     */
    isDirty() {
        return this.dirty;
    }
    // ============================================================================
    // CHANGE DETECTION
    // ============================================================================
    /**
     * Calculate SHA-256 hash of a file's contents
     * @param filePath - Path to file
     * @returns Hash string or empty string if file doesn't exist
     */
    calculateFileHash(filePath) {
        if (!fs.existsSync(filePath)) {
            return '';
        }
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return crypto.createHash('sha256').update(content).digest('hex');
        }
        catch {
            return '';
        }
    }
    /**
     * Calculate hashes for all domain state files
     * @returns StateHashes object with current hashes
     */
    calculateStateHashes() {
        return {
            session: this.calculateFileHash(this.getStatePath('session')),
            workpackage: this.calculateFileHash(this.getStatePath('workpackage')),
            plan: this.calculateFileHash(this.getStatePath('plan')),
            knowledge: this.calculateFileHash(this.getStatePath('knowledge'))
        };
    }
    /**
     * Detect changes across all domains
     * @returns ChangeDetectionResult with details about changes
     */
    detectChanges() {
        const currentHashes = this.calculateStateHashes();
        const previousHashes = this.state.stateHashes;
        const changedDomains = [];
        // Check each domain for changes
        if (this.config.changeDetection.useChecksums) {
            if (currentHashes.session !== previousHashes.session) {
                changedDomains.push('session');
            }
            if (currentHashes.workpackage !== previousHashes.workpackage) {
                changedDomains.push('workpackage');
            }
            if (currentHashes.plan !== previousHashes.plan) {
                changedDomains.push('plan');
            }
            if (currentHashes.knowledge !== previousHashes.knowledge) {
                changedDomains.push('knowledge');
            }
        }
        // Check mtime as fallback/additional check
        if (this.config.changeDetection.useMtime && changedDomains.length === 0) {
            const domains = ['session', 'workpackage', 'plan', 'knowledge'];
            const syncStateMtime = this.getFileMtime(this.getSyncStatePath());
            for (const domain of domains) {
                const statePath = this.getStatePath(domain);
                const stateMtime = this.getFileMtime(statePath);
                if (stateMtime > syncStateMtime) {
                    changedDomains.push(domain);
                }
            }
        }
        // Check safety interval
        const fullSyncRequired = this.state.promptsSinceSync >= this.config.safetyInterval;
        return {
            hasChanges: changedDomains.length > 0,
            changedDomains,
            currentHashes,
            previousHashes,
            fullSyncRequired
        };
    }
    /**
     * Get file modification time
     * @param filePath - Path to file
     * @returns Modification time in milliseconds, or 0 if file doesn't exist
     */
    getFileMtime(filePath) {
        if (!fs.existsSync(filePath)) {
            return 0;
        }
        try {
            const stat = fs.statSync(filePath);
            return stat.mtimeMs;
        }
        catch {
            return 0;
        }
    }
    /**
     * Check if sync is needed based on configuration
     * @returns True if sync should be performed
     */
    shouldSync() {
        if (this.config.mode === 'always') {
            return true;
        }
        if (this.config.mode === 'manual') {
            return false;
        }
        // on_change mode
        const detection = this.detectChanges();
        return detection.hasChanges || detection.fullSyncRequired;
    }
    // ============================================================================
    // STATE ACCESSORS
    // ============================================================================
    /**
     * Get the current sync state
     */
    getState() {
        return { ...this.state };
    }
    /**
     * Get session summary
     */
    getSessionSummary() {
        return { ...this.state.session };
    }
    /**
     * Get workpackage summary
     */
    getWorkpackageSummary() {
        return { ...this.state.workpackage };
    }
    /**
     * Get plan summary
     */
    getPlanSummary() {
        return { ...this.state.plan };
    }
    /**
     * Get knowledge summary
     */
    getKnowledgeSummary() {
        return { ...this.state.knowledge };
    }
    /**
     * Get cross-domain links
     */
    getLinks() {
        return JSON.parse(JSON.stringify(this.state.links));
    }
    /**
     * Get prompts since last sync
     */
    getPromptsSinceSync() {
        return this.state.promptsSinceSync;
    }
    // ============================================================================
    // CONTEXT UPDATERS
    // ============================================================================
    /**
     * Update session summary
     * @param session - New session summary
     */
    updateSessionSummary(session) {
        this.state.session = {
            ...this.state.session,
            ...session
        };
        this.dirty = true;
    }
    /**
     * Update workpackage summary
     * @param workpackage - New workpackage summary
     */
    updateWorkpackageSummary(workpackage) {
        this.state.workpackage = {
            ...this.state.workpackage,
            ...workpackage
        };
        this.dirty = true;
    }
    /**
     * Update plan summary
     * @param plan - New plan summary
     */
    updatePlanSummary(plan) {
        this.state.plan = {
            ...this.state.plan,
            ...plan
        };
        this.dirty = true;
    }
    /**
     * Update knowledge summary
     * @param knowledge - New knowledge summary
     */
    updateKnowledgeSummary(knowledge) {
        this.state.knowledge = {
            ...this.state.knowledge,
            ...knowledge
        };
        this.dirty = true;
    }
    /**
     * Add a knowledge link
     * @param workpackageId - Workpackage systemId
     * @param link - Knowledge link to add
     */
    addKnowledgeLink(workpackageId, link) {
        if (!this.state.links.workpackageKnowledge[workpackageId]) {
            this.state.links.workpackageKnowledge[workpackageId] = [];
        }
        // Check for duplicate
        const existing = this.state.links.workpackageKnowledge[workpackageId]
            .find(l => l.id === link.id);
        if (!existing) {
            this.state.links.workpackageKnowledge[workpackageId].push(link);
            this.dirty = true;
        }
    }
    /**
     * Remove a knowledge link
     * @param workpackageId - Workpackage systemId
     * @param knowledgeId - Knowledge entry ID to remove
     */
    removeKnowledgeLink(workpackageId, knowledgeId) {
        if (!this.state.links.workpackageKnowledge[workpackageId]) {
            return;
        }
        const initialLength = this.state.links.workpackageKnowledge[workpackageId].length;
        this.state.links.workpackageKnowledge[workpackageId] =
            this.state.links.workpackageKnowledge[workpackageId].filter(l => l.id !== knowledgeId);
        if (this.state.links.workpackageKnowledge[workpackageId].length < initialLength) {
            this.dirty = true;
        }
    }
    /**
     * Update a knowledge link status
     * @param workpackageId - Workpackage systemId
     * @param knowledgeId - Knowledge entry ID
     * @param status - New status
     */
    updateKnowledgeLinkStatus(workpackageId, knowledgeId, status) {
        const links = this.state.links.workpackageKnowledge[workpackageId];
        if (!links)
            return;
        const link = links.find(l => l.id === knowledgeId);
        if (link && link.status !== status) {
            link.status = status;
            this.dirty = true;
        }
    }
    /**
     * Get all knowledge links for a workpackage
     * @param workpackageId - Workpackage systemId
     * @returns Array of knowledge links
     */
    getKnowledgeLinksForWorkpackage(workpackageId) {
        return this.state.links.workpackageKnowledge[workpackageId]?.map(l => ({ ...l })) ?? [];
    }
    /**
     * Update state hashes after sync
     * @param hashes - New state hashes
     */
    updateStateHashes(hashes) {
        this.state.stateHashes = { ...hashes };
        this.dirty = true;
    }
    /**
     * Record a full sync
     */
    recordFullSync() {
        this.state.lastFullSync = new Date().toISOString();
        this.state.promptsSinceSync = 0;
        this.dirty = true;
    }
    /**
     * Increment prompts since sync counter
     */
    incrementPromptCounter() {
        this.state.promptsSinceSync++;
        this.dirty = true;
    }
    /**
     * Add a deprecated reference warning
     * @param knowledgeId - Knowledge entry ID that has deprecated reference
     */
    addDeprecatedReference(knowledgeId) {
        if (!this.state.knowledge.deprecatedReferences.includes(knowledgeId)) {
            this.state.knowledge.deprecatedReferences.push(knowledgeId);
            this.dirty = true;
        }
    }
    /**
     * Remove a deprecated reference warning
     * @param knowledgeId - Knowledge entry ID
     */
    removeDeprecatedReference(knowledgeId) {
        const index = this.state.knowledge.deprecatedReferences.indexOf(knowledgeId);
        if (index !== -1) {
            this.state.knowledge.deprecatedReferences.splice(index, 1);
            this.dirty = true;
        }
    }
    /**
     * Add a recent knowledge entry
     * @param knowledgeId - Knowledge entry ID
     * @param maxRecent - Maximum recent entries to keep (default 10)
     */
    addRecentKnowledgeEntry(knowledgeId, maxRecent = 10) {
        // Remove if already exists
        const index = this.state.knowledge.recentEntries.indexOf(knowledgeId);
        if (index !== -1) {
            this.state.knowledge.recentEntries.splice(index, 1);
        }
        // Add to front
        this.state.knowledge.recentEntries.unshift(knowledgeId);
        // Trim to max
        if (this.state.knowledge.recentEntries.length > maxRecent) {
            this.state.knowledge.recentEntries = this.state.knowledge.recentEntries.slice(0, maxRecent);
        }
        this.dirty = true;
    }
    // ============================================================================
    // VALIDATION
    // ============================================================================
    /**
     * Validate sync state integrity
     * @returns Array of validation error messages (empty if valid)
     */
    validate() {
        const errors = [];
        // Check version
        if (!this.state.version) {
            errors.push('Missing version');
        }
        // Check timestamps
        if (!this.state.lastUpdated) {
            errors.push('Missing lastUpdated timestamp');
        }
        if (!this.state.lastFullSync) {
            errors.push('Missing lastFullSync timestamp');
        }
        // Validate workpackage summary has systemId
        if (this.state.workpackage.systemId &&
            !this.state.workpackage.systemId.startsWith('wp-') &&
            this.state.workpackage.systemId !== '') {
            errors.push(`Invalid workpackage systemId format: ${this.state.workpackage.systemId}`);
        }
        // Validate plan summary has phase systemId
        if (this.state.plan.activePhaseSystemId &&
            !this.state.plan.activePhaseSystemId.startsWith('ph-') &&
            this.state.plan.activePhaseSystemId !== '') {
            errors.push(`Invalid phase systemId format: ${this.state.plan.activePhaseSystemId}`);
        }
        // Validate knowledge links have systemIds
        for (const [wpId, links] of Object.entries(this.state.links.workpackageKnowledge)) {
            if (!wpId.startsWith('wp-')) {
                errors.push(`Invalid workpackage systemId in links: ${wpId}`);
            }
            for (const link of links) {
                if (!link.workpackageId.startsWith('wp-')) {
                    errors.push(`Invalid workpackageId in link ${link.id}: ${link.workpackageId}`);
                }
                if (!link.phaseId.startsWith('ph-')) {
                    errors.push(`Invalid phaseId in link ${link.id}: ${link.phaseId}`);
                }
            }
        }
        return errors;
    }
    // ============================================================================
    // RESET / CLEAR
    // ============================================================================
    /**
     * Reset sync state to defaults
     */
    reset() {
        this.state = (0, types_1.createDefaultSyncState)();
        this.dirty = true;
    }
    /**
     * Clear all knowledge links
     */
    clearKnowledgeLinks() {
        this.state.links.workpackageKnowledge = {};
        this.dirty = true;
    }
    /**
     * Clear deprecated references
     */
    clearDeprecatedReferences() {
        this.state.knowledge.deprecatedReferences = [];
        this.dirty = true;
    }
}
exports.SyncStateManager = SyncStateManager;
// ==============================================================================
// FACTORY FUNCTION
// ==============================================================================
/**
 * Create a SyncStateManager instance
 * @param basePath - Project root directory
 * @param config - Optional sync configuration
 * @returns SyncStateManager instance
 */
function createSyncStateManager(basePath, config) {
    const manager = new SyncStateManager(basePath, config);
    manager.load();
    return manager;
}
//# sourceMappingURL=context-hub.js.map