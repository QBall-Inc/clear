#!/usr/bin/env npx ts-node
"use strict";
/**
 * Workpackage Progress CLI Tool (P2.7)
 *
 * Two interfaces:
 * 1. Hook-based: Tracks progress within active workpackage, validates scope.
 *    Called by workpackage-progress.sh bash wrapper.
 *    Usage: npx ts-node progress-cli.ts --clear-dir=<path> [--file=<path>] [--deliverable=<id>] [--complete]
 *
 * 2. Slash command: View/update progress, validate for completion.
 *    Commands: progress [--set N], validate
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.slashProgressCommand = slashProgressCommand;
exports.slashValidateCommand = slashValidateCommand;
exports.runSlashProgressCLI = runSlashProgressCLI;
const registry_1 = require("../registry");
const status_cli_1 = require("./status-cli");
const lifecycle_cli_1 = require("./lifecycle-cli");
const parse_args_1 = require("../../cli/parse-args");
const validation_1 = require("../../validation");
// ==============================================================================
// SLASH COMMAND: progress [--set N]
// ==============================================================================
/**
 * View or update workpackage progress (slash command interface)
 *
 * @param registry - Workpackage registry manager
 * @param setProgress - Optional progress value to set (0-100)
 * @returns Progress result
 */
async function slashProgressCommand(registry, setProgress) {
    const state = registry.loadState();
    const entries = registry.getAllWorkpackages();
    // 1. Check if there's an active workpackage
    if (!state.activeWorkpackage) {
        return {
            success: false,
            progress: 0,
            message: 'No active workpackage.\n\nUse `/cf-workpackage start <id>` to activate one.'
        };
    }
    // 2. Find the active workpackage
    const active = entries.find(e => e.id === state.activeWorkpackage);
    if (!active) {
        return {
            success: false,
            progress: 0,
            message: `Active workpackage ${state.activeWorkpackage} not found in registry.`
        };
    }
    // 3. Get full workpackage for deliverables
    const full = registry.getWorkpackage(active.id);
    // 4. If setting progress
    if (setProgress !== undefined) {
        // Validate progress value
        if (setProgress < 0 || setProgress > 100) {
            return {
                success: false,
                workpackage: active,
                progress: registry.calculateProgress(active.id).progress,
                message: `Invalid progress value: ${setProgress}. Must be between 0 and 100.`
            };
        }
        // Cannot set progress on completed/archived
        if (active.status === 'complete' || active.status === 'archived') {
            return {
                success: false,
                workpackage: active,
                progress: registry.calculateProgress(active.id).progress,
                message: `Cannot update progress on ${active.status} workpackage.`
            };
        }
        // Progress is derived from deliverable states — it is not a free-standing value
        // that can be set to an arbitrary number. Setting an arbitrary percentage would
        // not change any deliverable state, so it would be overwritten the next time a
        // tracked file write recalculates progress. Only `--set 100` is meaningful: it
        // sweeps all deliverables to complete, which is a coherent state change that
        // recomputes to 100%.
        if (setProgress !== 100) {
            return {
                success: false,
                workpackage: active,
                progress: registry.calculateProgress(active.id).progress,
                message: [
                    `Cannot set progress to ${setProgress}%. Progress is derived from deliverable states, not set directly.`,
                    '',
                    'To advance progress, mark deliverables done:',
                    '  - View current deliverables:  /cf-workpackage progress',
                    '  - Mark a deliverable complete: /cf-workpackage update <id> --status=complete',
                    '  - Mark all deliverables complete and finish at 100%: /cf-workpackage progress --set 100',
                ].join('\n')
            };
        }
        // --set 100 derives 100% by sweeping every deliverable to complete. With no
        // deliverables there is nothing to sweep: the recompute would stay at 0% and a
        // "success" envelope would falsely claim the workpackage was advanced. Refuse
        // it with the same actionable envelope shape used for `--set N≠100`.
        if (!full?.deliverables || full.deliverables.length === 0) {
            return {
                success: false,
                workpackage: active,
                progress: registry.calculateProgress(active.id).progress,
                message: 'Cannot set progress to 100%: this workpackage has no deliverables to complete. Progress is derived from deliverable states.'
            };
        }
        // --set 100 sweeps all deliverables to complete. This is a coherent state
        // mutation: every deliverable transitions to complete, so the recomputed
        // aggregate progress is 100%. Each markDeliverableComplete refreshes the
        // derived progress scalars, so no separate scalar write is needed.
        for (const d of full.deliverables) {
            registry.markDeliverableComplete(d.id);
        }
        const finalProgress = registry.calculateProgress(active.id).progress;
        return {
            success: true,
            workpackage: active,
            progress: finalProgress,
            message: `✅ ${active.id} progress updated: ${(0, status_cli_1.formatProgress)(finalProgress)}`
        };
    }
    // 5. View progress
    // Aggregate progress is derived from live deliverable states. Recompute it
    // directly here so the view always reflects current truth, independent of any
    // cached scalar in the registry index or state file.
    const currentProgress = registry.calculateProgress(active.id).progress;
    const deliverables = [];
    if (full?.deliverables) {
        for (const d of full.deliverables) {
            const deliverableState = state.deliverables[d.id];
            deliverables.push({
                id: d.id,
                pattern: d.pattern,
                status: deliverableState?.status ?? d.status,
                completedAt: deliverableState?.completedAt
            });
        }
    }
    // Build output
    const lines = [];
    lines.push(`📊 ${active.id} Progress: ${(0, status_cli_1.formatProgress)(currentProgress)}`);
    if (deliverables.length > 0) {
        lines.push('');
        lines.push('Deliverables:');
        for (const d of deliverables) {
            const icon = d.status === 'complete' ? '✅' : '⬜';
            lines.push(`  ${icon} ${d.pattern} (${d.status})`);
        }
        const complete = deliverables.filter(d => d.status === 'complete').length;
        lines.push('');
        lines.push(`Estimated: ${complete} of ${deliverables.length} deliverables complete`);
    }
    return {
        success: true,
        workpackage: active,
        progress: currentProgress,
        deliverables,
        message: lines.join('\n')
    };
}
// ==============================================================================
// SLASH COMMAND: validate
// ==============================================================================
/**
 * Validate if current workpackage meets completion criteria (slash command interface)
 *
 * @param registry - Workpackage registry manager
 * @returns Validate result
 */
