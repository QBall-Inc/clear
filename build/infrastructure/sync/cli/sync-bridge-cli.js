"use strict";
/**
 * Sync Bridge CLI — Extensible dispatch bridge for hook-to-SyncStateManager wiring.
 *
 * Called by scripts/sync/sync-bridge.sh from hook dispatchers. Each hook invokes
 * a named operation via --op=<name>. The dispatch map routes to handler functions.
 *
 * ## Adding a new operation
 *
 * 1. Write a handler: `async function handleMyOp(manager, opts): Promise<OpResult>`
 * 2. Add to DISPATCH_MAP: `'my-op': handleMyOp`
 * 3. The handler receives a loaded SyncStateManager and parsed CLI options.
 *    Call manager.save() if the handler mutates state.
 *
 * ## Operations
 *
 * - update-workpackage: Update WP summary in sync-state after progress-cli
 * - update-knowledge:   Update knowledge summary after knowledge-capture
 * - link-knowledge:     Link knowledge entry to active WP (capture-time auto-linking)
 * - persist:            Save current sync-state to disk (flush dirty state)
 * - load:               Load sync-state from disk, output as JSON
 * - reconcile:          Detect and correct stale knowledge links at session start
 * - reconcile-knowledge: Rebuild the denormalized knowledge cache from source-of-truth (recovery)
 * - reconcile-plan:     Detect and correct plan/WP state drift at session start
 *
 * Usage: node sync-bridge-cli.js --clear-dir=<path> --op=<operation> [--data=<json>]
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
exports.main = main;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const parse_args_1 = require("../../cli/parse-args");
const validation_1 = require("../../validation");
const context_hub_1 = require("../context-hub");
const knowledge_linker_1 = require("../knowledge-linker");
const db_1 = require("../../knowledge/db");
const audit_log_1 = require("../audit-log");
const parser_1 = require("../../workpackage/parser");
const registry_1 = require("../../workpackage/registry");
const parser_2 = require("../../plan/parser");
const writer_1 = require("../../plan/writer");
const registry_2 = require("../../plan/registry");
const phase_id_1 = require("../../plan/phase-id");
const plan_rollup_1 = require("../plan-rollup");
// ==============================================================================
// CONSTANTS
// ==============================================================================
// Typed Sets so a future addition to WorkpackageStatus or SessionSummary['status']
// produces a compile error if not also added here (STD-001 / TS-2 / TS-3 fix).
const VALID_WP_STATUSES = new Set([
    'not_started', 'in_progress', 'paused', 'blocked', 'complete', 'deferred', 'archived',
]);
// ==============================================================================
// DISPATCH MAP
// ==============================================================================
const DISPATCH_MAP = {
    'update-workpackage': handleUpdateWorkpackage,
    'update-session': handleUpdateSession,
    'update-knowledge': handleUpdateKnowledge,
    'link-knowledge': handleLinkKnowledge,
    'persist': handlePersist,
    'load': handleLoad,
    'reconcile': handleReconcile,
    'reconcile-knowledge': handleReconcileKnowledge,
    'reconcile-plan': handleReconcilePlan,
};
// Typed against SessionSummary['status'] so the Set cannot silently drift from
// the SessionSummary union (STD-001 / TS-3 fix).
const VALID_SESSION_STATUSES = new Set(['active', 'ending', 'complete']);
// ==============================================================================
// OPERATION HANDLERS
// ==============================================================================
/**
 * Update workpackage summary in sync-state.
 * Expects --data with JSON containing workpackage progress fields:
 *   displayId, title, progress (matches WorkpackageSummary interface).
 */
async function handleUpdateWorkpackage(manager, opts) {
    const data = parseDataArg(opts.data);
    if (!data) {
        return { success: false, op: 'update-workpackage', error: 'Invalid or missing --data JSON' };
    }
    // WP-DF3 AC2 (S167 G1+G2 fix): systemId added to the accepted field set so the
    // upstream ProgressOutput pipeline can populate WorkpackageSummary.systemId —
    // previously unreachable because ProgressOutput lacked the field entirely.
    const hasFields = data.systemId !== undefined || data.displayId !== undefined || data.title !== undefined || data.progress !== undefined || data.status !== undefined;
    if (!hasFields) {
        return { success: true, op: 'update-workpackage', updated: false, reason: 'No workpackage fields in data' };
    }
    manager.updateWorkpackageSummary({
        ...(typeof data.systemId === 'string' ? { systemId: data.systemId } : {}),
        ...(typeof data.displayId === 'string' ? { displayId: data.displayId } : {}),
        ...(typeof data.title === 'string' ? { title: data.title } : {}),
        ...(typeof data.progress === 'number' ? { progress: data.progress } : {}),
        ...(typeof data.status === 'string' && VALID_WP_STATUSES.has(data.status) ? { status: data.status } : {}),
    });
    if (manager.isDirty()) {
        manager.save();
    }
    return {
        success: true,
        op: 'update-workpackage',
        updated: true,
    };
}
/**
 * Link a knowledge entry to the active workpackage in sync-state.
 * Expects --data with JSON containing:
 *   knowledgeId (string), knowledgeTitle (string).
 *
 * Returns status: success | no_workpackage | already_linked | error.
 * The manager parameter is unused — linkKnowledge() creates its own manager
 * from basePath. This is intentional: linkKnowledge() also writes to the
 * knowledge DB and audit log, which requires full basePath context.
 */
