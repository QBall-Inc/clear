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
                progress: active.progress ?? 0,
                message: `Invalid progress value: ${setProgress}. Must be between 0 and 100.`
            };
        }
        // Cannot set progress on completed/archived
        if (active.status === 'complete' || active.status === 'archived') {
            return {
                success: false,
                workpackage: active,
                progress: active.progress ?? 0,
                message: `Cannot update progress on ${active.status} workpackage.`
            };
        }
        const oldProgress = active.progress ?? 0;
        // Note: entry mutation is in-memory only (for result/display); persisted via state file below
        active.progress = setProgress;
        // Update state
        const newState = {
            ...state,
            progress: setProgress,
            lastActivity: new Date().toISOString()
        };
        registry.saveState(newState);
        return {
            success: true,
            workpackage: active,
            progress: setProgress,
            message: `✅ ${active.id} progress updated: ${(0, status_cli_1.formatProgress)(oldProgress)} → ${(0, status_cli_1.formatProgress)(setProgress)}`
        };
    }
    // 5. View progress
    const currentProgress = active.progress ?? state.progress ?? 0;
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
    const registry = new registry_1.WorkpackageRegistryManager(options.clearDir);
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
function formatProgressUpdate(workpackageId, progress, completedDeliverable) {
    const percentage = Math.round(progress * 100);
    let message = `[${workpackageId} Progress: ${percentage}%]`;
    if (completedDeliverable) {
        message += ` ✅ Deliverable complete: ${completedDeliverable}`;
    }
    return message;
}
/**
 * Main progress tracking operation
 */
function trackProgress(options) {
    const registry = new registry_1.WorkpackageRegistryManager(options.clearDir);
    // Get active workpackage
    const activeId = registry.getActiveWorkpackageId();
    if (!activeId) {
        // No active workpackage - silent return
        return {
            progress: 0,
            status: 'success'
        };
    }
    const state = registry.loadState();
    const previousProgress = state.progress;
    // If a file was specified, check scope and match to deliverable
    if (options.file) {
        // Validate scope
        const scopeResult = registry.validateScope(options.file);
        if (!scopeResult.valid) {
            return {
                additionalContext: formatScopeWarning(options.file, scopeResult.suggestedWorkpackage),
                progress: previousProgress,
                status: 'warning',
                scopeValid: false
            };
        }
        // Try to match file to a deliverable
        const matchedDeliverable = registry.matchFileToDeliverable(options.file);
        if (matchedDeliverable && !options.deliverableId) {
            options.deliverableId = matchedDeliverable;
        }
        // Auto-mark matched deliverable as in_progress on first write
        // Skip if --complete is set — explicit complete takes precedence over auto in_progress
        if (matchedDeliverable && !options.markComplete) {
            try {
                const newProgress = registry.markDeliverableInProgress(matchedDeliverable);
                if (newProgress !== previousProgress) {
                    return {
                        additionalContext: formatProgressUpdate(activeId, newProgress, matchedDeliverable),
                        progress: newProgress,
                        status: 'success'
                    };
                }
            }
            catch (error) {
                // Non-fatal — log but continue with rest of tracking
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                return {
                    progress: previousProgress,
                    status: 'warning',
                    error: `Auto-progress failed: ${errorMsg}`
                };
            }
        }
    }
    // If marking a deliverable complete
    if (options.deliverableId && options.markComplete) {
        try {
            const newProgress = registry.markDeliverableComplete(options.deliverableId);
            // Only output if progress changed
            if (newProgress !== previousProgress) {
                return {
                    additionalContext: formatProgressUpdate(activeId, newProgress, options.deliverableId),
                    progress: newProgress,
                    status: 'success'
                };
            }
        }
        catch (error) {
            return {
                progress: previousProgress,
                status: 'error',
                error: error instanceof Error ? error.message : 'Failed to mark complete'
            };
        }
    }
    // Recalculate progress
    const progressResult = registry.calculateProgress(activeId);
    const currentProgress = progressResult.progress;
    // Check for 100% completion
    if (currentProgress >= 1 && previousProgress < 1) {
        return {
            additionalContext: `🎉 [${activeId}] Workpackage complete! All deliverables finished.`,
            progress: currentProgress,
            status: 'success'
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
            status: 'success'
        };
    }
    // Silent return - no progress change
    return {
        progress: currentProgress,
        status: 'success'
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
            ].join('\n')
        }));
        process.exit(0);
    }
    try {
        const options = parseArgs();
        const result = trackProgress(options);
        console.log(JSON.stringify(result));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
            progress: 0,
            status: 'error',
            error: errorMessage
        };
        console.log(JSON.stringify(result));
    }
}
//# sourceMappingURL=progress-cli.js.map