async function slashValidateCommand(registry) {
    const state = registry.loadState();
    const entries = registry.getAllWorkpackages();
    // 1. Check if there's an active workpackage
    if (!state.activeWorkpackage) {
        return {
            success: false,
            valid: false,
            issues: ['No active workpackage'],
            warnings: [],
            message: 'No active workpackage.\n\nUse `/cf-workpackage start <id>` to activate one.'
        };
    }
    // 2. Find the active workpackage
    const active = entries.find(e => e.id === state.activeWorkpackage);
    if (!active) {
        return {
            success: false,
            valid: false,
            issues: ['Active workpackage not found'],
            warnings: [],
            message: `Active workpackage ${state.activeWorkpackage} not found in registry.`
        };
    }
    // AC29 (POST-80): defense-in-depth on-demand progress recompute.
    //
    // Catches drift between state.progress and the actual deliverable YAML:
    //   (a) hand-edits that bypass update-cli entirely
    //   (b) crashed update-cli runs that wrote YAML but missed the AC28 recalc
    //
    // AC28 fixes the write path; AC29 hardens the read path. Two-layer defense
    // so neither alone is load-bearing. Wrapped in try/catch so a recalc failure
    // doesn't block validation (validateForCompletion can still surface its own
    // findings based on the current state).
    try {
        const recomputed = registry.calculateProgress(active.id);
        if (state.progress !== recomputed.progress) {
            const refreshed = registry.loadState();
            refreshed.progress = recomputed.progress;
            refreshed.lastActivity = new Date().toISOString();
            registry.saveState(refreshed);
        }
    }
    catch (e) {
        process.stderr.write(`[progress-cli validate] on-demand progress recompute failed (AC29 best-effort): ${e instanceof Error ? e.message : String(e)}\n`);
    }
    // 3. Run validation
    const validation = (0, lifecycle_cli_1.validateForCompletion)(registry, active);
    return {
        success: true,
        workpackage: active,
        valid: validation.valid,
        issues: validation.issues,
        warnings: validation.warnings,
        message: (0, lifecycle_cli_1.formatValidation)(validation, active.id)
    };
}
/**
 * Run progress CLI slash command
 */