async function handleLinkKnowledge(manager, opts) {
    void manager; // linkKnowledge manages its own SyncStateManager
    const data = parseDataArg(opts.data);
    if (!data) {
        return { success: false, op: 'link-knowledge', error: 'Invalid or missing --data JSON' };
    }
    const knowledgeId = typeof data.knowledgeId === 'string' ? data.knowledgeId : '';
    const knowledgeTitle = typeof data.knowledgeTitle === 'string' ? data.knowledgeTitle : '';
    if (!knowledgeId) {
        return { success: false, op: 'link-knowledge', error: 'Missing required knowledgeId in --data' };
    }
    // sessionId/sessionNumber not available in hook context — bash dispatchers
    // don't carry session state. Audit entries log with session 0; the link
    // itself is stored correctly in sync-state regardless.
    const result = await (0, knowledge_linker_1.linkKnowledge)({
        basePath: opts.clearDir,
        sessionId: '',
        sessionNumber: 0,
        knowledgeId,
        knowledgeTitle,
        linkedBy: 'auto'
    });
    return {
        success: result.status === 'success' || result.status === 'already_linked' || result.status === 'no_workpackage',
        op: 'link-knowledge',
        status: result.status,
        knowledgeId,
        ...(result.error ? { error: result.error } : {}),
    };
}
/**
 * Update session summary in sync-state. (WP-DF3 AC5 / S167 G3 fix)
 *
 * Prior to this op, SessionSummary fields were populated only by session-sync.ts
 * `syncSession()` — a function defined but never called from any production
 * site. As a result, sync-state.session was perpetually defaulted to
 * `{id:"", number:0, tokensUsed:0, status:"active"}` regardless of session
 * lifecycle. This op exposes the same writer surface that handleUpdateWorkpackage
 * uses, so session-init.sh and session-monitor.sh can refresh the session block
 * on lifecycle events.
 *
 * Expects --data with JSON containing any subset of:
 *   id (string), number (number), tokensUsed (number), status ('active'|'ending'|'complete').
 * Fields with the wrong type are silently dropped (matches handleUpdateWorkpackage pattern).
 */
async function handleUpdateSession(manager, opts) {
    const data = parseDataArg(opts.data);
    if (!data) {
        return { success: false, op: 'update-session', error: 'Invalid or missing --data JSON' };
    }
    const hasFields = data.id !== undefined
        || data.number !== undefined
        || data.tokensUsed !== undefined
        || data.status !== undefined;
    if (!hasFields) {
        return { success: true, op: 'update-session', updated: false, reason: 'No session fields in data' };
    }
    manager.updateSessionSummary({
        ...(typeof data.id === 'string' ? { id: data.id } : {}),
        ...(typeof data.number === 'number' ? { number: data.number } : {}),
        ...(typeof data.tokensUsed === 'number' ? { tokensUsed: data.tokensUsed } : {}),
        ...(typeof data.status === 'string' && VALID_SESSION_STATUSES.has(data.status)
            ? { status: data.status }
            : {}),
    });
    if (manager.isDirty()) {
        manager.save();
    }
    return {
        success: true,
        op: 'update-session',
        updated: true,
    };
}
/**
 * Update knowledge summary in sync-state.
 * Expects --data with JSON containing knowledge capture result:
 *   entryId (string), pendingCaptures (number).
 */
async function handleUpdateKnowledge(manager, opts) {
    const data = parseDataArg(opts.data);
    if (!data) {
        return { success: false, op: 'update-knowledge', error: 'Invalid or missing --data JSON' };
    }
    if (typeof data.entryId === 'string') {
        manager.addRecentKnowledgeEntry(data.entryId);
    }
    if (typeof data.pendingCaptures === 'number') {
        manager.updateKnowledgeSummary({
            pendingCaptures: data.pendingCaptures,
        });
    }
    if (manager.isDirty()) {
        manager.save();
    }
    return {
        success: true,
        op: 'update-knowledge',
        entryId: data.entryId ?? null,
    };
}
/**
 * Persist (flush) current sync-state to disk.
 */
async function handlePersist(manager, opts) {
    void opts;
    // Record a full-sync timestamp on every persist op so sync-state.lastFullSync
    // reflects the last flush to disk. The Stop hook fires persist once per
    // session, so this is the cadence users observe for "last full sync".
    manager.recordFullSync();
    const saved = manager.save();
    return {
        success: saved,
        op: 'persist',
        saved,
    };
}
/**
 * Load sync-state from disk and output as JSON.
 */
async function handleLoad(manager, opts) {
    void opts;
    const state = manager.getState();
    return {
        success: true,
        op: 'load',
        state,
    };
}
/**
 * Reconcile sync-state knowledge links against the knowledge database.
 *
 * Detects stale links where sync-state has status 'active' but the knowledge DB
 * entry has been superseded, deprecated, or archived. Corrects the sync-state
 * link status to match DB truth. If a superseded entry has a successor and
 * autoMigrateSuperseded is enabled (via --data), creates a new link for the
 * successor entry.
 *
 * Called by session-start.sh after knowledge-load.sh and before context output.
 * Logs all corrections to .clear/audit/ for traceability.
 */
