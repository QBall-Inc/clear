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
exports.linkKnowledge = linkKnowledge;
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
        const link = {
            id: knowledgeId,
            workpackageId: targetWpSystemId,
            phaseId: targetPhaseSystemId,
            title: knowledgeTitle,
            linkedAt: timestamp,
            linkedBy,
            status: 'active',
            deprecation_type: null
        };
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