async function runSlashProgressCLI(subcommand, args, options) {
    const registry = new registry_1.WorkpackageRegistryManager((0, validation_1.resolveClearDir)(options.clearDir).clearSubdir);
    switch (subcommand) {
        case 'progress': {
            // Check for --set flag or bare numeric positional arg (e.g. `progress 100`)
            const setIndex = args.indexOf('--set');
            let setProgress;
            if (setIndex !== -1 && args[setIndex + 1]) {
                const value = parseInt(args[setIndex + 1], 10);
                if (!isNaN(value)) {
                    setProgress = value;
                }
                else {
                    return `Invalid progress value: ${args[setIndex + 1]}. Must be a number.`;
                }
            }
            else if (setIndex === -1 && args.length > 0 && /^\d+$/.test(args[0])) {
                // Treat bare numeric first arg as --set value: `progress 100` === `progress --set 100`
                setProgress = parseInt(args[0], 10);
            }
            const result = await slashProgressCommand(registry, setProgress);
            return result.message;
        }
        case 'validate': {
            const result = await slashValidateCommand(registry);
            return result.message;
        }
        default:
            return `Unknown subcommand: ${subcommand}. Valid subcommands: progress, validate`;
    }
}
/**
 * Parse command line arguments
 */
function parseArgs() {
    return (0, parse_args_1.parseCliArgs)({ clearDir: '.clear', markComplete: false }, [
        { prefix: '--file=', apply: (v, o) => { o.file = v; } },
        { prefix: '--deliverable=', apply: (v, o) => { o.deliverableId = v; } },
        { flag: '--complete', apply: (_v, o) => { o.markComplete = true; } },
        { prefix: '--prompt=', apply: (v, o) => { o.userPrompt = v; } }
    ]);
}
/**
 * Format scope warning message
 */
function formatScopeWarning(file, suggestedWorkpackage) {
    const lines = [];
    lines.push(`⚠️ Scope warning: ${file} is outside current workpackage scope`);
    if (suggestedWorkpackage) {
        lines.push(`This file belongs to ${suggestedWorkpackage}.`);
    }
    lines.push('');
    lines.push('Options:');
    lines.push('1. Skip this change');
    lines.push('2. Add file to current workpackage scope');
    lines.push('3. Continue anyway');
    return lines.join('\n');
}
/**
 * Format progress update message (only shown when progress changes)
 */
function formatProgressUpdate(workpackageId, progress, promotedDeliverable, promotion) {
    const percentage = Math.round(progress);
    let message = `[${workpackageId} Progress: ${percentage}%]`;
    if (promotedDeliverable) {
        const label = promotion === 'complete' ? '✅ Deliverable complete' : '🟡 Deliverable started';
        message += ` ${label}: ${promotedDeliverable}`;
    }
    return message;
}
/**
 * Main progress tracking operation
 */
