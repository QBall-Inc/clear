"use strict";
/**
 * Workpackage Registry
 *
 * Manages workpackage loading, dependency resolution, and progress tracking.
 * Updated Session 33 with Dual-ID Architecture support (P1.6).
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
exports.WorkpackageRegistryManager = exports.WorkpackageRegistryError = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const parser_1 = require("./parser");
const types_1 = require("../sync/types");
/**
 * Error thrown during registry operations
 */
class WorkpackageRegistryError extends Error {
    constructor(message, workpackageId, details) {
        super(message);
        this.workpackageId = workpackageId;
        this.details = details;
        this.name = 'WorkpackageRegistryError';
    }
}
exports.WorkpackageRegistryError = WorkpackageRegistryError;
/**
 * Workpackage Registry Manager
 *
 * Dual-ID Architecture (P1.6): Supports both legacy display IDs and systemIds.
 * - Use getWorkpackage() for legacy id lookup (backward compatible)
 * - Use getWorkpackageBySystemId() for systemId lookup (preferred)
 * - Use resolveWorkpackage() to auto-detect ID type
 */
class WorkpackageRegistryManager {
    constructor(clearDir) {
        this.registry = null;
        /** Cache by legacy display ID */
        this.workpackageCache = new Map();
        /** Cache by systemId (P1.6) */
        this.systemIdCache = new Map();
        /** Map systemId → displayId for quick lookup */
        this.systemIdToDisplayId = new Map();
        this.clearDir = clearDir;
    }
    // ===========================================================================
    // Registry Loading
    // ===========================================================================
    /**
     * Get path to registry file
     */
    get registryPath() {
        return path.join(this.clearDir, 'workpackages', 'registry.yaml');
    }
    /**
     * Get path to state file
     */
    get statePath() {
        return path.join(this.clearDir, 'state', 'workpackage.json');
    }
    /**
     * Load the registry
     */
    loadRegistry() {
        if (!this.registry) {
            this.registry = (0, parser_1.parseRegistryFile)(this.registryPath);
        }
        return this.registry;
    }
    /**
     * Get all workpackages from registry
     */
    getAllWorkpackages() {
        return this.loadRegistry().workpackages;
    }
    /**
     * Get a workpackage by legacy display ID (loads full definition)
     *
     * @param id - Legacy display ID (e.g., "P1.4")
     * @param options - Optional parser knobs (see `ParseOptions` in parser.ts).
     *                  When `tolerantEnums: true`, the cache is BYPASSED (the
     *                  lenient parse must not contaminate later strict reads,
     *                  and the strict cache must not short-circuit the lenient
     *                  request). The tolerant entry is returned WITHOUT being
     *                  inserted into the cache.
     * @returns Workpackage entry or null
     */
    getWorkpackage(id, options = {}) {
        // Cache layer: strict reads can re-use cache; tolerant reads bypass it
        // entirely to avoid the two failure modes documented above.
        if (!options.tolerantEnums && this.workpackageCache.has(id)) {
            return this.workpackageCache.get(id);
        }
        // Find in registry
        const registry = this.loadRegistry();
        const entry = registry.workpackages.find(wp => wp.id === id);
        if (!entry) {
            return null;
        }
        // Load full definition — fall back to <id>.yaml if file field missing.
        // Confine the resolved path to the workpackages dir to defend against a
        // registry entry with a traversal-shaped file field (mirrors the guard in
        // refreshProgressScalars). Hardens every getWorkpackage caller.
        const fileName = entry.file || `${entry.id}.yaml`;
        const workpackagesDir = path.resolve(path.join(this.clearDir, 'workpackages'));
        const filePath = path.resolve(workpackagesDir, fileName);
        if (filePath !== workpackagesDir && !filePath.startsWith(workpackagesDir + path.sep)) {
            return null;
        }
        try {
            const workpackage = (0, parser_1.parseWorkpackageFile)(filePath, options);
            // Cache only strict reads. A tolerant entry may contain raw invalid
            // string values on type/priority (the user is in the middle of
            // repairing them); caching that would poison subsequent strict reads.
            if (!options.tolerantEnums) {
                this.workpackageCache.set(id, workpackage);
                // Also cache by systemId if available (P1.6)
                if (workpackage.systemId) {
                    this.systemIdCache.set(workpackage.systemId, workpackage);
                    this.systemIdToDisplayId.set(workpackage.systemId, workpackage.id);
                }
            }
            return workpackage;
        }
        catch (error) {
            // Three-way routing keeps swallow narrow:
            //   FILE_NOT_FOUND → null (absent WP YAML is "not yet created")
            //   other WorkpackageParseError codes → re-throw (content/schema problems)
            //   anything else → re-throw (unexpected runtime errors must surface)
            // The earlier two-way logic relied on `instanceof` short-circuiting, which
            // would have swallowed non-parse errors as null and hidden bugs.
            if (error instanceof parser_1.WorkpackageParseError) {
                if (error.errorCode !== 'FILE_NOT_FOUND') {
                    throw error;
                }
                console.error(`Failed to load workpackage ${id}:`, error);
                return null;
            }
            throw error;
        }
    }
    /**
     * Get a workpackage by systemId (P1.6 Dual-ID Architecture)
     * @param systemId - System ID (e.g., "wp-a1b2c3d4")
     * @param options - Optional parser knobs (forwarded to getWorkpackage)
     * @returns Workpackage entry or null
     */
    getWorkpackageBySystemId(systemId, options = {}) {
        // Cache bypass on tolerantEnums (matches getWorkpackage discipline).
        if (!options.tolerantEnums && this.systemIdCache.has(systemId)) {
            return this.systemIdCache.get(systemId);
        }
        // Find in registry by systemId
        const registry = this.loadRegistry();
        const entry = registry.workpackages.find(wp => wp.systemId === systemId);
        if (!entry) {
            return null;
        }
        // Load via display ID (which forwards options + caches strictly).
        return this.getWorkpackage(entry.id, options);
    }
    /**
     * Resolve a workpackage by either systemId or legacy display ID
     * Automatically detects which type of ID was provided
     * @param id - Either systemId (wp-*) or legacy display ID (P1.4)
     * @param options - Optional parser knobs (forwarded to the resolved getter)
     * @returns Workpackage entry or null
     */
    resolveWorkpackage(id, options = {}) {
        if ((0, types_1.isWorkpackageSystemId)(id)) {
            return this.getWorkpackageBySystemId(id, options);
        }
        return this.getWorkpackage(id, options);
    }
    /**
     * Invalidate cached entries for a workpackage. Use after writing a repair
     * (update-cli tolerant-load path) so the next strict read picks up the
     * mutated YAML from disk rather than a stale strict-cached entry that
     * predates the repair.
     *
     * @param id - Display ID (e.g., "P1.4")
     */
    invalidateWorkpackageCache(id) {
        const cached = this.workpackageCache.get(id);
        this.workpackageCache.delete(id);
        if (cached?.systemId) {
            this.systemIdCache.delete(cached.systemId);
            this.systemIdToDisplayId.delete(cached.systemId);
        }
    }
    /**
     * Get the display ID for a systemId
     * @param systemId - System ID (e.g., "wp-a1b2c3d4")
     * @returns Display ID (e.g., "P1.4") or null if not found
     */
    getDisplayIdForSystemId(systemId) {
        // Check cache first
        if (this.systemIdToDisplayId.has(systemId)) {
            return this.systemIdToDisplayId.get(systemId);
        }
        // Try to load the workpackage
        const workpackage = this.getWorkpackageBySystemId(systemId);
        return workpackage?.id ?? null;
    }
    /**
     * Get the systemId for a display ID
     * @param displayId - Display ID (e.g., "P1.4")
     * @returns System ID or null if not found/not migrated
     */
    getSystemIdForDisplayId(displayId) {
        const workpackage = this.getWorkpackage(displayId);
        return workpackage?.systemId ?? null;
    }
    /**
     * Get workpackage status from registry
     */
    getWorkpackageStatus(id) {
        const registry = this.loadRegistry();
        const entry = registry.workpackages.find(wp => wp.id === id);
        return entry?.status ?? null;
    }
    // ===========================================================================
    // State Management
    // ===========================================================================
    /**
     * Load current state
     */
    loadState() {
        return (0, parser_1.parseStateFile)(this.statePath);
    }
    /**
     * Save state
     */
    saveState(state) {
        (0, parser_1.writeStateFile)(this.statePath, state);
    }
    /**
     * Get active workpackage ID
     */
    getActiveWorkpackageId() {
        return this.loadState().activeWorkpackage;
    }
    /**
     * Get active workpackage (full definition)
     */
    getActiveWorkpackage() {
        const id = this.getActiveWorkpackageId();
        if (!id)
            return null;
        return this.getWorkpackage(id);
    }
    /**
     * Set active workpackage
     * @param id - Either systemId (wp-*) or legacy display ID (P1.4)
     * @param sessionId - Current session ID
     * @returns Updated workpackage state
     */
    setActiveWorkpackage(id, sessionId) {
        // Support both systemId and display ID
        const workpackage = this.resolveWorkpackage(id);
        if (!workpackage) {
            throw new WorkpackageRegistryError('Workpackage not found', id);
        }
        const now = new Date().toISOString();
        const state = {
            activeWorkpackage: workpackage.id, // Always store display ID for backward compat
            activeWorkpackageSystemId: workpackage.systemId ?? null, // Store systemId if available (P1.6)
            activePhaseSystemId: workpackage.phase ?? null, // Store phase systemId if available (P1.6)
            startedAt: now,
            lastActivity: now,
            progress: 0,
            deliverables: {},
            scopeWarnings: [],
            sessionId
        };
        // Initialize deliverable states
        for (const deliverable of workpackage.deliverables) {
            state.deliverables[deliverable.id] = {
                status: deliverable.status
            };
        }
        this.saveState(state);
        return state;
    }
    // ===========================================================================
    // Dependency Resolution
    // ===========================================================================
    /**
     * Validate dependencies for a workpackage
     * @param id - Workpackage ID
     * @returns Validation result
     */
    validateDependencies(id) {
        const workpackage = this.getWorkpackage(id);
        if (!workpackage) {
            return {
                valid: false,
                blockedBy: [],
                softBlocked: [],
                missingDeliverables: {}
            };
        }
        const blockedBy = [];
        const softBlocked = [];
        const missingDeliverables = {};
        for (const dep of workpackage.dependencies.upstream) {
            const status = this.getWorkpackageStatus(dep.id);
            // Archived workpackages are considered "done" (soft-deleted) and don't block
            if (status !== 'complete' && status !== 'archived') {
                if (dep.type === 'hard') {
                    blockedBy.push(dep.id);
                }
                else {
                    softBlocked.push(dep.id);
                }
            }
            // Check specific deliverables if required
            if (dep.deliverables_needed && dep.deliverables_needed.length > 0) {
                const depWorkpackage = this.getWorkpackage(dep.id);
                if (depWorkpackage) {
                    const missing = [];
                    for (const deliverableId of dep.deliverables_needed) {
                        const deliverable = depWorkpackage.deliverables.find(d => d.id === deliverableId);
                        if (!deliverable || deliverable.status !== 'complete') {
                            missing.push(deliverableId);
                        }
                    }
                    if (missing.length > 0) {
                        missingDeliverables[dep.id] = missing;
                        if (dep.type === 'hard' && !blockedBy.includes(dep.id)) {
                            blockedBy.push(dep.id);
                        }
                    }
                }
            }
        }
        return {
            valid: blockedBy.length === 0,
            blockedBy,
            softBlocked,
            missingDeliverables
        };
    }
    /**
     * Detect circular dependencies using DFS
     * @param id - Starting workpackage ID
     * @returns Detection result with cycle path if found
     */
    detectCircularDependencies(id) {
        const visited = new Set();
        const recursionStack = new Set();
        const path = [];
        const dfs = (currentId) => {
            visited.add(currentId);
            recursionStack.add(currentId);
            path.push(currentId);
            const workpackage = this.getWorkpackage(currentId);
            if (workpackage) {
                for (const dep of workpackage.dependencies.upstream) {
                    if (!visited.has(dep.id)) {
                        const cycle = dfs(dep.id);
                        if (cycle)
                            return cycle;
                    }
                    else if (recursionStack.has(dep.id)) {
                        // Found cycle - return the cycle path
                        const cycleStart = path.indexOf(dep.id);
                        return [...path.slice(cycleStart), dep.id];
                    }
                }
            }
            path.pop();
            recursionStack.delete(currentId);
            return null;
        };
        const cycle = dfs(id);
        return {
            hasCircular: cycle !== null,
            cycle: cycle || []
        };
    }
    /**
     * Get workpackages that are ready to start (not blocked)
     */
    getUnblockedWorkpackages() {
        const registry = this.loadRegistry();
        const unblocked = [];
        for (const entry of registry.workpackages) {
            if (entry.status === 'complete')
                continue;
            if (entry.status === 'blocked')
                continue;
            const validation = this.validateDependencies(entry.id);
            if (validation.valid) {
                unblocked.push(entry);
            }
        }
        return unblocked;
    }
    /**
     * Get alternative workpackages when blocked
     */
    getAlternatives(blockedId) {
        const unblocked = this.getUnblockedWorkpackages();
        return unblocked
            .filter(wp => wp.id !== blockedId)
            .map(wp => wp.id);
    }
    /**
     * Resolve dependencies in topological order
     * @param id - Workpackage ID
     * @returns Ordered list of dependency IDs (dependencies first)
     */
    resolveDependencyOrder(id) {
        const result = [];
        const visited = new Set();
        const visit = (currentId) => {
            if (visited.has(currentId))
                return;
            visited.add(currentId);
            const workpackage = this.getWorkpackage(currentId);
            if (workpackage) {
                for (const dep of workpackage.dependencies.upstream) {
                    visit(dep.id);
                }
            }
            result.push(currentId);
        };
        visit(id);
        return result;
    }
    /**
     * Calculate weighted progress for a workpackage.
     *
     * Sole conversion boundary for the WP progress unit: input is per-deliverable
     * weights (arbitrary scale), output is an integer 0-100 percentage. Every
     * downstream consumer of `ProgressResult.progress` (markers, state writes,
     * sync-state summaries, dashboard, CLIs) treats the value as 0-100 with no
     * further scaling.
     *
     * @param id - Workpackage ID
     * @returns ProgressResult with `progress` as integer 0-100 percentage
     */
    calculateProgress(id) {
        const workpackage = this.getWorkpackage(id);
        if (!workpackage) {
            return {
                progress: 0,
                completedDeliverables: [],
                pendingDeliverables: [],
                totalWeight: 0,
                completedWeight: 0
            };
        }
        const state = this.loadState();
        const deliverableStates = state.deliverables || {};
        let totalWeight = 0;
        let completedWeight = 0;
        const completedDeliverables = [];
        const pendingDeliverables = [];
        // Check if all weights are zero (legacy WPs created before R6.1)
        const allWeightsZero = workpackage.deliverables.every(d => d.weight === 0);
        const effectiveWeight = (w) => allWeightsZero ? 1 : w;
        for (const deliverable of workpackage.deliverables) {
            const weight = effectiveWeight(deliverable.weight);
            totalWeight += weight;
            const deliverableState = deliverableStates[deliverable.id];
            const status = deliverableState?.status ?? deliverable.status;
            if (status === 'complete') {
                completedWeight += weight;
                completedDeliverables.push(deliverable.id);
            }
            else if (status === 'in_progress') {
                completedWeight += weight * WorkpackageRegistryManager.IN_PROGRESS_WEIGHT_FACTOR;
                pendingDeliverables.push(deliverable.id);
            }
            else {
                pendingDeliverables.push(deliverable.id);
            }
        }
        const progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
        return {
            progress,
            completedDeliverables,
            pendingDeliverables,
            totalWeight,
            completedWeight
        };
    }
    /**
     * Update a deliverable's status and recalculate progress.
     *
     * Cascades the status change into the WP YAML's deliverables[i].status
     * (and completedAt on transitions in/out of 'complete'), so the state map
     * and the human-readable WP YAML stay in lockstep. Without this cascade,
     * auto-promote via PostToolUse would mutate only the state map and leave
     * the YAML stale — readers grepping the YAML for status fields see
     * not_started while the state map says in_progress / complete.
     *
     * Order matters: write the YAML first. A YAML-write failure throws before
     * any state-map mutation, so a partial write can't leave the two surfaces
     * disagreeing in the opposite direction.
     *
     * @param deliverableId - Deliverable ID
     * @param newState - New deliverable state to set
     * @returns Updated progress (0-100 percentage)
     */
    updateDeliverableAndRecalculate(deliverableId, newState) {
        const state = this.loadState();
        if (!state.activeWorkpackage) {
            throw new WorkpackageRegistryError('No active workpackage');
        }
        // Cascade the status into the WP YAML before mutating state. Throws on
        // resolution / serialization / write failure; state map remains intact.
        this.cascadeDeliverableStatusToYaml(state.activeWorkpackage, deliverableId, newState);
        state.deliverables[deliverableId] = newState;
        state.lastActivity = new Date().toISOString();
        // Save state FIRST so calculateProgress reads the updated values
        this.saveState(state);
        const progressResult = this.calculateProgress(state.activeWorkpackage);
        state.progress = progressResult.progress;
        this.saveState(state);
        // Refresh the two derived progress scalars (registry index + WP YAML) from the
        // recomputed value. Aggregate progress is derived from live deliverable states,
        // so these persisted scalars are kept as a cache that is rewritten on every
        // deliverable mutation — this is the single choke point through which all
        // deliverable status changes flow, so the three stores can never diverge.
        this.refreshProgressScalars(state.activeWorkpackage, progressResult.progress);
        return progressResult.progress;
    }
    /**
     * Rewrite the derived progress scalars in registry.yaml (the fast-read index)
     * and the per-workpackage YAML (the human-readable detail file) to match the
     * authoritative value computed by calculateProgress. Status is left untouched;
     * only the progress scalar is refreshed.
     *
     * Best-effort: a failure to refresh either scalar emits a stderr warning and
     * does not abort the mutation. The state map (the runtime source) has already
     * been saved by the caller, and calculateProgress recomputes from live
     * deliverable states regardless, so a stale scalar self-heals on the next
     * mutation. Failing the whole deliverable update on a cache-refresh hiccup
     * would be more disruptive than the transient display drift it guards against.
     *
     * Public so deliverable-mutation paths that bypass updateDeliverableAndRecalculate
     * (e.g. the update CLI's active-WP recompute, which drives calculateProgress with a
     * display ID to sidestep an internal systemId/displayId shape mismatch) can refresh
     * the same scalars and keep all three stores in lockstep.
     *
     * @param activeWorkpackageId - state.activeWorkpackage (systemId or displayId)
     * @param progress - Authoritative progress value (0-100) to write
     */
    refreshProgressScalars(activeWorkpackageId, progress) {
        // Registry index (store 1). Pass null status so only progress is rewritten.
        try {
            this.updateRegistryEntryStatus(activeWorkpackageId, null, progress);
        }
        catch (e) {
            process.stderr.write(`[clear] Skipping registry progress refresh for ${activeWorkpackageId}: ${e instanceof Error ? e.message : String(e)}\n`);
        }
        // Per-workpackage YAML detail file (store 2). Resolve a typed entry and the
        // file path the same way cascadeDeliverableStatusToYaml does, set the progress
        // scalar on the typed entry (status untouched), then write via the shared
        // atomic writer (temp-write + rename). The write is atomic so a crash mid-write
        // cannot leave a truncated detail file behind; this matters because this path
        // runs on every deliverable mutation. The resolved path is confined to the
        // workpackages dir to defend against a registry entry with a traversal-shaped
        // file field.
        try {
            const registryEntry = this.getAllWorkpackages().find(e => e.id === activeWorkpackageId || e.systemId === activeWorkpackageId);
            if (!registryEntry)
                return;
            const workpackagesDir = path.resolve(path.join(this.clearDir, 'workpackages'));
            const filePath = path.resolve(workpackagesDir, registryEntry.file);
            if (filePath !== workpackagesDir && !filePath.startsWith(workpackagesDir + path.sep)) {
                return;
            }
            if (!fs.existsSync(filePath))
                return;
            // Safe-by-construction: this method re-reads the entry then writes it back, so
            // it must never resolve a STALE cached entry — a caller (e.g. update-cli) may
            // have written a fresh deliverable status to disk WITHOUT invalidating the
            // cache, and rewriting the stale entry would clobber that just-written status.
            // The cache is keyed by display id AND by systemId, and activeWorkpackageId may
            // be either form, so flush both key forms symmetrically around the
            // re-resolve+write: before, to force a fresh on-disk read; after, to leave no
            // cached entry that predates this write.
            this.invalidateWorkpackageCache(registryEntry.id);
            this.invalidateWorkpackageCache(activeWorkpackageId);
            const wpEntry = this.resolveWorkpackage(activeWorkpackageId);
            if (!wpEntry)
                return;
            wpEntry.progress = progress;
            (0, parser_1.writeWorkpackageAtomic)(filePath, wpEntry);
            this.invalidateWorkpackageCache(registryEntry.id);
            this.invalidateWorkpackageCache(activeWorkpackageId);
        }
        catch (e) {
            process.stderr.write(`[clear] Skipping workpackage YAML progress refresh for ${activeWorkpackageId}: ${e instanceof Error ? e.message : String(e)}\n`);
        }
    }
    /**
     * Write the deliverable's new status into the active workpackage YAML.
     *
     * Looks up the active workpackage by systemId-or-displayId via resolveWorkpackage,
     * derives the YAML file path from the registry entry, finds the deliverable in
     * the workpackage's deliverables array, mutates target.status (and target.completedAt
     * to mirror the state-map invariant), then calls writeWorkpackageAtomic.
     *
     * After the YAML write lands, invalidates the workpackage cache so subsequent
     * strict reads pick up the new status from disk.
     *
     * Best-effort semantics on lookup degradation: resolveWorkpackage returning null
     * (missing WP YAML on disk), missing registry entry, or a deliverable id absent
     * from the WP YAML's deliverables array all emit a stderr warning and return
     * without writing. The state-map update proceeds at the caller — the cascade
     * cannot create state that the YAML doesn't already model, so silent skip is
     * the right semantics for those degraded paths (preserves the historical
     * "flexible deliverable management" contract documented at progress-cli's
     * non-existent-deliverable acceptance test). writeWorkpackageAtomic failures
     * (schema validation, disk error) propagate as real errors. A confinement
     * check on the resolved write path also throws if the registry entry's
     * `file` field would resolve outside the workpackages dir (defense against
     * a maliciously-authored registry.yaml with a traversal-shaped filename).
     *
     * @param activeWorkpackageId - state.activeWorkpackage (systemId or displayId)
     * @param deliverableId - Deliverable ID to mutate
     * @param newState - New deliverable state (status + optional completedAt)
     */
    cascadeDeliverableStatusToYaml(activeWorkpackageId, deliverableId, newState) {
        let wpEntry;
        try {
            wpEntry = this.resolveWorkpackage(activeWorkpackageId);
        }
        catch (e) {
            // Parse / schema error on the WP YAML — emit warning and skip cascade.
            // Schema-corrupted YAMLs already need operator attention; failing the
            // entire state mutation on top would be more disruptive than helpful.
            process.stderr.write(`[clear] Skipping WP YAML cascade for ${activeWorkpackageId}: ${e instanceof Error ? e.message : String(e)}. Run \`cf-debug validate-state\` to inspect.\n`);
            return;
        }
        if (!wpEntry) {
            // WP YAML missing on disk or registry entry stale. State map can still hold
            // the deliverable status; cascade has nothing to write into.
            process.stderr.write(`[clear] Skipping WP YAML cascade: active workpackage ${activeWorkpackageId} not found in registry. Run \`cf-debug validate-state\` to inspect. State map updated; YAML untouched.\n`);
            return;
        }
        // resolveWorkpackage succeeded → the registry entry for wpEntry.id exists
        // by construction (getWorkpackage looked it up). Match by display id only —
        // matching on systemId would false-positive on `undefined === undefined`
        // for legacy entries that lack a systemId.
        const registryEntry = this.getAllWorkpackages().find(e => e.id === wpEntry.id);
        if (!registryEntry) {
            // Defensive guard; in practice unreachable post-resolveWorkpackage success.
            process.stderr.write(`[clear] Skipping WP YAML cascade for ${wpEntry.id}: registry entry missing post-resolve. Run \`cf-debug validate-state\` to inspect.\n`);
            return;
        }
        const workpackagesDir = path.resolve(path.join(this.clearDir, 'workpackages'));
        const filePath = path.resolve(workpackagesDir, registryEntry.file);
        // Confinement: a maliciously-authored registry.yaml could set `file:` to
        // a traversal-shaped value (e.g., `../../etc/passwd.yaml`). Pattern
        // mirrors the file-presence-resolver confinement at line 762 + 791.
        if (filePath !== workpackagesDir && !filePath.startsWith(workpackagesDir + path.sep)) {
            process.stderr.write(`[clear] Skipping WP YAML cascade for ${wpEntry.id}: registry file field resolves outside workpackages dir. Run \`cf-debug validate-state\` to inspect.\n`);
            return;
        }
        const targetIdx = wpEntry.deliverables.findIndex(d => d.id === deliverableId);
        if (targetIdx === -1) {
            // Deliverable id not in the WP YAML — preserved as a silent skip per the
            // historical "flexible deliverable management" contract: progress-cli
            // sets state.deliverables[id] for any id the caller supplies, including
            // ids that don't appear in the WP YAML (the WP YAML stays authoritative
            // and the phantom state entry is ignored on next read).
            return;
        }
        const target = wpEntry.deliverables[targetIdx];
        target.status = newState.status;
        if (newState.status === 'complete') {
            target.completedAt = newState.completedAt || new Date().toISOString();
        }
        else if (target.completedAt) {
            // Reverting away from complete: stale completedAt would mislead progress
            // and audit views into thinking the deliverable is still done.
            delete target.completedAt;
        }
        (0, parser_1.writeWorkpackageAtomic)(filePath, wpEntry);
        this.invalidateWorkpackageCache(wpEntry.id);
    }
    /**
     * Mark a deliverable as in_progress (auto-triggered by PostToolUse hook on first file write).
     * No-op if already in_progress or complete.
     * @param deliverableId - Deliverable ID
     * @returns Updated progress (0-100 percentage)
     */
    markDeliverableInProgress(deliverableId) {
        const state = this.loadState();
        if (!state.activeWorkpackage) {
            throw new WorkpackageRegistryError('No active workpackage');
        }
        const existing = state.deliverables[deliverableId];
        if (existing?.status === 'in_progress' || existing?.status === 'complete') {
            const progressResult = this.calculateProgress(state.activeWorkpackage);
            return progressResult.progress;
        }
        return this.updateDeliverableAndRecalculate(deliverableId, { status: 'in_progress' });
    }
    /**
     * Mark a deliverable as complete
     * @param deliverableId - Deliverable ID
     * @returns Updated progress (0-100 percentage)
     */
    markDeliverableComplete(deliverableId) {
        return this.updateDeliverableAndRecalculate(deliverableId, {
            status: 'complete',
            completedAt: new Date().toISOString()
        });
    }
    /**
     * Sweep in_progress deliverables for the active workpackage and promote any whose
     * description-extracted file is present on disk to status='complete'.
     *
     * Scoping (writtenPath): on the per-write hook path, pass the file that was just
     * written. Completion is then confined to the SINGLE deliverable that `writtenPath`
     * maps to via matchFileToDeliverable — mirroring the path-gating the in_progress
     * half already applies. A tracked write to an unrelated file (which maps to no
     * deliverable) promotes nothing, so an unrelated edit can no longer spuriously
     * complete a deliverable whose target file merely happens to already exist on disk.
     * When `writtenPath` is omitted, the method performs the original GLOBAL disk sweep
     * over every in_progress deliverable — reserved BY CONVENTION for an explicit
     * reconcile/recompute "catch-up" path; the per-write hook must always pass writtenPath.
     *
     * Re-entrant on already-complete state: only deliverables currently at in_progress
     * are considered (already-complete and not_started are skipped by the outer filter),
     * so a repeated call promotes nothing new. Pattern-based
     * deliverables require explicit `--complete` — glob "all files exist" is out of
     * scope here. Path traversal is blocked by confining resolved paths to projectRoot.
     *
     * Stub-then-iterate caveat: writing a stub file will promote to complete. Revert
     * via the workpackage update CLI's per-deliverable status mutation.
     *
     * @param projectRoot - Path to project root (parent of clearDir); resolved internally
     * @param writtenPath - Optional file just written; when provided, completion is
     *   scoped to the deliverable that path maps to (per-write hook). Omit for the
     *   global catch-up sweep (reconcile path).
     * @returns Array of deliverable IDs that were promoted
     */
    checkInProgressDeliverablesForCompletion(projectRoot, writtenPath) {
        const state = this.loadState();
        if (!state.activeWorkpackage)
            return [];
        const workpackage = this.getWorkpackage(state.activeWorkpackage);
        if (!workpackage)
            return [];
        // Path-scoped mode: confine completion to the deliverable the written file maps
        // to. If the write matched no deliverable, there is nothing to complete.
        // Mode selection is by ARGUMENT PRESENCE, not value: any provided writtenPath
        // (including the degenerate '') enters scoped mode — '' matches no deliverable,
        // so it safely promotes nothing. ONLY an omitted argument selects the global
        // catch-up sweep, so a caller cannot accidentally trigger the global sweep by
        // passing an empty/falsy path.
        let scopedDeliverableId = null;
        if (writtenPath !== undefined) {
            scopedDeliverableId = this.matchFileToDeliverable(writtenPath);
            if (!scopedDeliverableId)
                return [];
        }
        const resolvedRoot = path.resolve(projectRoot);
        const promoted = [];
        for (const d of workpackage.deliverables) {
            // In path-scoped mode, only the matched deliverable is eligible.
            if (scopedDeliverableId !== null && d.id !== scopedDeliverableId)
                continue;
            if (state.deliverables[d.id]?.status !== 'in_progress')
                continue;
            const filePath = this.resolveDeliverableFilePath(d);
            if (!filePath)
                continue;
            const absolutePath = path.resolve(resolvedRoot, filePath);
            // Confinement check: skip paths that resolve outside the project root.
            // Description / pattern fields are human-authored and could legitimately
            // or maliciously contain `../` segments; treat that as a non-match
            // rather than promoting.
            if (absolutePath !== resolvedRoot && !absolutePath.startsWith(resolvedRoot + path.sep))
                continue;
            if (fs.existsSync(absolutePath)) {
                this.markDeliverableComplete(d.id);
                promoted.push(d.id);
            }
        }
        return promoted;
    }
    /**
     * Count deliverables of a workpackage whose resolved file is present on disk.
     * Resolution per resolveDeliverableFilePath: try `pattern` first (when
     * populated + path-shaped), fall back to extracting the leading path from
     * `description`. Used by `lifecycle-cli complete` summary to surface
     * file-presence count alongside the state-machine count.
     *
     * Takes a WorkpackageEntry directly rather than dereferencing state.activeWorkpackage
     * because callers (e.g., lifecycle-cli complete summary) run after the active state
     * has been cleared as part of the completion transition — relying on state at that
     * point would always return 0.
     *
     * @param workpackage - Workpackage entry whose deliverables to inspect
     * @param projectRoot - Path to project root (parent of clearDir); resolved internally
     * @returns Count of deliverables whose resolved file exists
     */
    countDeliverablesWithFilePresent(workpackage, projectRoot) {
        const resolvedRoot = path.resolve(projectRoot);
        let count = 0;
        for (const d of workpackage.deliverables) {
            const filePath = this.resolveDeliverableFilePath(d);
            if (!filePath)
                continue;
            const absolutePath = path.resolve(resolvedRoot, filePath);
            if (absolutePath !== resolvedRoot && !absolutePath.startsWith(resolvedRoot + path.sep))
                continue;
            if (fs.existsSync(absolutePath))
                count++;
        }
        return count;
    }
    /**
     * Count deliverables of a workpackage whose `pattern` or `description` field
     * yields a resolvable file path. Differs from countDeliverablesWithFilePresent
     * in that it does NOT check disk presence — it counts deliverables that COULD
     * be file-presence-tracked (vs description-only deliverables like "Voice/copy
     * audit across renderer" that yield null from resolveDeliverableFilePath).
     *
     * Takes a WorkpackageEntry directly rather than dereferencing state.activeWorkpackage
     * because callers (e.g., lifecycle-cli complete summary) run after the active state
     * has been cleared as part of the completion transition — relying on state at that
     * point would always return 0.
     *
     * Used by `lifecycle-cli complete` summary to decide whether the file-presence
     * line is informative (some deliverables file-resolvable) or noise (all
     * deliverables description-only, surface "(none configured)" message instead).
     *
     * @param workpackage - Workpackage entry whose deliverables to inspect
     * @returns Count of deliverables with a resolvable file-path hint
     */
    countDeliverablesWithFileResolution(workpackage) {
        let count = 0;
        for (const d of workpackage.deliverables) {
            if (this.resolveDeliverableFilePath(d))
                count++;
        }
        return count;
    }
    // ===========================================================================
    // Scope Validation
    // ===========================================================================
    /**
     * Determine if a scope item is a file-path pattern vs a natural-language description.
     * Patterns: contain `/`, `*`, `?`, or are a single token without spaces (e.g., `src/auth/**`,
     * `*.ts`, `auth`). Descriptions: contain whitespace AND none of the glob chars (e.g.,
     * `"240px fixed sidebar with Q-ball lockup"`).
     *
     * When in_scope contains any descriptive item, the pattern-enforcement branch is skipped
     * to preserve the auto-promotion contract for consumer YAMLs created via /cf-plan create
     * Track B / Bulwark plan-import / hand-authoring.
     */
    looksLikePattern(item) {
        if (item.includes('/') || item.includes('*') || item.includes('?')) {
            return true;
        }
        return !/\s/.test(item);
    }
    /**
     * Validate if a file is within workpackage scope
     * @param filePath - File path to check
     * @returns Scope validation result
     */
    validateScope(filePath) {
        const workpackage = this.getActiveWorkpackage();
        if (!workpackage) {
            return { valid: true, warnings: [], outOfScopeFiles: [] };
        }
        const normalizedPath = filePath.replace(/\\/g, '/');
        const warnings = [];
        const outOfScopeFiles = [];
        // Check if file matches out_of_scope patterns. Descriptive (natural-language) items are
        // skipped: matchesPattern would convert them to a regex that cannot meaningfully match
        // a file path, so they neither block nor inform.
        for (const pattern of workpackage.scope.out_of_scope) {
            if (!this.looksLikePattern(pattern))
                continue;
            if (this.matchesPattern(normalizedPath, pattern)) {
                outOfScopeFiles.push(filePath);
                warnings.push(`File ${filePath} is explicitly out of scope (matches: ${pattern})`);
            }
        }
        // In_scope enforcement: only enforce when in_scope is uniformly pattern-shaped. If any
        // item is descriptive, the user authored scope as features (not path globs) and the
        // pattern check is not meaningful — fall back to deliverable matching as the
        // canonical in-scope signal.
        const inScopeIsPatternBased = workpackage.scope.in_scope.length > 0
            && workpackage.scope.in_scope.every(item => this.looksLikePattern(item));
        if (inScopeIsPatternBased) {
            let matchesInScope = false;
            for (const pattern of workpackage.scope.in_scope) {
                if (this.matchesPattern(normalizedPath, pattern)) {
                    matchesInScope = true;
                    break;
                }
            }
            if (!matchesInScope) {
                outOfScopeFiles.push(filePath);
                warnings.push(`File ${filePath} does not match any in_scope patterns`);
            }
        }
        // Suggested workpackage lookup also honors looksLikePattern — descriptive in_scope on a
        // sibling WP cannot resolve a meaningful suggestion.
        let suggestedWorkpackage;
        if (outOfScopeFiles.length > 0) {
            for (const entry of this.getAllWorkpackages()) {
                const wp = this.getWorkpackage(entry.id);
                if (wp && wp.id !== workpackage.id) {
                    for (const pattern of wp.scope.in_scope) {
                        if (!this.looksLikePattern(pattern))
                            continue;
                        if (this.matchesPattern(normalizedPath, pattern)) {
                            suggestedWorkpackage = wp.id;
                            break;
                        }
                    }
                }
                if (suggestedWorkpackage)
                    break;
            }
        }
        return {
            valid: outOfScopeFiles.length === 0,
            warnings,
            outOfScopeFiles,
            suggestedWorkpackage
        };
    }
    /**
     * Match a file path against a glob-like pattern
     */
    matchesPattern(filePath, pattern) {
        // Convert glob pattern to regex
        // **/ matches any directory depth
        // * matches any characters except /
        const regexPattern = pattern
            .replace(/\*\*/g, '{{DOUBLE_STAR}}')
            .replace(/\*/g, '[^/]*')
            .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')
            .replace(/\//g, '\\/');
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(filePath);
    }
    /**
     * Match a file against deliverable patterns
     * @param filePath - File path to check
     * @returns Matching deliverable ID or null
     */
    matchFileToDeliverable(filePath) {
        const workpackage = this.getActiveWorkpackage();
        if (!workpackage)
            return null;
        const normalizedPath = filePath.replace(/\\/g, '/');
        for (const deliverable of workpackage.deliverables) {
            // Primary: match against explicit glob pattern
            if (deliverable.pattern && this.matchesPattern(normalizedPath, deliverable.pattern)) {
                return deliverable.id;
            }
            // Fallback: extract path from description (e.g., "src/foo/bar.ts — description")
            if (!deliverable.pattern) {
                const descPath = (0, parser_1.extractLeadingDeliverablePath)(deliverable.description);
                // Anchor the suffix match on a path-segment boundary: a descPath of
                // "foo.md" matches "dir/foo.md" (and the bare "foo.md") but NOT "barfoo.md".
                // A bare endsWith would false-match "barfoo.md" and, since this matcher now
                // also gates per-write completion, complete the WRONG deliverable.
                if (descPath && (normalizedPath === descPath || normalizedPath.endsWith('/' + descPath))) {
                    return deliverable.id;
                }
            }
        }
        return null;
    }
    /**
     * Resolve a deliverable's file-path hint by trying the `pattern` field first
     * (when populated and path-shaped), falling back to extracting the leading
     * path from `description`. Returns null when neither field yields a usable
     * path — the deliverable then sits outside file-presence accounting until
     * the author supplies one or the other.
     *
     * Two-field strategy rationale: parser.ts auto-wraps free-form `in_scope`
     * strings into `{pattern: '', description: <string>}`, so in practice
     * `description` carries the path for ~88% of consumer-authored deliverables;
     * `pattern` is the explicit override path when the author wanted to encode
     * a file the description doesn't name verbatim. Honoring `pattern` first
     * respects that explicit author intent on the rare-but-real entries that
     * use it.
     *
     * @param deliverable - Deliverable shape with pattern + description
     * @returns Extracted path or null
     */
    resolveDeliverableFilePath(deliverable) {
        const pattern = deliverable.pattern?.trim();
        if (pattern && this.isPathShaped(pattern)) {
            return pattern;
        }
        return (0, parser_1.extractLeadingDeliverablePath)(deliverable.description);
    }
    /**
     * Path-shape test for the `pattern` field. A value is path-shaped when it
     * contains a directory separator or a glob metacharacter (`*`, `?`, `{`, `[`)
     * — both mark an explicit author-written pattern — OR is a concrete path
     * token per the shared deliverable-path predicate (alphabetic file extension
     * or a curated extensionless build-file basename like Makefile). This keeps a
     * create-time-inferred pattern resolvable at read-time. Bare tokens without
     * separators, glob chars, an extension, or allowlist membership (e.g.,
     * `auth`, `setup`, version strings like `v1.0`) are not treated as paths:
     * they're typically tags/categories, and counting them as file paths would
     * yield false negatives against the filesystem check downstream.
     */
    isPathShaped(value) {
        if (/[/*?{[]/.test(value))
            return true;
        return (0, parser_1.isDeliverablePathToken)(value);
    }
    // ===========================================================================
    // Registry Mutation
    // ===========================================================================
    /**
     * Update a workpackage's status and/or progress in registry.yaml on disk.
     * Reads the registry file, updates the matching entry, and writes back.
     *
     * Pass `newStatus = null` to refresh the progress scalar only, leaving the
     * status field untouched. This is the progress-only write used when a
     * deliverable mutation recalculates aggregate progress without changing the
     * workpackage's lifecycle status — keeping the fast-read registry index in
     * lockstep with the live deliverable-derived value.
     *
     * @param id - Workpackage display ID or systemId
     * @param newStatus - New status to set, or null to leave status unchanged
     * @param newProgress - New progress value (0-100); omit to leave progress unchanged
     * @throws WorkpackageRegistryError if workpackage not found in registry file
     */
    updateRegistryEntryStatus(id, newStatus, newProgress) {
        const registryPath = this.registryPath;
        const content = fs.readFileSync(registryPath, 'utf-8');
        const registry = yaml.load(content, { schema: yaml.JSON_SCHEMA });
        const entry = registry.workpackages.find(wp => wp.id === id || wp.systemId === id);
        if (!entry) {
            throw new WorkpackageRegistryError('Workpackage not found in registry', id);
        }
        if (newStatus !== null) {
            entry.status = newStatus;
        }
        if (newProgress !== undefined) {
            entry.progress = newProgress;
        }
        fs.writeFileSync(registryPath, yaml.dump(registry), 'utf-8');
        // Invalidate cached registry so next load picks up the change
        this.registry = null;
    }
    /**
     * Update a workpackage's title in registry.yaml on disk (the fast-read index
     * mirror of the WP YAML title). Reads the registry file, updates the matching
     * entry's title, and writes back, preserving all other entry fields.
     *
     * Unlike status — which is deliberately NOT mirrored from a bare update-cli
     * write to preserve the single-completion-writer invariant — a title is a
     * display label with no lifecycle/sync semantics. status-cli lists titles from
     * this index, so the mirror is kept in lockstep with the WP YAML in the same
     * command (a stale mirror would show the old title until a full rebuild).
     *
     * @param id - Workpackage display ID or systemId
     * @param newTitle - New title to set
     * @throws WorkpackageRegistryError if workpackage not found in registry file
     */
    updateRegistryEntryTitle(id, newTitle) {
        const registryPath = this.registryPath;
        const content = fs.readFileSync(registryPath, 'utf-8');
        const registry = yaml.load(content, { schema: yaml.JSON_SCHEMA });
        const entry = registry.workpackages.find(wp => wp.id === id || wp.systemId === id);
        if (!entry) {
            throw new WorkpackageRegistryError('Workpackage not found in registry', id);
        }
        entry.title = newTitle;
        fs.writeFileSync(registryPath, yaml.dump(registry), 'utf-8');
        // Invalidate cached registry so next load picks up the change
        this.registry = null;
    }
    // ===========================================================================
    // Cache Management
    // ===========================================================================
    /**
     * Clear all caches
     */
    clearCache() {
        this.registry = null;
        this.workpackageCache.clear();
        this.systemIdCache.clear();
        this.systemIdToDisplayId.clear();
    }
    // ===========================================================================
    // Dual-ID Migration Helpers (P1.6)
    // ===========================================================================
    /**
     * Check if all workpackages in registry have systemIds
     * @returns true if all workpackages have systemIds
     */
    allWorkpackagesHaveSystemIds() {
        const registry = this.loadRegistry();
        return registry.workpackages.every(wp => wp.systemId && wp.systemId.startsWith('wp-'));
    }
    /**
     * Get workpackages missing systemIds (for migration)
     * @returns Array of workpackage display IDs that need migration
     */
    getWorkpackagesMissingSystemIds() {
        const registry = this.loadRegistry();
        return registry.workpackages
            .filter(wp => !wp.systemId || !wp.systemId.startsWith('wp-'))
            .map(wp => wp.id);
    }
    /**
     * Generate a systemId for a workpackage from its display ID
     * Uses deterministic hash for consistent migration
     * @param displayId - Display ID (e.g., "P1.4")
     * @returns Generated systemId
     */
    generateMigrationSystemId(displayId) {
        return (0, types_1.generateSystemIdFromLegacy)(displayId, 'workpackage');
    }
}
exports.WorkpackageRegistryManager = WorkpackageRegistryManager;
// ===========================================================================
// Progress Tracking
// ===========================================================================
/** Weight multiplier for in_progress deliverables (50% contribution) */
WorkpackageRegistryManager.IN_PROGRESS_WEIGHT_FACTOR = 0.5;
//# sourceMappingURL=registry.js.map