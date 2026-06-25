"use strict";
/**
 * Knowledge ↔ Workpackage/Plan Linking (WF-3a)
 *
 * Maintains bidirectional links between knowledge entries and work items
 * using systemId references for stability.
 *
 * Key Features:
 * - Auto-link knowledge to active workpackage on capture
 * - Link by systemId (NOT display ID) for stability
 * - Query knowledge by workpackage/phase
 * - Track link status (active, deprecated, superseded)
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.4.
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
exports.buildSyncKnowledgeLink = buildSyncKnowledgeLink;
exports.linkKnowledge = linkKnowledge;
exports.propagateKnowledgeCapture = propagateKnowledgeCapture;
exports.propagateKnowledgeLink = propagateKnowledgeLink;
exports.unlinkKnowledge = unlinkKnowledge;
exports.getKnowledgeByWorkpackage = getKnowledgeByWorkpackage;
exports.getKnowledgeByPhase = getKnowledgeByPhase;
exports.getWorkpackagesWithKnowledge = getWorkpackagesWithKnowledge;
exports.updateLinkStatus = updateLinkStatus;
exports.createAutoLinkHandler = createAutoLinkHandler;
exports.isKnowledgeLinked = isKnowledgeLinked;
exports.getLinksForKnowledge = getLinksForKnowledge;
const path = __importStar(require("path"));
const context_hub_1 = require("./context-hub");
const audit_log_1 = require("./audit-log");
const db_1 = require("../knowledge/db");
const parser_1 = require("../knowledge/parser");
// ==============================================================================
// LINK CONSTRUCTION
// ==============================================================================
/**
 * Build an active (non-deprecated) {@link KnowledgeLink} for the sync-state
 * projection. Single source of the link shape so the constant fields
 * (`status: 'active'`, `deprecation_type: null`) and field ordering live in one
 * place instead of being re-spelled at every write surface. Callers resolve the
 * systemId refs themselves and pass them in (`phaseId` is a required systemId
 * string — `''` when none resolved, matching the sync-state default).
 *
 * @param params.id - Knowledge entry ID (e.g. "TD-025")
 * @param params.workpackageId - Workpackage systemId
 * @param params.phaseId - Phase systemId ('' when none)
 * @param params.title - Knowledge entry title
 * @param params.linkedAt - ISO timestamp (defaults to now)
 * @param params.linkedBy - Link source ('auto' | 'manual' | session id; default 'auto')
 */
function buildSyncKnowledgeLink(params) {
    return {
        id: params.id,
        workpackageId: params.workpackageId,
        phaseId: params.phaseId,
        title: params.title,
        linkedAt: params.linkedAt ?? new Date().toISOString(),
        linkedBy: params.linkedBy ?? 'auto',
        status: 'active',
        deprecation_type: null
    };
}
// ==============================================================================
// LINK KNOWLEDGE TO WORKPACKAGE
// ==============================================================================
/**
 * Link a knowledge entry to a workpackage.
 *
 * Uses systemId for stability - links survive plan restructuring.
 *
 * @param input - Link knowledge input
 * @returns Link result
 */
