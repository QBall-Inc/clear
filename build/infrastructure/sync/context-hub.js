"use strict";
/**
 * Sync State Manager (WF-4)
 *
 * Central aggregation point for cross-domain state. Maintains the
 * sync-state.json file with summaries from all domains.
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
exports.mergeOntoDefaults = mergeOntoDefaults;
exports.createSyncStateManager = createSyncStateManager;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const validation_1 = require("../validation");
const types_1 = require("./types");
// ==============================================================================
// CONSTANTS
// ==============================================================================
const SYNC_STATE_FILE = 'sync-state.json';
const STATE_DIR = '.clear/state';
// ==============================================================================
// SCHEMA NORMALIZATION
// ==============================================================================
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function structuralClass(value) {
    if (Array.isArray(value))
        return 'array';
    if (isPlainObject(value))
        return 'object';
    return 'primitive';
}
/**
 * Deep-merge a parsed sync-state onto the current default shape (schema
 * upgrade-on-read). Parsed values WIN when they are STRUCTURALLY COMPATIBLE with
 * the default: an existing key (and any extra key the parsed state carries) whose
 * value is the same structural class as the default — both objects, both arrays,
 * both primitives — is preserved verbatim. Objects recurse; arrays are leaf values
 * (the parsed array is taken whole, never element-merged).
 *
 * Two cases fall back to the default (and flag the result as upgraded):
 *   1. A default key ABSENT from the parsed state.
 *   2. A present key whose parsed value is the WRONG structural class for the slot
 *      (e.g. `recentEntries` stored as a string, or a domain object stored as a
 *      scalar). Preferring the default here keeps the typed mutators from
 *      dereferencing an incompatible type at runtime.
 *
 * Why this exists: real consumer states are schema-divergent. A first-generation
 * consumer state can lack the `links` key and the `deprecatedReferences` field,
 * yet still pass the top-level structural guard, so without normalization the raw
 * state reaches the typed mutators and they dereference `undefined` / call array
 * methods on a non-array. Normalizing on load closes that crash class while keeping
 * the consumer's real data intact.
 *
 * @returns the merged object plus `added` = true iff at least one default key was
 *   filled or coerced (the caller marks the manager dirty so the next save persists
 *   the upgraded shape).
 */
function mergeOntoDefaults(parsed, defaults) {
    let added = false;
    const merged = { ...parsed };
    for (const key of Object.keys(defaults)) {
        if (!(key in parsed)) {
            merged[key] = defaults[key];
            added = true;
            continue;
        }
        const parsedClass = structuralClass(parsed[key]);
        const defaultClass = structuralClass(defaults[key]);
        if (parsedClass === 'object' && defaultClass === 'object') {
            const sub = mergeOntoDefaults(parsed[key], defaults[key]);
            merged[key] = sub.merged;
            if (sub.added)
                added = true;
        }
        else if (parsedClass !== defaultClass) {
            // Structural-type mismatch: the parsed value is incompatible with the
            // canonical shape for this slot. Prefer the default so downstream typed
            // mutators operate on the expected type.
            merged[key] = defaults[key];
            added = true;
        }
        // else: same structural class (both arrays or both primitives) — preserve parsed.
    }
    return { merged, added };
}
/**
 * Map a knowledge entry status onto the narrower KnowledgeLink status union.
 * KnowledgeStatus carries a 'pending' value that the link schema has no slot for;
 * a pending entry is treated as active for linking purposes. Any unrecognized
 * value also collapses to 'active' (fail-safe — a link is never dropped over an
 * unknown status).
 */
