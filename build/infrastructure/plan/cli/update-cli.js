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
exports.updateMilestoneRequires = updateMilestoneRequires;
exports.runUpdateCLI = runUpdateCLI;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const registry_1 = require("../registry");
const parse_args_1 = require("../../cli/parse-args");
const validation_1 = require("../../validation");
const plan_rollup_1 = require("../../sync/plan-rollup");
const types_1 = require("../types");
const writer_1 = require("../writer");
const audit_log_1 = require("../../sync/audit-log");
/**
 * Apply the dual-key envelope to a result before serialization.
 * Sets `success` from `status === 'success'`, and mirrors
 * `additionalContext` (or `error` as fallback) into `message`.
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
 * Statuses a milestone can be SET to via tooling (reversibility). `at_risk` is a
 * derived risk signal that is never hand-set; this narrows `string` to the
 * settable subset of MilestoneStatus.
 */
function isSettableMilestoneStatus(status) {
    return status === 'complete' || status === 'in_progress' || status === 'not_started';
}
/**
 * Set a milestone's status in plan.json and master-plan.yaml.
 *
 * Accepts complete / in_progress / not_started (reversibility — a milestone
 * declared complete can be walked back). The lockstep two-surface write, and
 * clearing completedAt on any non-complete status, is owned by
 * registry.setMilestoneStatus, so this function no longer does its own YAML
 * write-back (the prior two-store divergence is closed at the writer).
 */
function updateMilestone(registry, milestoneId, status) {
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
    // Reversibility: a milestone can be set complete, walked back to in_progress,
    // or reset to not_started. `at_risk` is a derived risk signal, not a
    // hand-settable status, so it is rejected here. The type-guard narrows
    // `status` to MilestoneStatus, so the writer call needs no cast.
    if (!isSettableMilestoneStatus(status)) {
        return {
            status: 'error',
            error: `Unsupported milestone status: ${status}. Supported: complete, in_progress, not_started.`
        };
    }
    // setMilestoneStatus writes plan.json AND master-plan.yaml in lockstep and
    // clears completedAt for any non-complete status, so the prior separate YAML
    // write-back is subsumed (no surface divergence, no residual completedAt).
    registry.setMilestoneStatus(milestoneId, status);
    return {
        status: 'success',
        action: 'update-milestone',
        details: { milestoneId, status, milestoneName: milestone.name },
        additionalContext: `Milestone status set to ${status}: ${milestoneId} (${milestone.name})`
    };
}
/**
 * Edit a milestone's `requires` list (AC16-AC18, AC23-AC24, AC27).
 *
 * Parses comma-separated IDs from --requires=<list>, de-duplicates,
 * validates each ID exists in plan.phases[].workpackages OR plan.milestones,
 * replaces milestone.requires entirely, writes back to master-plan.yaml.
 *
 * Audit action: 'edit-requires' (distinguishes from 'update-milestone' status-complete).
 *
 * Empty list rejected (AC23) — clearing requires would orphan the milestone's
 * completion gating, so it requires an explicit future flag.
 */