async function linkKnowledge(input) {
    const { basePath, sessionId, sessionNumber, knowledgeId, knowledgeTitle, workpackageSystemId, phaseSystemId, linkedBy = 'auto' } = input;
    const timestamp = new Date().toISOString();
    try {
        const clearDir = path.join(basePath, '.clear');
        const domainsUpdated = [];
        // Load sync state to get active workpackage if not specified
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        const syncState = syncManager.getState();
        // Determine target workpackage
        const targetWpSystemId = workpackageSystemId ?? syncState.workpackage.systemId;
        const targetPhaseSystemId = phaseSystemId ?? syncState.plan.activePhaseSystemId;
        if (!targetWpSystemId) {
            return {
                status: 'no_workpackage',
                domainsUpdated: [],
                timestamp,
                error: 'No active workpackage to link to'
            };
        }
        // Check if already linked
        const existingLinks = syncManager.getKnowledgeLinksForWorkpackage(targetWpSystemId);
        if (existingLinks.some(l => l.id === knowledgeId)) {
            return {
                status: 'already_linked',
                domainsUpdated: [],
                timestamp
            };
        }
        // Create link
        const link = buildSyncKnowledgeLink({
            id: knowledgeId,
            workpackageId: targetWpSystemId,
            phaseId: targetPhaseSystemId,
            title: knowledgeTitle,
            linkedAt: timestamp,
            linkedBy
        });
        // Update sync state with new link via typed mutator (avoids shallow-copy mutation)
        syncManager.addKnowledgeLink(targetWpSystemId, link);
        // Update recent entries via typed mutator
        syncManager.addRecentKnowledgeEntry(knowledgeId);
        syncManager.save();
        domainsUpdated.push('sync', 'knowledge');
        // Update knowledge database if available
        try {
            const db = new db_1.KnowledgeDatabase(clearDir);
            if (db.initialize()) {
                updateKnowledgeEntryLink(db, knowledgeId, targetWpSystemId, targetPhaseSystemId);
                db.close();
            }
        }
        catch {
            // Database update is optional - link is stored in sync state
        }
        // Log audit entry
        const auditLogger = new audit_log_1.AuditLogger(basePath, sessionId, sessionNumber);
        auditLogger.log({
            domain: 'knowledge',
            action: 'link',
            trigger: linkedBy === 'auto' ? 'auto_sync' : 'manual',
            target: knowledgeId,
            metadata: {
                event: 'knowledge_linked',
                workpackageId: targetWpSystemId,
                phaseId: targetPhaseSystemId,
                linkedBy
            }
        });
        return {
            status: 'success',
            link,
            domainsUpdated,
            timestamp
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            status: 'error',
            domainsUpdated: [],
            timestamp,
            error: `Link knowledge failed: ${errorMessage}`
        };
    }
}
// ==============================================================================
// INTRINSIC PROPAGATION HELPERS (shared single-writer)
// ==============================================================================
/**
 * Intrinsically propagate a knowledge CREATE/UPDATE to sync-state.
 *
 * The shared writer that makes the entrypoint (skill / hook / raw Bash) irrelevant
 * to correctness: a mutating CLI calls this directly so its own execution leaves
 * `sync-state.knowledge.recentEntries` coherent, instead of relying on the
 * UserPromptSubmit hook to catch up on the NEXT prompt.
 *
 * Synchronous load -> mutate -> save in one tick (never holds the manager across
 * an await). Idempotent: addRecentKnowledgeEntry dedups by id, so co-running with
 * the hook path yields a single coherent projection. Schema-normalize happens
 * inside SyncStateManager.load(), so this is safe on schema-divergent consumer
 * state. Throws nothing the caller must handle — the existing mutators and save()
 * own their error surfaces; callers fire this as a side effect.
 *
 * @param basePath - Project root directory
 * @param knowledgeId - Knowledge entry ID just created/updated (e.g. "TD-025")
 */
