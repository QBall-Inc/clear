#!/usr/bin/env npx ts-node
"use strict";
/**
 * Workpackage Update CLI
 *
 * Programmatic mutation surface for workpackage YAMLs. Two modes:
 *   1. WP-level field updates (status, description, acceptance_criteria,
 *      deliverables, verification, notes, scope, dependencies)
 *   2. Per-deliverable mutation (status, description, weight, pattern)
 *
 * Standalone CLI matching the existing workpackage CLI pattern (lifecycle-cli,
 * progress-cli, status-cli, create-cli, deps-cli, load-cli). NOT router-mediated.
 *
 * Usage:
 *   update-cli <wp-id> --status=complete
 *   update-cli <wp-id> --description="..." --acceptance-criteria-file=acs.json
 *   update-cli <wp-id> deliverable <del-id> --status=in_progress --weight=2
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
exports.writeWorkpackageAtomic = void 0;
exports.runUpdateCLI = runUpdateCLI;
exports.parseArgs = parseArgs;
const path = __importStar(require("path"));
const registry_1 = require("../registry");
const parser_1 = require("../parser");
Object.defineProperty(exports, "writeWorkpackageAtomic", { enumerable: true, get: function () { return parser_1.writeWorkpackageAtomic; } });
const types_1 = require("../types");
const audit_log_1 = require("../../sync/audit-log");
const validation_1 = require("../../validation");
const cli_file_input_1 = require("../../shared/cli-file-input");
const create_cli_1 = require("./create-cli");
// ==============================================================================
// CONSTANTS
// ==============================================================================
const WORKPACKAGE_STATUSES = [
    'not_started',
    'in_progress',
    'paused',
    'blocked',
    'complete',
    'deferred',
    'archived'
];
const DELIVERABLE_STATUSES = [
    'not_started',
    'in_progress',
    'complete'
];
// ==============================================================================
// VALIDATION HELPERS
// ==============================================================================
function isWorkpackageStatus(v) {
    return WORKPACKAGE_STATUSES.includes(v);
}
function isDeliverableStatus(v) {
    return DELIVERABLE_STATUSES.includes(v);
}
function parseWeight(raw) {
    // Strict digit-only match: parseFloat would silently accept "3abc" → 3, masking typos
    // like "30abc". Open-ended cap (no upper bound) — calculateProgress normalizes by
    // dividing completedWeight/totalWeight, so the absolute magnitude doesn't matter.
    const trimmed = raw.trim();
    if (!/^[0-9]+$/.test(trimmed)) {
        throw new Error(`Invalid --weight value: ${JSON.stringify(raw)}. Must be a non-negative integer.`);
    }
    return parseInt(trimmed, 10);
}
function readArrayFieldRaw(source, field) {
    let raw;
    if (source.file) {
        // Route the file read through the shared validated reader so the array-field
        // file inputs get the same not-a-directory + size-cap + permission handling
        // as the free-form text fields (single validation surface).
        raw = (0, cli_file_input_1.readTextFieldFile)(source.file, field);
    }
    else if (source.inline !== undefined) {
        raw = source.inline;
    }
    else {
        throw new Error(`Field ${field} requires either --${field}=<json> or --${field}-file=<path>`);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (e) {
        throw new Error(`Field ${field}: invalid JSON — ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!Array.isArray(parsed)) {
        throw new Error(`Field ${field}: JSON must be an array`);
    }
    return parsed;
}
function validateStringArray(value, field) {
    const result = [];
    for (let i = 0; i < value.length; i++) {
        if (typeof value[i] !== 'string') {
            throw new Error(`Field ${field}[${i}]: must be a string`);
        }
        result.push(value[i]);
    }
    return result;
}
function validateDeliverableArray(value) {
    const result = [];
    for (let i = 0; i < value.length; i++) {
        const d = value[i];
        if (!d || typeof d !== 'object') {
            throw new Error(`deliverables[${i}]: must be an object`);
        }
        if (typeof d.id !== 'string') {
            throw new Error(`deliverables[${i}].id: must be a string`);
        }
        if (typeof d.pattern !== 'string') {
            throw new Error(`deliverables[${i}].pattern: must be a string`);
        }
        if (typeof d.weight !== 'number' || !Number.isInteger(d.weight) || d.weight < 0) {
            throw new Error(`deliverables[${i}].weight: must be a non-negative integer (got ${JSON.stringify(d.weight)})`);
        }
        if (typeof d.status !== 'string' || !isDeliverableStatus(d.status)) {
            throw new Error(`deliverables[${i}].status: must be one of ${DELIVERABLE_STATUSES.join(', ')}`);
        }
        const out = {
            id: d.id,
            pattern: d.pattern,
            weight: d.weight,
            status: d.status
        };
        if (typeof d.description === 'string') {
            out.description = d.description;
        }
        if (typeof d.completedAt === 'string') {
            out.completedAt = d.completedAt;
        }
        result.push(out);
    }
    return result;
}
function validateDependencyArray(value, field) {
    const result = [];
    for (let i = 0; i < value.length; i++) {
        const d = value[i];
        if (!d || typeof d !== 'object') {
            throw new Error(`${field}[${i}]: must be an object`);
        }
        if (typeof d.id !== 'string') {
            throw new Error(`${field}[${i}].id: must be a string`);
        }
        if (d.type !== 'hard' && d.type !== 'soft') {
            throw new Error(`${field}[${i}].type: must be 'hard' or 'soft'`);
        }
        const out = { id: d.id, type: d.type };
        if (Array.isArray(d.deliverables_needed)) {
            out.deliverables_needed = validateStringArray(d.deliverables_needed, `${field}[${i}].deliverables_needed`);
        }
        if (typeof d.description === 'string') {
            out.description = d.description;
        }
        result.push(out);
    }
    return result;
}
function validateStatusTransition(current, next, force) {
    // Reject complete → not_started without --force.
    // All other transitions are allowed (lifecycle-cli enforces deeper rules; update-cli is
    // a maintenance surface that needs to permit corrections like complete → in_progress).
    if (current === 'complete' && next === 'not_started' && !force) {
        throw new Error(`Refusing status transition complete → not_started without --force. ` +
            `Pass --force to override (auditable).`);
    }
}
// ==============================================================================
// MUTATION APPLICATION
// ==============================================================================
function applyWorkpackageMutations(entry, options) {
    const next = JSON.parse(JSON.stringify(entry));
    const changes = [];
    if (options.status !== undefined) {
        if (!isWorkpackageStatus(options.status)) {
            throw new Error(`Invalid --status: ${options.status}. Must be one of ${WORKPACKAGE_STATUSES.join(', ')}`);
        }
        validateStatusTransition(entry.status, options.status, options.force);
        if (next.status !== options.status) {
            changes.push({ field: 'status', oldValue: next.status, newValue: options.status });
            next.status = options.status;
        }
    }
    if (options.type !== undefined) {
        if (!(0, types_1.isWorkpackageType)(options.type)) {
            throw new Error(`Invalid --type: ${options.type}. Must be one of ${types_1.WORKPACKAGE_TYPES.join(', ')}`);
        }
        if (next.type !== options.type) {
            changes.push({ field: 'type', oldValue: next.type, newValue: options.type });
            next.type = options.type;
        }
    }
    if (options.priority !== undefined) {
        if (!(0, types_1.isWorkpackagePriority)(options.priority)) {
            throw new Error(`Invalid --priority: ${options.priority}. Must be one of ${types_1.WORKPACKAGE_PRIORITIES.join(', ')}`);
        }
        if (next.priority !== options.priority) {
            changes.push({ field: 'priority', oldValue: next.priority, newValue: options.priority });
            next.priority = options.priority;
        }
    }
    if (options.title !== undefined) {
        const trimmed = options.title.trim();
        if (trimmed.length === 0) {
            throw new Error('Invalid --title: title must be a non-empty string.');
        }
        // Reject embedded control characters (newlines, tabs, NUL, etc.): the title
        // is written to the WP YAML and the registry index, and rendered in the
        // status-cli listing table — a control char would corrupt those shared
        // state surfaces. Fail fast at the boundary (CS3).
        // eslint-disable-next-line no-control-regex
        if (/[\x00-\x1F\x7F]/.test(trimmed)) {
            throw new Error('Invalid --title: must not contain control characters (newlines, tabs, etc.).');
        }
        const lengthCheck = (0, create_cli_1.validateTitleLength)(trimmed);
        if (!lengthCheck.valid) {
            throw new Error(`Invalid --title: exceeds ${create_cli_1.MAX_TITLE_LENGTH} characters (currently: ${trimmed.length}). Suggested: ${lengthCheck.suggested}`);
        }
        if (next.title !== trimmed) {
            changes.push({ field: 'title', oldValue: next.title, newValue: trimmed });
            next.title = trimmed;
        }
    }
    if (options.description !== undefined && next.description !== options.description) {
        changes.push({ field: 'description', oldValue: next.description, newValue: options.description });
        next.description = options.description;
    }
    if (options.acceptanceCriteria) {
        const arr = readArrayFieldRaw(options.acceptanceCriteria, 'acceptance-criteria');
        const validated = validateStringArray(arr, 'acceptance_criteria');
        changes.push({ field: 'acceptance_criteria', oldValue: next.acceptance_criteria, newValue: validated });
        next.acceptance_criteria = validated;
    }
    if (options.deliverables) {
        const arr = readArrayFieldRaw(options.deliverables, 'deliverables');
        const validated = validateDeliverableArray(arr);
        const ids = new Set();
        for (const d of validated) {
            if (ids.has(d.id)) {
                throw new Error(`deliverables: duplicate id ${JSON.stringify(d.id)}`);
            }
            ids.add(d.id);
        }
        changes.push({ field: 'deliverables', oldValue: next.deliverables, newValue: validated });
        next.deliverables = validated;
    }
    if (options.verification) {
        const arr = readArrayFieldRaw(options.verification, 'verification');
        const validated = validateStringArray(arr, 'verification');
        changes.push({ field: 'verification', oldValue: next.verification, newValue: validated });
        next.verification = validated;
    }
    if (options.notes) {
        const arr = readArrayFieldRaw(options.notes, 'notes');
        const validated = validateStringArray(arr, 'notes');
        changes.push({ field: 'notes', oldValue: next.notes, newValue: validated });
        next.notes = validated;
    }
    if (options.inScope) {
        const arr = readArrayFieldRaw(options.inScope, 'in-scope');
        const validated = validateStringArray(arr, 'scope.in_scope');
        changes.push({ field: 'scope.in_scope', oldValue: next.scope.in_scope, newValue: validated });
        next.scope.in_scope = validated;
    }
    if (options.outOfScope) {
        const arr = readArrayFieldRaw(options.outOfScope, 'out-of-scope');
        const validated = validateStringArray(arr, 'scope.out_of_scope');
        changes.push({ field: 'scope.out_of_scope', oldValue: next.scope.out_of_scope, newValue: validated });
        next.scope.out_of_scope = validated;
    }
    if (options.upstream) {
        const arr = readArrayFieldRaw(options.upstream, 'upstream');
        const validated = validateDependencyArray(arr, 'dependencies.upstream');
        changes.push({ field: 'dependencies.upstream', oldValue: next.dependencies.upstream, newValue: validated });
        next.dependencies.upstream = validated;
    }
    if (options.downstream) {
        const arr = readArrayFieldRaw(options.downstream, 'downstream');
        const validated = validateDependencyArray(arr, 'dependencies.downstream');
        changes.push({ field: 'dependencies.downstream', oldValue: next.dependencies.downstream ?? [], newValue: validated });
        next.dependencies.downstream = validated;
    }
    return { mutated: next, changes };
}
function applyDeliverableMutations(entry, options) {
    const next = JSON.parse(JSON.stringify(entry));
    const changes = [];
    const idx = next.deliverables.findIndex(d => d.id === options.deliverableId);
    if (idx === -1) {
        throw new Error(`Deliverable not found: ${options.deliverableId} (workpackage ${entry.id} has ${next.deliverables.length} deliverables)`);
    }
    const target = next.deliverables[idx];
    const fieldPrefix = `deliverable[${target.id}]`;
    if (options.status !== undefined) {
        if (!isDeliverableStatus(options.status)) {
            throw new Error(`Invalid deliverable --status: ${options.status}. Must be one of ${DELIVERABLE_STATUSES.join(', ')}`);
        }
        if (target.status !== options.status) {
            changes.push({ field: `${fieldPrefix}.status`, oldValue: target.status, newValue: options.status });
            target.status = options.status;
            if (options.status === 'complete' && !target.completedAt) {
                target.completedAt = new Date().toISOString();
            }
            else if (options.status !== 'complete' && target.completedAt) {
                // Reverting away from complete (the documented stub-then-iterate correction surface).
                // Stale completedAt would mislead progress reporting and audit views into thinking the
                // deliverable is done when it isn't.
                delete target.completedAt;
            }
        }
    }
    if (options.description !== undefined && target.description !== options.description) {
        changes.push({ field: `${fieldPrefix}.description`, oldValue: target.description, newValue: options.description });
        target.description = options.description;
    }
    if (options.weight !== undefined) {
        const w = parseWeight(options.weight);
        if (target.weight !== w) {
            changes.push({ field: `${fieldPrefix}.weight`, oldValue: target.weight, newValue: w });
            target.weight = w;
        }
    }
    if (options.pattern !== undefined && target.pattern !== options.pattern) {
        changes.push({ field: `${fieldPrefix}.pattern`, oldValue: target.pattern, newValue: options.pattern });
        target.pattern = options.pattern;
    }
    return { mutated: next, changes };
}
// ==============================================================================
// PERSISTENCE
// ==============================================================================
function resolveWorkpackagePath(registry, clearDir, wpId, tolerantEnums = false) {
    const entry = registry.resolveWorkpackage(wpId, { tolerantEnums });
    if (!entry) {
        throw new registry_1.WorkpackageRegistryError(`Workpackage not found: ${wpId}`, wpId);
    }
    const allEntries = registry.getAllWorkpackages();
    const registryEntry = allEntries.find(e => e.id === entry.id || e.systemId === entry.systemId);
    if (!registryEntry) {
        throw new registry_1.WorkpackageRegistryError(`Workpackage registry entry missing for ${entry.id}`, entry.id);
    }
    const fileName = registryEntry.file || `${entry.systemId || entry.id}.yaml`;
    const filePath = path.join(clearDir, 'workpackages', fileName);
    return { entry, filePath };
}
function emitAuditLog(options, entry, changes) {
    // sessionNumber=0 is the not-in-session sentinel (session-init.sh starts CLEAR_SESSION_NUMBER
    // at 1; default 0 means update was invoked outside a CLEAR session). Skipping audit emit
    // for an unattributable session matches the project-wide convention shared by delete-cli,
    // plan/update-cli, and sync-bridge-cli.
    if (!options.sessionId || !options.sessionNumber) {
        return;
    }
    if (changes.length === 0) {
        return;
    }
    // Derive the project root via the shared form-tolerant resolver — accepts both
    // the project-root and `.clear`-dir forms; AuditLogger wants the project root
    // (it appends `.clear/audit/` internally).
    const basePath = (0, validation_1.resolveClearDir)(options.clearDir).projectRoot;
    const auditLogger = new audit_log_1.AuditLogger(basePath, options.sessionId, options.sessionNumber);
    const target = entry.systemId || entry.id;
    const summary = {};
    for (const c of changes) {
        summary[c.field] = { from: c.oldValue, to: c.newValue };
    }
    auditLogger.logUpdate('workpackage', 'update', target, {
        targetDisplayId: entry.id,
        oldValue: null,
        newValue: summary,
        trigger: 'manual',
        metadata: options.deliverableId ? { deliverableId: options.deliverableId } : undefined
    });
}
// ==============================================================================
// MAIN
// ==============================================================================
async function runUpdateCLI(options) {
    const clearDir = (0, validation_1.resolveClearDir)(options.clearDir || `${options.cwd}/.clear`).clearSubdir;
    const registry = new registry_1.WorkpackageRegistryManager(clearDir);
    // Narrowly-scoped recovery affordance: when the mutation set targets the
    // type or priority field, allow the load to be lenient on those enums so
    // an existing corrupt value (e.g., a workpackage file authored before the
    // current enum vocabulary) doesn't deadlock the very repair that fixes it.
    // writeWorkpackageAtomic stays strict — unrepaired entries still fail at
    // the pre-write round-trip, so this can't silently persist invalid data.
    const isRepairingEnum = options.type !== undefined || options.priority !== undefined;
    let entry;
    let filePath;
    try {
        const resolved = resolveWorkpackagePath(registry, clearDir, options.wpId, isRepairingEnum);
        entry = resolved.entry;
        filePath = resolved.filePath;
    }
    catch (e) {
        return { status: 'error', error: e instanceof Error ? e.message : String(e) };
    }
    // Emit a single stderr notice so the operator sees that they hit the
    // recovery code path (vs an ordinary update). The notice fires only when
    // the load surfaced at least one captured enum warning — a clean file
    // taking the same tolerant code path is silent.
    if (entry.validationWarnings && entry.validationWarnings.length > 0) {
        process.stderr.write(`[update-cli] NOTE: target file has invalid type/priority — repairing. ` +
            `Details: ${entry.validationWarnings.join('; ')}\n`);
    }
    const isDeliverableMode = options.deliverableId !== undefined;
    let result;
    try {
        result = isDeliverableMode
            ? applyDeliverableMutations(entry, options)
            : applyWorkpackageMutations(entry, options);
    }
    catch (e) {
        return { status: 'error', error: e instanceof Error ? e.message : String(e) };
    }
    if (result.changes.length === 0) {
        return {
            status: 'no_changes',
            action: isDeliverableMode ? 'update-deliverable' : 'update-workpackage',
            wpId: entry.id,
            deliverableId: options.deliverableId,
            changes: []
        };
    }
    // YAML-only write contract (single completion-writer invariant).
    //
    // This path mutates ONLY the target workpackage's own YAML file. A status
    // change here is deliberately NOT mirrored into the registry index or
    // sync-state — doing so would make update-cli a second completion-writer and
    // re-introduce the multi-source-of-truth drift between registry status,
    // sync-state, and the WP YAML.
    //
    // The sanctioned path that propagates a completion across all state stores is
    // `workpackage complete` (propagateLifecycleChange in lifecycle-cli.ts, which
    // writes YAML + registry + sync-state + plan rollup in lockstep). A bare
    // status write left here is reconciled back into agreement at the next
    // session start (the reconcile-plan pass corrects registry status from the
    // WP-YAML source of truth). The active-WP deliverable-progress refresh below
    // is the only state touch on this path, and only for the active WP.
    try {
        (0, parser_1.writeWorkpackageAtomic)(filePath, result.mutated);
    }
    catch (e) {
        return { status: 'error', error: e instanceof Error ? e.message : String(e) };
    }
    // Cache hygiene: if we took the tolerant path, the strict cache was
    // bypassed on read but the on-disk YAML now contains the repaired value.
    // Invalidate so the next strict read picks up the new bytes instead of
    // potentially returning a stale entry from a parallel earlier load.
    if (isRepairingEnum) {
        registry.invalidateWorkpackageCache(entry.id);
    }
    // Title mirror lockstep. Unlike a bare status write (YAML-only, reconciled at the
    // next session start to preserve the single-completion-writer invariant above), a
    // title is a display label with no completion / sync-state / plan-rollup semantics.
    // status-cli lists titles from the registry index, so a YAML-only title write would
    // leave the listing showing the old title until a full rebuild. Keep the registry
    // mirror in sync in the same command. Scoped strictly to a title change — this does
    // NOT mirror status. A mirror-write failure is non-fatal (the WP YAML source of
    // truth already updated; the mirror re-derives on the next reconcile/rebuild).
    const titleChange = result.changes.find(c => c.field === 'title');
    if (titleChange) {
        try {
            // result.mutated.title is the already-trimmed new title (typed string on
            // WorkpackageEntry) — read it directly rather than casting the unknown
            // FieldChange.newValue.
            registry.updateRegistryEntryTitle(entry.id, result.mutated.title);
        }
        catch (e) {
            process.stderr.write(`[update-cli] Warning: WP title updated in the workpackage file, but the registry ` +
                `index mirror did not sync (non-fatal — reconciles at next session start): ` +
                `${e instanceof Error ? e.message : String(e)}\n`);
        }
    }
    // AC28 (POST-80): Active-WP-only deliverable-status recompute.
    //
    // After the YAML write succeeds, refresh state.progress IF the target WP is the
    // currently active one. Non-active WP updates write YAML only — state.progress
    // is structurally active-WP-only by design (S182 Stage 0 Option A decision per
    // WP-PS5.yaml s182_stage0_drift.DRIFT-2). When that WP later becomes active,
    // calculateProgress will read the fresh YAML status and produce the right value.
    //
    // Implementation note: bypasses registry.markDeliverable{InProgress,Complete}
    // because those internally call calculateProgress(state.activeWorkpackage),
    // and state.activeWorkpackage is a systemId while calculateProgress -> getWorkpackage
    // only accepts display IDs (registry.ts:111). We already hold entry.id (the
    // display ID), so we drive the recompute directly with it — sidestepping the
    // ID-shape mismatch in the existing internal helper.
    //
    // Wrapped in try/catch — if recalc throws, stderr warn but don't block the
    // success return (the YAML mutation already succeeded; state.progress staleness
    // is a soft failure recoverable on next session).
    if (isDeliverableMode && options.deliverableId !== undefined) {
        try {
            const state = registry.loadState();
            const activeWpId = state.activeWorkpackage;
            const isActiveWp = !!activeWpId && (activeWpId === entry.systemId || activeWpId === entry.id);
            if (isActiveWp) {
                const statusChange = result.changes.find(c => c.field === `deliverable[${options.deliverableId}].status`);
                const newStatus = statusChange?.newValue;
                if (newStatus === 'complete' || newStatus === 'in_progress' || newStatus === 'not_started') {
                    // Write the deliverable's new state. completedAt only set for 'complete'.
                    state.deliverables[options.deliverableId] = newStatus === 'complete'
                        ? { status: 'complete', completedAt: new Date().toISOString() }
                        : { status: newStatus };
                    state.lastActivity = new Date().toISOString();
                    registry.saveState(state);
                    // Recompute progress using entry.id (display ID — the form
                    // calculateProgress -> getWorkpackage accepts).
                    const progressResult = registry.calculateProgress(entry.id);
                    const refreshed = registry.loadState();
                    refreshed.progress = progressResult.progress;
                    registry.saveState(refreshed);
                    // Refresh the derived progress scalars (registry index + WP YAML) from the
                    // same recomputed value. This path mutates deliverable state without going
                    // through the internal recalculate helper, so it must refresh the cached
                    // scalars itself to keep all progress stores in lockstep.
                    registry.refreshProgressScalars(entry.id, progressResult.progress);
                }
                // If no status change in this mutation (e.g., weight/pattern-only edit),
                // skip recompute — calculateProgress wouldn't return a different value.
            }
        }
        catch (e) {
            process.stderr.write(`[update-cli] Warning: progress recompute after this update failed (non-fatal — progress refreshes on next session start): ${e instanceof Error ? e.message : String(e)}\n`);
        }
    }
    try {
        emitAuditLog(options, result.mutated, result.changes);
    }
    catch (e) {
        process.stderr.write(`[update-cli] audit log emit failed: ${e instanceof Error ? e.message : String(e)}\n`);
    }
    const fieldList = result.changes.map(c => c.field).join(', ');
    // A bare workpackage --status update is YAML-only — it deliberately does NOT mirror
    // into the registry index or sync-state (see the single-completion-writer note above).
    // Surface that scope honestly so a status edit is not mistaken for a propagated
    // completion, and point to the lifecycle path that DOES propagate.
    const wpStatusChanged = !isDeliverableMode && result.changes.some(c => c.field === 'status');
    const scopeNote = wpStatusChanged
        ? '\n\nNote: a status change via this command writes the workpackage file only — the registry index and sync-state reconcile at the next session start. For a completion that must propagate across all state stores now, use `/cf-workpackage complete` instead.'
        : '';
    return {
        status: 'success',
        action: isDeliverableMode ? 'update-deliverable' : 'update-workpackage',
        wpId: entry.id,
        deliverableId: options.deliverableId,
        changes: result.changes,
        additionalContext: (isDeliverableMode
            ? `Updated deliverable ${options.deliverableId} on ${entry.id}: ${fieldList}`
            : `Updated workpackage ${entry.id}: ${fieldList}`) + scopeNote
    };
}
function parseArgs(argv) {
    const options = {
        clearDir: '',
        cwd: '.',
        sessionId: '',
        sessionNumber: 0,
        force: false,
        wpId: ''
    };
    const errors = [];
    const positionals = [];
    // --title and --name are aliases for the WP display title; collected separately
    // so a conflicting pair (both present, different values) can be rejected post-loop.
    let titleFlag;
    let nameFlag;
    const ensureSource = (key) => {
        const current = options[key];
        if (current)
            return current;
        const created = {};
        options[key] = created;
        return created;
    };
    for (const arg of argv) {
        if (arg.startsWith('--clear-dir=')) {
            options.clearDir = arg.substring('--clear-dir='.length);
        }
        else if (arg.startsWith('--cwd=')) {
            options.cwd = arg.substring('--cwd='.length);
        }
        else if (arg.startsWith('--session-id=')) {
            options.sessionId = arg.substring('--session-id='.length);
        }
        else if (arg.startsWith('--session-number=')) {
            options.sessionNumber = parseInt(arg.substring('--session-number='.length), 10) || 0;
        }
        else if (arg === '--force') {
            options.force = true;
        }
        else if (arg.startsWith('--status=')) {
            options.status = arg.substring('--status='.length);
        }
        else if (arg.startsWith('--type=')) {
            options.type = arg.substring('--type='.length);
        }
        else if (arg.startsWith('--priority=')) {
            options.priority = arg.substring('--priority='.length);
        }
        else if (arg.startsWith('--title=')) {
            titleFlag = arg.substring('--title='.length);
        }
        else if (arg.startsWith('--name=')) {
            nameFlag = arg.substring('--name='.length);
        }
        else if (arg.startsWith('--description=')) {
            options.description = arg.substring('--description='.length);
        }
        else if (arg.startsWith('--description-file=')) {
            options.descriptionFile = arg.substring('--description-file='.length);
        }
        else if (arg.startsWith('--weight=')) {
            options.weight = arg.substring('--weight='.length);
        }
        else if (arg.startsWith('--pattern=')) {
            options.pattern = arg.substring('--pattern='.length);
        }
        else if (arg.startsWith('--acceptance-criteria=')) {
            ensureSource('acceptanceCriteria').inline = arg.substring('--acceptance-criteria='.length);
        }
        else if (arg.startsWith('--acceptance-criteria-file=')) {
            ensureSource('acceptanceCriteria').file = arg.substring('--acceptance-criteria-file='.length);
        }
        else if (arg.startsWith('--deliverables=')) {
            ensureSource('deliverables').inline = arg.substring('--deliverables='.length);
        }
        else if (arg.startsWith('--deliverables-file=')) {
            ensureSource('deliverables').file = arg.substring('--deliverables-file='.length);
        }
        else if (arg.startsWith('--verification=')) {
            ensureSource('verification').inline = arg.substring('--verification='.length);
        }
        else if (arg.startsWith('--verification-file=')) {
            ensureSource('verification').file = arg.substring('--verification-file='.length);
        }
        else if (arg.startsWith('--notes=')) {
            ensureSource('notes').inline = arg.substring('--notes='.length);
        }
        else if (arg.startsWith('--notes-file=')) {
            ensureSource('notes').file = arg.substring('--notes-file='.length);
        }
        else if (arg.startsWith('--in-scope=')) {
            ensureSource('inScope').inline = arg.substring('--in-scope='.length);
        }
        else if (arg.startsWith('--in-scope-file=')) {
            ensureSource('inScope').file = arg.substring('--in-scope-file='.length);
        }
        else if (arg.startsWith('--out-of-scope=')) {
            ensureSource('outOfScope').inline = arg.substring('--out-of-scope='.length);
        }
        else if (arg.startsWith('--out-of-scope-file=')) {
            ensureSource('outOfScope').file = arg.substring('--out-of-scope-file='.length);
        }
        else if (arg.startsWith('--upstream=')) {
            ensureSource('upstream').inline = arg.substring('--upstream='.length);
        }
        else if (arg.startsWith('--upstream-file=')) {
            ensureSource('upstream').file = arg.substring('--upstream-file='.length);
        }
        else if (arg.startsWith('--downstream=')) {
            ensureSource('downstream').inline = arg.substring('--downstream='.length);
        }
        else if (arg.startsWith('--downstream-file=')) {
            ensureSource('downstream').file = arg.substring('--downstream-file='.length);
        }
        else if (arg.startsWith('--')) {
            errors.push(`Unknown flag: ${arg}`);
        }
        else {
            positionals.push(arg);
        }
    }
    if (positionals.length === 0) {
        errors.push('Missing positional argument: <wp-id>');
    }
    else {
        options.wpId = positionals[0];
        if (positionals.length >= 2) {
            if (positionals[1] === 'deliverable') {
                if (positionals.length < 3) {
                    errors.push("Missing positional argument: deliverable <id> requires an id");
                }
                else {
                    options.deliverableId = positionals[2];
                }
            }
            else {
                errors.push(`Unrecognised positional: ${positionals[1]} (expected 'deliverable' for per-deliverable mode)`);
            }
        }
    }
    if (options.clearDir) {
        options.clearDir = (0, validation_1.validateBasePath)(options.clearDir);
    }
    // Resolve --description / --description-file (mutual exclusion + size cap +
    // ENOENT/dir/permission) post-loop, so the file content lands in
    // options.description before the mutation appliers consume it. Parse failures
    // join the errors channel rather than throwing (consistent with the rest of
    // parseArgs). Guard on the file flag because the inline-only path needs no
    // resolution; resolveTextFieldSource still enforces mutual exclusion when both
    // flags appear together.
    if (options.descriptionFile !== undefined) {
        try {
            options.description = (0, cli_file_input_1.resolveTextFieldSource)(options.description, options.descriptionFile, 'description');
        }
        catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
        }
    }
    // Resolve --title / --name (aliases for the WP display title). Reject a
    // conflicting pair (both present with different values) so the operator's
    // intent is unambiguous; identical values or a single flag resolve cleanly.
    if (titleFlag !== undefined && nameFlag !== undefined && titleFlag !== nameFlag) {
        errors.push('--title and --name are aliases; provide only one (or identical values), not a conflicting pair.');
    }
    else if (titleFlag !== undefined || nameFlag !== undefined) {
        options.title = titleFlag ?? nameFlag;
    }
    return { options, errors };
}
function helpText() {
    return [
        'Usage:',
        '  update-cli <wp-id> [WP-level flags]',
        '  update-cli <wp-id> deliverable <del-id> [per-deliverable flags]',
        '',
        'WP-level flags:',
        `  --title=<text>                     OR --name=<text> (alias). Rename the WP (max ${create_cli_1.MAX_TITLE_LENGTH}).`,
        '  --status=<s>                       not_started|in_progress|paused|blocked|complete|deferred|archived',
        `  --type=<t>                         ${types_1.WORKPACKAGE_TYPES.join('|')}`,
        `  --priority=<p>                     ${types_1.WORKPACKAGE_PRIORITIES.join('|')}`,
        '  --description=<text>               OR --description-file=<path>',
        '  --acceptance-criteria=<json>       OR --acceptance-criteria-file=<path>',
        '  --deliverables=<json>              OR --deliverables-file=<path>',
        '  --verification=<json>              OR --verification-file=<path>',
        '  --notes=<json>                     OR --notes-file=<path>',
        '  --in-scope=<json>                  OR --in-scope-file=<path>',
        '  --out-of-scope=<json>              OR --out-of-scope-file=<path>',
        '  --upstream=<json>                  OR --upstream-file=<path>',
        '  --downstream=<json>                OR --downstream-file=<path>',
        '',
        'Per-deliverable flags:',
        '  --status=<s>                       not_started|in_progress|complete',
        '  --description=<text>               OR --description-file=<path>',
        '  --weight=<n>                       Non-negative integer. See "Weight conventions" in cf-workpackage SKILL.md.',
        '  --pattern=<glob>',
        '',
        'Common flags:',
        '  --clear-dir=<path>                 .clear directory (default: <cwd>/.clear)',
        '  --cwd=<path>                       Working directory (default: .)',
        '  --session-id=<id>                  Audit log session id (audit log emit gated on this AND --session-number)',
        '  --session-number=<n>               Audit log session number',
        '  --force                            Allow status transitions normally rejected (e.g., complete → not_started)',
        '',
        'Stub-then-iterate caveat:',
        '  PostToolUse may auto-promote a deliverable to in_progress on file-write before the file is real.',
        "  To revert premature progress, run: update-cli <wp-id> deliverable <del-id> --status=in_progress",
        '',
        'Notes:',
        '  - WP YAML comments are NOT preserved (yaml.dump round-trip). Hand-edit if comment retention matters.',
        '  - Atomic write via temp+rename. Schema validation runs pre-write; failures leave the YAML unchanged.',
        '  - Audit log entries (workpackage/update) emitted only when both --session-id and --session-number are set.'
    ].join('\n');
}
if (require.main === module) {
    const argv = process.argv.slice(2);
    if (argv.includes('--help') || argv.includes('help') || argv.length === 0) {
        console.log(JSON.stringify({ success: true, message: helpText() }));
        process.exit(0);
    }
    const { options, errors } = parseArgs(argv);
    if (errors.length > 0) {
        console.error(JSON.stringify({ status: 'error', error: errors.join('; ') }));
        process.exit(1);
    }
    runUpdateCLI(options)
        .then(result => {
        console.log(JSON.stringify(result));
        process.exit(result.status === 'error' ? 1 : 0);
    })
        .catch(error => {
        console.error(JSON.stringify({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
        }));
        process.exit(1);
    });
}
//# sourceMappingURL=update-cli.js.map