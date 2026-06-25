#!/usr/bin/env npx ts-node
"use strict";
/**
 * Plan Blockers CLI Tool
 *
 * Detects and reports blocking issues across phases.
 * Called by plan-blockers.sh bash wrapper.
 *
 * Usage: npx ts-node blockers-cli.ts --clear-dir=<path> [--phase=<id>]
 */
Object.defineProperty(exports, "__esModule", { value: true });
const registry_1 = require("../registry");
const parse_args_1 = require("../../cli/parse-args");
const validation_1 = require("../../validation");
/**
 * Parse command line arguments
 */
function parseArgs() {
    return (0, parse_args_1.parseCliArgs)({ clearDir: './.clear' }, [
        { prefix: '--phase=', apply: (v, o) => { o.phaseId = v; } }
    ]);
}
/**
 * Get severity icon
 */
function getSeverityIcon(severity) {
    switch (severity) {
        case 'critical':
            return '🔴';
        case 'high':
            return '🟠';
        case 'medium':
            return '🟡';
        case 'low':
            return '🟢';
        default:
            return '⚪';
    }
}
/**
 * Format blockers for context output
 */
function formatBlockersContext(blockers, suggestions) {
    const lines = [];
    if (blockers.length === 0) {
        return '✅ No blockers detected. All dependencies satisfied.';
    }
    lines.push(`⚠️ ${blockers.length} blocker${blockers.length > 1 ? 's' : ''} detected:`);
    lines.push('');
    blockers.forEach((blocker, i) => {
        const icon = getSeverityIcon(blocker.severity);
        switch (blocker.type) {
            case 'dependency':
                lines.push(`${i + 1}. ${icon} ${blocker.blocking} blocks ${blocker.blocked} (hard dependency)`);
                if (blocker.description) {
                    lines.push(`   → ${blocker.description}`);
                }
                break;
            case 'milestone_risk': {
                const timePct = blocker.timeConsumed !== undefined ? Math.round(blocker.timeConsumed) : 0;
                const progressPct = blocker.progress !== undefined ? Math.round(blocker.progress) : 0;
                lines.push(`${i + 1}. ${icon} ${blocker.milestone} at risk (${timePct}% time, ${progressPct}% progress)`);
                if (blocker.description) {
                    lines.push(`   → ${blocker.description}`);
                }
                break;
            }
            case 'resource':
                lines.push(`${i + 1}. ${icon} Resource constraint`);
                if (blocker.description) {
                    lines.push(`   → ${blocker.description}`);
                }
                break;
            case 'decision':
                lines.push(`${i + 1}. ${icon} Pending decision`);
                if (blocker.description) {
                    lines.push(`   → ${blocker.description}`);
                }
                break;
        }
    });
    if (suggestions.length > 0) {
        lines.push('');
        lines.push('Suggestions:');
        suggestions.forEach((suggestion) => {
            lines.push(`• ${suggestion}`);
        });
    }
    return lines.join('\n');
}
/**
 * Main blockers operation
 */
function detectBlockers(options) {
    const registry = new registry_1.PlanRegistryManager((0, validation_1.resolveClearDir)(options.clearDir).clearSubdir);
    // Load plan
    const plan = registry.loadPlan();
    if (!plan) {
        const text = 'No plan found';
        return {
            success: false,
            message: text,
            additionalContext: text,
            blockers: [],
            status: 'error',
            error: text
        };
    }
    // Detect blockers
    const blockers = registry.detectBlockers(options.phaseId);
    // Generate suggestions
    const suggestions = registry.generateSuggestions(blockers);
    // Update state with blockers
    const state = registry.loadState();
    state.blockers = blockers;
    state.lastActivity = new Date().toISOString();
    registry.saveState(state);
    if (blockers.length === 0) {
        const text = '✅ No blockers detected. All dependencies satisfied.';
        return {
            success: true,
            message: text,
            additionalContext: text,
            blockers: [],
            status: 'clear'
        };
    }
    const text = formatBlockersContext(blockers, suggestions);
    return {
        success: true,
        message: text,
        additionalContext: text,
        blockers,
        suggestions,
        status: 'blockers_found'
    };
}
// Main execution — only run when invoked directly
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: blockers-cli.js [options]',
                '',
                'Options:',
                '  --clear-dir=<path>           Path to .clear directory (default: .clear)',
                '  --phase=<phase-id>           Filter blockers by phase ID',
            ].join('\n')
        }));
        process.exit(0);
    }
    try {
        const options = parseArgs();
        const result = detectBlockers(options);
        console.log(JSON.stringify(result));
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const result = {
            success: false,
            message: errorMessage,
            additionalContext: errorMessage,
            blockers: [],
            status: 'error',
            error: errorMessage
        };
        console.log(JSON.stringify(result));
    }
}
//# sourceMappingURL=blockers-cli.js.map