function propagateKnowledgeCapture(basePath, knowledgeId) {
    // Defense-in-depth: only project a well-formed knowledge ID into recentEntries.
    // Both current callers pass validated/auto-generated IDs, so this never fires
    // today; the guard keeps a future caller from polluting sync-state with a
    // malformed ref. Reuse the canonical validator (drift-proof sourcing) rather
    // than a parallel regex. No-op on invalid — the caller owns its primary surfaces.
    if (!(0, parser_1.isValidId)(knowledgeId)) {
        return;
    }
    const syncManager = new context_hub_1.SyncStateManager(basePath);
    syncManager.load();
    syncManager.addRecentKnowledgeEntry(knowledgeId);
    syncManager.save();
}
/**
 * Intrinsically propagate a knowledge->workpackage LINK to sync-state.
 *
 * Narrow companion to {@link propagateKnowledgeCapture} for the link surface: the
 * caller (link-cli) keeps owning the DB + markdown frontmatter + WP-YAML surfaces
 * and calls this last to add ONLY the sync-state projection. Lower blast radius
 * than delegating the whole flow to {@link linkKnowledge}.
 *
 * Synchronous load -> mutate -> save; idempotent (addKnowledgeLink dedups by
 * link.id). Schema-normalize in load() makes `state.links` safe even when the
 * consumer state had no `links` key (the divergent-shape crash site).
 *
 * Precondition (TS-005): the floor must NOT record a semantically-invalid link.
 * SyncStateManager.validate() rejects any link whose workpackage/phase refs are
 * not systemIds (`wp-…` / `ph-…`), so a `""` or display-ID phaseId would surface
 * as state corruption to the SS detection layer (debug-cli drift check +
 * reconcile). When the link's own phase ref is absent or non-systemId, resolve
 * it from the active phase (mirrors {@link linkKnowledge}'s
 * `?? activePhaseSystemId` precedent); if a valid `wp-`/`ph-` pair still can't be
 * formed, no-op rather than inject an invalid link — the caller keeps its other
 * surfaces (DB + .md + WP-YAML).
 *
 * @param basePath - Project root directory
 * @param workpackageSystemId - Target workpackage systemId
 * @param link - The KnowledgeLink to record
 * @returns true if the link was propagated, false if skipped as invalid
 */
function propagateKnowledgeLink(basePath, workpackageSystemId, link) {
    const syncManager = new context_hub_1.SyncStateManager(basePath);
    syncManager.load();
    // Resolve a systemId phase: prefer the link's own phase ref, fall back to the
    // active phase when it is absent/non-systemId (drift-proof sourcing). `plan`
    // is a required SyncState field, so no optional chain (matches linkKnowledge).
    let resolvedPhaseId = link.phaseId;
    if (!resolvedPhaseId || !resolvedPhaseId.startsWith('ph-')) {
        const activePhaseSystemId = syncManager.getState().plan.activePhaseSystemId;
        if (activePhaseSystemId && activePhaseSystemId.startsWith('ph-')) {
            resolvedPhaseId = activePhaseSystemId;
        }
    }
    // Guard: a valid link needs systemId wp + phase refs, else validate() would
    // flag the state as corrupt. Skip (no-op) rather than persist an invalid link.
    if (!workpackageSystemId.startsWith('wp-') ||
        !link.workpackageId.startsWith('wp-') ||
        !resolvedPhaseId?.startsWith('ph-')) {
        return false;
    }
    syncManager.addKnowledgeLink(workpackageSystemId, { ...link, phaseId: resolvedPhaseId });
    syncManager.addRecentKnowledgeEntry(link.id);
    syncManager.save();
    return true;
}
/**
 * Update knowledge entry in database with workpackage/phase links (GAP-13)
 *
 * Schema v2 supports workpackage_id and phase_id columns.
 * This ensures links persist in both sync-state AND knowledge DB.
 */
function updateKnowledgeEntryLink(db, knowledgeId, workpackageSystemId, phaseSystemId) {
    // GAP-13: Now using db.linkToWorkpackage() to persist links in database
    // This ensures links survive across sessions and can be queried via DB
    const updated = db.linkToWorkpackage(knowledgeId, workpackageSystemId, phaseSystemId);
    if (!updated) {
        // Entry may not exist in DB yet - create a minimal entry
        const entry = db.getEntry(knowledgeId);
        if (!entry) {
            // Entry doesn't exist - this is OK if knowledge was captured before DB initialization
            // The link is still stored in sync-state
            return;
        }
        // If entry exists but update failed, try upsert with link data
        entry.workpackage_id = workpackageSystemId;
        entry.phase_id = phaseSystemId;
        entry.modified = new Date().toISOString();
        db.upsertEntry(entry);
    }
}
// ==============================================================================
// UNLINK KNOWLEDGE FROM WORKPACKAGE
// ==============================================================================
/**
 * Remove link between knowledge entry and workpackage.
 *
 * @param input - Unlink knowledge input
 * @returns Unlink result
 */
