"use strict";
/**
 * Plan Phase CLI
 *
 * Granular mutation surface for plan phases. Subcommands:
 *   list           Enumerate phases (read-only)
 *   show           Show full phase detail (read-only)
 *   add            Add a new phase (--name REQUIRED)
 *   rename         Rename an existing phase
 *   mark-complete  Set phase status to 'complete' (idempotent)
 *   delete         Remove a phase + reindex (double opt-in via --yes-i-mean-it)
 *
 * Default with no subcommand is `list` — eliminates the historical
 * phantom-phase risk where invoking with no args silently called `add`.
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
exports.PHASE_SUBCOMMANDS = exports.MAX_NAME_LENGTH = void 0;
exports.validateNameLength = validateNameLength;
exports.findPhaseById = findPhaseById;
exports.insertPhaseAtPosition = insertPhaseAtPosition;
exports.removePhaseAtIndex = removePhaseAtIndex;
exports.detectPhaseIdConvention = detectPhaseIdConvention;
exports.mintNextPhaseId = mintNextPhaseId;
exports.createPhase = createPhase;
exports.cascadePhaseIdChange = cascadePhaseIdChange;
exports.runAddPhase = runAddPhase;
exports.runPhaseCLI = runPhaseCLI;
const path = __importStar(require("path"));
const registry_1 = require("../registry");
const writer_1 = require("../writer");
const types_1 = require("../../sync/types");
const audit_log_1 = require("../../sync/audit-log");
const validation_1 = require("../../validation");
const sanitize_path_1 = require("../../cli/sanitize-path");
// ==============================================================================
// CONSTANTS
// ==============================================================================
/** Maximum length for phase name */
exports.MAX_NAME_LENGTH = 80;
/** Subcommands supported by phase-cli */
exports.PHASE_SUBCOMMANDS = [
    'list',
    'show',
    'add',
    'rename',
    'mark-complete',
    'delete',
    'remove-workpackage',
];
/**
 * Double opt-in flag for destructive operations. _FLAG is the user-facing
 * display string (with the leading `--`); _KEY is the lookup form used against
 * parseArgs' flagsBool set (parseArgs strips the prefix at parse time).
 * Holding both forms together eliminates the prior implicit double-encoding
 * where a single literal had `--` stripped at the call site.
 */
const DELETE_CONFIRM_FLAG = '--yes-i-mean-it';
const DELETE_CONFIRM_FLAG_KEY = 'yes-i-mean-it';
/**
 * Strip control characters and ANSI escape introducers from user-controlled
 * strings (--id, --name) before interpolating into stdout JSON or stderr
 * additionalContext. Prevents log-injection / line-fragmentation where a
 * crafted argv value could split the single-line JSON contract or smuggle
 * terminal escape sequences past the CLI output boundary.
 *
 * Replacement char is `?` to keep the sanitized form recognizable in error
 * text without expanding length unpredictably.
 */
function sanitizeForUserContext(input) {
    // eslint-disable-next-line no-control-regex
    return input.replace(/[\x00-\x1F\x7F]/g, '?');
}
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
// VALIDATION
// ==============================================================================
/**
 * Validate phase name length
 * @param name - Name to validate
 * @returns Validation result with suggested alternative if too long
 */
function validateNameLength(name) {
    if (name.length <= exports.MAX_NAME_LENGTH) {
        return { valid: true };
    }
    const suggested = name.substring(0, exports.MAX_NAME_LENGTH - 3).trim() + '...';
    return { valid: false, suggested };
}
// ==============================================================================
// PHASE MANAGEMENT
// ==============================================================================
/**
 * Find phase by display ID or system ID
 * @param phases - Array of phases
 * @param id - Display or system ID
 * @returns Phase and index, or null if not found
 */
function findPhaseById(phases, id) {
    const index = phases.findIndex(p => p.id === id || p.systemId === id);
    if (index === -1) {
        return null;
    }
    return { phase: phases[index], index };
}
/**
 * Insert a new phase and reindex positions
 * @param phases - Existing phases
 * @param newPhase - Phase to insert
 * @param afterIndex - Insert after this index (-1 for beginning, undefined for end)
 * @returns Updated phases array
 */
function insertPhaseAtPosition(phases, newPhase, afterIndex) {
    const result = [...phases];
    // Calculate insertion index
    const insertIndex = afterIndex !== undefined
        ? afterIndex + 1
        : result.length;
    // Insert new phase
    result.splice(insertIndex, 0, newPhase);
    // Reindex positions only — display IDs are stable identities, decoupled from
    // position. Surviving phases keep their IDs; the new phase keeps its minted ID.
    result.forEach((phase, idx) => {
        phase.position = idx + 1;
    });
    return result;
}
/**
 * Remove a phase at the given index and reindex remaining positions only.
 * Surviving phases keep their display IDs verbatim — deleting a phase never
 * renumbers the IDs of the phases that remain (positions shift to stay contiguous).
 */
function removePhaseAtIndex(phases, removeIndex) {
    const result = [...phases];
    result.splice(removeIndex, 1);
    result.forEach((phase, idx) => {
        phase.position = idx + 1;
    });
    return result;
}
/**
 * Detect the phase display-ID naming convention from a plan's existing phases.
 * Returns the prefix + separator of the first parseable `<prefix><sep><number>`
 * ID (e.g. "Phase-1" → { prefix: "Phase", separator: "-" }; "phase_2" →
 * { prefix: "phase", separator: "_" }). Defaults to canonical `Phase` + `-`
 * for an empty plan or one with no parseable convention.
 */
