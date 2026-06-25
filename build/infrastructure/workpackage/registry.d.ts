/**
 * Workpackage Registry
 *
 * Manages workpackage loading, dependency resolution, and progress tracking.
 * Updated Session 33 with Dual-ID Architecture support (P1.6).
 */
import { WorkpackageEntry, WorkpackageRegistry, WorkpackageRegistryEntry, WorkpackageState, WorkpackageStatus, DependencyValidationResult, CircularDependencyResult, ProgressResult, ScopeValidationResult } from './types';
import { ParseOptions } from './parser';
/**
 * Error thrown during registry operations
 */
export declare class WorkpackageRegistryError extends Error {
    readonly workpackageId?: string | undefined;
    readonly details?: Record<string, unknown> | undefined;
    constructor(message: string, workpackageId?: string | undefined, details?: Record<string, unknown> | undefined);
}
/**
 * Workpackage Registry Manager
 *
 * Dual-ID Architecture (P1.6): Supports both legacy display IDs and systemIds.
 * - Use getWorkpackage() for legacy id lookup (backward compatible)
 * - Use getWorkpackageBySystemId() for systemId lookup (preferred)
 * - Use resolveWorkpackage() to auto-detect ID type
 */
export declare class WorkpackageRegistryManager {
    private clearDir;
    private registry;
    /** Cache by legacy display ID */
    private workpackageCache;
    /** Cache by systemId (P1.6) */
    private systemIdCache;
    /** Map systemId → displayId for quick lookup */
    private systemIdToDisplayId;
    constructor(clearDir: string);
    /**
     * Get path to registry file
     */
    private get registryPath();
    /**
     * Get path to state file
     */
    private get statePath();
    /**
     * Load the registry
     */
    loadRegistry(): WorkpackageRegistry;
    /**
     * Get all workpackages from registry
     */
    getAllWorkpackages(): WorkpackageRegistryEntry[];
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
    getWorkpackage(id: string, options?: ParseOptions): WorkpackageEntry | null;
    /**
     * Get a workpackage by systemId (P1.6 Dual-ID Architecture)
     * @param systemId - System ID (e.g., "wp-a1b2c3d4")
     * @param options - Optional parser knobs (forwarded to getWorkpackage)
     * @returns Workpackage entry or null
     */
    getWorkpackageBySystemId(systemId: string, options?: ParseOptions): WorkpackageEntry | null;
    /**
     * Resolve a workpackage by either systemId or legacy display ID
     * Automatically detects which type of ID was provided
     * @param id - Either systemId (wp-*) or legacy display ID (P1.4)
     * @param options - Optional parser knobs (forwarded to the resolved getter)
     * @returns Workpackage entry or null
     */
    resolveWorkpackage(id: string, options?: ParseOptions): WorkpackageEntry | null;
    /**
     * Invalidate cached entries for a workpackage. Use after writing a repair
     * (update-cli tolerant-load path) so the next strict read picks up the
     * mutated YAML from disk rather than a stale strict-cached entry that
     * predates the repair.
     *
     * @param id - Display ID (e.g., "P1.4")
     */
    invalidateWorkpackageCache(id: string): void;
    /**
     * Get the display ID for a systemId
     * @param systemId - System ID (e.g., "wp-a1b2c3d4")
     * @returns Display ID (e.g., "P1.4") or null if not found
     */
    getDisplayIdForSystemId(systemId: string): string | null;
    /**
     * Get the systemId for a display ID
     * @param displayId - Display ID (e.g., "P1.4")
     * @returns System ID or null if not found/not migrated
     */
    getSystemIdForDisplayId(displayId: string): string | null;
    /**
     * Get workpackage status from registry
     */
    getWorkpackageStatus(id: string): WorkpackageStatus | null;
    /**
     * Load current state
     */
    loadState(): WorkpackageState;
    /**
     * Save state
     */
    saveState(state: WorkpackageState): void;
    /**
     * Get active workpackage ID
     */
    getActiveWorkpackageId(): string | null;
    /**
     * Get active workpackage (full definition)
     */
    getActiveWorkpackage(): WorkpackageEntry | null;
    /**
     * Set active workpackage
     * @param id - Either systemId (wp-*) or legacy display ID (P1.4)
     * @param sessionId - Current session ID
     * @returns Updated workpackage state
     */
    setActiveWorkpackage(id: string, sessionId: string): WorkpackageState;
    /**
     * Validate dependencies for a workpackage
     * @param id - Workpackage ID
     * @returns Validation result
     */
    validateDependencies(id: string): DependencyValidationResult;
    /**
     * Detect circular dependencies using DFS
     * @param id - Starting workpackage ID
     * @returns Detection result with cycle path if found
     */
    detectCircularDependencies(id: string): CircularDependencyResult;
    /**
     * Get workpackages that are ready to start (not blocked)
     */
    getUnblockedWorkpackages(): WorkpackageRegistryEntry[];
    /**
     * Get alternative workpackages when blocked
     */
    getAlternatives(blockedId: string): string[];
    /**
     * Resolve dependencies in topological order
     * @param id - Workpackage ID
     * @returns Ordered list of dependency IDs (dependencies first)
     */
    resolveDependencyOrder(id: string): string[];
    /** Weight multiplier for in_progress deliverables (50% contribution) */
    private static readonly IN_PROGRESS_WEIGHT_FACTOR;
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
    calculateProgress(id: string): ProgressResult;
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
    private updateDeliverableAndRecalculate;
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
    refreshProgressScalars(activeWorkpackageId: string, progress: number): void;
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
    private cascadeDeliverableStatusToYaml;
    /**
     * Mark a deliverable as in_progress (auto-triggered by PostToolUse hook on first file write).
     * No-op if already in_progress or complete.
     * @param deliverableId - Deliverable ID
     * @returns Updated progress (0-100 percentage)
     */
    markDeliverableInProgress(deliverableId: string): number;
    /**
     * Mark a deliverable as complete
     * @param deliverableId - Deliverable ID
     * @returns Updated progress (0-100 percentage)
     */
    markDeliverableComplete(deliverableId: string): number;
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
    checkInProgressDeliverablesForCompletion(projectRoot: string, writtenPath?: string): string[];
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
    countDeliverablesWithFilePresent(workpackage: WorkpackageEntry, projectRoot: string): number;
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
    countDeliverablesWithFileResolution(workpackage: WorkpackageEntry): number;
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
    private looksLikePattern;
    /**
     * Validate if a file is within workpackage scope
     * @param filePath - File path to check
     * @returns Scope validation result
     */
    validateScope(filePath: string): ScopeValidationResult;
    /**
     * Match a file path against a glob-like pattern
     */
    private matchesPattern;
    /**
     * Match a file against deliverable patterns
     * @param filePath - File path to check
     * @returns Matching deliverable ID or null
     */
    matchFileToDeliverable(filePath: string): string | null;
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
    private resolveDeliverableFilePath;
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
    private isPathShaped;
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
    updateRegistryEntryStatus(id: string, newStatus: WorkpackageStatus | null, newProgress?: number): void;
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
    updateRegistryEntryTitle(id: string, newTitle: string): void;
    /**
     * Clear all caches
     */
    clearCache(): void;
    /**
     * Check if all workpackages in registry have systemIds
     * @returns true if all workpackages have systemIds
     */
    allWorkpackagesHaveSystemIds(): boolean;
    /**
     * Get workpackages missing systemIds (for migration)
     * @returns Array of workpackage display IDs that need migration
     */
    getWorkpackagesMissingSystemIds(): string[];
    /**
     * Generate a systemId for a workpackage from its display ID
     * Uses deterministic hash for consistent migration
     * @param displayId - Display ID (e.g., "P1.4")
     * @returns Generated systemId
     */
    generateMigrationSystemId(displayId: string): string;
}
//# sourceMappingURL=registry.d.ts.map