async function unlinkKnowledge(input) {
    const { basePath, sessionId, sessionNumber, knowledgeId, workpackageSystemId } = input;
    const timestamp = new Date().toISOString();
    try {
        const domainsUpdated = [];
        // Load sync state
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        // Find and remove link via typed accessor (avoids shallow-copy mutation)
        const existingLinks = syncManager.getKnowledgeLinksForWorkpackage(workpackageSystemId);
        if (existingLinks.length === 0) {
            return {
                status: 'not_found',
                domainsUpdated: [],
                timestamp,
                error: `No links found for workpackage: ${workpackageSystemId}`
            };
        }
        const linkExists = existingLinks.some(l => l.id === knowledgeId);
        if (!linkExists) {
            return {
                status: 'not_found',
                domainsUpdated: [],
                timestamp,
                error: `Knowledge ${knowledgeId} not linked to workpackage ${workpackageSystemId}`
            };
        }
        // Remove link via typed mutator
        syncManager.removeKnowledgeLink(workpackageSystemId, knowledgeId);
        syncManager.save();
        domainsUpdated.push('sync', 'knowledge');
        // GAP-13: Update knowledge database to remove link
        const clearDir = path.join(basePath, '.clear');
        try {
            const db = new db_1.KnowledgeDatabase(clearDir);
            if (db.initialize()) {
                db.unlinkFromWorkpackage(knowledgeId);
                db.close();
            }
        }
        catch {
            // Database update is optional - link is removed from sync state
        }
        // Log audit entry
        const auditLogger = new audit_log_1.AuditLogger(basePath, sessionId, sessionNumber);
        auditLogger.log({
            domain: 'knowledge',
            action: 'unlink',
            trigger: 'manual',
            target: knowledgeId,
            metadata: {
                event: 'knowledge_unlinked',
                workpackageId: workpackageSystemId
            }
        });
        return {
            status: 'success',
            domainsUpdated,
            timestamp
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            status: 'error',
            domainsUpdated: [],
            timestamp,
            error: `Unlink knowledge failed: ${errorMessage}`
        };
    }
}
// ==============================================================================
// QUERY KNOWLEDGE BY WORKPACKAGE/PHASE
// ==============================================================================
/**
 * Get all knowledge entries linked to a workpackage.
 *
 * @param input - Query input
 * @returns Array of knowledge link summaries
 */
function getKnowledgeByWorkpackage(input) {
    const { basePath, workpackageSystemId, statusFilter } = input;
    try {
        // Load sync state
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        const syncState = syncManager.getState();
        const links = syncState.links.workpackageKnowledge[workpackageSystemId] ?? [];
        return links
            .filter(link => !statusFilter || link.status === statusFilter)
            .map(link => ({
            id: link.id,
            title: link.title,
            status: link.status,
            linkedAt: link.linkedAt,
            entryType: extractEntryType(link.id)
        }));
    }
    catch {
        return [];
    }
}
/**
 * Get all knowledge entries linked to a phase (across all workpackages in phase).
 *
 * @param input - Query input
 * @returns Array of knowledge link summaries
 */
function getKnowledgeByPhase(input) {
    const { basePath, phaseSystemId, statusFilter } = input;
    try {
        // Load sync state
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        const syncState = syncManager.getState();
        const results = [];
        const seen = new Set();
        // Iterate all workpackage links and filter by phase
        for (const links of Object.values(syncState.links.workpackageKnowledge)) {
            for (const link of links) {
                if (link.phaseId === phaseSystemId && !seen.has(link.id)) {
                    if (!statusFilter || link.status === statusFilter) {
                        results.push({
                            id: link.id,
                            title: link.title,
                            status: link.status,
                            linkedAt: link.linkedAt,
                            entryType: extractEntryType(link.id)
                        });
                        seen.add(link.id);
                    }
                }
            }
        }
        return results.sort((a, b) => b.linkedAt.localeCompare(a.linkedAt));
    }
    catch {
        return [];
    }
}
/**
 * Get all workpackages that have knowledge linked.
 *
 * @param basePath - Project root directory
 * @returns Array of workpackage systemIds with link counts
 */
