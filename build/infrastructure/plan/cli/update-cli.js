"use strict";
/**
 * Plan Update CLI (R4.2c)
 *
 * Implements /cf-plan update command for programmatic plan state updates.
 * Supports: --active-phase, --milestone + --status, --rollup.
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
exports.updateActivePhase = updateActivePhase;
exports.updateMilestone = updateMilestone;
exports.runUpdateCLI = runUpdateCLI;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const registry_1 = require("../registry");
const parse_args_1 = require("../../cli/parse-args");
const plan_rollup_1 = require("../../sync/plan-rollup");
const types_1 = require("../types");
const writer_1 = require("../writer");
// ==============================================================================
// OPERATIONS
// ==============================================================================
/**
 * Update the active phase in plan.json and master-plan.yaml
 *
 * POST-31 fix: writes back to master-plan.yaml so that registry.getActivePhase()
 * (which reads from YAML) returns the correct phase on subsequent invocations.
 */
function updateActivePhase(registry, phaseId, cwd) {
    const plan = registry.loadPlan();
    if (!plan) {
        return { status: 'no_plan', error: 'No master plan found' };
    }
    // Resolve phase by either display ID or system ID
    const phase = registry.resolvePhase(phaseId);
    if (!phase) {
        const available = plan.phases.map(p => `  - ${p.id}${p.systemId ? ` (${p.systemId})` : ''}`).join('\n');
        return {
            status: 'error',
            error: `Phase not found: ${phaseId}`,
            additionalContext: `Phase "${phaseId}" not found. Available phases:\n${available}`
        };
    }
    const state = registry.loadState();
    const oldPhaseId = state.activePhaseId;
    state.activePhaseId = phase.id;
    state.activePhaseSystemId = phase.systemId ?? null;
    state.lastActivity = new Date().toISOString();
    registry.saveState(state);
    // YAML write-back (POST-31 fix — R5.5b pattern, fire-and-log)
    plan.activePhase = phase.id;
    const writeResult = (0, writer_1.writeMasterPlan)(cwd, plan);
    if (writeResult.status === 'error') {
        process.stderr.write(`[update-cli] master-plan.yaml write-back failed: ${writeResult.error}\n`);
    }
    return {
        status: 'success',
        action: 'update-active-phase',
        details: { oldPhaseId, newPhaseId: phase.id, systemId: phase.systemId },
        additionalContext: `Active phase updated: ${oldPhaseId} → ${phase.id} (${phase.name})`
    };
}
/**
 * Mark a milestone as complete in plan.json and master-plan.yaml
 *
 * K0.1 finding: same two-store divergence as POST-31.
 * markMilestoneComplete() writes JSON only — this function adds YAML write-back.
 */
function updateMilestone(registry, milestoneId, status, cwd) {
    const plan = registry.loadPlan();
    if (!plan) {
        return { status: 'no_plan', error: 'No master plan found' };
    }
    const milestone = registry.getMilestone(milestoneId);
    if (!milestone) {
        const available = plan.milestones.map(m => `  - ${m.id}: ${m.name}`).join('\n');
        return {
            status: 'error',
            error: `Milestone not found: ${milestoneId}`,
            additionalContext: `Milestone "${milestoneId}" not found. Available milestones:\n${available}`
        };
    }
    if (status !== 'complete') {
        return {
            status: 'error',
            error: `Unsupported milestone status: ${status}. Only "complete" is supported.`
        };
    }
    registry.markMilestoneComplete(milestoneId);
    // YAML write-back (K0.1 finding — R5.5b pattern, fire-and-log)
    const planMilestone = plan.milestones.find(m => m.id === milestoneId);
    if (planMilestone) {
        planMilestone.status = 'complete';
        const writeResult = (0, writer_1.writeMasterPlan)(cwd, plan);
        if (writeResult.status === 'error') {
            process.stderr.write(`[update-cli] milestone YAML write-back failed: ${writeResult.error}\n`);
        }
    }
    return {
        status: 'success',
        action: 'update-milestone',
        details: { milestoneId, status, milestoneName: milestone.name },
        additionalContext: `Milestone marked complete: ${milestoneId} (${milestone.name})`
    };
}
/**
 * Append an entry to the change-log YAML file.
 * Creates the file with a `changes:` root key if it doesn't exist.
 */
function appendChangelog(options) {
    const changeLogPath = path.resolve(options.cwd, types_1.DEFAULT_PLAN_CONFIG.plan.changeLog);
    const changeLogDir = path.dirname(changeLogPath);
    const changelogType = options.changelogType?.trim();
    if (!changelogType) {
        return { status: 'error', error: 'No changelog type specified. Use --changelog-type=<type>.' };
    }
    const entry = {
        timestamp: new Date().toISOString(),
        type: changelogType,
    };
    if (options.changelogMilestone) {
        entry.milestone = options.changelogMilestone;
    }
    if (options.changelogPhase) {
        entry.phase = options.changelogPhase;
    }
    if (options.changelogDetail) {
        entry.detail = options.changelogDetail;
    }
    if (options.sessionNumber > 0) {
        entry.session = options.sessionNumber;
    }
    // Read existing or create new
    let changes = [];
    if (fs.existsSync(changeLogPath)) {
        const raw = fs.readFileSync(changeLogPath, 'utf-8');
        const parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
        if (parsed?.changes && Array.isArray(parsed.changes)) {
            changes = parsed.changes;
        }
    }
    else {
        // Ensure directory exists
        fs.mkdirSync(changeLogDir, { recursive: true });
    }
    changes.push(entry);
    const output = yaml.dump({ changes }, { lineWidth: -1, noRefs: true });
    fs.writeFileSync(changeLogPath, output, 'utf-8');
    return {
        status: 'success',
        action: 'append-changelog',
        details: { path: changeLogPath, entry },
        additionalContext: `Changelog entry appended: ${options.changelogType}${options.changelogMilestone ? ` (${options.changelogMilestone})` : ''}`
    };
}
/**
 * Trigger a plan rollup
 */
