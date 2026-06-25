"use strict";
/**
 * Workpackage Lifecycle CLI (P2.7)
 *
 * Implements lifecycle management commands: start, pause, complete, delete
 * Based on P2.7 Feature Brief Sections 2.5-2.10
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
exports.ValidationError = exports.DependencyBlockedError = exports.WorkpackageNotFoundError = void 0;
exports.checkBlockingDependencies = checkBlockingDependencies;
exports.formatBlockers = formatBlockers;
exports.startCommand = startCommand;
exports.pauseCommand = pauseCommand;
exports.validateForCompletion = validateForCompletion;
exports.formatValidation = formatValidation;
exports.completeCommand = completeCommand;
exports.deleteCommand = deleteCommand;
exports.runLifecycleCLI = runLifecycleCLI;
const path = __importStar(require("path"));
const validation_1 = require("../../validation");
const registry_1 = require("../registry");
const types_1 = require("../types");
const state_machine_1 = require("../state-machine");
const status_cli_1 = require("./status-cli");
const progress_cli_1 = require("./progress-cli");
const audit_log_1 = require("../../sync/audit-log");
const plan_rollup_1 = require("../../sync/plan-rollup");
const plan_propagate_1 = require("../../sync/plan-propagate");
const parser_1 = require("../parser");
const context_hub_1 = require("../../sync/context-hub");
const deprecation_1 = require("../../sync/deprecation");
const registry_2 = require("../../plan/registry");
const update_cli_1 = require("../../plan/cli/update-cli");
// ==============================================================================
// ERROR TYPES
// ==============================================================================
/**
 * Error thrown when a workpackage is not found
 */
class WorkpackageNotFoundError extends Error {
    constructor(id) {
        super(`Workpackage not found: ${id}`);
        this.id = id;
        this.name = 'WorkpackageNotFoundError';
    }
}
exports.WorkpackageNotFoundError = WorkpackageNotFoundError;
/**
 * Error thrown when blocked by dependencies
 */
class DependencyBlockedError extends Error {
    constructor(blockers) {
        super(`Blocked by incomplete dependencies: ${blockers.join(', ')}`);
        this.blockers = blockers;
        this.name = 'DependencyBlockedError';
    }
}
exports.DependencyBlockedError = DependencyBlockedError;
/**
 * Error thrown when validation fails
 */