function detectPhaseIdConvention(phases) {
    for (const phase of phases) {
        const match = /^([A-Za-z]+)([-_])\d+$/.exec(phase.id);
        if (match) {
            return { prefix: match[1], separator: match[2] };
        }
    }
    return { prefix: 'Phase', separator: '-' };
}
/**
 * Mint the next collision-free phase display ID: the maximum numeric suffix
 * across existing IDs + 1, in the plan's detected convention. Position-independent —
 * minting never collides with or gaps against an existing ID. An empty plan mints
 * the convention default (`Phase-1`).
 */
function mintNextPhaseId(phases) {
    const { prefix, separator } = detectPhaseIdConvention(phases);
    let maxSuffix = 0;
    for (const phase of phases) {
        const match = /(\d+)$/.exec(phase.id);
        if (match) {
            const suffix = parseInt(match[1], 10);
            // Guard against a pathologically long numeric suffix overflowing to
            // Infinity (which would mint "<prefix><sep>Infinity"). Not reachable via
            // any CLI path — only via a hand-malformed plan file — but cheap to defend.
            if (Number.isFinite(suffix) && suffix > maxSuffix) {
                maxSuffix = suffix;
            }
        }
    }
    return `${prefix}${separator}${maxSuffix + 1}`;
}
/**
 * Create a new phase object with a caller-minted display ID.
 * @param name - Phase name
 * @param position - Initial position (reindexed on insert)
 * @param id - Display ID, minted collision-free by the caller via {@link mintNextPhaseId}
 * @returns New phase object
 */
function createPhase(name, position, id) {
    return {
        id,
        systemId: (0, types_1.generatePhaseSystemId)(),
        position,
        name,
        status: 'not_started',
        workpackages: [],
        weights: {},
        dependencies: []
    };
}
/**
 * The single mutator permitted to CHANGE an existing phase's display ID.
 *
 * Pure: it updates and returns the three in-memory structures it is handed; the
 * caller owns persistence (no filesystem I/O here). When a phase's display ID
 * changes, it updates the active-phase referential-integrity surfaces in one
 * atomic pass:
 *   1. phases[].id (the rename itself)
 *   2. milestones[].phase
 *   3. master-plan activePhase + plan-state activePhaseId
 *   4. sync-state activePhaseDisplayId
 * The immutable systemId surfaces (activePhaseSystemId) are intentionally left
 * untouched — a display-ID change must not perturb the stable cross-domain ID.
 *
 * Dormant on add/delete (both preserve existing IDs); ships as defense-in-depth
 * and as the substrate for a future phase-rename affordance. NOTE: a real rename
 * affordance must ALSO extend this cascade to the other display-ID reference
 * surfaces a rename would orphan — workpackage `phase` fields and phase
 * `dependencies[]` entries that reference phases by display ID — which lie
 * outside the active-phase invariant this function currently maintains.
 */
function cascadePhaseIdChange(oldId, newId, surfaces) {
    const { plan, planState, syncState } = surfaces;
    for (const phase of plan.phases) {
        if (phase.id === oldId) {
            phase.id = newId;
        }
    }
    for (const milestone of plan.milestones) {
        if (milestone.phase === oldId) {
            milestone.phase = newId;
        }
    }
    if (plan.activePhase === oldId) {
        plan.activePhase = newId;
    }
    if (planState.activePhaseId === oldId) {
        planState.activePhaseId = newId;
    }
    if (syncState.plan.activePhaseDisplayId === oldId) {
        syncState.plan.activePhaseDisplayId = newId;
    }
    return { plan, planState, syncState };
}
// ==============================================================================
// OUTPUT FORMATTING
// ==============================================================================
/**
 * Format add-success message
 */
function formatAddSuccessMessage(phases, newPhase, afterPhaseId) {
    const lines = [];
    lines.push(`✅ Phase added: ${newPhase.id} - "${newPhase.name}"`);
    lines.push('');
    lines.push(`Position: ${newPhase.position}${afterPhaseId ? ` (after ${afterPhaseId})` : ' (at end)'}`);
    lines.push(`System ID: ${newPhase.systemId}`);
    lines.push('');
    lines.push('Phases:');
    for (const phase of phases) {
        const statusIcon = getStatusIcon(phase.status);
        const isNew = phase.systemId === newPhase.systemId;
        const marker = isNew ? ' ← NEW' : '';
        lines.push(`  ${phase.id}: ${phase.name} [${statusIcon}]${marker}`);
    }
    return lines.join('\n');
}
/**
 * Get status icon for display
 */
function getStatusIcon(status) {
    switch (status) {
        case 'complete': return '✅';
        case 'in_progress': return '🔄';
        case 'blocked': return '🚫';
        case 'deferred': return '⏸️';
        default: return '⬜';
    }
}
/**
 * Format validation error message
 */
