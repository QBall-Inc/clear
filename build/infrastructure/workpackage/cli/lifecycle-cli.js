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
const state_machine_1 = require("../state-machine");
const status_cli_1 = require("./status-cli");
const progress_cli_1 = require("./progress-cli");
const audit_log_1 = require("../../sync/audit-log");
const plan_rollup_1 = require("../../sync/plan-rollup");
const plan_propagate_1 = require("../../sync/plan-propagate");
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
async function propagateLifecycleChange(registry, target, newStatus, syncAction, options) {
    const targetId = target.systemId || target.id;
    const clearDir = options.clearDir;
    // Step 1: WP YAML write-back (source of truth — AD1)
    try {
        const wpFileName = target.file || `${targetId}.yaml`;
        const wpFilePath = path.join(clearDir, 'workpackages', wpFileName);
        (0, plan_propagate_1.updateWorkpackageFileStatus)(wpFilePath, newStatus);
    }
    catch (err) {
        process.stderr.write(`[propagate] YAML write-back failed for ${targetId}: ${err instanceof Error ? err.message : err}\n`);
    }
    // Step 2: registry.yaml update (fast-read index — AD1)
    try {
        registry.updateRegistryEntryStatus(target.id, newStatus);
    }
    catch (err) {
        process.stderr.write(`[propagate] Registry update failed for ${targetId}: ${err instanceof Error ? err.message : err}\n`);
    }
    // Step 3: sync-state update (conditional — AD4)
    try {
        if (syncAction === 'update') {
            const syncManager = new context_hub_1.SyncStateManager(options.basePath);
            syncManager.load();
            syncManager.updateWorkpackageSummary({ status: newStatus });
            syncManager.save();
        }
        else if (syncAction === 'clear') {
            const syncManager = new context_hub_1.SyncStateManager(options.basePath);
            syncManager.load();
            syncManager.updateWorkpackageSummary({
                systemId: '',
                displayId: '',
                title: '',
                progress: 0,
                sessionId: '',
                status: undefined,
            });
            syncManager.save();
        }
        // syncAction === 'skip': no sync-state update
    }
    catch (err) {
        process.stderr.write(`[propagate] Sync-state update failed for ${targetId}: ${err instanceof Error ? err.message : err}\n`);
    }
    // Step 4: Plan rollup (AD9 — last step)
    try {
        await (0, plan_rollup_1.rollupPlanProgress)({
            basePath: options.basePath,
            sessionId: options.sessionId,
            sessionNumber: options.sessionNumber,
            triggeredByWorkpackage: targetId,
        });
    }
    catch (err) {
        process.stderr.write(`[propagate] Plan rollup failed for ${targetId}: ${err instanceof Error ? err.message : err}\n`);
    }
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
    // 7. Update state
    const newState = {
        activeWorkpackage: target.id,
        activeWorkpackageSystemId: target.systemId ?? null,
        activePhaseSystemId: target.phase ?? null,
        startedAt: target.startedAt || now,
        lastActivity: now,
        progress: target.progress ?? 0,
        deliverables: {},
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
        // Auto-pause: propagate paused status for previous WP (skip sync-state — not active)
        if (previouslyPaused) {
            await propagateLifecycleChange(registry, previouslyPaused, 'paused', 'skip', options);
        }
        // Propagate in_progress status for target WP (update sync-state — now active)
        await propagateLifecycleChange(registry, target, 'in_progress', 'update', options);
    }
    // 10. Auto-advance plan activePhase (POST-30 fix)
    if (options && target.phase) {
        try {
            const planRegistry = new registry_2.PlanRegistryManager(options.clearDir);
            (0, update_cli_1.updateActivePhase)(planRegistry, target.phase, options.basePath);
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
    const progressAtPause = active.progress ?? state.progress ?? 0;
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
    // 7. Propagate state changes (R4.2b — BUG-012 fix)
    // Clear sync-state: no active WP after pause
    if (options) {
        await propagateLifecycleChange(registry, active, 'paused', 'clear', options);
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
    // Check progress — state file is runtime source of truth (updated by progress-cli),
    // fall back to registry entry progress (updated by plan-propagate).
    // State file stores progress in mixed scales: hook path writes 0-1, slash command writes 0-100.
    // Normalise to 0-100 for comparison.
    const rawStateProgress = state.activeWorkpackage === workpackage.id ? (state.progress ?? 0) : 0;
    const normalisedStateProgress = rawStateProgress > 1 ? Math.round(rawStateProgress) : Math.round(rawStateProgress * 100);
    const progress = Math.max(workpackage.progress ?? 0, normalisedStateProgress);
    if (progress < 100) {
        issues.push(`Progress: ${(0, status_cli_1.formatProgress)(progress)} (expected 100%)`);
    }
    // Check deliverables — merge YAML status with state file status (state file tracks runtime completions)
    let deliverablesComplete = 0;
    let deliverablesTotal = 0;
    if (full?.deliverables) {
        deliverablesTotal = full.deliverables.length;
        deliverablesComplete = full.deliverables.filter(d => {
            // Check state file first (runtime completions), fall back to YAML status
            const stateDeliverable = state.deliverables[d.id];
            return (stateDeliverable?.status === 'complete') || d.status === 'complete';
        }).length;
        if (deliverablesComplete < deliverablesTotal) {
            warnings.push(`Deliverables: ${deliverablesComplete}/${deliverablesTotal} complete`);
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
        if (validation.progress < 100) {
            lines.push('  - Set progress: `/cf-workpackage progress --set 100`');
        }
        if (validation.deliverablesComplete < validation.deliverablesTotal) {
            lines.push('  - Mark deliverables complete via progress CLI');
        }
        lines.push('  - Or run `/cf-workpackage complete --force` to override');
    }
    return lines.join('\n');
}
/**
 * Complete the current active workpackage
 *
 * @param registry - Workpackage registry manager
 * @param auditLogger - Audit logger instance
 * @param force - Skip validation
 * @param options - Additional options
 * @returns Complete result
 */
async function completeCommand(registry, auditLogger, force, options) {
    const state = registry.loadState();
    const entries = registry.getAllWorkpackages();
    // 1. Check if there's an active workpackage
    if (!state.activeWorkpackage) {
        return {
            success: false,
            message: 'No active workpackage to complete.\n\nUse `/cf-workpackage list` to see available workpackages.'
        };
    }
    // 2. Find the active workpackage
    const active = entries.find(e => e.id === state.activeWorkpackage);
    if (!active) {
        return {
            success: false,
            message: `Active workpackage ${state.activeWorkpackage} not found in registry.`
        };
    }
    // 3. Validate transition - if in state.activeWorkpackage, it's effectively in_progress
    // The entry.status from registry file may not reflect runtime status
    // Since we confirmed state.activeWorkpackage === active.id, we can complete it
    // 4. Run validation
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
    // 5. Mark complete
    // Note: status mutation is in-memory only (for result/display); persisted via state file
    active.status = 'complete';
    active.completedAt = now;
    active.progress = 100;
    // 6. Log completion audit entry
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
    // 7. Update state to no active workpackage
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
    // 8. Propagate state changes (R4.2b — BUG-012 fix)
    // Clear sync-state: no active WP after completion.
    // propagateLifecycleChange handles YAML + registry + sync-state + rollup.
    await propagateLifecycleChange(registry, active, 'complete', 'clear', options);
    // 9. Auto-complete milestones (POST-29 fix)
    const completedMilestones = [];
    try {
        const planRegistry = new registry_2.PlanRegistryManager(options.clearDir);
        const plan = planRegistry.loadPlan();
        if (plan) {
            const planState = planRegistry.loadState();
            for (const milestone of plan.milestones) {
                // Skip already-complete milestones
                if (planState.milestones[milestone.id]?.status === 'complete')
                    continue;
                const check = planRegistry.checkMilestoneStatus(milestone.id);
                if (check.status === 'complete') {
                    (0, update_cli_1.updateMilestone)(planRegistry, milestone.id, 'complete', options.basePath);
                    completedMilestones.push(milestone.id);
                }
            }
        }
    }
    catch (err) {
        process.stderr.write(`[lifecycle] auto-milestone check failed: ${err instanceof Error ? err.message : err}\n`);
    }
    // Read plan progress from sync-state (already updated by propagation rollup).
    // Note: If the rollup step in propagation failed silently (NFR2 fire-and-log),
    // this may return stale/zero progress. planProgress is display-only in the result message.
    let planProgress;
    try {
        const syncManager = new context_hub_1.SyncStateManager(options.basePath);
        syncManager.load();
        const planSummary = syncManager.getState().plan;
        if (planSummary.phaseProgress > 0) {
            planProgress = planSummary.phaseProgress;
        }
    }
    catch {
        // Reading plan progress is optional
    }
    // 10. Find unblocked workpackages
    const unblockedWorkpackages = [];
    for (const entry of entries) {
        if (entry.status !== 'not_started' && entry.status !== 'blocked')
            continue;
        const full = registry.getWorkpackage(entry.id);
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
        lines.push(`  - Deliverables: ${validation.deliverablesComplete}/${validation.deliverablesTotal}`);
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
        lines.push(`Plan progress: ${(0, status_cli_1.formatProgress)(planProgress * 100)}`);
    }
    return {
        success: true,
        workpackage: active,
        planProgress,
        unblockedWorkpackages: unblockedWorkpackages.length > 0 ? unblockedWorkpackages : undefined,
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
    const dependents = [];
    for (const entry of entries) {
        if (entry.id === target.id)
            continue;
        const full = registry.getWorkpackage(entry.id);
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
        message: `✅ ${target.id} archived (soft deleted)\n\nThe workpackage is hidden but preserved.\nUse \`/cf-workpackage list --all\` to view archived items.` + deprecationMessage
    };
}
// ==============================================================================
// CLI ENTRY POINT
// ==============================================================================
/**
 * Run lifecycle CLI command
 */
/**
 * Parse command line arguments for standalone execution
 */
function parseArgs() {
    const argv = process.argv.slice(2);
    let clearDir = '.clear';
    let basePath = '.';
    let sessionId = `session-${Date.now()}`;
    let sessionNumber = 0;
    const positionalArgs = [];
    for (const arg of argv) {
        if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.substring('--clear-dir='.length);
        }
        else if (arg.startsWith('--base-path=')) {
            basePath = arg.substring('--base-path='.length);
        }
        else if (arg.startsWith('--session-id=')) {
            sessionId = arg.substring('--session-id='.length);
        }
        else if (arg.startsWith('--session-number=')) {
            sessionNumber = parseInt(arg.substring('--session-number='.length), 10) || 0;
        }
        else {
            positionalArgs.push(arg);
        }
    }
    const subcommand = positionalArgs[0] || '';
    const args = positionalArgs.slice(1);
    return {
        subcommand,
        args,
        options: { clearDir, basePath, sessionId, sessionNumber }
    };
}
/**
 * Run lifecycle CLI command
 */
async function runLifecycleCLI(subcommand, args, options, auditLogger) {
    options.clearDir = (0, validation_1.validateBasePath)(options.clearDir);
    options.basePath = (0, validation_1.validateBasePath)(options.basePath);
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
                const result = await completeCommand(registry, auditLogger, force, options);
                return result.message;
            }
            case 'delete': {
                const targetId = args[0];
                const confirmed = args.includes('--confirm') || args.includes('-y');
                if (!targetId) {
                    return 'Usage: /cf-workpackage delete <id> [--confirm]';
                }
                const result = await deleteCommand(registry, targetId, confirmed, auditLogger, options);
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
                    'Usage: lifecycle-cli <command> [args] --clear-dir=<path> --base-path=<path>',
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
                    '  --base-path=<path>            Project base path',
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
        throw error;
    }
}
// Main execution — only run when invoked directly
if (require.main === module) {
    const { subcommand, args, options } = parseArgs();
    if (!subcommand) {
        console.error(JSON.stringify({
            error: 'Usage: lifecycle-cli.js <start|pause|complete|delete|defer|reorder> [args] --clear-dir=<path> --base-path=<path> --session-id=<id> --session-number=<n>'
        }));
        process.exit(1);
    }
    const auditLogger = new audit_log_1.AuditLogger(options.basePath, options.sessionId, options.sessionNumber);
    runLifecycleCLI(subcommand, args, options, auditLogger)
        .then(message => {
        console.log(JSON.stringify({ success: true, message }));
    })
        .catch(error => {
        console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
        process.exit(1);
    });
}
//# sourceMappingURL=lifecycle-cli.js.map