function getWorkpackagesWithKnowledge(basePath) {
    try {
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        const syncState = syncManager.getState();
        const results = [];
        for (const [wpId, links] of Object.entries(syncState.links.workpackageKnowledge)) {
            const activeCount = links.filter(l => l.status === 'active').length;
            const deprecatedCount = links.filter(l => l.status === 'deprecated' || l.status === 'superseded').length;
            results.push({
                workpackageSystemId: wpId,
                linkCount: links.length,
                activeCount,
                deprecatedCount
            });
        }
        return results;
    }
    catch {
        return [];
    }
}
// ==============================================================================
// UPDATE LINK STATUS
// ==============================================================================
/**
 * Update the status of a knowledge link.
 *
 * @param basePath - Project root directory
 * @param knowledgeId - Knowledge entry ID
 * @param workpackageSystemId - Workpackage systemId
 * @param newStatus - New link status
 * @returns true if updated
 */
function updateLinkStatus(basePath, knowledgeId, workpackageSystemId, newStatus) {
    try {
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        // Use typed mutator to avoid shallow-copy mutation
        const existingLinks = syncManager.getKnowledgeLinksForWorkpackage(workpackageSystemId);
        if (!existingLinks.some(l => l.id === knowledgeId))
            return false;
        syncManager.updateKnowledgeLinkStatus(workpackageSystemId, knowledgeId, newStatus);
        syncManager.save();
        return true;
    }
    catch {
        return false;
    }
}
// ==============================================================================
// AUTO-LINK ON CAPTURE
// ==============================================================================
/**
 * Create an auto-link handler for use during knowledge capture.
 *
 * @param basePath - Project root directory
 * @returns Function that auto-links knowledge on capture
 */
function createAutoLinkHandler(basePath) {
    return async (sessionId, sessionNumber, knowledgeId, knowledgeTitle) => {
        return linkKnowledge({
            basePath,
            sessionId,
            sessionNumber,
            knowledgeId,
            knowledgeTitle,
            linkedBy: 'auto'
        });
    };
}
// ==============================================================================
// UTILITY FUNCTIONS
// ==============================================================================
/**
 * Extract entry type from knowledge ID (e.g., "TD-025" -> "TD")
 */
function extractEntryType(id) {
    const match = id.match(/^([A-Z]+)-/);
    return match ? match[1] : 'unknown';
}
/**
 * Check if a knowledge entry is linked to any workpackage.
 *
 * @param basePath - Project root directory
 * @param knowledgeId - Knowledge entry ID
 * @returns true if linked to at least one workpackage
 */
function isKnowledgeLinked(basePath, knowledgeId) {
    try {
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        const syncState = syncManager.getState();
        for (const links of Object.values(syncState.links.workpackageKnowledge)) {
            if (links.some(l => l.id === knowledgeId)) {
                return true;
            }
        }
        return false;
    }
    catch {
        return false;
    }
}
/**
 * Get all links for a knowledge entry.
 *
 * @param basePath - Project root directory
 * @param knowledgeId - Knowledge entry ID
 * @returns Array of links
 */
function getLinksForKnowledge(basePath, knowledgeId) {
    try {
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        const syncState = syncManager.getState();
        const results = [];
        for (const links of Object.values(syncState.links.workpackageKnowledge)) {
            const link = links.find(l => l.id === knowledgeId);
            if (link) {
                results.push(link);
            }
        }
        return results;
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=knowledge-linker.js.map