function toLinkStatus(status) {
    return status === 'deprecated' || status === 'superseded' || status === 'archived'
        ? status
        : 'active';
}
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
     */
    constructor(basePath) {
        this.dirty = false;
        // Defense-in-depth: validate the path and strip any '.clear' suffix the
        // upstream caller may have conflated into basePath. validateBasePath
        // rejects '..' traversal sequences; stripClearSuffix prevents the
        // `.clear/.clear/<sub>` duplicate-hierarchy leak class. Constructors
        // are direct-call surfaces (not all callers go through CLI parseArgs),
        // so input validation belongs here as well.
        this.basePath = (0, validation_1.stripClearSuffix)((0, validation_1.validateBasePath)(basePath), 'SyncStateManager');
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
            // Schema upgrade-on-read. isSyncState() only guarantees the top-level
            // domains exist; schema-divergent consumer states (e.g. a first-generation
            // state with no `links` key) would otherwise reach the typed mutators and
            // crash. Deep-merge onto the current default shape — structurally-compatible
            // parsed values win, absent or wrong-typed default keys are filled. Mark
            // dirty only when keys were added/coerced so the upgraded shape persists on
            // the next save without spuriously dirtying a complete state.
            const { merged, added } = mergeOntoDefaults(parsed, (0, types_1.createDefaultSyncState)());
            this.state = merged;
            this.dirty = added;
            // Detect ratio-leak progress values. The canonical scale is 0-100; a
            // strictly-sub-1 nonzero value from a legacy writer would silently
            // re-introduce mixed-scale arithmetic if consumed as percent. Warn so
            // the operator (Claude) can re-run progress on the affected WP. No
            // auto-rescale — the boundary value 1 is a legitimate 1% and rescaling
            // would double-count.
            const wpProgress = this.state.workpackage?.progress;
            if (typeof wpProgress === 'number' && wpProgress > 0 && wpProgress < 1) {
                process.stderr.write(`[SyncStateManager] workpackage.progress=${wpProgress} on load is below the 1% floor — ` +
                    `expected 0-100 percentage range, got a sub-1 value (likely a stale ratio writer). ` +
                    `Run \`/cf-workpackage progress\` on the active workpackage to recompute.\n`);
            }
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
            // Atomic write — serialize to a sibling temp file, then rename over the
            // target. rename(2) is atomic on the same filesystem, so a crash mid-write
            // leaves the prior sync-state.json intact rather than a truncated file. The
            // temp sits in the same dir (same FS) as the target.
            const tmpPath = `${statePath}.tmp`;
            fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf-8');
            fs.renameSync(tmpPath, statePath);
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
     * Update workpackage summary. The `progress` field on WorkpackageSummary is
     * 0-100 percentage per the calculateProgress contract.
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
     * Clear the active-workpackage block to its empty-identity canonical form.
     *
     * Use after a lifecycle transition (complete, pause-to-no-active) leaves
     * no active workpackage. This is the single source of truth for the
     * "no active WP" sync-state shape — callers should prefer it over
     * inlining the empty-field literal at every site.
     *
     * Canonical shape applied: { systemId: '', displayId: '', title: '',
     * progress: 0, sessionId: '', status: undefined }.
     */
    clearActiveWorkpackage() {
        this.updateWorkpackageSummary({
            systemId: '',
            displayId: '',
            title: '',
            progress: 0,
            sessionId: '',
            status: undefined,
        });
    }
    /**
     * Set the previous-workpackage snapshot. (WP-DF3 AC5 / S167 G5 fix)
     *
     * Called when a WP transitions out of `in_progress` via pause OR auto-pause-
     * on-switch, so resume-context surfaces can show "Previously you were
     * working on X, paused at N%". Prior to this mutator the
     * `previousWorkpackage` block had zero writers despite being declared in
     * the SyncState schema.
     *
     * @param prev - Snapshot of the WP being paused
     */
    updatePreviousWorkpackage(prev) {
        this.state.previousWorkpackage = { ...prev };
        this.dirty = true;
    }
    /**
     * Clear the previous-workpackage snapshot. (WP-DF3 AC5 / S167 G5 fix)
     *
     * Use when the previously-paused WP is resumed OR when its identity is no
     * longer relevant (e.g., it was completed). Leaving stale data here would
     * mislead resume-context surfaces.
     */
    clearPreviousWorkpackage() {
        if (this.state.previousWorkpackage !== undefined) {
            delete this.state.previousWorkpackage;
            this.dirty = true;
        }
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
     * Record a full sync
     */
    recordFullSync() {
        this.state.lastFullSync = new Date().toISOString();
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
    /**
     * Rebuild the denormalized knowledge cache (knowledge.recentEntries and the
     * links.workpackageKnowledge map) from the knowledge database — the
     * materialized source-of-truth. This is the RECOVERY path for sync-state
     * drift: when a capture or link never propagated, or a project was imported
     * or migrated, the cache can go empty/stale while the DB still holds the real
     * entries (the empty "Recent Knowledge" dashboard panel symptom). Unlike
     * reconcile, which only PRUNES stale links, this repopulates from scratch.
     *
     * The caller supplies the entries (so this manager stays free of the native
     * knowledge-db dependency). Ordering is recomputed here from creation time, so
     * the projection is deterministic regardless of the caller's input order.
     *
     * Idempotent: each field is replaced only when the freshly-projected value
     * differs from the current one, so a second run over an already-coherent store
     * is a no-op — no dirty flag, no save, no backup churn. A genuinely-empty
     * knowledge store rebuilds to an empty-but-valid cache (no over-correction).
     *
     * Scope: rebuilds the two load-bearing, consumed fields only.
     * knowledge.totalCount is intentionally NOT touched here — it is deferred to a
     * follow-up that wires it as a real dashboard-surfaced field and unifies the
     * two divergent SyncState knowledge shapes. pendingCaptures and
     * deprecatedReferences are owned by the capture and deprecation lifecycles and
     * are likewise left untouched.
     *
     * @param entries - All knowledge entries from the DB (source-of-truth)
     * @param maxRecent - Cap for recentEntries (default 10, matches addRecentKnowledgeEntry)
     * @returns observability counts: entries considered, recent kept, WP groups, total links
     */
    rebuildKnowledgeCache(entries, maxRecent = 10) {
        // Most-recent-first by creation time; tie-break by id (descending) so the
        // ordering is fully deterministic even when timestamps collide.
        const byCreatedDesc = [...entries].sort((a, b) => b.created.localeCompare(a.created) || b.id.localeCompare(a.id));
        const recentEntries = byCreatedDesc.slice(0, maxRecent).map(e => e.id);
        // Group links by the entry's materialized workpackage_id. Entries with no WP
        // association (null/empty) are intentionally dropped — that is the recovery
        // property for stale links: an unlinked entry whose DB workpackage_id was
        // cleared no longer appears in the rebuilt map.
        const workpackageKnowledge = {};
        for (const e of byCreatedDesc) {
            const wpId = e.workpackageId;
            if (!wpId)
                continue;
            (workpackageKnowledge[wpId] ?? (workpackageKnowledge[wpId] = [])).push({
                id: e.id,
                workpackageId: wpId,
                phaseId: e.phaseId ?? '',
                title: e.title,
                linkedAt: e.created,
                linkedBy: 'auto',
                status: toLinkStatus(e.status),
                deprecation_type: e.deprecationType ?? null,
            });
        }
        // Replace only on actual change (idempotency) so an already-coherent store is a true no-op.
        const recentChanged = JSON.stringify(this.state.knowledge.recentEntries) !== JSON.stringify(recentEntries);
        const linksChanged = JSON.stringify(this.state.links.workpackageKnowledge) !== JSON.stringify(workpackageKnowledge);
        if (recentChanged) {
            this.state.knowledge.recentEntries = recentEntries;
        }
        if (linksChanged) {
            this.state.links.workpackageKnowledge = workpackageKnowledge;
        }
        if (recentChanged || linksChanged) {
            this.dirty = true;
        }
        return {
            entries: entries.length,
            recent: recentEntries.length,
            workpackages: Object.keys(workpackageKnowledge).length,
            links: Object.values(workpackageKnowledge).reduce((n, links) => n + links.length, 0),
        };
    }
    // ============================================================================
    // VALIDATION
    // ============================================================================
    /**
     * Validate sync state integrity
     *
     * Null-meaning contract (consumed by createSyncState in project-init.ts):
     *   - workpackage: null    → "no active WP yet" (fresh-init state)
     *   - plan: null           → "no plan created yet"
     *   - knowledge.recentEntries: []  → empty array (never null)
     *   - links: undefined     → "no cross-domain links yet" (fresh init may omit field entirely)
     *   - lastFullSync: null   → "no full sync ever performed"
     *
     * All accesses to nullable state blocks must guard for null/undefined to avoid
     * runtime crashes on freshly-initialized sync-state.json files.
     *
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
        // lastFullSync may be null = no full sync ever performed (fresh init);
        // only flag if the field is missing entirely (undefined) rather than
        // explicitly null per the null-meaning contract above.
        if (this.state.lastFullSync === undefined) {
            errors.push('Missing lastFullSync timestamp');
        }
        // Validate workpackage summary has systemId (null = no active WP yet, skip)
        if (this.state.workpackage &&
            this.state.workpackage.systemId &&
            !this.state.workpackage.systemId.startsWith('wp-') &&
            this.state.workpackage.systemId !== '') {
            errors.push(`Invalid workpackage systemId format: ${this.state.workpackage.systemId}`);
        }
        // Validate plan summary has phase systemId (null = no plan created yet, skip)
        if (this.state.plan &&
            this.state.plan.activePhaseSystemId &&
            !this.state.plan.activePhaseSystemId.startsWith('ph-') &&
            this.state.plan.activePhaseSystemId !== '') {
            errors.push(`Invalid phase systemId format: ${this.state.plan.activePhaseSystemId}`);
        }
        // Validate knowledge links have systemIds (links may be omitted on fresh init)
        if (this.state.links?.workpackageKnowledge) {
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
 * @returns SyncStateManager instance
 */
function createSyncStateManager(basePath) {
    const manager = new SyncStateManager(basePath);
    manager.load();
    return manager;
}
//# sourceMappingURL=context-hub.js.map