function trackProgress(options) {
    // Resolve --clear-dir once for this request; resolveClearDir is idempotent + pure.
    const { projectRoot, clearSubdir } = (0, validation_1.resolveClearDir)(options.clearDir);
    const registry = new registry_1.WorkpackageRegistryManager(clearSubdir);
    // Get active workpackage
    const activeId = registry.getActiveWorkpackageId();
    if (!activeId) {
        // No active workpackage - silent return
        return {
            progress: 0,
            status: 'success'
        };
    }
    // WP-DF3 AC2 (S167 G1+G2 fix): emit active-WP identity on every ProgressOutput
    // so the post-tool.sh:145 jq extraction can forward systemId/displayId/title
    // to sync-bridge handleUpdateWorkpackage. Prior to this, sync-state.workpackage
    // title was structurally unreachable.
    const activeEntry = registry.getWorkpackage(activeId);
    const wpContext = activeEntry
        ? {
            systemId: activeEntry.systemId || activeEntry.id,
            displayId: activeEntry.id,
            title: activeEntry.title,
        }
        : {};
    const state = registry.loadState();
    const previousProgress = state.progress;
    // If a file was specified, match to deliverable first (auto-promotion is the canonical
    // contract per skills/cf-workpackage/SKILL.md). Scope validation runs AFTER as advisory:
    // a deliverable match is the strongest "in-scope" signal, and short-circuiting on scope
    // before deliverable matching would suppress auto-promotion for any WP whose scope.in_scope
    // contains natural-language feature descriptions (the common cf-plan/Bulwark-import shape).
    if (options.file) {
        const matchedDeliverable = registry.matchFileToDeliverable(options.file);
        if (matchedDeliverable && !options.deliverableId) {
            options.deliverableId = matchedDeliverable;
        }
        // Auto-mark matched deliverable as in_progress on first write
        // Skip if --complete is set — explicit complete takes precedence over auto in_progress
        if (matchedDeliverable && !options.markComplete) {
            try {
                registry.markDeliverableInProgress(matchedDeliverable);
            }
            catch (error) {
                // Non-fatal — log but continue with rest of tracking
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                return {
                    progress: previousProgress,
                    status: 'warning',
                    error: `Auto-progress failed: ${errorMsg}`,
                    ...wpContext
                };
            }
        }
        // After the in_progress match attempt, check the deliverable the written file
        // maps to for file-presence completion. (When the write maps to no deliverable,
        // this resolves to a no-op — nothing to complete.) The auto-promote mechanism
        // turns the in_progress state into complete once the deliverable's target file is
        // on disk. Passing options.file scopes completion to that one deliverable, so a
        // tracked write to an UNRELATED file can no longer spuriously complete a
        // deliverable whose target happens to already exist. The global "catch-up" sweep
        // (no writtenPath) is reserved by convention for an explicit reconcile path, not
        // this per-write hook.
        // projectRoot resolved once at the top of trackProgress (parent of the .clear dir).
        const promotedToComplete = registry.checkInProgressDeliverablesForCompletion(projectRoot, options.file);
        const lastPromoted = promotedToComplete[promotedToComplete.length - 1];
        // Compute progress AFTER both auto-mark and sweep so the result reflects current truth.
        const newProgress = registry.calculateProgress(activeId).progress;
        // Scope validation (advisory). validateScope is tolerant of natural-language in_scope
        // items — only pattern-shaped scope items trigger out-of-scope. A deliverable match
        // suppresses the scope warning entirely (the match is the canonical in-scope signal).
        const scopeResult = registry.validateScope(options.file);
        const scopeWarningApplies = !scopeResult.valid && !matchedDeliverable;
        if (newProgress !== previousProgress) {
            const promotionLabel = lastPromoted ? 'complete' : matchedDeliverable ? 'in_progress' : undefined;
            const progressMsg = formatProgressUpdate(activeId, newProgress, lastPromoted ?? matchedDeliverable ?? undefined, promotionLabel);
            return {
                additionalContext: scopeWarningApplies
                    ? `${progressMsg}\n\n${formatScopeWarning(options.file, scopeResult.suggestedWorkpackage)}`
                    : progressMsg,
                progress: newProgress,
                status: 'success',
                ...(scopeWarningApplies ? { scopeValid: false } : {}),
                ...wpContext
            };
        }
        if (scopeWarningApplies) {
            return {
                additionalContext: formatScopeWarning(options.file, scopeResult.suggestedWorkpackage),
                progress: previousProgress,
                status: 'warning',
                scopeValid: false,
                ...wpContext
            };
        }
    }
    // If marking a deliverable complete
    if (options.deliverableId && options.markComplete) {
        try {
            const newProgress = registry.markDeliverableComplete(options.deliverableId);
            // Only output if progress changed
            if (newProgress !== previousProgress) {
                return {
                    additionalContext: formatProgressUpdate(activeId, newProgress, options.deliverableId, 'complete'),
                    progress: newProgress,
                    status: 'success',
                    ...wpContext
                };
            }
        }
        catch (error) {
            return {
                progress: previousProgress,
                status: 'error',
                error: error instanceof Error ? error.message : 'Failed to mark complete',
                ...wpContext
            };
        }
    }
    // Recalculate progress
    const progressResult = registry.calculateProgress(activeId);
    const currentProgress = progressResult.progress;
    // Check for 100% completion
    if (currentProgress >= 100 && previousProgress < 100) {
        return {
            additionalContext: `🎉 [${activeId}] Workpackage complete! All deliverables finished.`,
            progress: currentProgress,
            status: 'success',
            ...wpContext
        };
    }
    // Only output if progress changed (silent otherwise)
    if (currentProgress !== previousProgress) {
        // Update state with new progress
        state.progress = currentProgress;
        state.lastActivity = new Date().toISOString();
        registry.saveState(state);
        return {
            additionalContext: formatProgressUpdate(activeId, currentProgress),
            progress: currentProgress,
            status: 'success',
            ...wpContext
        };
    }
    // Silent return - no progress change.
    // WP-DF3 AC2: still emit wpContext so post-tool.sh can keep sync-state fresh
    // even when progress didn't move (covers the mid-session WP-switch window
    // before the first progress-changing edit on the new WP).
    return {
        progress: currentProgress,
        status: 'success',
        ...wpContext
    };
}
/**
 * Apply the dual-key envelope to a result before serialization.
 */