class ValidationError extends Error {
    constructor(message, issues) {
        super(message);
        this.issues = issues;
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
/**
 * Propagate a lifecycle state change across all four persistence stores.
 *
 * Execution order (AD9): YAML → registry → sync-state → rollup.
 * Each step is fire-and-log: failures are caught and logged to stderr
 * but do not block the lifecycle transition (NFR2).
 *
 * @param registry - Workpackage registry manager
 * @param target - Registry entry for the workpackage being updated
 * @param newStatus - Status to propagate
 * @param syncAction - How to update sync-state
 * @param options - Session context for rollup
 */
async function propagateLifecycleChange(registry, target, newStatus, syncAction, options, newProgress) {
    // System-preferred id is required for file paths and cross-domain refs (yaml file
    // name on disk; rollup correlation id consumed by audit log). User-facing stderr
    // messages use the display id via formatWorkpackageId so error output reads
    // "P5.1" rather than "wp-647a5f25".
    const targetSystemId = target.systemId || target.id;
    const targetDisplay = (0, types_1.formatWorkpackageId)(target, 'both');
    const clearDir = options.clearDir;
    // Step 1: WP YAML write-back (source of truth — AD1)
    try {
        const wpFileName = target.file || `${targetSystemId}.yaml`;
        const wpFilePath = path.join(clearDir, 'workpackages', wpFileName);
        (0, plan_propagate_1.updateWorkpackageFileStatus)(wpFilePath, newStatus, newProgress);
    }
    catch (err) {
        process.stderr.write(`[propagate] YAML write-back failed for ${targetDisplay}: ${err instanceof Error ? err.message : err}\n`);
    }
    // Step 2: registry.yaml update (fast-read index — AD1)
    try {
        registry.updateRegistryEntryStatus(target.id, newStatus, newProgress);
    }
    catch (err) {
        process.stderr.write(`[propagate] Registry update failed for ${targetDisplay}: ${err instanceof Error ? err.message : err}\n`);
    }
    // Step 3: sync-state update (conditional — AD4)
    try {
        if (syncAction === 'update') {
            // WP-DF3 AC3 (S167 G2 fix): populate full active-WP identity here too.
            // Previously only `status` flipped on lifecycle update, leaving displayId/
            // title/systemId stale between a mid-session WP switch and the next
            // progress-emitting PostToolUse. With this write, /cf-workpackage start B
            // immediately refreshes sync-state.workpackage to B's identity.
            const syncManager = new context_hub_1.SyncStateManager(options.basePath);
            syncManager.load();
            // Carry the freshly-computed progress (newProgress) into the dashboard
            // snapshot. Without it, a lifecycle update flipped status/identity but left
            // sync-state.workpackage.progress at its activation-time value, so the
            // session-start dashboard rendered a stale 0% for a WP whose true progress
            // had already climbed in the registry. Only set it when present, so a
            // transition with no progress in scope never overwrites the scalar with
            // undefined (updateWorkpackageSummary spreads the partial verbatim).
            syncManager.updateWorkpackageSummary({
                systemId: target.systemId || target.id,
                displayId: target.id,
                title: target.title,
                sessionId: options.sessionId,
                status: newStatus,
                ...(typeof newProgress === 'number' ? { progress: newProgress } : {}),
            });
            syncManager.save();
        }
        else if (syncAction === 'clear') {
            const syncManager = new context_hub_1.SyncStateManager(options.basePath);
            syncManager.load();
            syncManager.clearActiveWorkpackage();
            syncManager.save();
        }
        // syncAction === 'skip': no sync-state update
    }
    catch (err) {
        process.stderr.write(`[propagate] Sync-state update failed for ${targetDisplay}: ${err instanceof Error ? err.message : err}\n`);
    }
    // Step 4: Plan rollup (AD9 — last step)
    try {
        await (0, plan_rollup_1.rollupPlanProgress)({
            basePath: options.basePath,
            sessionId: options.sessionId,
            sessionNumber: options.sessionNumber,
            triggeredByWorkpackage: targetSystemId,
        });
    }
    catch (err) {
        process.stderr.write(`[propagate] Plan rollup failed for ${targetDisplay}: ${err instanceof Error ? err.message : err}\n`);
    }
}
// ==============================================================================
// REGISTRY-WALK RESILIENCE
// ==============================================================================
/**
 * Read one WP off the registry as part of a multi-WP walk, isolating
 * parse failures so a single bad-type WP doesn't abort the walk.
 *
 * Strict registry.getWorkpackage(id) throws WorkpackageParseError with
 * errorCode='SCHEMA_MISMATCH' when the loaded YAML's type or priority
 * fails enum validation. Informational walks (unblock-after-complete,
 * dependent-discovery for delete) treat that failure as a non-fatal
 * warning, push to the collector, and skip the entry.
 *
 * Returns null on parse failure (caller continues the walk) OR on
 * not-found (caller also skips — matches existing pre-DR2 semantics).
 *
 * @param registry - workpackage registry manager
 * @param entry - registry index entry (loaded already; safe to read .id)
 * @param warnings - collector that informational warnings accumulate into
 * @returns full WP entry, or null on any read failure
 */
function safeGetWorkpackageForWalk(registry, entry, warnings) {
    try {
        return registry.getWorkpackage(entry.id);
    }
    catch (err) {
        if (err instanceof parser_1.WorkpackageParseError && err.errorCode === 'SCHEMA_MISMATCH') {
            warnings.push({ displayId: entry.id, detail: err.message });
            return null;
        }
        // Other error classes (file I/O, unexpected runtime) re-throw — the
        // walk's caller must see them. SCHEMA_MISMATCH is the only enum-class
        // failure we isolate; everything else stays loud.
        throw err;
    }
}
/**
 * Format the consolidated stderr warning emitted at command exit when
 * a registry walk surfaced one or more corrupt-type/priority entries.
 *
 * Output shape (single line, even when many entries are affected):
 *   [lifecycle] WARNING: N workpackage(s) in registry have invalid
 *   type/priority. Repair via: update-cli <wp-id> --type=<valid>
 *   --priority=<valid>. Affected: P6.7 (Invalid type: bug), ...
 */
function formatCorruptRegistryWarning(warnings) {
    if (warnings.length === 0)
        return '';
    const affected = warnings
        .map(w => `${w.displayId} (${w.detail.replace(/\.$/, '')})`)
        .join(', ');
    return (`[lifecycle] WARNING: ${warnings.length} workpackage(s) in registry have ` +
        `invalid type/priority. Repair via: update-cli <wp-id> --type=<valid> ` +
        `--priority=<valid>. Affected: ${affected}\n`);
}
// ==============================================================================
// DEPENDENCY VALIDATION
// ==============================================================================
/**
 * Check for blocking dependencies
 */
function checkBlockingDependencies(registry, workpackageId) {
    const validation = registry.validateDependencies(workpackageId);
    const blockers = [];
    const entries = registry.getAllWorkpackages();
    for (const blockerId of validation.blockedBy) {
        const blocker = entries.find(e => e.id === blockerId || e.systemId === blockerId);
        if (blocker) {
            blockers.push({
                id: blocker.systemId || blocker.id,
                displayId: blocker.id,
                status: blocker.status,
                progress: blocker.progress ?? 0
            });
        }
    }
    return blockers;
}
/**
 * Format blockers for display
 */
function formatBlockers(blockers) {
    const lines = [];
    lines.push('⚠️ Blocked by incomplete dependencies:');
    lines.push('');
    for (const blocker of blockers) {
        const progressStr = blocker.progress > 0 ? ` (${(0, status_cli_1.formatProgress)(blocker.progress)})` : '';
        lines.push(`  ❌ ${blocker.displayId} (${blocker.status}${progressStr})`);
    }
    lines.push('');
    lines.push('Options:');
    lines.push('  1. Complete blocking dependencies first (recommended)');
    lines.push('  2. Run with --force to start anyway');
    return lines.join('\n');
}
// ==============================================================================
// START COMMAND
// ==============================================================================
/**
 * Start/activate a workpackage
 *
 * @param registry - Workpackage registry manager
 * @param targetId - Workpackage ID to start (display ID or system ID)
 * @param force - Skip dependency validation
 * @param auditLogger - Audit logger instance
 * @returns Start result
 */
async function startCommand(registry, targetId, force, auditLogger, options) {
    const entries = registry.getAllWorkpackages();
    const state = registry.loadState();
    // 1. Find target workpackage
    const target = entries.find(e => e.id === targetId || e.systemId === targetId);
    if (!target) {
        throw new WorkpackageNotFoundError(targetId);
    }
    // 2. Check target status
    if (target.status === 'complete') {
        throw new state_machine_1.InvalidTransitionError(target.status, 'in_progress', 'Cannot start a completed workpackage');
    }
    if (target.status === 'archived') {
        throw new state_machine_1.InvalidTransitionError(target.status, 'in_progress', 'Cannot start an archived workpackage');
    }
    // Check if this is already the active workpackage (via state, not entry status)
    // Guard: only compare systemIds when both are defined to avoid undefined === undefined match
    const isActiveById = state.activeWorkpackage === target.id;
    const isActiveBySystemId = state.activeWorkpackageSystemId != null && target.systemId != null && state.activeWorkpackageSystemId === target.systemId;
    if (isActiveById || isActiveBySystemId) {
        return {
            success: true,
            workpackage: { ...target, status: 'in_progress' },
            forcedStart: false,
            message: `📦 ${target.id} "${target.title}" is already active`
        };
    }
    // 3. Validate transition
    if (!(0, state_machine_1.canStart)(target.status)) {
        throw new state_machine_1.InvalidTransitionError(target.status, 'in_progress', 'Cannot start from current status');
    }
    // 4. Check dependencies
    const blockers = checkBlockingDependencies(registry, target.id);
    if (blockers.length > 0 && !force) {
        throw new DependencyBlockedError(blockers.map(b => b.displayId));
    }
    const correlationId = auditLogger.generateCorrelationId();
    const now = new Date().toISOString();
    let previouslyPaused;
    // Load the full WorkpackageEntry (target is a lightweight RegistryEntry without deliverables).
    // Done BEFORE pause/audit/state mutation so a failure here cannot leave state in a partially-
    // mutated form (pause audit logged but new WP not initialized). Fail-fast per CS3 — silent
    // fallback to an empty deliverables map would re-create the auto-promotion failure mode this
    // helper is intended to prevent (state.deliverables[id] would be undefined, and the no-op
    // check at registry.markDeliverableInProgress would let the first write transition through).
    const fullTarget = registry.getWorkpackage(target.id);
    if (!fullTarget) {
        throw new WorkpackageNotFoundError(target.id);
    }
    // 5. Handle current active workpackage (state was loaded at start)
    if (state.activeWorkpackage && state.activeWorkpackage !== target.id) {
        const currentActive = entries.find(e => e.id === state.activeWorkpackage);
        if (currentActive) {
            // Pause current workpackage
            // Note: status mutation is in-memory only (for result/display); persisted via state file
            previouslyPaused = { ...currentActive, status: 'in_progress' };
            currentActive.status = 'paused';
            // Log pause audit entry
            auditLogger.logUpdate('workpackage', 'update', currentActive.systemId || currentActive.id, {
                targetDisplayId: currentActive.id,
                oldValue: { status: 'in_progress' },
                newValue: { status: 'paused' },
                trigger: 'user_prompt',
                correlationId,
                metadata: {
                    reason: 'switched_to_new_wp',
                    progressAtPause: currentActive.progress ?? 0,
                    switchedTo: target.id
                }
            });
        }
    }
    // 6. Activate target
    // Note: status mutation is in-memory only (for result/display); persisted via state file
    const oldStatus = target.status;
    target.status = 'in_progress';
    if (!target.startedAt) {
        target.startedAt = now;
    }
    // 7. Update state. fullTarget loaded above (pre-mutation, fail-fast).
    const initialDeliverables = {};
    for (const deliverable of fullTarget.deliverables) {
        initialDeliverables[deliverable.id] = { status: deliverable.status };
    }
    const newState = {
        activeWorkpackage: target.id,
        activeWorkpackageSystemId: target.systemId ?? null,
        activePhaseSystemId: target.phase ?? null,
        startedAt: target.startedAt || now,
        lastActivity: now,
        progress: target.progress ?? 0,
        deliverables: initialDeliverables,
        scopeWarnings: [],
        sessionId: auditLogger.getSessionId()
    };
    registry.saveState(newState);
    // 8. Log activation audit entry
    auditLogger.logUpdate('workpackage', 'update', target.systemId || target.id, {
        targetDisplayId: target.id,
        oldValue: { status: oldStatus },
        newValue: { status: 'in_progress' },
        trigger: 'user_prompt',
        correlationId
    });
    // 9. Propagate state changes (R4.2b — BUG-012 fix)
    if (options) {
        // Auto-pause: propagate paused status for previous WP (skip sync-state — not active).
        // Don't overwrite progress: the paused WP's last-known progress is what was already there.
        if (previouslyPaused) {
            await propagateLifecycleChange(registry, previouslyPaused, 'paused', 'skip', options);
            // WP-DF3 AC5 (S167 G5 fix): snapshot the paused WP into sync-state so
            // resume-context surfaces can render "Previously you were working on X,
            // paused at N%". The block had zero writers prior to this.
            try {
                const syncManager = new context_hub_1.SyncStateManager(options.basePath);
                syncManager.load();
                syncManager.updatePreviousWorkpackage({
                    systemId: previouslyPaused.systemId || previouslyPaused.id,
                    displayId: previouslyPaused.id,
                    pausedAt: now,
                    progressAtPause: previouslyPaused.progress ?? 0,
                    reason: 'switched_to_new_wp',
                });
                syncManager.save();
            }
            catch (err) {
                process.stderr.write(`[lifecycle] previousWorkpackage snapshot failed (auto-pause): ${err instanceof Error ? err.message : err}\n`);
            }
        }
        // Derive the propagated progress from the WP's true deliverable/AC state via
        // the single computation source (calculateProgress), instead of positionally
        // assigning 0 on any non-paused start. The old `: 0` branch zeroed the
        // propagated scalar for BOTH a re-started in_progress WP (real progress lost)
        // AND a not_started WP carrying already-complete deliverables — both now
        // report their true computed progress. A genuinely fresh not_started WP with
        // no completed deliverables still computes 0 naturally. The in-memory
        // state.progress saved in newState above was never the problem; the spurious 0
        // only ever lived in this propagated scalar. calculateProgress reads the
        // just-saved deliverable states and returns an integer 0-100.
        const startProgress = registry.calculateProgress(target.id).progress;
        await propagateLifecycleChange(registry, target, 'in_progress', 'update', options, startProgress);
        // WP-DF3 AC5 (S167 G5 fix): when the started target was itself the
        // previously-paused WP, clear the previousWorkpackage block — resuming X
        // means X is no longer "previous." This avoids stale snapshots.
        if (oldStatus === 'paused') {
            try {
                const syncManager = new context_hub_1.SyncStateManager(options.basePath);
                syncManager.load();
                const prev = syncManager.getState().previousWorkpackage;
                if (prev && (prev.systemId === (target.systemId || target.id) || prev.displayId === target.id)) {
                    syncManager.clearPreviousWorkpackage();
                    syncManager.save();
                }
            }
            catch (err) {
                process.stderr.write(`[lifecycle] previousWorkpackage clear-on-resume failed: ${err instanceof Error ? err.message : err}\n`);
            }
        }
    }
    // 10. Auto-advance plan activePhase (POST-30 fix)
    if (options && target.phase) {
        try {
            const planRegistry = new registry_2.PlanRegistryManager(options.clearDir);
            // updateActivePhase returns an UpdateOutput with status 'success' |
            // 'error' | 'no_plan'. The catch block only fires on throws — error-
            // return statuses (phase-not-found, write-back failure) would otherwise
            // be silently dropped. Surface them to stderr so operators see why
            // activePhase didn't advance.
            const advanceResult = (0, update_cli_1.updateActivePhase)(planRegistry, target.phase, options.basePath);
            if (advanceResult.status === 'error') {
                // `advanceResult.error` is `string | undefined` on the error branch;
                // fall back so the stderr line never emits the literal "undefined".
                process.stderr.write(`[lifecycle] activePhase advance error: ${advanceResult.error ?? 'unknown'}\n`);
            }
        }
        catch (err) {
            process.stderr.write(`[lifecycle] activePhase advance failed: ${err instanceof Error ? err.message : err}\n`);
        }
    }
    // 11. Build result message
    let message = `✅ ${target.id} "${target.title}" now active`;
    if (previouslyPaused) {
        message += `\n   ${previouslyPaused.id} paused at ${(0, status_cli_1.formatProgress)(previouslyPaused.progress ?? 0)}`;
    }
    if (blockers.length > 0 && force) {
        message += `\n⚠️ Started with ${blockers.length} incomplete dependencies (--force used)`;
    }
    return {
        success: true,
        workpackage: target,
        previouslyPaused,
        forcedStart: force && blockers.length > 0,
        blockers: blockers.length > 0 ? blockers.map(b => b.displayId) : undefined,
        message
    };
}
// ==============================================================================
// PAUSE COMMAND
// ==============================================================================
/**
 * Pause the current active workpackage
 *
 * @param registry - Workpackage registry manager
 * @param auditLogger - Audit logger instance
 * @param reason - Reason for pause
 * @returns Pause result
 */
async function pauseCommand(registry, auditLogger, reason = 'user_explicit_pause', options) {
    const state = registry.loadState();
    const entries = registry.getAllWorkpackages();
    // 1. Check if there's an active workpackage
    if (!state.activeWorkpackage) {
        return {
            success: false,
            progressAtPause: 0,
            message: 'No active workpackage to pause.\n\nUse `/cf-workpackage list` to see available workpackages.'
        };
    }
    // 2. Find the active workpackage
    const active = entries.find(e => e.id === state.activeWorkpackage);
    if (!active) {
        return {
            success: false,
            progressAtPause: 0,
            message: `Active workpackage ${state.activeWorkpackage} not found in registry.`
        };
    }
    // 3. Validate transition - if in state.activeWorkpackage, it's effectively in_progress
    // The entry.status from registry file may not reflect runtime status
    // Since we confirmed state.activeWorkpackage === active.id, we can pause it
    // 4. Pause the workpackage
    // Note: status mutation is in-memory only (for result/display); persisted via state file
    // RC1C (POST-47): Math.max guards against the `?? ?? 0` precedence bug — `0 ?? Y`
    // returns 0, so a stale registry 0 would mask a fresher state value at pause time.
    const progressAtPause = Math.max(active.progress ?? 0, state.progress ?? 0);
    active.status = 'paused';
    // 5. Log audit entry
    auditLogger.logUpdate('workpackage', 'update', active.systemId || active.id, {
        targetDisplayId: active.id,
        oldValue: { status: 'in_progress' },
        newValue: { status: 'paused' },
        trigger: reason === 'user_explicit_pause' ? 'user_prompt' : 'auto_sync',
        metadata: {
            reason,
            progressAtPause
        }
    });
    // 6. Update state to no active workpackage
    const newState = {
        activeWorkpackage: null,
        activeWorkpackageSystemId: null,
        activePhaseSystemId: null,
        startedAt: null,
        lastActivity: new Date().toISOString(),
        progress: 0,
        deliverables: {},
        scopeWarnings: [],
        sessionId: state.sessionId
    };
    registry.saveState(newState);
    // 7. Propagate state changes.
    // Clear sync-state: no active WP after pause. state.progress is 0-100 per the
    // calculateProgress contract.
    // Source asymmetry vs start: start sources progress LIVE from
    // registry.calculateProgress(target.id), whereas pause snapshots the value
    // already persisted in workpackage.json (state.progress) — the WP is being
    // deactivated here, so the last-written scalar IS the intended progress-at-pause.
    if (options) {
        const pausedProgressPercent = Math.round(state.progress ?? 0);
        await propagateLifecycleChange(registry, active, 'paused', 'clear', options, pausedProgressPercent);
        // Snapshot the paused WP into sync-state so a future start can show
        // "Resuming X (was paused at N%)". The reason carries the user's pause
        // intent (explicit vs end-of-session) for downstream messaging.
        try {
            const syncManager = new context_hub_1.SyncStateManager(options.basePath);
            syncManager.load();
            syncManager.updatePreviousWorkpackage({
                systemId: active.systemId || active.id,
                displayId: active.id,
                pausedAt: new Date().toISOString(),
                progressAtPause: pausedProgressPercent,
                reason,
            });
            syncManager.save();
        }
        catch (err) {
            process.stderr.write(`[lifecycle] previousWorkpackage snapshot failed (pause): ${err instanceof Error ? err.message : err}\n`);
        }
    }
    return {
        success: true,
        workpackage: active,
        progressAtPause,
        message: `✅ ${active.id} "${active.title}" paused at ${(0, status_cli_1.formatProgress)(progressAtPause)}\n\nNo active workpackage. Use \`/cf-workpackage start <id>\` to activate.`
    };
}
/**
 * Validate if a workpackage can be completed
 */
function validateForCompletion(registry, workpackage) {
    const issues = [];
    const warnings = [];
    const full = registry.getWorkpackage(workpackage.id);
    const state = registry.loadState();
    // Count deliverables — merge YAML status with state file status (state file tracks
    // runtime completions). Computed first because both the deliverable-completeness
    // check and the progress check below are meaningful only when the workpackage has
    // deliverables to derive progress from.
    let deliverablesComplete = 0;
    let deliverablesTotal = 0;
    if (full?.deliverables) {
        deliverablesTotal = full.deliverables.length;
        deliverablesComplete = full.deliverables.filter(d => {
            // Check state file first (runtime completions), fall back to YAML status
            const stateDeliverable = state.deliverables[d.id];
            return (stateDeliverable?.status === 'complete') || d.status === 'complete';
        }).length;
    }
    // Check progress — recompute live from deliverable states rather than trusting a
    // cached scalar. The completion gate must be authoritative: a stale or hand-set
    // scalar must not be able to wave a workpackage through. Aggregate progress is
    // derived from deliverables, so it only gates completion when deliverables exist.
    // A workpackage with zero deliverables derives progress 0 (no deliverables to
    // weigh) and is gated on its dependencies + explicit completion alone — it must
    // stay completable, so neither the progress nor the deliverable check applies.
    const progress = registry.calculateProgress(workpackage.id).progress;
    if (deliverablesTotal > 0) {
        // Incomplete deliverables BLOCK completion. This is the actionable root cause —
        // progress is derived from deliverable states, so progress < 100 here is a
        // consequence of the incomplete deliverables, not a separate problem. Emit only
        // the deliverable issue in that case to keep the failure actionable.
        if (deliverablesComplete < deliverablesTotal) {
            issues.push(`Deliverables: ${deliverablesComplete}/${deliverablesTotal} complete (expected all complete)`);
        }
        else if (progress < 100) {
            // All deliverables read complete but the derived progress still lags — a stale
            // computed value. Surface it as the sole signal here.
            issues.push(`Progress: ${(0, status_cli_1.formatProgress)(progress)} (expected 100%)`);
        }
    }
    // Check dependencies
    const validation = registry.validateDependencies(workpackage.id);
    const depsTotal = full?.dependencies.upstream.length ?? 0;
    const depsComplete = depsTotal - validation.blockedBy.length;
    if (validation.blockedBy.length > 0) {
        issues.push(`Dependencies: ${validation.blockedBy.join(', ')} incomplete`);
    }
    return {
        valid: issues.length === 0,
        issues,
        warnings,
        progress,
        deliverablesComplete,
        deliverablesTotal,
        depsComplete,
        depsTotal
    };
}
/**
 * Format validation result for display
 */
function formatValidation(validation, workpackageId) {
    const lines = [];
    if (validation.valid) {
        lines.push(`✅ ${workpackageId} is ready for completion`);
        lines.push('');
        lines.push('Checklist:');
        lines.push(`  ✅ Dependencies: ${validation.depsComplete}/${validation.depsTotal} complete`);
        lines.push(`  ✅ Progress: ${(0, status_cli_1.formatProgress)(validation.progress)}`);
        if (validation.deliverablesTotal > 0) {
            lines.push(`  ✅ Deliverables: ${validation.deliverablesComplete}/${validation.deliverablesTotal} complete`);
        }
        lines.push('');
        lines.push('Run `/cf-workpackage complete` to finalize.');
    }
    else {
        lines.push(`❌ ${workpackageId} cannot be completed yet`);
        lines.push('');
        lines.push('Issues:');
        for (const issue of validation.issues) {
            lines.push(`  ❌ ${issue}`);
        }
        for (const warning of validation.warnings) {
            lines.push(`  ⚠️ ${warning}`);
        }
        if (validation.depsComplete === validation.depsTotal && validation.depsTotal > 0) {
            lines.push(`  ✅ Dependencies: ${validation.depsComplete}/${validation.depsTotal} complete`);
        }
        lines.push('');
        lines.push('To fix:');
        if (validation.deliverablesComplete < validation.deliverablesTotal) {
            // Genuinely incomplete deliverables are the root cause. Direct the user to
            // complete them — do NOT suggest `--set 100`, which would sweep every
            // deliverable to complete and mask the real unfinished state.
            lines.push('  - Mark each remaining deliverable complete: `/cf-workpackage update <id> --status=complete`');
        }
        else if (validation.progress < 100) {
            // Deliverables all complete but derived progress still lags (stale scalar) —
            // a sweep is the correct remedy here.
            lines.push('  - Recompute progress: `/cf-workpackage progress --set 100`');
        }
        lines.push('  - Or run `/cf-workpackage complete --force` to override');
    }
    return lines.join('\n');
}
/**
 * Read a workpackage's status from the WP YAML (the declared source of truth).
 *
 * The registry index (getAllWorkpackages) is the enumeration surface but a
 * drifting MIRROR; the per-WP YAML is the status SOT. Returns:
 *   - the WP-YAML status when the YAML parses;
 *   - the registry-mirror status when the YAML is ABSENT (getWorkpackage returns
 *     null for FILE_NOT_FOUND — there is no SOT file to contradict the mirror);
 *   - null when the YAML EXISTS but cannot be parsed (a content/schema error
 *     that getWorkpackage re-throws).
 *
 * A null (unreadable SOT) MUST be handled by callers with a SAFE default —
 * never by trusting the drifting mirror, and never by aborting the whole
 * command on one bad sibling. The natural null-comparisons at the call sites do
 * exactly this: `status !== 'complete'` keeps the active path completable, and
 * `status === 'in_progress'` is false, so an unparseable WP is excluded from the
 * in_progress count rather than miscounted via its (possibly stale) mirror.
 */
function readWorkpackageSotStatus(registry, entry) {
    try {
        const wp = registry.getWorkpackage(entry.id);
        return wp ? wp.status : entry.status;
    }
    catch {
        return null;
    }
}
/**
 * Resolve the target workpackage for `complete` via three ordered branches:
 *
 *   1. Explicit id (positional arg) — wins outright; a not-found explicit id is
 *      an actionable failure, never a silent no-op.
 *   2. state.activeWorkpackage when set — the healthy path (unchanged). The
 *      stale/deleted-id guard is preserved; additionally, an already-complete
 *      active pointer (stale state drift) falls through to branch 3 rather than
 *      silently re-completing (complete has no re-entry guard of its own).
 *   3. The unique in_progress workpackage — enumerated off the registry mirror
 *      but COUNTED/SELECTED against each candidate's WP-YAML status (the SOT),
 *      so a mirror-vs-YAML drift cannot miscount or auto-pick a drifted entry.
 *      Zero in_progress → actionable no-op; exactly one → it is the target;
 *      more than one → fail loud listing the ids (never auto-pick one of many).
 *
 * Resolution ONLY — the resolved target flows through completeCommand's body
 * (validation, mark-complete, audit, state-clear, propagate) unchanged.
 */
function resolveCompleteTarget(explicitId, state, entries, registry) {
    // Branch 1 — explicit id wins (mirrors startCommand's id||systemId lookup).
    if (explicitId) {
        const target = entries.find(e => e.id === explicitId || e.systemId === explicitId);
        if (!target) {
            return {
                ok: false,
                message: `Workpackage ${explicitId} not found.\n\nUse \`/cf-workpackage list\` to see available workpackages.`
            };
        }
        return { ok: true, target };
    }
    // Branch 2 — the active workpackage when one is set.
    let alreadyCompleteActiveId;
    if (state.activeWorkpackage) {
        const active = entries.find(e => e.id === state.activeWorkpackage);
        if (!active) {
            // Preserved stale/deleted-id guard (with an actionable next step).
            return {
                ok: false,
                message: `Active workpackage ${state.activeWorkpackage} not found in registry.\n\nUse \`/cf-workpackage list\` to see available workpackages.`
            };
        }
        // Completable-status guard: only DIVERT when the WP-YAML SOT CONFIRMS the
        // active pointer is already complete (stale drift). An unreadable SOT (null)
        // does NOT divert — the user explicitly has this WP active, so it stays
        // completable (preserves the pre-resolver behavior + one-bad-WP resilience).
        if (readWorkpackageSotStatus(registry, active) !== 'complete') {
            return { ok: true, target: active };
        }
        // Already complete — fall through to branch 3 to recover to a live WP;
        // remember the id for an accurate dead-end message if nothing is in progress.
        alreadyCompleteActiveId = active.id;
    }
    // Branch 3 — the unique in_progress workpackage (status confirmed via SOT).
    // An unparseable SOT (null) is excluded: a WP whose status cannot be read is
    // never silently auto-picked as the completion target.
    const inProgress = entries.filter(e => readWorkpackageSotStatus(registry, e) === 'in_progress');
    if (inProgress.length === 0) {
        if (alreadyCompleteActiveId) {
            return {
                ok: false,
                message: `Workpackage ${alreadyCompleteActiveId} is already complete.\n\n` +
                    'Use `/cf-workpackage list` to see available workpackages, ' +
                    'or `/cf-workpackage start <id>` to begin one.'
            };
        }
        return {
            ok: false,
            message: 'No active workpackage to complete.\n\n' +
                'Use `/cf-workpackage list` to see available workpackages, ' +
                'or `/cf-workpackage start <id>` to begin one.'
        };
    }
    if (inProgress.length > 1) {
        const ids = inProgress.map(e => e.id).join(', ');
        return {
            ok: false,
            message: `More than one workpackage is in progress: ${ids}.\n\n` +
                'Specify which to complete: `/cf-workpackage complete <id>`.'
        };
    }
    const [soleInProgress] = inProgress;
    return { ok: true, target: soleInProgress };
}
/**
 * Complete a workpackage. The target is resolved by resolveCompleteTarget:
 * an explicit id when provided, else the active workpackage, else the unique
 * in_progress workpackage.
 *
 * @param registry - Workpackage registry manager
 * @param auditLogger - Audit logger instance
 * @param force - Skip validation
 * @param options - Additional options
 * @param targetId - Optional explicit workpackage id (positional); when omitted, the active / unique-in_progress fallback applies
 * @returns Complete result
 */
async function completeCommand(registry, auditLogger, force, options, targetId) {
    const state = registry.loadState();
    const entries = registry.getAllWorkpackages();
    // 1. Resolve the completion target: explicit id, else the active workpackage,
    // else the unique in_progress workpackage. Resolution only — the resolved
    // target flows through the body below (validation, mark-complete, audit,
    // state-clear, propagate) unchanged.
    const resolution = resolveCompleteTarget(targetId, state, entries, registry);
    if (!resolution.ok) {
        return {
            success: false,
            message: resolution.message
        };
    }
    const active = resolution.target;
    // 2. Validate. The resolved target is completable (branch 2 skips an
    // already-complete active pointer; branch 3 confirms in_progress via the
    // WP-YAML SOT; the registry-mirror status may lag runtime, which is fine).
    const validation = validateForCompletion(registry, active);
    if (!validation.valid && !force) {
        return {
            success: false,
            workpackage: active,
            validationIssues: validation.issues,
            message: formatValidation(validation, active.id)
        };
    }
    const correlationId = auditLogger.generateCorrelationId();
    const now = new Date().toISOString();
    // 3. Mark complete
    // Note: status mutation is in-memory only (for result/display); persisted via state file
    active.status = 'complete';
    active.completedAt = now;
    active.progress = 100;
    // 4. Log completion audit entry
    auditLogger.logUpdate('workpackage', 'update', active.systemId || active.id, {
        targetDisplayId: active.id,
        oldValue: { status: 'in_progress' },
        newValue: { status: 'complete' },
        trigger: 'user_prompt',
        correlationId,
        metadata: {
            forced: force,
            validationIssues: validation.issues.length > 0 ? validation.issues : undefined
        }
    });
    // 5. Update state to no active workpackage
    const newState = {
        activeWorkpackage: null,
        activeWorkpackageSystemId: null,
        activePhaseSystemId: null,
        startedAt: null,
        lastActivity: now,
        progress: 0,
        deliverables: {},
        scopeWarnings: [],
        sessionId: state.sessionId
    };
    registry.saveState(newState);
    // Snapshot which milestones are already complete BEFORE propagation runs the
    // rollup (step 8). The rollup is the canonical milestone-completer, so step 9
    // uses this snapshot to tell which milestones the rollup completes during THIS
    // command (those earn the celebration) apart from ones completed in a prior
    // session (which must not be re-announced).
    let preCompletedMilestones = new Set();
    try {
        const preState = new registry_2.PlanRegistryManager(options.clearDir).loadState();
        preCompletedMilestones = new Set(Object.entries(preState.milestones)
            .filter(([, entry]) => entry?.status === 'complete')
            .map(([id]) => id));
    }
    catch (err) {
        process.stderr.write(`[lifecycle] milestone pre-snapshot failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    // 6. Propagate state changes (R4.2b — BUG-012 fix)
    // Clear sync-state: no active WP after completion.
    // propagateLifecycleChange handles YAML + registry + sync-state + rollup.
    // Status-derived progress: a status:complete WP is canonically 100% regardless of any
    // residual deliverable state-machine quirks; persist that truth so registry-level reads
    // stop drifting against the terminal status.
    await propagateLifecycleChange(registry, active, 'complete', 'clear', options, 100);
    // 7. Auto-complete milestones (POST-29 fix)
    const completedMilestones = [];
    try {
        const planRegistry = new registry_2.PlanRegistryManager(options.clearDir);
        const plan = planRegistry.loadPlan();
        if (plan) {
            const planState = planRegistry.loadState();
            for (const milestone of plan.milestones) {
                if (planState.milestones[milestone.id]?.status === 'complete') {
                    // Already complete in plan.json. If it was NOT complete before this
                    // command, the rollup (step 8) just completed it — surface it for the
                    // celebration; otherwise it was done in a prior session, so skip it.
                    if (!preCompletedMilestones.has(milestone.id)) {
                        completedMilestones.push(milestone.id);
                    }
                    continue;
                }
                // Fallback: complete anything the rollup missed (defense-in-depth).
                const check = planRegistry.checkMilestoneStatus(milestone.id);
                if (check.status === 'complete') {
                    (0, update_cli_1.updateMilestone)(planRegistry, milestone.id, 'complete');
                    completedMilestones.push(milestone.id);
                }
            }
        }
    }
    catch (err) {
        process.stderr.write(`[lifecycle] auto-milestone check failed: ${err instanceof Error ? err.message : err}\n`);
    }
    // Read whole-plan progress from sync-state (persisted by rollupPlanProgress).
    // POST-42 fix: prior code read planSummary.phaseProgress (active-phase-only)
    // into a variable named planProgress, causing lifecycle-cli to display
    // phase progress as plan progress — misleading when plan has multiple phases.
    // planProgress is display-only in the result message. Falls back to undefined
    // if rollup has not yet run for this plan (first-time sync) or if sync-state
    // predates POST-42 (optional field).
    let planProgress;
    try {
        const syncManager = new context_hub_1.SyncStateManager(options.basePath);
        syncManager.load();
        const planSummary = syncManager.getState().plan;
        if (typeof planSummary.planProgress === 'number' && planSummary.planProgress > 0) {
            planProgress = planSummary.planProgress;
        }
    }
    catch {
        // Reading plan progress is optional
    }
    // 8. Find unblocked workpackages
    // Per-iteration safe load: a single bad-type WP elsewhere in the registry
    // must NOT abort the post-completion walk. The walk is informational
    // ("which downstream WPs are now unblocked?") and downgrades to a
    // stderr warning at command exit for the offending entries.
    const unblockedWorkpackages = [];
    const corruptRegistryWarnings = [];
    for (const entry of entries) {
        if (entry.status !== 'not_started' && entry.status !== 'blocked')
            continue;
        const full = safeGetWorkpackageForWalk(registry, entry, corruptRegistryWarnings);
        if (!full)
            continue;
        // Check if this WP depends on the completed one
        const dependsOnCompleted = full.dependencies.upstream.some(dep => dep.id === active.id || dep.id === active.systemId);
        if (dependsOnCompleted) {
            // Check if now unblocked
            const validation = registry.validateDependencies(entry.id);
            if (validation.valid) {
                unblockedWorkpackages.push(entry.id);
                // Log unblock audit entry
                auditLogger.logUpdate('workpackage', 'update', entry.systemId || entry.id, {
                    targetDisplayId: entry.id,
                    oldValue: { blocked: true },
                    newValue: { blocked: false },
                    trigger: 'auto_sync',
                    correlationId,
                    metadata: { unblockedBy: active.id }
                });
            }
        }
    }
    // 11. Build result message
    const lines = [];
    lines.push(`✅ ${active.id} "${active.title}" complete!`);
    lines.push('');
    lines.push('Summary:');
    lines.push(`  - Status: complete`);
    if (active.startedAt) {
        lines.push(`  - Started: ${(0, status_cli_1.formatDate)(active.startedAt)}`);
    }
    lines.push(`  - Completed: ${(0, status_cli_1.formatDate)(now)}`);
    if (active.linkedKnowledge && active.linkedKnowledge.length > 0) {
        lines.push(`  - Knowledge created: ${active.linkedKnowledge.join(', ')}`);
    }
    if (validation.deliverablesTotal > 0) {
        // Decide whether file-presence reporting is informative for this WP. The
        // resolver tries `pattern` first (when populated + path-shaped), falls
        // back to extracting the leading path from `description`. Deliverables
        // where both fields fail to yield a path are description-only (e.g.,
        // "Voice/copy audit across renderer") — counting them toward N produces
        // the alarming "0/N files present" symptom even though that's the
        // correct answer for a non-file deliverable.
        //
        // When NO deliverable is file-resolvable, suppress the file-presence
        // line entirely and surface "(none configured)". When SOME deliverables
        // are file-resolvable, report files present against the resolvable-count
        // denominator (not the total), so the line stays honest about which
        // deliverables it's accounting for.
        //
        // Safe load: a corrupted active WP would surface as undefined from
        // safeGetWorkpackageForWalk; default to "(none configured)" — the
        // lifecycle complete already succeeded by this point and a misleading
        // "0/N files present" line was the original deliverable-accounting bug.
        const activeFull = safeGetWorkpackageForWalk(registry, active, corruptRegistryWarnings);
        const fileResolvableCount = activeFull
            ? registry.countDeliverablesWithFileResolution(activeFull)
            : 0;
        if (!activeFull || fileResolvableCount === 0) {
            lines.push(`  - Deliverables: ${validation.deliverablesTotal} total (none configured for file-presence tracking; descriptions only)`);
        }
        else {
            const filesPresent = registry.countDeliverablesWithFilePresent(activeFull, options.basePath);
            // Report file-presence against the resolvable-count denominator so the
            // line stays comprehensible when some deliverables are description-only.
            // The state-machine count uses the full total — it tracks all deliverables.
            const remainder = validation.deliverablesTotal - fileResolvableCount;
            const annotation = remainder > 0 ? ` (${remainder} description-only)` : '';
            lines.push(`  - Deliverables: ${filesPresent}/${fileResolvableCount} files present${annotation} ` +
                `(state-machine: ${validation.deliverablesComplete}/${validation.deliverablesTotal} complete)`);
        }
    }
    if (completedMilestones.length > 0) {
        lines.push('');
        lines.push('Milestones achieved:');
        for (const msId of completedMilestones) {
            lines.push(`  🏆 ${msId}`);
        }
    }
    if (unblockedWorkpackages.length > 0) {
        lines.push('');
        lines.push('Downstream impact:');
        for (const wpId of unblockedWorkpackages) {
            const wp = entries.find(e => e.id === wpId);
            lines.push(`  🔓 ${wpId} "${wp?.title || ''}" now unblocked`);
        }
    }
    if (planProgress !== undefined) {
        lines.push('');
        // planProgress is sourced from sync-state which stores aggregated WP
        // progress on a 0-100 scale per the calculateProgress contract.
        lines.push(`Plan progress: ${(0, status_cli_1.formatProgress)(planProgress)}`);
    }
    return {
        success: true,
        workpackage: active,
        planProgress,
        unblockedWorkpackages: unblockedWorkpackages.length > 0 ? unblockedWorkpackages : undefined,
        corruptRegistryWarnings: corruptRegistryWarnings.length > 0 ? corruptRegistryWarnings : undefined,
        message: lines.join('\n')
    };
}
// ==============================================================================
// DELETE COMMAND
// ==============================================================================
/**
 * Delete (archive) a workpackage
 *
 * @param registry - Workpackage registry manager
 * @param targetId - Workpackage ID to delete
 * @param confirmed - Skip confirmation
 * @param auditLogger - Audit logger instance
 * @returns Delete result
 */
async function deleteCommand(registry, targetId, confirmed, auditLogger, options) {
    const entries = registry.getAllWorkpackages();
    const state = registry.loadState();
    // 1. Find target workpackage
    const target = entries.find(e => e.id === targetId || e.systemId === targetId);
    if (!target) {
        throw new WorkpackageNotFoundError(targetId);
    }
    // 2. Check if already archived
    if (target.status === 'archived') {
        return {
            success: false,
            workpackage: target,
            message: `${target.id} is already archived.`
        };
    }
    // 3. Check if active (cannot delete active)
    if (target.status === 'in_progress' || state.activeWorkpackage === target.id) {
        return {
            success: false,
            workpackage: target,
            message: `Cannot delete active workpackage. Pause it first with \`/cf-workpackage pause\`.`
        };
    }
    // 4. Validate transition
    if (!(0, state_machine_1.canArchive)(target.status)) {
        throw new state_machine_1.InvalidTransitionError(target.status, 'archived', 'Cannot archive from current status');
    }
    // 5. Check for downstream dependents
    // Per-iteration safe load: same resilience principle as completeCommand's
    // unblock loop. A single bad-type WP elsewhere in the registry must NOT
    // abort the dependent-discovery walk.
    const dependents = [];
    const corruptRegistryWarnings = [];
    for (const entry of entries) {
        if (entry.id === target.id)
            continue;
        const full = safeGetWorkpackageForWalk(registry, entry, corruptRegistryWarnings);
        if (!full)
            continue;
        const dependsOnTarget = full.dependencies.upstream.some(dep => dep.id === target.id || dep.id === target.systemId);
        if (dependsOnTarget && entry.status !== 'complete' && entry.status !== 'archived') {
            dependents.push(entry.id);
        }
    }
    // 6. If not confirmed and has dependents, show warning
    if (!confirmed && dependents.length > 0) {
        const lines = [];
        lines.push(`⚠️ Delete ${target.id} "${target.title}"?`);
        lines.push('');
        lines.push('This workpackage will be archived (soft deleted):');
        lines.push('  - Hidden from default listings');
        if (target.linkedKnowledge && target.linkedKnowledge.length > 0) {
            lines.push(`  - ${target.linkedKnowledge.length} linked knowledge entries preserved`);
        }
        lines.push(`  - ${dependents.length} downstream dependent(s) will show missing dependency:`);
        for (const depId of dependents) {
            lines.push(`    - ${depId}`);
        }
        lines.push('');
        lines.push('Run with --confirm to proceed.');
        return {
            success: false,
            workpackage: target,
            corruptRegistryWarnings: corruptRegistryWarnings.length > 0 ? corruptRegistryWarnings : undefined,
            message: lines.join('\n')
        };
    }
    // 7. Archive the workpackage
    // Note: status mutation is in-memory only (for result/display); not written back to registry
    const oldStatus = target.status;
    target.status = 'archived';
    target.archivedAt = new Date().toISOString();
    // 8. Log audit entry
    auditLogger.logUpdate('workpackage', 'purge', target.systemId || target.id, {
        targetDisplayId: target.id,
        oldValue: { status: oldStatus },
        newValue: { status: 'archived' },
        trigger: 'user_prompt',
        metadata: {
            dependentsAffected: dependents.length > 0 ? dependents : undefined
        }
    });
    // 9. Propagate state changes (R4.2b — BUG-012 fix)
    // Skip sync-state: delete targets non-active WPs (checked in step 3)
    if (options) {
        const clearDir = path.join(options.basePath, '.clear');
        await propagateLifecycleChange(registry, target, 'archived', 'skip', {
            clearDir,
            basePath: options.basePath,
            sessionId: options.sessionId,
            sessionNumber: options.sessionNumber,
        });
    }
    // 10. Propagate deprecation warnings for linked knowledge
    let deprecationMessage = '';
    if (options) {
        const deprecationResult = await (0, deprecation_1.deprecateOnDefer)({
            basePath: options.basePath,
            sessionId: options.sessionId,
            sessionNumber: options.sessionNumber,
            deferredWorkpackageSystemId: target.systemId || target.id,
            action: 'warn',
        });
        if (deprecationResult.warnings.length > 0) {
            deprecationMessage = '\n\nDeprecation warnings:\n' + deprecationResult.warnings.map(w => `  - ${w}`).join('\n');
        }
    }
    return {
        success: true,
        workpackage: target,
        corruptRegistryWarnings: corruptRegistryWarnings.length > 0 ? corruptRegistryWarnings : undefined,
        message: `✅ ${target.id} archived (soft deleted)\n\nThe workpackage is hidden but preserved.\nUse \`/cf-workpackage list --all\` to view archived items.` + deprecationMessage
    };
}
// ==============================================================================
// CLI ENTRY POINT
// ==============================================================================
/**
 * Parse command line arguments for standalone execution
 */
function parseArgs() {
    const argv = process.argv.slice(2);
    let clearDir = './.clear';
    let explicitSessionId;
    let explicitSessionNumber;
    const positionalArgs = [];
    for (const arg of argv) {
        if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.substring('--clear-dir='.length);
        }
        else if (arg.startsWith('--session-id=')) {
            explicitSessionId = arg.substring('--session-id='.length);
        }
        else if (arg.startsWith('--session-number=')) {
            const parsed = parseInt(arg.substring('--session-number='.length), 10);
            explicitSessionNumber = Number.isNaN(parsed) ? undefined : parsed;
        }
        else {
            positionalArgs.push(arg);
        }
    }
    // basePath (project root) via stripClearSuffix on the RAW arg — this DELIBERATELY
    // preserves the bare-`.clear` conflation warning (caller: lifecycle-cli), the
    // WP-DR5 regression detector that cli-no-double-clear-leak.bats asserts.
    // clearSubdir (the .clear dir) via the form-tolerant resolver for the registry
    // managers + getCurrentSession (which joins <clearSubdir>/state/session.json).
    // resolveClearDir is intentionally warning-free; validateBasePath rejects
    // traversal-shaped input before any filesystem access.
    const basePath = (0, validation_1.stripClearSuffix)(clearDir, 'lifecycle-cli');
    const { clearSubdir } = (0, validation_1.resolveClearDir)((0, validation_1.validateBasePath)(clearDir));
    // Resolve session identity from sync state when argv didn't supply both.
    // Replaces the prior `session-${Date.now()}` default — synthetic IDs corrupt
    // audit-log correlation since every emit gets a fresh timestamp suffix.
    const session = (0, audit_log_1.getCurrentSession)(clearSubdir, {
        sessionId: explicitSessionId,
        sessionNumber: explicitSessionNumber
    });
    const subcommand = positionalArgs[0] || '';
    const args = positionalArgs.slice(1);
    return {
        subcommand,
        args,
        options: { clearDir: clearSubdir, basePath, sessionId: session.sessionId, sessionNumber: session.sessionNumber }
    };
}
/**
 * Run lifecycle CLI command
 */
async function runLifecycleCLI(subcommand, args, options, auditLogger) {
    // Normalize --clear-dir into the canonical .clear subdir + project root, tolerant
    // of either convention (so a caller passing the project root `.` and one passing
    // `./.clear` resolve identically — the OBS-8/4 fix). validateBasePath first
    // preserves traversal rejection. Registry managers + WP-state joins consume
    // clearSubdir (options.clearDir); SyncStateManager / audit / phase sites consume
    // projectRoot (options.basePath, always the parent of the .clear dir).
    const resolved = (0, validation_1.resolveClearDir)((0, validation_1.validateBasePath)(options.clearDir));
    options.clearDir = resolved.clearSubdir;
    options.basePath = resolved.projectRoot;
    const registry = new registry_1.WorkpackageRegistryManager(options.clearDir);
    try {
        switch (subcommand) {
            case 'start': {
                const targetId = args[0];
                const force = args.includes('--force') || args.includes('-f');
                if (!targetId) {
                    return 'Usage: /cf-workpackage start <id> [--force]';
                }
                const result = await startCommand(registry, targetId, force, auditLogger, options);
                return result.message;
            }
            case 'pause': {
                const result = await pauseCommand(registry, auditLogger, 'user_explicit_pause', options);
                return result.message;
            }
            case 'complete': {
                const force = args.includes('--force') || args.includes('-f');
                // Optional positional WP id. Use the first non-flag arg (NOT args[0])
                // so a bare `complete --force` is not mis-read as an explicit id.
                const targetId = args.find(a => !a.startsWith('-'));
                const result = await completeCommand(registry, auditLogger, force, options, targetId);
                if (result.corruptRegistryWarnings && result.corruptRegistryWarnings.length > 0) {
                    process.stderr.write(formatCorruptRegistryWarning(result.corruptRegistryWarnings));
                }
                return result.message;
            }
            case 'delete': {
                const targetId = args[0];
                const confirmed = args.includes('--confirm') || args.includes('-y');
                if (!targetId) {
                    return 'Usage: /cf-workpackage delete <id> [--confirm]';
                }
                const result = await deleteCommand(registry, targetId, confirmed, auditLogger, options);
                if (result.corruptRegistryWarnings && result.corruptRegistryWarnings.length > 0) {
                    process.stderr.write(formatCorruptRegistryWarning(result.corruptRegistryWarnings));
                }
                return result.message;
            }
            case 'defer': {
                const targetId = args[0];
                if (!targetId) {
                    return 'Usage: /cf-workpackage defer <id> [--reason=<reason>]';
                }
                // Extract --reason from args
                const reasonArg = args.find(a => a.startsWith('--reason='));
                const reason = reasonArg ? reasonArg.substring('--reason='.length) : '';
                const deferResult = await (0, plan_propagate_1.deferWorkpackage)({
                    basePath: options.basePath,
                    sessionId: options.sessionId,
                    sessionNumber: options.sessionNumber,
                    workpackageId: targetId,
                    reason,
                });
                if (deferResult.status === 'not_found') {
                    return `❌ ${deferResult.error}`;
                }
                if (deferResult.status === 'error') {
                    return `❌ ${deferResult.error}`;
                }
                return deferResult.message ?? `Deferred ${targetId}`;
            }
            case 'progress': {
                const result = await (0, progress_cli_1.runSlashProgressCLI)('progress', args, { clearDir: options.clearDir });
                return result;
            }
            case 'validate': {
                const result = await (0, progress_cli_1.runSlashProgressCLI)('validate', args, { clearDir: options.clearDir });
                return result;
            }
            case 'reorder': {
                const targetId = args[0];
                if (!targetId) {
                    return 'Usage: /cf-workpackage reorder <id> --position=<N>';
                }
                // Extract --position from args
                const positionArg = args.find(a => a.startsWith('--position='));
                if (!positionArg) {
                    return 'Error: --position=<N> is required for reorder. Usage: /cf-workpackage reorder <id> --position=<N>';
                }
                const newPosition = parseInt(positionArg.substring('--position='.length), 10);
                if (isNaN(newPosition) || newPosition < 1) {
                    return `Error: Invalid position "${positionArg.substring('--position='.length)}". Position must be a positive integer.`;
                }
                // Resolve display ID to system ID via registry (Critic GAP-A: reorderWorkpackage only matches systemId)
                const resolvedWp = registry.resolveWorkpackage(targetId);
                if (!resolvedWp) {
                    return `❌ Workpackage not found: ${targetId}`;
                }
                const systemId = resolvedWp.systemId ?? resolvedWp.id;
                const reorderResult = await (0, plan_propagate_1.reorderWorkpackage)({
                    basePath: options.basePath,
                    sessionId: options.sessionId,
                    sessionNumber: options.sessionNumber,
                    workpackageSystemId: systemId,
                    newPosition,
                });
                if (reorderResult.status === 'not_found') {
                    return `❌ ${reorderResult.error}`;
                }
                if (reorderResult.status === 'error') {
                    return `❌ ${reorderResult.error}`;
                }
                return reorderResult.message ?? `Reordered ${targetId} to position ${newPosition}`;
            }
            case '--help':
            case 'help':
                return [
                    'Usage: lifecycle-cli <command> [args] --clear-dir=<path>',
                    '',
                    'Commands:',
                    '  start <id> [--force]         Start/activate a workpackage',
                    '  pause                         Pause the active workpackage',
                    '  complete [--force]            Complete the active workpackage',
                    '  delete <id> [--confirm]       Delete a workpackage',
                    '  defer <id> [--reason=<text>]  Defer a workpackage',
                    '  reorder <id> --position=<N>   Reorder a workpackage',
                    '  progress [<N>|--set <N>]      View or set progress (0-100)',
                    '  validate                      Check completion readiness',
                    '',
                    'Options:',
                    '  --clear-dir=<path>            Path to .clear directory',
                    '',
                    'Notes:',
                    '  - Deliverables auto-promote not_started → in_progress → complete on Write/Edit hook',
                    '    when a description-extracted file is present on disk.',
                    '  - To revert premature promotion (e.g., after a stub write), use:',
                    '      update-cli deliverable <deliverable-id> --status=in_progress',
                    '  - `progress 100` (or `progress --set 100`) sweeps all deliverables to complete.',
                ].join('\n');
            default:
                return `Unknown subcommand: ${subcommand}. Run with --help for usage.`;
        }
    }
    catch (error) {
        if (error instanceof WorkpackageNotFoundError) {
            return `❌ ${error.message}`;
        }
        if (error instanceof state_machine_1.InvalidTransitionError) {
            return `❌ ${error.message}`;
        }
        if (error instanceof DependencyBlockedError) {
            const blockers = checkBlockingDependencies(registry, args[0]);
            return formatBlockers(blockers);
        }
        // Belt-and-braces: if a future code path inside any subcommand introduces an
        // unguarded registry.getWorkpackage() call, surface a clean envelope here so
        // the CLI never emits a raw stack trace for a parser-class failure. The
        // errorCode is included verbatim in the user-facing message so the operator
        // can distinguish enum mismatches from malformed YAML or read errors.
        // FILE_NOT_FOUND is already absorbed inside registry.ts (it's the
        // "WP not yet created" sentinel) and never reaches this branch.
        if (error instanceof parser_1.WorkpackageParseError) {
            const repairHint = error.errorCode === 'SCHEMA_MISMATCH'
                ? ' Repair via update-cli <wp-id> --type=<valid> --priority=<valid>.'
                : '';
            process.stderr.write(`[lifecycle] WARNING: Encountered invalid workpackage data during ${subcommand} ` +
                `(${error.errorCode}).${repairHint} Detail: ${error.message}\n`);
            return `❌ Invalid workpackage data prevented ${subcommand} (${error.errorCode}): ${error.message}`;
        }
        throw error;
    }
}
// Main execution — only run when invoked directly
if (require.main === module) {
    const { subcommand, args, options } = parseArgs();
    if (!subcommand) {
        const usageText = 'Usage: lifecycle-cli.js <start|pause|complete|delete|defer|reorder> [args] --clear-dir=<path> --session-id=<id> --session-number=<n>';
        console.error(JSON.stringify({
            success: false,
            message: usageText,
            additionalContext: usageText,
            error: 'Missing required subcommand'
        }));
        process.exit(1);
    }
    const auditLogger = new audit_log_1.AuditLogger(options.basePath, options.sessionId, options.sessionNumber);
    // Dual-key envelope: `message` is canonical CLI shape (read by skill jq);
    // `additionalContext` mirrors it for any future hook-script invocation
    // (Claude Code hook spec). Both carry identical text.
    runLifecycleCLI(subcommand, args, options, auditLogger)
        .then(message => {
        console.log(JSON.stringify({
            success: true,
            message,
            additionalContext: message
        }));
    })
        .catch(error => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(JSON.stringify({
            success: false,
            message: errorMessage,
            additionalContext: errorMessage,
            error: errorMessage
        }));
        process.exit(1);
    });
}
//# sourceMappingURL=lifecycle-cli.js.map