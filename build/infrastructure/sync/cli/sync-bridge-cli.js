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
const context_hub_1 = require("../context-hub");
const knowledge_linker_1 = require("../knowledge-linker");
const db_1 = require("../../knowledge/db");
const audit_log_1 = require("../audit-log");
const parser_1 = require("../../workpackage/parser");
const parser_2 = require("../../plan/parser");
const writer_1 = require("../../plan/writer");
const registry_1 = require("../../plan/registry");
// ==============================================================================
// CONSTANTS
// ==============================================================================
const VALID_WP_STATUSES = new Set([
    'not_started', 'in_progress', 'paused', 'blocked', 'complete', 'deferred', 'archived',
]);
// ==============================================================================
// DISPATCH MAP
// ==============================================================================
const DISPATCH_MAP = {
    'update-workpackage': handleUpdateWorkpackage,
    'update-knowledge': handleUpdateKnowledge,
    'link-knowledge': handleLinkKnowledge,
    'persist': handlePersist,
    'load': handleLoad,
    'reconcile': handleReconcile,
    'reconcile-plan': handleReconcilePlan,
};
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
    const hasFields = data.displayId !== undefined || data.title !== undefined || data.progress !== undefined || data.status !== undefined;
    if (!hasFields) {
        return { success: true, op: 'update-workpackage', updated: false, reason: 'No workpackage fields in data' };
    }
    manager.updateWorkpackageSummary({
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
 * Updates state hashes before saving.
 */
async function handlePersist(manager, opts) {
    void opts;
    const hashes = manager.calculateStateHashes();
    manager.updateStateHashes(hashes);
    manager.incrementPromptCounter();
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
    reconcileCheck3_SyncStateVsStateFiles(clearDir, manager, corrections, errors);
    return {
        success: true,
        op: 'reconcile-plan',
        corrections: corrections.length,
        check1Corrections,
        check2Corrections,
        check3Corrections: corrections.filter(c => c.check === 3).length,
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
            const planRegistry = new registry_1.PlanRegistryManager(clearDir);
            planRegistry.initializeState('reconcile-plan');
        }
    }
    catch (e) {
        errors.push(`Check 2 failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    return count;
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
            const syncWpSummary = manager.getWorkpackageSummary();
            // F-06 fix: runtime type guards on parsed JSON
            if (typeof raw.activeWorkpackage === 'string' && syncWpSummary.displayId !== raw.activeWorkpackage) {
                corrections.push({
                    check: 3,
                    field: 'sync.workpackage.displayId',
                    oldValue: syncWpSummary.displayId,
                    newValue: raw.activeWorkpackage,
                });
                manager.updateWorkpackageSummary({ displayId: raw.activeWorkpackage });
            }
            if (typeof raw.progress === 'number' && syncWpSummary.progress !== raw.progress) {
                corrections.push({
                    check: 3,
                    field: 'sync.workpackage.progress',
                    oldValue: String(syncWpSummary.progress),
                    newValue: String(raw.progress),
                });
                manager.updateWorkpackageSummary({ progress: raw.progress });
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
                '  update-knowledge             Update knowledge summary after capture',
                '  link-knowledge               Link knowledge entry to active WP',
                '  persist                      Save current sync-state to disk',
                '  load                         Load sync-state from disk as JSON',
                '  reconcile                    Detect/correct stale knowledge links',
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
        process.exit(1);
        return; // unreachable in production, needed for test mock of process.exit
    }
    if (!options.op) {
        const result = {
            success: false,
            op: 'unknown',
            error: 'Missing required --op argument',
        };
        console.log(JSON.stringify(result));
        process.exit(1);
        return;
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
        process.exit(1);
        return;
    }
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