function formatValidationMessage(providedName, suggestedName) {
    const lines = [];
    lines.push(`❌ Name exceeds ${exports.MAX_NAME_LENGTH} characters (currently: ${providedName.length})`);
    lines.push('');
    lines.push(`Provided: "${providedName}"`);
    if (suggestedName) {
        lines.push('');
        lines.push(`Suggestion: "${suggestedName}"`);
    }
    lines.push('');
    lines.push('Please provide a shorter name or accept the suggestion.');
    return lines.join('\n');
}
/**
 * Format the "Available phases:" lookup-failure helper text.
 * Reused by show/rename/delete/mark-complete NotFound paths so users always
 * see actionable next-step guidance.
 */
function formatAvailablePhases(phases) {
    if (phases.length === 0) {
        return 'No phases defined in this plan yet.';
    }
    const rows = phases.map(p => `  - ${p.id} (${p.systemId}): ${p.name}`).join('\n');
    return `Available phases:\n${rows}`;
}
/**
 * Format list-subcommand output as a compact table.
 */
function formatListOutput(phases) {
    if (phases.length === 0) {
        return 'No phases defined.';
    }
    const lines = [];
    lines.push('Phases:');
    lines.push('');
    for (const phase of phases) {
        const wpCount = Array.isArray(phase.workpackages) ? phase.workpackages.length : 0;
        const icon = getStatusIcon(phase.status);
        lines.push(`  ${phase.id} (${phase.systemId}) — ${phase.name} [${icon} ${phase.status}] — ${wpCount} workpackage${wpCount === 1 ? '' : 's'}`);
    }
    return lines.join('\n');
}
/**
 * Format show-subcommand output (full detail for a single phase).
 */
function formatShowOutput(phase) {
    const lines = [];
    lines.push(`Phase: ${phase.id} (${phase.systemId})`);
    lines.push('');
    lines.push(`  Name: ${phase.name}`);
    lines.push(`  Position: ${phase.position}`);
    lines.push(`  Status: ${getStatusIcon(phase.status)} ${phase.status}`);
    const wps = Array.isArray(phase.workpackages) ? phase.workpackages : [];
    lines.push(`  Workpackages (${wps.length}):`);
    if (wps.length === 0) {
        lines.push('    (none)');
    }
    else {
        for (const wp of wps) {
            const weight = phase.weights?.[wp];
            lines.push(`    - ${wp}${weight !== undefined ? ` [weight: ${weight}]` : ''}`);
        }
    }
    const deps = Array.isArray(phase.dependencies) ? phase.dependencies : [];
    lines.push(`  Dependencies (${deps.length}):`);
    if (deps.length === 0) {
        lines.push('    (none)');
    }
    else {
        for (const dep of deps) {
            lines.push(`    - ${dep}`);
        }
    }
    return lines.join('\n');
}
function loadPlanOrFail(cwd, subcommand) {
    const clearDir = path.join(cwd, '.clear');
    const registry = new registry_1.PlanRegistryManager(clearDir);
    const plan = registry.loadPlan();
    if (!plan) {
        return {
            ok: false,
            failure: {
                status: 'no_plan',
                subcommand,
                error: 'No master plan found',
                additionalContext: 'No master plan found. Use /cf-plan create first.',
            },
        };
    }
    return { ok: true, plan, registry };
}
function resolvePhaseOrFail(registry, plan, id, subcommand) {
    const phase = registry.resolvePhase(id);
    if (!phase) {
        const safeId = sanitizeForUserContext(id);
        return {
            ok: false,
            failure: {
                status: 'not_found',
                subcommand,
                error: `Phase not found: ${safeId}`,
                additionalContext: `[CLEAR] phase-cli ${subcommand}: phase "${safeId}" not found.\n\n${formatAvailablePhases(plan.phases)}`,
            },
        };
    }
    return { ok: true, phase };
}
// ==============================================================================
// SUBCOMMAND HANDLERS
// ==============================================================================
/**
 * `phase-cli list` — read-only enumeration.
 */
function runListPhase(options) {
    const loaded = loadPlanOrFail(options.cwd, 'list');
    if (!loaded.ok)
        return loaded.failure;
    return {
        status: 'success',
        subcommand: 'list',
        additionalContext: formatListOutput(loaded.plan.phases),
    };
}
/**
 * `phase-cli show --id=<phase-id>` — full phase detail (read-only).
 */
function runShowPhase(id, options) {
    if (!id || id.trim() === '') {
        return {
            status: 'invalid_args',
            subcommand: 'show',
            error: '--id is required',
            additionalContext: '[CLEAR] phase-cli show: --id is required. See `phase-cli show --help` for usage.',
        };
    }
    const loaded = loadPlanOrFail(options.cwd, 'show');
    if (!loaded.ok)
        return loaded.failure;
    const resolved = resolvePhaseOrFail(loaded.registry, loaded.plan, id, 'show');
    if (!resolved.ok)
        return resolved.failure;
    const { phase } = resolved;
    return {
        status: 'success',
        subcommand: 'show',
        phaseId: phase.id,
        phaseSystemId: phase.systemId,
        phaseName: phase.name,
        position: phase.position,
        additionalContext: formatShowOutput(phase),
    };
}
/**
 * `phase-cli add --name=<name>` — REJECTS missing --name (no silent default).
 *
 * Synchronous despite the legacy `Promise` wrapping — no awaits in body.
 * The CLI dispatcher (runPhaseCLI) is async; sync results auto-wrap.
 */