function updateMilestoneRequires(registry, milestoneId, requiresRaw, cwd, auditLogger) {
    const plan = registry.loadPlan();
    if (!plan) {
        return { status: 'no_plan', error: 'No master plan found' };
    }
    // Parse comma-list — trim each token, drop empties, then de-dup (AC24).
    const rawTokens = requiresRaw.split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (rawTokens.length === 0) {
        return {
            status: 'error',
            error: '[CLEAR] --requires requires at least one ID, or use --status=complete for status-only updates.'
        };
    }
    // De-dup preserving first occurrence (AC24).
    const seen = new Set();
    const requiresList = [];
    let dedupedCount = 0;
    for (const token of rawTokens) {
        if (seen.has(token)) {
            dedupedCount++;
            continue;
        }
        seen.add(token);
        requiresList.push(token);
    }
    const planMilestone = plan.milestones.find(m => m.id === milestoneId);
    if (!planMilestone) {
        const available = plan.milestones.map(m => `  - ${m.id}: ${m.name}`).join('\n');
        return {
            status: 'error',
            error: `Milestone not found: ${milestoneId}`,
            additionalContext: `Milestone "${milestoneId}" not found. Available milestones:\n${available}`
        };
    }
    // Build set of valid reference IDs: all WP IDs across all phases + all milestone IDs.
    const validWpIds = new Set(plan.phases.flatMap(p => p.workpackages));
    const validMilestoneIds = new Set(plan.milestones.map(m => m.id));
    const invalidIds = requiresList.filter(id => !validWpIds.has(id) && !validMilestoneIds.has(id));
    if (invalidIds.length > 0) {
        const availableWps = [...validWpIds].sort().map(id => `  - ${id}`).join('\n');
        const availableMilestones = [...validMilestoneIds].sort().map(id => `  - ${id}`).join('\n');
        return {
            status: 'error',
            error: `Invalid --requires ID(s): ${invalidIds.join(', ')}`,
            additionalContext: `[CLEAR] --requires references unknown ID(s): ${invalidIds.join(', ')}.\n\n` +
                `Available workpackage IDs:\n${availableWps || '  (none)'}\n\n` +
                `Available milestone IDs:\n${availableMilestones || '  (none)'}`
        };
    }
    const oldRequires = [...planMilestone.requires];
    planMilestone.requires = requiresList;
    const writeResult = (0, writer_1.writeMasterPlan)(cwd, plan);
    if (writeResult.status === 'error') {
        return {
            status: 'error',
            error: `master-plan.yaml write failed: ${writeResult.error ?? 'unknown write error'}`
        };
    }
    // Canonical AuditAction is broad-category ('update'); specific operation distinction
    // (per AC16) lives in metadata.operation. Mirrors S180 phase-cli pattern at
    // phase-cli.ts:549-557 (action: 'create' + metadata.operation: 'add').
    auditLogger?.log({
        domain: 'plan',
        action: 'update',
        trigger: 'user_prompt',
        target: planMilestone.id,
        targetDisplayId: planMilestone.id,
        oldValue: oldRequires,
        newValue: requiresList,
        metadata: {
            surface: 'milestone',
            operation: 'edit-requires',
            dedupedCount
        }
    });
    const dedupNote = dedupedCount > 0 ? ` (deduplicated ${dedupedCount} repeat ID${dedupedCount === 1 ? '' : 's'})` : '';
    return {
        status: 'success',
        action: 'edit-requires',
        details: {
            milestoneId,
            milestoneName: planMilestone.name,
            oldRequires,
            newRequires: requiresList,
            dedupedCount
        },
        additionalContext: `Milestone ${milestoneId} requires updated: [${requiresList.join(', ')}]${dedupNote}`
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
        .map(([id, p]) => `  ${id}: ${p}%`)
        .join('\n');
    let message = `Plan rollup complete. Overall: ${result.overallProgress}%\n${phaseEntries}`;
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
    const clearDir = (0, validation_1.resolveClearDir)(options.clearDir || `${options.cwd}/.clear`).clearSubdir;
    const registry = new registry_1.PlanRegistryManager(clearDir);
    if (options.activePhase) {
        return updateActivePhase(registry, options.activePhase, options.cwd);
    }
    if (options.milestone) {
        // --requires takes precedence over --status (edit-requires is more specific).
        if (options.milestoneRequires !== undefined) {
            const auditLogger = (0, audit_log_1.createAuditLogger)(options.cwd, options.sessionId, options.sessionNumber);
            return updateMilestoneRequires(registry, options.milestone, options.milestoneRequires, options.cwd, auditLogger);
        }
        const status = options.milestoneStatus ?? 'complete';
        return updateMilestone(registry, options.milestone, status);
    }
    if (options.rollup) {
        return triggerRollup(options);
    }
    if (options.changelog) {
        return appendChangelog(options);
    }
    return {
        status: 'error',
        error: 'No action specified. Use --active-phase=<id>, --milestone=<id> --status=complete, --milestone=<id> --requires=<csv>, --rollup, or --changelog --changelog-type=<type>.'
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
        { prefix: '--requires=', apply: (v, o) => { o.milestoneRequires = v; } },
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
                '  --milestone=<id>             Update a milestone (requires --status OR --requires)',
                '  --rollup                     Recalculate plan progress from WP states',
                '  --changelog                  Add a changelog entry',
                '',
                'Options:',
                '  --cwd=<path>                 Project root directory (default: .)',
                '  --status=<status>            Milestone status (with --milestone, accepts: complete)',
                '  --requires=<csv>             Replace milestone.requires list with comma-separated IDs (WP or milestone IDs).',
                '                               Duplicates are silently removed. Empty list is rejected.',
                '                               Takes precedence over --status when both are present.',
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
        console.log(JSON.stringify(withEnvelope(result)));
    })
        .catch(error => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(JSON.stringify(withEnvelope({
            status: 'error',
            error: errorMessage,
            additionalContext: errorMessage,
        })));
        process.exit(1);
    });
}
//# sourceMappingURL=update-cli.js.map