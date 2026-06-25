/**
 * Debug CLI for Cross-Domain Sync (WF-7)
 *
 * Provides validation commands for diagnosing and repairing CLEAR state issues.
 * Implements the /cf-debug slash command functionality.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.9.
 */
import { DebugReport, ValidationIssue, DebugDomain } from '../types';
/**
 * Options for debug validation
 */
export interface DebugOptions {
    /** Focus on a specific domain */
    domain?: DebugDomain;
    /** Attempt auto-repair of issues */
    repair?: boolean;
    /** Check dual-ID integrity specifically */
    checkIds?: boolean;
    /** Verbose output */
    verbose?: boolean;
}
/**
 * Repair result
 */
export interface RepairResult {
    /** Issues that were repaired */
    repaired: ValidationIssue[];
    /** Issues that could not be repaired */
    failed: ValidationIssue[];
}
/**
 * DebugCLI provides validation and repair functionality for CLEAR state.
 */
export declare class DebugCLI {
    private basePath;
    private clearDir;
    constructor(basePath: string);
    /**
     * Run full diagnostic validation
     * @param options - Debug options
     * @returns Debug report with all issues found
     */
    validate(options?: DebugOptions): Promise<DebugReport>;
    /**
     * Attempt to repair auto-repairable issues
     * @param report - Debug report with issues to repair
     * @returns Repair result
     */
    repair(report: DebugReport): Promise<RepairResult>;
    private validateSyncState;
    private validateWorkpackages;
    private validatePlan;
    private validateKnowledge;
    /**
     * Compare the sync-state knowledge cache against the index (disk truth) and
     * return a drift warning when the cache is EMPTY but the index is not. Returns
     * null when there is no sync-state, when it cannot be read, or when the cache is
     * coherent — so a healthy or fresh project surfaces nothing.
     *
     * Two empty-cache conditions, either of which is real drift:
     *   - recentEntries empty while the index has entries (the dashboard "Recent
     *     Knowledge" panel blanks out).
     *   - links.workpackageKnowledge empty while the index has WP-associated entries
     *     (knowledge-to-workpackage links silently absent).
     *
     * Scope: totalCount is not compared here — it is a deferred field, not a
     * runtime-consumed cache value.
     *
     * @param dbEntryCount - total entries in the index (already known to be > 0)
     * @param dbLinkedCount - index entries carrying a workpackage_id
     */
    private detectKnowledgeCacheDrift;
    private validateDualIds;
    /**
     * Validate cross-domain references - check that referenced entities exist
     * GAP-08: Enhanced to verify entity existence, not just format
     */
    private validateCrossDomainReferences;
    /**
     * Load all existing workpackage systemIds from registry
     */
    private loadWorkpackageSystemIds;
    /**
     * Load all existing phase systemIds from master-plan.yaml
     */
    private loadPhaseSystemIds;
    /**
     * Read plan.json's activePhaseId, or null if absent/unparseable. The cast is narrowed to
     * the only field these checks read: on-disk plan.json written by an older plugin version
     * may omit activePhaseId, so it is modeled optional rather than asserted via `as PlanState`
     * (which types it required and would mask the runtime gap).
     */
    private readPlanState;
    /** Read sync-state.json plan.activePhaseDisplayId, or undefined if absent/unparseable. */
    private readSyncActivePhaseDisplayId;
    /** Parse master-plan.yaml, or null if absent/unparseable (malformed is reported by validatePlan). */
    private readMasterPlan;
    /**
     * AC6-a: display-id referential integrity. Every phase REFERENCE — milestones[].phase,
     * master-plan activePhase, plan.json activePhaseId, sync-state activePhaseDisplayId —
     * must resolve to an existing phases[].id by exact match (every runtime consumer
     * compares by exact equality). A format variant ("phase_1" vs "Phase-1") is reported as
     * auto-repairable; a true orphan as a non-repairable error. Net-new vs
     * validateCrossDomainReferences() (which validates systemId existence, not display IDs).
     */
    private validatePhaseReferentialIntegrity;
    /**
     * Resolve a single phase REFERENCE against the plan's phases[].id set and push an issue for
     * a format-variant (auto-repairable) or a true orphan (non-repairable). Extracted from
     * validatePhaseReferentialIntegrity() so the dependencies (phaseIds, issues) are explicit
     * rather than captured by a nested closure.
     */
    private checkPhaseRef;
    /**
     * AC6-b: registry-vs-WP status + progress drift. READ-ONLY — reports only, never
     * mutates the registry (the registry-vs-WP status CORRECTION lives in reconcile-plan's
     * reconcileCheck1). The WP YAML is the source of truth for status; computed progress is
     * WorkpackageRegistryManager.calculateProgress(id).
     */
    private validateRegistryWpStatusDrift;
    /**
     * AC6-c: active-phase display-id format consistency across master-plan.yaml, plan.json,
     * and sync-state.json. Reports when the surfaces name the SAME logical phase (same
     * normalized key) in inconsistent literal formats. Surfaces naming genuinely DIFFERENT
     * phases are value divergence (reconcile-plan's reconcileCheck3 territory), not a format
     * issue, and are deliberately not reported here (avoids over-trigger / double-report).
     */
    private validatePhaseIdFormatConsistency;
    private repairIssue;
    /**
     * Repair position gaps in master-plan.yaml by renumbering sequentially
     * Preserves systemIds - only position values change
     */
    private repairPositionGaps;
    /**
     * Repair display-id referential/format drift (clawbox S11 AC6): normalize every
     * format-variant phase reference in master-plan.yaml to its canonical phases[].id (the
     * source of truth), then re-derive plan.json from the corrected master-plan. The shared
     * reconcileMasterPlanPhaseRefs() is the SAME normalization the read-only detector uses,
     * so detection and repair never disagree. sync-state.activePhaseDisplayId is a projection
     * re-derived from plan.json at the next reconcile-plan / session-start; debug --repair
     * fixes the master-plan SOT + plan.json, and reconcile-plan completes the cascade.
     */
    private repairPhaseReferentialIntegrity;
    private repairSyncState;
    private createDirectory;
    /**
     * Validate the Claude Code install wiring for CLEAR in this consumer project.
     *
     * Unlike the .clear/-state domains, this inspects the Claude Code install surface:
     *   (a) .claude/settings.json exists + is valid JSON
     *   (b) settings.json statusLine is a type:"command" entry pointing at the CLEAR
     *       statusline script, and that script exists + is executable
     *   (c) the CLEAR env vars are present — distinguished by WRITER:
     *         - the 5 hook kill-switches are written by /cf-init → missing is an ERROR,
     *           remediated by re-running /cf-init;
     *         - CLEAR_PLUGIN_ROOT is written by the SessionStart hook on the first session
     *           after init (post-restart), NOT by init → its absence is a WARNING (expected
     *           until restart), remediated by restarting Claude Code, NOT by re-running init.
     *
     * The two-writer distinction is deliberate: it prevents the install check from
     * false-flagging a freshly-initialized-but-not-yet-restarted project as broken.
     */
    private validateInstallation;
    /**
     * Read + validate .claude/settings.json to the InstallSettings shape. Pushes an error and
     * returns null if the file is missing, unreadable, or not a JSON object. JSON.parse output
     * is typed `unknown` and narrowed, never trusted directly (settings.json is user-editable).
     */
    private readInstallSettings;
    /**
     * Check the settings.json statusLine wiring: a type:"command" entry whose command targets
     * the CLEAR statusline script, and that the script exists + is executable. The endsWith
     * suffix guard is also the confinement check — fs.existsSync/statSync only run on a command
     * that has already been confirmed to be a string ending in the CLEAR script suffix.
     */
    private checkStatuslineWiring;
    /**
     * Check the CLEAR env vars in settings.json. Two distinct writers, two severities:
     *   - the 5 hook kill-switches are written by /cf-init → missing is an ERROR (re-run /cf-init);
     *   - CLEAR_PLUGIN_ROOT is persisted by the SessionStart hook on the first session after init
     *     (post-restart), NOT by init → absence is a WARNING (expected until restart), remediated
     *     by restarting Claude Code, NOT by re-running init.
     * The two-writer split prevents false-flagging a freshly-initialized-but-not-yet-restarted project.
     */
    private checkClearEnvVars;
    private clearDirExists;
    /**
     * Probe whether the better-sqlite3 native binding loads in THIS process. Opens an
     * in-memory database (no file, no plugin-root, no consumer data touched) — construction
     * throws when the native addon cannot load (the unbuilt-module signature). This is the
     * read-only DIAGNOSTIC probe; it is deliberately distinct from sqlite-bootstrap's
     * addonLoads(), which probes a resolved plugin-root module path via a subprocess while
     * DECIDING a download/rebuild during init. cf-debug owns the diagnostic surface; the
     * bootstrap owns the production install path.
     */
    private probeSqliteBinding;
    private getAuditStatus;
    private buildReport;
    /**
     * Format report for console output
     */
    formatReport(report: DebugReport): string;
}
/**
 * Main CLI entry point
 */
export declare function main(args: string[]): Promise<void>;
//# sourceMappingURL=debug-cli.d.ts.map