async function triggerRollup(options) {
    const result = await (0, plan_rollup_1.rollupPlanProgress)({
        basePath: options.cwd,
        sessionId: options.sessionId,
        sessionNumber: options.sessionNumber
    });
    if (result.status === 'no_plan') {
        return { status: 'no_plan', error: 'No master plan found' };
    }
    if (result.status === 'error') {
        return { status: 'error', error: result.error };
    }
    const phaseEntries = Object.entries(result.phaseProgress)
        .map(([id, p]) => `  ${id}: ${Math.round(p * 100)}%`)
        .join('\n');
    let message = `Plan rollup complete. Overall: ${Math.round(result.overallProgress * 100)}%\n${phaseEntries}`;
    if (result.celebrationMessage) {
        message += `\n${result.celebrationMessage}`;
    }
    return {
        status: 'success',
        action: 'rollup',
        details: {
            overallProgress: result.overallProgress,
            phaseProgress: result.phaseProgress,
            milestonesAchieved: result.milestonesAchieved.map(m => m.milestoneId)
        },
        additionalContext: message
    };
}
// ==============================================================================
// MAIN
// ==============================================================================
/**
 * Run the update CLI
 */
async function runUpdateCLI(options) {
    const clearDir = options.clearDir || `${options.cwd}/.clear`;
    const registry = new registry_1.PlanRegistryManager(clearDir);
    if (options.activePhase) {
        return updateActivePhase(registry, options.activePhase, options.cwd);
    }
    if (options.milestone) {
        const status = options.milestoneStatus ?? 'complete';
        return updateMilestone(registry, options.milestone, status, options.cwd);
    }
    if (options.rollup) {
        return triggerRollup(options);
    }
    if (options.changelog) {
        return appendChangelog(options);
    }
    return {
        status: 'error',
        error: 'No action specified. Use --active-phase=<id>, --milestone=<id> --status=complete, --rollup, or --changelog --changelog-type=<type>.'
    };
}
// ==============================================================================
// CLI MAIN BLOCK
// ==============================================================================
function parseArgs() {
    return (0, parse_args_1.parseCliArgs)({
        clearDir: '',
        cwd: '.',
        sessionId: 'unknown',
        sessionNumber: 0,
        rollup: false,
        changelog: false
    }, [
        { prefix: '--cwd=', apply: (v, o) => { o.cwd = v; } },
        { prefix: '--active-phase=', apply: (v, o) => { o.activePhase = v; } },
        { prefix: '--milestone=', apply: (v, o) => { o.milestone = v; } },
        { prefix: '--status=', apply: (v, o) => { o.milestoneStatus = v; } },
        { prefix: '--session-id=', apply: (v, o) => { o.sessionId = v; } },
        { prefix: '--session-number=', apply: (v, o) => { o.sessionNumber = parseInt(v, 10) || 0; } },
        { flag: '--rollup', apply: (_v, o) => { o.rollup = true; } },
        { flag: '--changelog', apply: (_v, o) => { o.changelog = true; } },
        { prefix: '--changelog-type=', apply: (v, o) => { o.changelogType = v; } },
        { prefix: '--changelog-milestone=', apply: (v, o) => { o.changelogMilestone = v; } },
        { prefix: '--changelog-phase=', apply: (v, o) => { o.changelogPhase = v; } },
        { prefix: '--changelog-detail=', apply: (v, o) => { o.changelogDetail = v; } }
    ]);
}
// Main execution — only run when invoked directly
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: update-cli.js [action] [options]',
                '',
                'Actions (at least one required):',
                '  --active-phase=<phase-id>    Set the active phase',
                '  --milestone=<id>             Update a milestone (requires --status)',
                '  --rollup                     Recalculate plan progress from WP states',
                '  --changelog                  Add a changelog entry',
                '',
                'Options:',
                '  --cwd=<path>                 Project root directory (default: .)',
                '  --status=<status>            Milestone status (with --milestone)',
                '  --session-id=<id>            Current session identifier',
                '  --session-number=<number>    Current session number',
                '  --changelog-type=<type>      Changelog entry type',
                '  --changelog-milestone=<id>   Milestone for changelog entry',
                '  --changelog-phase=<id>       Phase for changelog entry',
                '  --changelog-detail=<text>    Detail text for changelog entry',
            ].join('\n')
        }));
        process.exit(0);
    }
    const input = parseArgs();
    runUpdateCLI(input)
        .then(result => {
        console.log(JSON.stringify(result));
    })
        .catch(error => {
        console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
        process.exit(1);
    });
}
//# sourceMappingURL=update-cli.js.map