async function handleReconcile(manager, opts) {
    const data = parseDataArg(opts.data);
    if (data === null) {
        return { success: false, op: 'reconcile', error: 'Invalid --data JSON' };
    }
    const autoMigrate = data.autoMigrateSuperseded === true;
    // opts.clearDir is the project root; KnowledgeDatabase expects .clear subdir
    const clearDir = path.join(opts.clearDir, '.clear');
    const db = new db_1.KnowledgeDatabase(clearDir);
    if (!db.initialize()) {
        return {
            success: true,
            op: 'reconcile',
            corrections: 0,
            status: 'no_db',
            message: 'Knowledge database not available — skipping reconciliation',
        };
    }
    // AuditLogger expects project root (basePath)
    const auditLogger = new audit_log_1.AuditLogger(opts.clearDir, '', // sessionId not available in hook context
    0 // sessionNumber not available in hook context
    );
    const links = manager.getLinks();
    const corrections = [];
    const migrated = [];
    try {
        for (const [wpId, wpLinks] of Object.entries(links.workpackageKnowledge)) {
            for (const link of wpLinks) {
                if (link.status !== 'active')
                    continue;
                const entry = db.getEntry(link.id);
                if (!entry)
                    continue; // Entry not in DB — leave link as-is
                if (entry.status === 'active')
                    continue; // In sync — no correction needed
                // Stale link detected: sync-state says 'active', DB says otherwise.
                // Validate that dbStatus is a recognized non-active status before updating.
                const dbStatus = entry.status;
                if (dbStatus !== 'superseded' && dbStatus !== 'deprecated' && dbStatus !== 'archived')
                    continue;
                manager.updateKnowledgeLinkStatus(wpId, link.id, dbStatus);
                manager.addDeprecatedReference(link.id);
                corrections.push({
                    knowledgeId: link.id,
                    workpackageId: wpId,
                    oldStatus: 'active',
                    newStatus: dbStatus,
                });
                auditLogger.log({
                    domain: 'knowledge',
                    action: 'repair',
                    target: link.id,
                    targetDisplayId: link.id,
                    oldValue: 'active',
                    newValue: dbStatus,
                    trigger: 'session_start',
                    metadata: { workpackageId: wpId, reason: 'reconcile_stale_link' },
                });
                // Auto-migrate: if superseded and has successor, link the successor
                if (autoMigrate && dbStatus === 'superseded' && entry.superseded_by) {
                    const successor = db.getEntry(entry.superseded_by);
                    if (successor && successor.status === 'active') {
                        const existingLinks = manager.getKnowledgeLinksForWorkpackage(wpId);
                        const alreadyLinked = existingLinks.some(l => l.id === successor.id);
                        if (!alreadyLinked) {
                            manager.addKnowledgeLink(wpId, {
                                id: successor.id,
                                workpackageId: wpId,
                                phaseId: link.phaseId,
                                title: successor.title ?? link.title,
                                linkedAt: new Date().toISOString(),
                                linkedBy: 'auto',
                                status: 'active',
                                deprecation_type: null,
                            });
                            migrated.push({
                                oldId: link.id,
                                newId: successor.id,
                                workpackageId: wpId,
                            });
                            auditLogger.log({
                                domain: 'knowledge',
                                action: 'link',
                                target: successor.id,
                                targetDisplayId: successor.id,
                                trigger: 'session_start',
                                metadata: {
                                    workpackageId: wpId,
                                    reason: 'reconcile_migrate_successor',
                                    supersededId: link.id,
                                },
                            });
                        }
                    }
                }
            }
        }
        if (manager.isDirty()) {
            manager.save();
        }
    }
    finally {
        db.close();
    }
    return {
        success: true,
        op: 'reconcile',
        corrections: corrections.length,
        migrated: migrated.length,
        status: corrections.length === 0 ? 'ok' : 'corrected',
        details: corrections.length > 0 ? corrections : undefined,
        migratedDetails: migrated.length > 0 ? migrated : undefined,
    };
}
/**
 * reconcile-knowledge: REBUILD the denormalized knowledge cache in sync-state
 * (knowledge.recentEntries + links.workpackageKnowledge) from the knowledge
 * database — the materialized source-of-truth. Recovery path for the drift where
 * the cache goes empty/stale while the DB holds the real entries (the empty
 * "Recent Knowledge" dashboard panel despite captured entries).
 *
 * Distinct from --op=reconcile, which only PRUNES stale links. Backs up
 * sync-state before persisting any change (reuses the Check-3 backup pattern),
 * and is idempotent — a coherent cache rebuilds to itself with no save and no
 * backup. An empty DB rebuilds the cache to an empty-but-valid projection.
 *
 * Called on demand (e.g. by cf-debug's actionable rebuild hint when the drift
 * check fires). Logs nothing to audit/ — the backup file is the recovery record.
 */
async function handleReconcileKnowledge(manager, opts) {
    // opts.clearDir is the project root; KnowledgeDatabase expects the .clear subdir
    const clearDir = path.join(opts.clearDir, '.clear');
    const db = new db_1.KnowledgeDatabase(clearDir);
    if (!db.initialize()) {
        return {
            success: true,
            op: 'reconcile-knowledge',
            status: 'no_db',
            rebuilt: false,
            message: 'Knowledge database not available — skipping rebuild',
        };
    }
    const errors = [];
    try {
        const sources = db.getAllEntries().map(entry => ({
            id: entry.id,
            title: entry.title,
            created: entry.created,
            status: entry.status,
            workpackageId: entry.workpackage_id,
            phaseId: entry.phase_id,
            deprecationType: entry.deprecation_type,
        }));
        const counts = manager.rebuildKnowledgeCache(sources);
        // Capture the change decision BEFORE save() clears the dirty flag. Only back
        // up + persist when the rebuild actually changed the cache, so a coherent
        // store is a true no-op (no backup churn — idempotency).
        const rebuilt = manager.isDirty();
        let backupPath = null;
        if (rebuilt) {
            backupPath = backupSyncStateBeforeReconcile(clearDir, errors, 'reconcile-knowledge');
            manager.save();
        }
        return {
            success: true,
            op: 'reconcile-knowledge',
            status: rebuilt ? 'rebuilt' : 'ok',
            rebuilt,
            entriesConsidered: counts.entries,
            recentEntries: counts.recent,
            workpackageGroups: counts.workpackages,
            linksRebuilt: counts.links,
            ...(backupPath ? { backup: path.basename(backupPath) } : {}),
            ...(errors.length > 0 ? { errors } : {}),
        };
    }
    finally {
        db.close();
    }
}
/**
 * reconcile-plan: Detect and correct plan/WP state drift at session start.
 *
 * Three independent checks, each fire-and-log (failure in one does not block others):
 *
 * Check 1 — Registry vs WP YAML status: WP YAML file is source of truth.
 *           If registry.yaml has a different status, correct the registry.
 *
 * Check 2 — Master-plan phases[].workpackages[] vs registry membership:
 *           Add WPs present in registry (non-deferred/archived) but missing from
 *           master-plan; remove WPs that are deferred/archived but still listed.
 *           If corrections made, re-derive plan.json via PlanRegistryManager.
 *
 * Check 3 — Sync-state.json summaries vs actual state files:
 *           Compare WP and plan summaries in sync-state against workpackage.json
 *           and plan.json on disk. Correct sync-state if stale.
 *
 * Called by session-start.sh after --op=reconcile (knowledge reconciliation).
 */
