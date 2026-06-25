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
import { SyncState, SessionSummary, WorkpackageSummary, PreviousWorkpackage, PlanSummary, KnowledgeSummary, CrossDomainLinks, KnowledgeLink } from './types';
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
export declare function mergeOntoDefaults(parsed: Record<string, unknown>, defaults: Record<string, unknown>): {
    merged: Record<string, unknown>;
    added: boolean;
};
/**
 * Minimal projection of a knowledge entry needed to rebuild the denormalized
 * sync-state knowledge cache. Decouples the manager from the native knowledge
 * database: the caller (the reconcile-knowledge CLI op) opens the DB and maps
 * each entry to this shape, so context-hub stays free of the better-sqlite3
 * dependency.
 */
export interface KnowledgeRebuildSource {
    /** Knowledge entry ID (e.g. "TD-025") */
    id: string;
    /** Entry title */
    title: string;
    /** ISO 8601 creation timestamp (used to order recentEntries, most-recent-first) */
    created: string;
    /** Entry status (KnowledgeStatus); mapped onto the link-status union below */
    status: string;
    /** Owning workpackage systemId, or null/'' when the entry has no WP association */
    workpackageId: string | null;
    /** Owning phase systemId, or null when unset */
    phaseId: string | null;
    /** Deprecation classification carried onto the rebuilt link */
    deprecationType: 'obsolete' | 'superseded' | null;
}
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
export declare class SyncStateManager {
    private basePath;
    private state;
    private dirty;
    /**
     * Create a new SyncStateManager
     * @param basePath - Project root directory
     */
    constructor(basePath: string);
    /**
     * Get the full path to the sync state file
     */
    private getSyncStatePath;
    /**
     * Ensure the state directory exists
     */
    private ensureStateDir;
    /**
     * Load sync state from file
     * @returns True if loaded successfully, false if using defaults
     */
    load(): boolean;
    /**
     * Save sync state to file
     * @returns True if saved successfully
     */
    save(): boolean;
    /**
     * Check if there are unsaved changes
     */
    isDirty(): boolean;
    /**
     * Get the current sync state
     */
    getState(): SyncState;
    /**
     * Get session summary
     */
    getSessionSummary(): SessionSummary;
    /**
     * Get workpackage summary
     */
    getWorkpackageSummary(): WorkpackageSummary;
    /**
     * Get plan summary
     */
    getPlanSummary(): PlanSummary;
    /**
     * Get knowledge summary
     */
    getKnowledgeSummary(): KnowledgeSummary;
    /**
     * Get cross-domain links
     */
    getLinks(): CrossDomainLinks;
    /**
     * Update session summary
     * @param session - New session summary
     */
    updateSessionSummary(session: Partial<SessionSummary>): void;
    /**
     * Update workpackage summary. The `progress` field on WorkpackageSummary is
     * 0-100 percentage per the calculateProgress contract.
     * @param workpackage - New workpackage summary
     */
    updateWorkpackageSummary(workpackage: Partial<WorkpackageSummary>): void;
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
    clearActiveWorkpackage(): void;
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
    updatePreviousWorkpackage(prev: PreviousWorkpackage): void;
    /**
     * Clear the previous-workpackage snapshot. (WP-DF3 AC5 / S167 G5 fix)
     *
     * Use when the previously-paused WP is resumed OR when its identity is no
     * longer relevant (e.g., it was completed). Leaving stale data here would
     * mislead resume-context surfaces.
     */
    clearPreviousWorkpackage(): void;
    /**
     * Update plan summary
     * @param plan - New plan summary
     */
    updatePlanSummary(plan: Partial<PlanSummary>): void;
    /**
     * Update knowledge summary
     * @param knowledge - New knowledge summary
     */
    updateKnowledgeSummary(knowledge: Partial<KnowledgeSummary>): void;
    /**
     * Add a knowledge link
     * @param workpackageId - Workpackage systemId
     * @param link - Knowledge link to add
     */
    addKnowledgeLink(workpackageId: string, link: KnowledgeLink): void;
    /**
     * Remove a knowledge link
     * @param workpackageId - Workpackage systemId
     * @param knowledgeId - Knowledge entry ID to remove
     */
    removeKnowledgeLink(workpackageId: string, knowledgeId: string): void;
    /**
     * Update a knowledge link status
     * @param workpackageId - Workpackage systemId
     * @param knowledgeId - Knowledge entry ID
     * @param status - New status
     */
    updateKnowledgeLinkStatus(workpackageId: string, knowledgeId: string, status: KnowledgeLink['status']): void;
    /**
     * Get all knowledge links for a workpackage
     * @param workpackageId - Workpackage systemId
     * @returns Array of knowledge links
     */
    getKnowledgeLinksForWorkpackage(workpackageId: string): KnowledgeLink[];
    /**
     * Record a full sync
     */
    recordFullSync(): void;
    /**
     * Add a deprecated reference warning
     * @param knowledgeId - Knowledge entry ID that has deprecated reference
     */
    addDeprecatedReference(knowledgeId: string): void;
    /**
     * Remove a deprecated reference warning
     * @param knowledgeId - Knowledge entry ID
     */
    removeDeprecatedReference(knowledgeId: string): void;
    /**
     * Add a recent knowledge entry
     * @param knowledgeId - Knowledge entry ID
     * @param maxRecent - Maximum recent entries to keep (default 10)
     */
    addRecentKnowledgeEntry(knowledgeId: string, maxRecent?: number): void;
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
    rebuildKnowledgeCache(entries: KnowledgeRebuildSource[], maxRecent?: number): {
        entries: number;
        recent: number;
        workpackages: number;
        links: number;
    };
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
    validate(): string[];
    /**
     * Reset sync state to defaults
     */
    reset(): void;
    /**
     * Clear all knowledge links
     */
    clearKnowledgeLinks(): void;
    /**
     * Clear deprecated references
     */
    clearDeprecatedReferences(): void;
}
/**
 * Create a SyncStateManager instance
 * @param basePath - Project root directory
 * @returns SyncStateManager instance
 */
export declare function createSyncStateManager(basePath: string): SyncStateManager;
//# sourceMappingURL=context-hub.d.ts.map