function withEnvelope(result) {
    const text = result.additionalContext ?? result.error ?? '';
    return {
        ...result,
        success: result.status === 'success',
        message: text,
        additionalContext: text,
    };
}
// Main execution — only run when invoked directly
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: progress-cli.js [options]',
                '',
                'Hook mode (called by PostToolUse):',
                '  --file=<path>              File being written (scope check + deliverable match)',
                '  --deliverable=<id>         Deliverable ID to update',
                '  --complete                 Mark matched deliverable as complete',
                '  --prompt=<text>            User prompt context',
                '',
                'Slash command mode (called via lifecycle-cli progress):',
                '  progress [<N>|--set <N>]   View or set progress (0-100)',
                '',
                'Common:',
                '  --clear-dir=<path>         Path to .clear directory (default: .clear)',
                '',
                'Notes:',
                '  - Hook mode auto-marks deliverables in_progress on first matching write,',
                '    then auto-promotes to complete when description-extracted file exists on disk.',
                '  - To revert premature promotion (e.g., stub file triggered auto-completion):',
                '      update-cli deliverable <deliverable-id> --status=in_progress',
                '  - `progress --set 100` sweeps all deliverables to complete (state-machine consistent).',
            ].join('\n')
        }));
        process.exit(0);
    }
    try {
        const options = parseArgs();
        const result = trackProgress(options);
        console.log(JSON.stringify(withEnvelope(result)));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
            progress: 0,
            status: 'error',
            error: errorMessage,
            additionalContext: errorMessage
        };
        console.log(JSON.stringify(withEnvelope(result)));
    }
}
//# sourceMappingURL=progress-cli.js.map