async function handleReconcilePlan(manager, opts) {
    const corrections = [];
    const errors = [];
    // Resolve paths — opts.clearDir is the project root
    const clearDir = path.join(opts.clearDir, '.clear');
    const registryPath = path.join(clearDir, 'workpackages', 'registry.yaml');
    const masterPlanPath = path.join(clearDir, 'plans', 'master-plan.yaml');
    const wpBaseDir = path.resolve(path.join(clearDir, 'workpackages'));
    const check1Corrections = reconcileCheck1_RegistryVsWpYaml(registryPath, wpBaseDir, corrections, errors);
    const check2Corrections = reconcileCheck2_MasterPlanVsRegistry(masterPlanPath, registryPath, opts.clearDir, clearDir, corrections, errors);
    // Check 4 runs BEFORE Check 3: it normalizes master-plan phase references (the SOT) and
    // re-derives plan.json, so Check 3 then propagates the corrected activePhaseId to
    // sync-state.activePhaseDisplayId.
    const check4Corrections = reconcileCheck4_PhaseReferentialIntegrity(masterPlanPath, opts.clearDir, clearDir, corrections, errors);
    reconcileCheck3_SyncStateVsStateFiles(clearDir, manager, corrections, errors);
    return {
        success: true,
        op: 'reconcile-plan',
        corrections: corrections.length,
        check1Corrections,
        check2Corrections,
        check3Corrections: corrections.filter(c => c.check === 3).length,
        check4Corrections,
        status: corrections.length === 0 ? 'ok' : 'corrected',
        details: corrections.length > 0 ? corrections : undefined,
        errors: errors.length > 0 ? errors : undefined,
    };
}
/**
 * Check 1: Registry vs WP YAML status.
 * WP YAML is source of truth. Read registry once, patch all drifted entries, write once.
 */