function runAddPhase(input, auditLogger) {
    const { cwd, name, afterId } = input;
    // --name is REQUIRED — no silent default.
    if (!name || name.trim() === '') {
        return {
            status: 'invalid_args',
            subcommand: 'add',
            error: '--name is required',
            additionalContext: '[CLEAR] phase-cli add: --name is required. See `phase-cli add --help` for usage.',
        };
    }
    const phaseName = name.trim();
    const loaded = loadPlanOrFail(cwd, 'add');
    if (!loaded.ok)
        return loaded.failure;
    const { plan } = loaded;
    // Validate name length
    const validation = validateNameLength(phaseName);
    if (!validation.valid) {
        return {
            status: 'error',
            subcommand: 'add',
            error: `Name exceeds ${exports.MAX_NAME_LENGTH} characters`,
            additionalContext: formatValidationMessage(phaseName, validation.suggested),
        };
    }
    try {
        // Find insertion point
        let afterIndex;
        let afterPhaseId;
        if (afterId) {
            const found = findPhaseById(plan.phases, afterId);
            if (!found) {
                const safeAfter = sanitizeForUserContext(afterId);
                return {
                    status: 'not_found',
                    subcommand: 'add',
                    error: `Phase not found: ${safeAfter}`,
                    additionalContext: `[CLEAR] phase-cli add: --after phase "${safeAfter}" not found.\n\n${formatAvailablePhases(plan.phases)}`,
                };
            }
            afterIndex = found.index;
            afterPhaseId = found.phase.id;
        }
        // Create new phase with a collision-free display ID minted in the plan's
        // detected convention (max numeric suffix + 1), NOT derived from position.
        const newId = mintNextPhaseId(plan.phases);
        const newPhase = createPhase(phaseName, plan.phases.length + 1, newId);
        // Insert and reindex positions (existing display IDs preserved)
        const updatedPhases = insertPhaseAtPosition(plan.phases, newPhase, afterIndex);
        // Update plan
        const updatedPlan = {
            ...plan,
            phases: updatedPhases
        };
        // Write updated plan
        const writeResult = (0, writer_1.writeMasterPlan)(cwd, updatedPlan);
        if (writeResult.status === 'error') {
            const writeErr = (0, sanitize_path_1.redactProjectPath)(writeResult.error ?? 'unknown write error', cwd);
            return {
                status: 'error',
                subcommand: 'add',
                error: writeErr,
                additionalContext: `Failed to write plan: ${writeErr}`,
            };
        }
        // Find the new phase after reindexing
        const insertedPhase = updatedPhases.find(p => p.systemId === newPhase.systemId);
        if (!insertedPhase) {
            throw new Error(`Phase with systemId ${newPhase.systemId} not found after insertion`);
        }
        // Audit log (when auditLogger available — read-only call paths skip this)
        auditLogger?.log({
            domain: 'plan',
            action: 'create',
            trigger: 'user_prompt',
            target: insertedPhase.systemId ?? insertedPhase.id,
            targetDisplayId: insertedPhase.id,
            newValue: { name: insertedPhase.name, position: insertedPhase.position },
            metadata: { surface: 'phase', operation: 'add', afterPhase: afterPhaseId },
        });
        return {
            status: 'success',
            subcommand: 'add',
            phaseId: insertedPhase.id,
            phaseSystemId: insertedPhase.systemId,
            phaseName: insertedPhase.name,
            position: insertedPhase.position,
            afterPhase: afterPhaseId,
            additionalContext: formatAddSuccessMessage(updatedPhases, insertedPhase, afterPhaseId),
        };
    }
    catch (error) {
        return {
            status: 'error',
            subcommand: 'add',
            error: error instanceof Error ? error.message : 'Unknown error',
            additionalContext: `Failed to add phase: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}
/**
 * `phase-cli rename --id=<phase-id> --name=<new-name>` — rename a phase.
 */
function runRenamePhase(id, newName, options, auditLogger) {
    if (!id || id.trim() === '') {
        return {
            status: 'invalid_args',
            subcommand: 'rename',
            error: '--id is required',
            additionalContext: '[CLEAR] phase-cli rename: --id is required. See `phase-cli rename --help` for usage.',
        };
    }
    if (!newName || newName.trim() === '') {
        return {
            status: 'invalid_args',
            subcommand: 'rename',
            error: '--name is required',
            additionalContext: '[CLEAR] phase-cli rename: --name is required. See `phase-cli rename --help` for usage.',
        };
    }
    const trimmedName = newName.trim();
    const loaded = loadPlanOrFail(options.cwd, 'rename');
    if (!loaded.ok)
        return loaded.failure;
    const { plan, registry } = loaded;
    const resolved = resolvePhaseOrFail(registry, plan, id, 'rename');
    if (!resolved.ok)
        return resolved.failure;
    const { phase } = resolved;
    const validation = validateNameLength(trimmedName);
    if (!validation.valid) {
        return {
            status: 'error',
            subcommand: 'rename',
            error: `Name exceeds ${exports.MAX_NAME_LENGTH} characters`,
            additionalContext: formatValidationMessage(trimmedName, validation.suggested),
        };
    }
    const oldName = phase.name;
    // Build updated plan with renamed phase (preserve identity, mutate name only).
    const updatedPhases = plan.phases.map(p => p.systemId === phase.systemId ? { ...p, name: trimmedName } : p);
    const updatedPlan = { ...plan, phases: updatedPhases };
    const writeResult = (0, writer_1.writeMasterPlan)(options.cwd, updatedPlan);
    if (writeResult.status === 'error') {
        const writeErr = (0, sanitize_path_1.redactProjectPath)(writeResult.error ?? 'unknown write error', options.cwd);
        return {
            status: 'error',
            subcommand: 'rename',
            error: writeErr,
            additionalContext: `Failed to write plan: ${writeErr}`,
        };
    }
    auditLogger?.log({
        domain: 'plan',
        action: 'update',
        trigger: 'user_prompt',
        target: phase.systemId ?? phase.id,
        targetDisplayId: phase.id,
        oldValue: { name: oldName },
        newValue: { name: trimmedName },
        metadata: { surface: 'phase', operation: 'rename' },
    });
    const msg = `✅ Phase renamed: ${phase.id} "${oldName}" → "${trimmedName}"`;
    return {
        status: 'success',
        subcommand: 'rename',
        phaseId: phase.id,
        phaseSystemId: phase.systemId,
        phaseName: trimmedName,
        oldValue: oldName,
        newValue: trimmedName,
        additionalContext: msg,
    };
}
/**
 * `phase-cli mark-complete --id=<phase-id>` — flip status to 'complete'.
 * Idempotent on already-complete: emits an informational success + audit-log
 * entry with metadata.idempotent=true so the redundant attempt is traceable.
 */
function runMarkCompletePhase(id, options, auditLogger) {
    if (!id || id.trim() === '') {
        return {
            status: 'invalid_args',
            subcommand: 'mark-complete',
            error: '--id is required',
            additionalContext: '[CLEAR] phase-cli mark-complete: --id is required. See `phase-cli mark-complete --help` for usage.',
        };
    }
    const loaded = loadPlanOrFail(options.cwd, 'mark-complete');
    if (!loaded.ok)
        return loaded.failure;
    const { plan, registry } = loaded;
    const resolved = resolvePhaseOrFail(registry, plan, id, 'mark-complete');
    if (!resolved.ok)
        return resolved.failure;
    const { phase } = resolved;
    const oldStatus = phase.status;
    // Idempotent on already-complete — log + return informational success without rewriting state.
    if (oldStatus === 'complete') {
        auditLogger?.log({
            domain: 'plan',
            action: 'update',
            trigger: 'user_prompt',
            target: phase.systemId ?? phase.id,
            targetDisplayId: phase.id,
            oldValue: { status: 'complete' },
            newValue: { status: 'complete' },
            metadata: { surface: 'phase', operation: 'mark-complete', idempotent: true },
        });
        return {
            status: 'success',
            subcommand: 'mark-complete',
            phaseId: phase.id,
            phaseSystemId: phase.systemId,
            phaseName: phase.name,
            oldValue: oldStatus,
            newValue: 'complete',
            additionalContext: `[CLEAR] ${phase.id} is already complete (no change).`,
        };
    }
    const updatedPhases = plan.phases.map(p => p.systemId === phase.systemId ? { ...p, status: 'complete' } : p);
    const updatedPlan = { ...plan, phases: updatedPhases };
    const writeResult = (0, writer_1.writeMasterPlan)(options.cwd, updatedPlan);
    if (writeResult.status === 'error') {
        const writeErr = (0, sanitize_path_1.redactProjectPath)(writeResult.error ?? 'unknown write error', options.cwd);
        return {
            status: 'error',
            subcommand: 'mark-complete',
            error: writeErr,
            additionalContext: `Failed to write plan: ${writeErr}`,
        };
    }
    auditLogger?.log({
        domain: 'plan',
        action: 'update',
        trigger: 'user_prompt',
        target: phase.systemId ?? phase.id,
        targetDisplayId: phase.id,
        oldValue: { status: oldStatus },
        newValue: { status: 'complete' },
        metadata: { surface: 'phase', operation: 'mark-complete' },
    });
    return {
        status: 'success',
        subcommand: 'mark-complete',
        phaseId: phase.id,
        phaseSystemId: phase.systemId,
        phaseName: phase.name,
        oldValue: oldStatus,
        newValue: 'complete',
        additionalContext: `✅ Phase marked complete: ${phase.id} "${phase.name}" (was: ${oldStatus})`,
    };
}
/**
 * `phase-cli delete --id=<phase-id> --yes-i-mean-it` — destructive delete.
 * Double opt-in: single-flag invocation fails with a position-shift/orphan warning
 * (in-progress WP warning appended when applicable).
 */
function runDeletePhase(id, confirmed, options, auditLogger) {
    if (!id || id.trim() === '') {
        return {
            status: 'invalid_args',
            subcommand: 'delete',
            error: '--id is required',
            additionalContext: '[CLEAR] phase-cli delete: --id is required. See `phase-cli delete --help` for usage.',
        };
    }
    const loaded = loadPlanOrFail(options.cwd, 'delete');
    if (!loaded.ok)
        return loaded.failure;
    const { plan, registry } = loaded;
    const resolved = resolvePhaseOrFail(registry, plan, id, 'delete');
    if (!resolved.ok)
        return resolved.failure;
    const { phase } = resolved;
    // Count workpackages that will be orphaned. The phase.workpackages array is
    // the membership list; any non-empty entry implies a WP whose phases[n]
    // membership is about to disappear.
    const phaseWorkpackages = Array.isArray(phase.workpackages) ? phase.workpackages : [];
    const orphanedWpCount = phaseWorkpackages.length;
    const orphanWarning = orphanedWpCount > 0
        ? `\n\nPhase has ${orphanedWpCount} in-progress workpackage${orphanedWpCount === 1 ? '' : 's'} — they will be orphaned: ${phaseWorkpackages.join(', ')}`
        : '';
    // Double-opt-in: error when --yes-i-mean-it absent.
    if (!confirmed) {
        return {
            status: 'invalid_args',
            subcommand: 'delete',
            error: `${DELETE_CONFIRM_FLAG} required`,
            additionalContext: `[CLEAR] phase-cli delete: requires ${DELETE_CONFIRM_FLAG} to confirm. ` +
                `Deleting ${phase.id} "${phase.name}" will shift the positions of subsequent phases (their display IDs are preserved) and orphan any milestones requiring ${phase.id}. ` +
                `If you understand the consequences, re-run with ${DELETE_CONFIRM_FLAG}.${orphanWarning}`,
        };
    }
    // Find phase index for removePhaseAtIndex.
    const phaseIdx = plan.phases.findIndex(p => p.systemId === phase.systemId);
    if (phaseIdx === -1) {
        // resolvePhase found it but findIndex can't — coherence failure, surface explicitly.
        return {
            status: 'error',
            subcommand: 'delete',
            error: `Internal: phase ${phase.id} resolved but not indexed in plan.phases`,
            additionalContext: 'Phase resolved by registry but missing from phases array. Plan state may be corrupt.',
        };
    }
    const updatedPhases = removePhaseAtIndex(plan.phases, phaseIdx);
    const updatedPlan = { ...plan, phases: updatedPhases };
    const writeResult = (0, writer_1.writeMasterPlan)(options.cwd, updatedPlan);
    if (writeResult.status === 'error') {
        const writeErr = (0, sanitize_path_1.redactProjectPath)(writeResult.error ?? 'unknown write error', options.cwd);
        return {
            status: 'error',
            subcommand: 'delete',
            error: writeErr,
            additionalContext: `Failed to write plan: ${writeErr}`,
        };
    }
    auditLogger?.log({
        domain: 'plan',
        action: 'delete',
        trigger: 'user_prompt',
        target: phase.systemId ?? phase.id,
        targetDisplayId: phase.id,
        oldValue: {
            name: phase.name,
            position: phase.position,
            status: phase.status,
            workpackageCount: orphanedWpCount,
        },
        metadata: {
            surface: 'phase',
            operation: 'delete',
            reindexedPhaseCount: updatedPhases.length,
            orphanedWorkpackages: phaseWorkpackages,
        },
    });
    const lines = [];
    lines.push(`✅ Phase deleted: ${phase.id} "${phase.name}"`);
    if (orphanedWpCount > 0) {
        lines.push('');
        lines.push(`⚠️  ${orphanedWpCount} workpackage${orphanedWpCount === 1 ? '' : 's'} orphaned: ${phaseWorkpackages.join(', ')}`);
    }
    if (updatedPhases.length > 0) {
        lines.push('');
        lines.push('Reindexed phases:');
        for (const p of updatedPhases) {
            lines.push(`  ${p.id}: ${p.name} [${getStatusIcon(p.status)}]`);
        }
    }
    else {
        lines.push('');
        lines.push('(No phases remaining in plan.)');
    }
    return {
        status: 'success',
        subcommand: 'delete',
        phaseId: phase.id,
        phaseSystemId: phase.systemId,
        phaseName: phase.name,
        oldValue: {
            name: phase.name,
            position: phase.position,
            status: phase.status,
        },
        additionalContext: lines.join('\n'),
    };
}
/**
 * `phase-cli remove-workpackage --phase=<phase-id> --wp=<wp-id>` (AC19-AC21).
 *
 * Removes wpId from phases[n].workpackages array AND drops wpId from
 * phases[n].weights map. YAML write-back + audit log.
 *
 * Semantics:
 *  - Phase not found → actionable error with available-phases list (AC21).
 *  - WP not present in phase → idempotent success (no-op write, audit still
 *    logged with metadata.idempotent=true) (AC20). Mirrors capture-cli's
 *    --remove-related-file idempotent precedent.
 *  - WP present → remove from both array + weights map; write back.
 */
function runRemoveWorkpackage(phaseId, wpId, options, auditLogger) {
    if (!phaseId || phaseId.trim() === '') {
        return {
            status: 'invalid_args',
            subcommand: 'remove-workpackage',
            error: '--phase is required',
            additionalContext: '[CLEAR] phase-cli remove-workpackage: --phase is required. See `phase-cli remove-workpackage --help` for usage.',
        };
    }
    if (!wpId || wpId.trim() === '') {
        return {
            status: 'invalid_args',
            subcommand: 'remove-workpackage',
            error: '--wp is required',
            additionalContext: '[CLEAR] phase-cli remove-workpackage: --wp is required. See `phase-cli remove-workpackage --help` for usage.',
        };
    }
    const loaded = loadPlanOrFail(options.cwd, 'remove-workpackage');
    if (!loaded.ok)
        return loaded.failure;
    const { plan, registry } = loaded;
    const resolved = resolvePhaseOrFail(registry, plan, phaseId, 'remove-workpackage');
    if (!resolved.ok)
        return resolved.failure;
    const { phase } = resolved;
    const safeWpId = sanitizeForUserContext(wpId);
    const phaseWorkpackages = Array.isArray(phase.workpackages) ? phase.workpackages : [];
    const phaseWeights = phase.weights ?? {};
    const wasPresent = phaseWorkpackages.includes(wpId);
    // AC20: idempotent on absent WP — success, no-op write (skip writeMasterPlan),
    // audit-log emits with metadata.idempotent=true so the no-op is still traceable.
    if (!wasPresent) {
        auditLogger?.log({
            domain: 'plan',
            action: 'update',
            trigger: 'user_prompt',
            target: phase.systemId ?? phase.id,
            targetDisplayId: phase.id,
            oldValue: { workpackages: phaseWorkpackages },
            newValue: { workpackages: phaseWorkpackages },
            metadata: {
                surface: 'phase',
                operation: 'remove-workpackage',
                wp: wpId,
                idempotent: true,
            },
        });
        return {
            status: 'success',
            subcommand: 'remove-workpackage',
            phaseId: phase.id,
            phaseSystemId: phase.systemId,
            phaseName: phase.name,
            oldValue: { workpackages: phaseWorkpackages },
            newValue: { workpackages: phaseWorkpackages },
            additionalContext: `[CLEAR] ${phase.id}: workpackage "${safeWpId}" not present in phase, no change.`,
        };
    }
    const newWorkpackages = phaseWorkpackages.filter(w => w !== wpId);
    const newWeights = { ...phaseWeights };
    delete newWeights[wpId];
    const updatedPhases = plan.phases.map(p => p.systemId === phase.systemId
        ? { ...p, workpackages: newWorkpackages, weights: newWeights }
        : p);
    const updatedPlan = { ...plan, phases: updatedPhases };
    const writeResult = (0, writer_1.writeMasterPlan)(options.cwd, updatedPlan);
    if (writeResult.status === 'error') {
        const writeErr = (0, sanitize_path_1.redactProjectPath)(writeResult.error ?? 'unknown write error', options.cwd);
        return {
            status: 'error',
            subcommand: 'remove-workpackage',
            error: writeErr,
            additionalContext: `Failed to write plan: ${writeErr}`,
        };
    }
    auditLogger?.log({
        domain: 'plan',
        action: 'update',
        trigger: 'user_prompt',
        target: phase.systemId ?? phase.id,
        targetDisplayId: phase.id,
        oldValue: { workpackages: phaseWorkpackages, weights: phaseWeights },
        newValue: { workpackages: newWorkpackages, weights: newWeights },
        metadata: {
            surface: 'phase',
            operation: 'remove-workpackage',
            wp: wpId,
            removedFromWeights: Object.prototype.hasOwnProperty.call(phaseWeights, wpId),
        },
    });
    return {
        status: 'success',
        subcommand: 'remove-workpackage',
        phaseId: phase.id,
        phaseSystemId: phase.systemId,
        phaseName: phase.name,
        oldValue: { workpackages: phaseWorkpackages, weights: phaseWeights },
        newValue: { workpackages: newWorkpackages, weights: newWeights },
        additionalContext: `✅ Removed workpackage "${safeWpId}" from ${phase.id}. Remaining: ${newWorkpackages.length === 0 ? '(none)' : newWorkpackages.join(', ')}`,
    };
}
function parseArgs(argv) {
    const flags = new Map();
    const flagsBool = new Set();
    let cwd = '.';
    let subcommand = '';
    let firstPositional = true;
    let showHelp = false;
    let explicitSessionId;
    let explicitSessionNumber;
    for (const arg of argv) {
        if (arg === '--help' || arg === '-h' || arg === 'help') {
            showHelp = true;
            continue;
        }
        if (arg.startsWith('--cwd=')) {
            cwd = arg.substring('--cwd='.length);
        }
        else if (arg.startsWith('--session-id=')) {
            explicitSessionId = arg.substring('--session-id='.length);
        }
        else if (arg.startsWith('--session-number=')) {
            const n = parseInt(arg.substring('--session-number='.length), 10);
            explicitSessionNumber = Number.isNaN(n) ? undefined : n;
        }
        else if (arg.startsWith('--') && arg.includes('=')) {
            const eq = arg.indexOf('=');
            flags.set(arg.substring(2, eq), arg.substring(eq + 1));
        }
        else if (arg.startsWith('--')) {
            flagsBool.add(arg.substring(2));
        }
        else if (firstPositional) {
            subcommand = arg;
            firstPositional = false;
        }
    }
    return { subcommand, showHelp, cwd, flags, flagsBool, explicitSessionId, explicitSessionNumber };
}
function helpText() {
    return [
        'Usage: phase-cli.js <subcommand> [options]',
        '',
        'Subcommands:',
        '  list                              List all phases (default when no subcommand)',
        '  show --id=<phase-id>              Show full detail for one phase',
        '  add --name=<name> [--after=<id>]  Add a new phase (--name REQUIRED)',
        '  rename --id=<id> --name=<name>    Rename an existing phase',
        '  mark-complete --id=<id>           Set phase status to complete (idempotent)',
        `  delete --id=<id> ${DELETE_CONFIRM_FLAG}      Delete a phase (double opt-in)`,
        '  remove-workpackage --phase=<phase-id> --wp=<wp-id>',
        '                                    Remove a workpackage from a phase (idempotent on absent WP)',
        '',
        'Common options:',
        '  --cwd=<path>             Project root directory (default: .)',
        '  --session-id=<id>        Override session identifier for audit (default: from .clear/state/session.json)',
        '  --session-number=<n>     Override session number for audit (default: from .clear/state/session.json)',
        '',
        'Examples:',
        '  phase-cli.js list',
        '  phase-cli.js show --id=Phase-1',
        '  phase-cli.js add --name="Phase 3 — Migration"',
        '  phase-cli.js rename --id=Phase-2 --name="Renamed Phase 2"',
        '  phase-cli.js mark-complete --id=Phase-1',
        `  phase-cli.js delete --id=Phase-5 ${DELETE_CONFIRM_FLAG}`,
    ].join('\n');
}
/**
 * Dispatch a phase-cli subcommand. Exposed for tests + future composition.
 *
 * The explicit return type pins the dispatch contract: every switch arm MUST
 * resolve to a SubcommandOutput. Combined with the never-typed default arm,
 * this makes phase_b additions to PHASE_SUBCOMMANDS surface as compile errors
 * rather than silent Promise<undefined> at runtime.
 */
async function runPhaseCLI(parsed) {
    if (parsed.showHelp) {
        return { status: 'success', additionalContext: helpText() };
    }
    // Containment-check the cwd BEFORE any filesystem reach (state file lookup,
    // audit-log path construction, plan loading). Mirrors lifecycle-cli's L1153
    // pre-getCurrentSession guard. writeMasterPlan internally also calls this,
    // but read-only and audit paths would bypass that guard otherwise.
    const safeCwd = (0, validation_1.validateBasePath)(parsed.cwd);
    // Default subcommand is `list`, NOT `add`. No-arg invocation must not
    // mutate state — phantom-phase risk elimination.
    const rawSubcommand = parsed.subcommand || 'list';
    if (!exports.PHASE_SUBCOMMANDS.includes(rawSubcommand)) {
        const safeBadCmd = sanitizeForUserContext(rawSubcommand);
        return {
            status: 'invalid_args',
            error: `Unknown subcommand: ${safeBadCmd}`,
            additionalContext: `[CLEAR] phase-cli: unknown subcommand "${safeBadCmd}".\n\n${helpText()}`,
        };
    }
    const subcommand = rawSubcommand;
    // Resolve session identity once per invocation; required by createAuditLogger.
    const clearDir = path.join(safeCwd, '.clear');
    const session = (0, audit_log_1.getCurrentSession)(clearDir, {
        sessionId: parsed.explicitSessionId,
        sessionNumber: parsed.explicitSessionNumber,
    });
    const options = {
        cwd: safeCwd,
        sessionId: session.sessionId,
        sessionNumber: session.sessionNumber,
    };
    // Audit logger is only needed for mutation subcommands. Construct on demand so
    // read-only paths (list/show) don't pay the filesystem cost.
    const needsAudit = subcommand === 'add' || subcommand === 'rename'
        || subcommand === 'mark-complete' || subcommand === 'delete'
        || subcommand === 'remove-workpackage';
    const auditLogger = needsAudit
        ? (0, audit_log_1.createAuditLogger)(safeCwd, session.sessionId, session.sessionNumber)
        : undefined;
    switch (subcommand) {
        case 'list':
            return runListPhase(options);
        case 'show':
            return runShowPhase(parsed.flags.get('id'), options);
        case 'add':
            return runAddPhase({
                cwd: options.cwd,
                name: parsed.flags.get('name') ?? '',
                afterId: parsed.flags.get('after'),
                sessionId: options.sessionId,
                sessionNumber: options.sessionNumber,
            }, auditLogger);
        case 'rename':
            return runRenamePhase(parsed.flags.get('id'), parsed.flags.get('name'), options, auditLogger);
        case 'mark-complete':
            return runMarkCompletePhase(parsed.flags.get('id'), options, auditLogger);
        case 'delete':
            return runDeletePhase(parsed.flags.get('id'), parsed.flagsBool.has(DELETE_CONFIRM_FLAG_KEY), options, auditLogger);
        case 'remove-workpackage':
            return runRemoveWorkpackage(parsed.flags.get('phase'), parsed.flags.get('wp'), options, auditLogger);
        default: {
            // Exhaustiveness check — adding a new PHASE_SUBCOMMANDS literal without
            // a corresponding case here surfaces as a compile error.
            const _exhaustive = subcommand;
            void _exhaustive;
            throw new Error(`Unhandled subcommand in dispatch: ${rawSubcommand}`);
        }
    }
}
// Main execution — only run when invoked directly
if (require.main === module) {
    const parsed = parseArgs(process.argv.slice(2));
    runPhaseCLI(parsed)
        .then(result => {
        // Historical CLI contract: stdout is the JSON result. Non-success states
        // (invalid_args / not_found / error / no_plan) are signalled via the
        // status field — exit code stays 0 to match the codebase's other plan
        // CLIs. Uncaught throws exit 1 below. withEnvelope adds the dual-key
        // surface (success + message + additionalContext) at the boundary so
        // internal callers see the rich enum while skills/hooks see canonical
        // CLI shape.
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
//# sourceMappingURL=phase-cli.js.map