function reconcileCheck1_RegistryVsWpYaml(registryPath, wpBaseDir, corrections, errors) {
    let count = 0;
    try {
        if (!fs.existsSync(registryPath))
            return 0;
        const registry = (0, parser_1.parseRegistryFile)(registryPath);
        // Read raw registry once for mutation (F-01 fix: single read-mutate-write)
        const rawContent = fs.readFileSync(registryPath, 'utf-8');
        const rawRegistry = yaml.load(rawContent, { schema: yaml.JSON_SCHEMA });
        let registryModified = false;
        for (const regEntry of registry.workpackages) {
            const wpFilename = regEntry.file || `${regEntry.id}.yaml`;
            const wpPath = path.join(wpBaseDir, wpFilename);
            // Path traversal guard (F-02 fix: OWASP A03)
            if (!path.resolve(wpPath).startsWith(wpBaseDir + path.sep))
                continue;
            if (!fs.existsSync(wpPath))
                continue;
            try {
                const wpEntry = (0, parser_1.parseWorkpackageFile)(wpPath);
                if (wpEntry.status !== regEntry.status) {
                    const rawEntry = rawRegistry.workpackages.find(wp => wp.id === regEntry.id || wp.systemId === regEntry.systemId);
                    if (rawEntry) {
                        corrections.push({
                            check: 1,
                            field: `registry[${regEntry.id}].status`,
                            oldValue: regEntry.status,
                            newValue: wpEntry.status,
                        });
                        rawEntry.status = wpEntry.status;
                        registryModified = true;
                        count++;
                    }
                }
            }
            catch {
                // WP parse failure — skip this entry, don't block other checks
            }
        }
        if (registryModified) {
            fs.writeFileSync(registryPath, yaml.dump(rawRegistry), 'utf-8');
        }
    }
    catch (e) {
        errors.push(`Check 1 failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    return count;
}
/**
 * Check 2: Master-plan phases[].workpackages[] vs registry membership.
 * Add missing non-deferred/archived WPs, remove deferred/archived WPs.
 * Re-derive plan.json if corrections made.
 */
function reconcileCheck2_MasterPlanVsRegistry(masterPlanPath, registryPath, projectRoot, clearDir, corrections, errors) {
    let count = 0;
    try {
        if (!fs.existsSync(masterPlanPath) || !fs.existsSync(registryPath))
            return 0;
        const plan = (0, parser_2.parseMasterPlanYaml)(masterPlanPath);
        const registry = (0, parser_1.parseRegistryFile)(registryPath);
        if (!plan)
            return 0;
        const deferredOrArchived = new Set(['deferred', 'archived']);
        let planModified = false;
        for (const phase of plan.phases) {
            // Find registry WPs belonging to this phase that are missing from master-plan
            for (const regEntry of registry.workpackages) {
                if (regEntry.phase !== phase.systemId && regEntry.phase !== phase.id)
                    continue;
                if (deferredOrArchived.has(regEntry.status))
                    continue;
                // Check against live array (F-14 fix: avoid stale snapshot)
                if (!phase.workpackages.includes(regEntry.id)) {
                    phase.workpackages.push(regEntry.id);
                    if (!(regEntry.id in phase.weights)) {
                        phase.weights[regEntry.id] = 1;
                    }
                    corrections.push({
                        check: 2,
                        field: `plan.phases[${phase.id}].workpackages`,
                        oldValue: 'missing',
                        newValue: `added ${regEntry.id}`,
                    });
                    count++;
                    planModified = true;
                }
            }
            // Remove deferred/archived WPs that are still listed in master-plan
            // F-05 fix: match regEntry by id AND verify it belongs to this phase
            const toRemove = [];
            for (const wpId of phase.workpackages) {
                const regEntry = registry.workpackages.find(wp => wp.id === wpId && (wp.phase === phase.systemId || wp.phase === phase.id));
                if (regEntry && deferredOrArchived.has(regEntry.status)) {
                    toRemove.push(wpId);
                }
            }
            for (const wpId of toRemove) {
                phase.workpackages = phase.workpackages.filter(id => id !== wpId);
                delete phase.weights[wpId];
                corrections.push({
                    check: 2,
                    field: `plan.phases[${phase.id}].workpackages`,
                    oldValue: `listed ${wpId}`,
                    newValue: 'removed (deferred/archived)',
                });
                count++;
                planModified = true;
            }
        }
        if (planModified) {
            // F-03 fix: check writeMasterPlan result before re-deriving plan.json
            const writeResult = (0, writer_1.writeMasterPlan)(projectRoot, plan);
            if (writeResult.status === 'error') {
                errors.push(`Check 2: writeMasterPlan failed: ${writeResult.error}`);
                return count;
            }
            // Re-derive plan.json — clear cache and re-initialize state
            const planRegistry = new registry_2.PlanRegistryManager(clearDir);
            planRegistry.initializeState('reconcile-plan');
        }
    }
    catch (e) {
        errors.push(`Check 2 failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    return count;
}
/**
 * Check 4: master-plan phase-reference format integrity.
 * Display-id references (milestones[].phase, activePhase) that are FORMAT variants of an
 * existing phases[].id ("phase_1" vs "Phase-1") are normalized to the canonical id; the
 * phases[].id values are the source of truth and are never changed. Projected surfaces
 * (plan.json activePhaseId, sync-state activePhaseDisplayId) follow via the plan re-derive
 * below + Check 3. Shares reconcileMasterPlanPhaseRefs() with debug-cli --check-ids/--repair
 * so detection and correction use one definition. Does NOT touch reconcileCheck1's
 * registry-vs-WP status correction.
 */
function reconcileCheck4_PhaseReferentialIntegrity(masterPlanPath, projectRoot, clearDir, corrections, errors) {
    try {
        if (!fs.existsSync(masterPlanPath))
            return 0;
        const plan = (0, parser_2.parseMasterPlanYaml)(masterPlanPath);
        if (!plan)
            return 0;
        // (1) Normalize the master-plan SOT (milestones[].phase + activePhase format variants).
        const sot = applyMasterPlanPhaseRefCorrections(plan, projectRoot, corrections, errors);
        if (!sot.ok)
            return 0; // master-plan write failed — do NOT re-derive from an uncorrected SOT
        // (2) Detect plan.json projection drift independently (the SOT may already be canonical
        //     while the projection lags). Both feed the single re-derive below.
        const projectionDrift = checkPlanStateProjectionDrift(clearDir, plan, corrections);
        if (sot.needReDerive || projectionDrift) {
            // Re-derive plan.json so its activePhaseId follows the corrected master-plan SOT.
            // Check 3 (after this) then propagates the corrected id to sync-state.activePhaseDisplayId.
            new registry_2.PlanRegistryManager(clearDir).initializeState('reconcile-plan');
        }
        return sot.count + (projectionDrift ? 1 : 0);
    }
    catch (e) {
        errors.push(`Check 4 failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
        return 0;
    }
}
/**
 * Normalize format-variant phase references in the master-plan SOT and write it back.
 * backup:true writes a .bak sibling before overwriting the consumer's primary plan file.
 * Returns the correction count, whether plan.json must be re-derived, and ok=false when the
 * write failed (the caller aborts so it never re-derives from an uncorrected SOT).
 */
function applyMasterPlanPhaseRefCorrections(plan, projectRoot, corrections, errors) {
    const refCorrections = (0, phase_id_1.reconcileMasterPlanPhaseRefs)(plan);
    if (refCorrections.length === 0) {
        return { count: 0, needReDerive: false, ok: true };
    }
    const writeResult = (0, writer_1.writeMasterPlan)(projectRoot, plan, { backup: true });
    if (writeResult.status === 'error') {
        errors.push(`Check 4: writeMasterPlan failed: ${writeResult.error}`);
        return { count: 0, needReDerive: false, ok: false };
    }
    for (const c of refCorrections) {
        corrections.push({
            check: 4,
            field: `plan.${c.field}`,
            oldValue: c.oldValue,
            newValue: c.newValue,
        });
    }
    return { count: refCorrections.length, needReDerive: true, ok: true };
}
/**
 * Detect plan.json projection drift: a plan.json activePhaseId that is a FORMAT variant of an
 * existing phases[].id while the master-plan SOT is already canonical. Records the correction
 * and returns true when found (the caller re-derives plan.json once for all of Check 4).
 */
function checkPlanStateProjectionDrift(clearDir, plan, corrections) {
    const planStatePath = path.join(clearDir, 'state', 'plan.json');
    if (!fs.existsSync(planStatePath))
        return false;
    try {
        const raw = JSON.parse(fs.readFileSync(planStatePath, 'utf-8'));
        if (typeof raw !== 'object' || raw === null)
            return false;
        const activePhaseId = raw.activePhaseId;
        if (typeof activePhaseId !== 'string' || !activePhaseId)
            return false;
        const res = (0, phase_id_1.resolvePhaseRef)(activePhaseId, plan.phases.map(p => p.id));
        if (res.status === 'format-variant' && res.canonical) {
            corrections.push({
                check: 4,
                field: 'plan.json activePhaseId',
                oldValue: activePhaseId,
                newValue: res.canonical,
            });
            return true;
        }
    }
    catch {
        // malformed plan.json is reported/handled elsewhere; skip the projection re-derive
    }
    return false;
}
/**
 * Back up sync-state.json before a reconciliation mutates it, so the change is
 * reversible. Writes a sibling `sync-state.bak-<timestamp>.json` and returns its
 * path, or null if the source is missing or the copy fails. Failure is logged and
 * non-fatal: reconciliation is best-effort per the Check 3 contract, and a failed
 * backup must not abort the reconcile (a stale dashboard is worse than a missing
 * backup file). The on-disk sync-state is still pristine at call time — the manager
 * mutates in memory and only persists once at the end of the reconcile — so the
 * backup captures the true pre-reconciliation state.
 */
function backupSyncStateBeforeReconcile(clearDir, errors, context = 'Check 3') {
    try {
        const src = path.join(clearDir, 'state', 'sync-state.json');
        if (!fs.existsSync(src))
            return null;
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const dest = path.join(clearDir, 'state', `sync-state.bak-${ts}.json`);
        fs.copyFileSync(src, dest);
        return dest;
    }
    catch (e) {
        // `context` labels the calling operation so a backup failure is attributed
        // to the right caller (the helper is shared across reconcile paths).
        errors.push(`${context} sync-state backup failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
        return null;
    }
}
/**
 * Check 3: Sync-state.json WP/plan summaries vs actual state files.
 * Correct sync-state if stale.
 */
function reconcileCheck3_SyncStateVsStateFiles(clearDir, manager, corrections, errors) {
    try {
        // Check workpackage summary against workpackage.json
        const wpStatePath = path.join(clearDir, 'state', 'workpackage.json');
        if (fs.existsSync(wpStatePath)) {
            const raw = JSON.parse(fs.readFileSync(wpStatePath, 'utf-8'));
            const rawObj = typeof raw === 'object' && raw !== null ? raw : {};
            // Hoist to a const local so the `typeof === 'string'` narrowing below
            // survives the intervening corrections.push / manager.update* calls
            // (property-access narrowing on rawObj would reset after each call).
            const activeWorkpackage = rawObj.activeWorkpackage;
            const syncWpSummary = manager.getWorkpackageSummary();
            // F-06 fix: runtime type guards on parsed JSON
            if (typeof activeWorkpackage === 'string' && syncWpSummary.displayId !== activeWorkpackage) {
                corrections.push({
                    check: 3,
                    field: 'sync.workpackage.displayId',
                    oldValue: syncWpSummary.displayId,
                    newValue: activeWorkpackage,
                });
                manager.updateWorkpackageSummary({ displayId: activeWorkpackage });
            }
            // Progress repair sources from the registry (authoritative), NOT from
            // workpackage.json. state/workpackage.json.progress is structurally
            // active-WP-only and goes stale the moment a WP is completed or
            // deactivated, so repairing the snapshot FROM it is a no-op exactly when
            // it matters (both read 0 for a deactivated-but-complete WP). The registry
            // derives progress from live deliverable states and falls back to the
            // per-WP YAML 'complete' statuses, yielding the true value (e.g. 100) even
            // when workpackage.json has been reset. Scope to a legitimately-active WP
            // (workpackage.json reports a string activeWorkpackage) so this repair can
            // never resurrect a deactivated block — the null-active-clear branch below
            // is the authoritative outcome for that case, and the `string` guard here
            // is the exact complement of its `!= string` guard.
            if (typeof activeWorkpackage === 'string') {
                try {
                    const registry = new registry_1.WorkpackageRegistryManager(clearDir);
                    // Only repair from a workpackage that actually exists in the registry.
                    // calculateProgress() returns a {progress:0} fallback for an unknown id,
                    // so an orphaned activeWorkpackage (its registry entry deleted/renamed)
                    // would otherwise push a spurious progress->0 "correction". Route the
                    // not-found case to errors[] instead of writing a false 0.
                    if (!registry.getWorkpackage(activeWorkpackage)) {
                        errors.push(`Check 3 progress repair skipped: active workpackage '${activeWorkpackage}' not found in registry`);
                    }
                    else {
                        const registryProgress = registry.calculateProgress(activeWorkpackage).progress;
                        if (syncWpSummary.progress !== registryProgress) {
                            corrections.push({
                                check: 3,
                                field: 'sync.workpackage.progress',
                                oldValue: String(syncWpSummary.progress),
                                newValue: String(registryProgress),
                            });
                            manager.updateWorkpackageSummary({ progress: registryProgress });
                        }
                    }
                }
                catch (e) {
                    // A registry read failure must not abort the reconcile; a stale
                    // progress scalar is recoverable on the next session start.
                    errors.push(`Check 3 registry progress read failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
            }
            // Null-active clear: workpackage.json is the source of truth for which WP is
            // active. When it reports NO active workpackage (activeWorkpackage is not a
            // string — null, absent, or any non-string value) but the sync-state still pins
            // a non-empty workpackage block, that block is stale: a completed or cleared WP
            // whose roll-over never reached sync-state. The session-start dashboard would
            // render it as a phantom active WP. The clear-on-complete path empties the block
            // on new completions; this is the session-start safety net that also reconciles a
            // pre-existing stale block. Reconcile by clearing from the authoritative source,
            // backing up sync-state first so the operation is reversible. The `!= string`
            // guard is the exact complement of the string-typed reconciliation above, so the
            // two branches are mutually exclusive. Require a non-empty block so an
            // already-clear state is a no-op (no spurious correction, no backup churn, idempotent).
            const noActiveWorkpackage = typeof activeWorkpackage !== 'string';
            const blockIsNonEmpty = syncWpSummary.systemId !== '' || syncWpSummary.displayId !== '';
            if (noActiveWorkpackage && blockIsNonEmpty) {
                const backupPath = backupSyncStateBeforeReconcile(clearDir, errors);
                corrections.push({
                    check: 3,
                    field: 'sync.workpackage (cleared — workpackage.json has no active workpackage)',
                    oldValue: syncWpSummary.displayId || syncWpSummary.systemId,
                    newValue: backupPath
                        ? `cleared (backup: ${path.basename(backupPath)})`
                        : 'cleared',
                });
                manager.clearActiveWorkpackage();
            }
        }
        // Check plan summary against plan.json
        const planStatePath = path.join(clearDir, 'state', 'plan.json');
        if (fs.existsSync(planStatePath)) {
            const raw = JSON.parse(fs.readFileSync(planStatePath, 'utf-8'));
            const syncPlanSummary = manager.getPlanSummary();
            if (typeof raw.activePhaseId === 'string' && syncPlanSummary.activePhaseDisplayId !== raw.activePhaseId) {
                corrections.push({
                    check: 3,
                    field: 'sync.plan.activePhaseDisplayId',
                    oldValue: syncPlanSummary.activePhaseDisplayId,
                    newValue: raw.activePhaseId,
                });
                manager.updatePlanSummary({ activePhaseDisplayId: raw.activePhaseId });
            }
            if (typeof raw.activePhaseSystemId === 'string' && syncPlanSummary.activePhaseSystemId !== raw.activePhaseSystemId) {
                corrections.push({
                    check: 3,
                    field: 'sync.plan.activePhaseSystemId',
                    oldValue: syncPlanSummary.activePhaseSystemId,
                    newValue: raw.activePhaseSystemId,
                });
                manager.updatePlanSummary({ activePhaseSystemId: raw.activePhaseSystemId });
            }
            // WP-PL8 light-(b): belt-and-suspenders systemId backfill. The dashboard
            // now keys "(no plan loaded)" off the always-present activePhaseDisplayId,
            // so an empty systemId no longer hides a healthy plan. Keep the optional
            // systemId coherent when it IS resolvable: if plan.json carried no systemId
            // (null/absent → the string-copy above was skipped) yet the active phase
            // has a systemId in the authoritative master-plan.yaml, populate it. If
            // master-plan.yaml also lacks a systemId for the phase, this is a no-op —
            // the plan genuinely has none, which is valid. Idempotent: once sync-state
            // holds the systemId, this guard (=== '') is false on subsequent sessions.
            // Best-effort match by display- or system-id (whichever plan.json stored);
            // a normalization miss simply leaves it empty (the renderer copes).
            // LOAD-BEARING re-read: getPlanSummary() returns a fresh COPY of state.plan
            // (`{ ...this.state.plan }`), so the snapshot captured above (syncPlanSummary)
            // does NOT reflect the string-copy mutation at the activePhaseSystemId branch.
            // Re-reading here makes this guard skip when plan.json already supplied a real
            // systemId — using the stale snapshot would re-enter and push a spurious second
            // correction over the value just set. Do not "simplify" to the snapshot.
            if (manager.getPlanSummary().activePhaseSystemId === '' &&
                typeof raw.activePhaseId === 'string' &&
                raw.activePhaseId !== '') {
                // Isolated try/catch: parseMasterPlanYaml throws (PlanParseError) on a
                // malformed master-plan.yaml. This backfill is best-effort and MUST NOT
                // destabilize the load-bearing WP/plan reconcile above — a throw here
                // would otherwise abort Check 3 before manager.save() and silently drop
                // every correction computed this pass. Swallow + record, never rethrow.
                try {
                    const masterPlanPath = path.join(clearDir, 'plans', 'master-plan.yaml');
                    if (fs.existsSync(masterPlanPath)) {
                        const masterPlan = (0, parser_2.parseMasterPlanYaml)(masterPlanPath);
                        const resolvedPhase = masterPlan?.phases.find(p => p.id === raw.activePhaseId ||
                            (p.systemId !== undefined && p.systemId === raw.activePhaseId));
                        if (resolvedPhase?.systemId) {
                            corrections.push({
                                check: 3,
                                field: 'sync.plan.activePhaseSystemId (backfilled from master-plan.yaml)',
                                oldValue: '',
                                newValue: resolvedPhase.systemId,
                            });
                            manager.updatePlanSummary({ activePhaseSystemId: resolvedPhase.systemId });
                        }
                    }
                }
                catch (e) {
                    errors.push(`Check 3 systemId backfill skipped: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
            }
            if (typeof raw.activePhaseId === 'string' && raw.phaseProgress && typeof raw.phaseProgress === 'object') {
                const actualProgress = typeof raw.phaseProgress[raw.activePhaseId] === 'number'
                    ? raw.phaseProgress[raw.activePhaseId] : 0;
                if (syncPlanSummary.phaseProgress !== actualProgress) {
                    corrections.push({
                        check: 3,
                        field: 'sync.plan.phaseProgress',
                        oldValue: String(syncPlanSummary.phaseProgress),
                        newValue: String(actualProgress),
                    });
                    manager.updatePlanSummary({ phaseProgress: actualProgress });
                }
            }
            // WP-DF3 AC5 (S167 G8 fix): mirror blockers from plan.json into sync-state.
            // Session-start safety net — if blockers-cli ran between sessions and
            // plan-rollup didn't catch up before session end, this reconciles the
            // sync-state mirror. The structured Blocker[] is flattened to string[]
            // matching the sync-state schema (description if set, else type:subject).
            if (Array.isArray(raw.blockers)) {
                // STD-001 + LINT-03 cross-role fix: use the shared formatBlockerForSyncState
                // from plan-rollup.ts instead of an inline duplicate. The raw JSON shape
                // (Record<string, unknown> from JSON.parse) is adapted to the typed
                // Blocker shape via a runtime-guarded mapper. Keeps the trim/no-trim
                // behavior aligned across plan-rollup and session-start reconcile.
                const mirrored = raw.blockers
                    .filter((b) => typeof b === 'object' && b !== null)
                    .map((b) => (0, plan_rollup_1.formatBlockerForSyncState)({
                    type: (typeof b.type === 'string' ? b.type : 'blocker'),
                    severity: (typeof b.severity === 'string' ? b.severity : 'medium'),
                    description: typeof b.description === 'string' ? b.description : undefined,
                    blocking: typeof b.blocking === 'string' ? b.blocking : undefined,
                    blocked: typeof b.blocked === 'string' ? b.blocked : undefined,
                    milestone: typeof b.milestone === 'string' ? b.milestone : undefined,
                }));
                const existing = syncPlanSummary.blockers ?? [];
                const differs = mirrored.length !== existing.length
                    || mirrored.some((v, i) => v !== existing[i]);
                if (differs) {
                    corrections.push({
                        check: 3,
                        field: 'sync.plan.blockers',
                        oldValue: `[${existing.length} entries]`,
                        newValue: `[${mirrored.length} entries]`,
                    });
                    manager.updatePlanSummary({ blockers: mirrored });
                }
            }
        }
        if (manager.isDirty()) {
            manager.save();
        }
    }
    catch (e) {
        errors.push(`Check 3 failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
}
// ==============================================================================
// HELPERS
// ==============================================================================
/**
 * Parse --data JSON argument. Returns null on malformed JSON (CS3: fail fast).
 */
function parseDataArg(dataStr) {
    if (!dataStr) {
        return {};
    }
    try {
        return JSON.parse(dataStr);
    }
    catch {
        return null;
    }
}
// ==============================================================================
// CLI ENTRY POINT
// ==============================================================================
const ARG_PARSERS = [
    { prefix: '--op=', apply: (v, o) => { o.op = v; } },
    { prefix: '--data=', apply: (v, o) => { o.data = v; } },
];
async function main(args) {
    const helpArgs = args ?? process.argv.slice(2);
    if (helpArgs.includes('--help') || helpArgs.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: sync-bridge-cli.js --op=<operation> [options]',
                '',
                'Operations:',
                '  update-workpackage           Update WP summary in sync-state',
                '  update-session               Update session summary in sync-state',
                '  update-knowledge             Update knowledge summary after capture',
                '  link-knowledge               Link knowledge entry to active WP',
                '  persist                      Save current sync-state to disk',
                '  load                         Load sync-state from disk as JSON',
                '  reconcile                    Detect/correct stale knowledge links',
                '  reconcile-knowledge          Rebuild the knowledge cache from source-of-truth',
                '  reconcile-plan               Detect/correct plan/WP state drift',
                '',
                'Options:',
                '  --clear-dir=<path>           Path to .clear directory (required)',
                '  --op=<operation>             Operation name (required)',
                '  --data=<json>                JSON data payload for the operation',
            ].join('\n')
        }));
        process.exit(0);
    }
    // Support both direct args (for testing) and process.argv (production).
    // Both paths use the same parsing logic; direct args skip validateBasePath
    // since test directories may not exist on disk.
    let options;
    if (args) {
        options = { clearDir: '', op: '', data: '' };
        for (const arg of args) {
            if (arg.startsWith('--clear-dir=')) {
                options.clearDir = arg.substring('--clear-dir='.length);
            }
            else if (arg.startsWith('--op=')) {
                options.op = arg.substring('--op='.length);
            }
            else if (arg.startsWith('--data=')) {
                options.data = arg.substring('--data='.length);
            }
        }
    }
    else {
        options = (0, parse_args_1.parseCliArgs)({ clearDir: '', op: '', data: '' }, ARG_PARSERS);
    }
    // Validate required args
    if (!options.clearDir) {
        const result = {
            success: false,
            op: options.op || 'unknown',
            error: 'Missing required --clear-dir argument',
        };
        console.log(JSON.stringify(result));
        // `return process.exit(...)` (not `exit(); return;`): process.exit returns `never` in
        // production; under the no-op exit mock the sync-bridge-cli tests use it returns, so this
        // `return` exits the handler. The single-statement form avoids a TS7027 unreachable warning.
        return process.exit(1);
    }
    if (!options.op) {
        const result = {
            success: false,
            op: 'unknown',
            error: 'Missing required --op argument',
        };
        console.log(JSON.stringify(result));
        return process.exit(1); // see note above
    }
    // Look up handler
    const handler = DISPATCH_MAP[options.op];
    if (!handler) {
        const result = {
            success: false,
            op: options.op,
            error: `Unknown operation: ${options.op}`,
            availableOps: Object.keys(DISPATCH_MAP),
        };
        console.log(JSON.stringify(result));
        return process.exit(1); // see note above
    }
    // Normalize --clear-dir to the project root regardless of which convention the
    // caller passed (`.`/$CWD project-root form OR `./.clear` form). Every sync-bridge
    // handler treats opts.clearDir as the project root (joins `.clear` onto it); a
    // dispatcher passing the .clear dir would otherwise nest into <root>/.clear/.clear/
    // — the OBS-7 reconcile "0 corrections" artifact. resolveClearDir collapses both
    // forms to the same project root. (The production path is already traversal-checked
    // by parseCliArgs; the direct-args test path intentionally skips that, and
    // resolveClearDir does no filesystem access.)
    options.clearDir = (0, validation_1.resolveClearDir)(options.clearDir).projectRoot;
    // Create manager and load state
    const manager = new context_hub_1.SyncStateManager(options.clearDir);
    manager.load();
    // Execute handler
    const result = await handler(manager, options);
    console.log(JSON.stringify(result));
    if (!result.success) {
        process.exit(1);
    }
}
// Run if called directly
if (require.main === module) {
    main().catch(error => {
        const result = {
            success: false,
            op: 'unknown',
            error: error instanceof Error ? error.message : String(error),
        };
        console.log(JSON.stringify(result));
        process.exit(1);
    });
}
//# sourceMappingURL=sync-bridge-cli.js.map