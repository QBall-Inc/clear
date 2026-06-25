"use strict";
/**
 * Deprecation Propagation (WF-3b)
 *
 * Propagates knowledge deprecation status to linked workpackages.
 * Handles supersession chains and generates warnings for linked items.
 *
 * Key Features:
 * - Mark linked knowledge as deprecated when workpackage deferred
 * - Propagate supersession through references
 * - Generate deprecation warnings in sync state
 * - Support auto-migration of superseded references
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.5.
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
exports.deprecateOnDefer = deprecateOnDefer;
exports.supersedeKnowledge = supersedeKnowledge;
exports.resolveSupersessionChain = resolveSupersessionChain;
exports.getDeprecationWarnings = getDeprecationWarnings;
exports.isOrphanDeprecation = isOrphanDeprecation;
exports.clearDeprecationWarning = clearDeprecationWarning;
exports.createDeprecationHandler = createDeprecationHandler;
exports.hasDeprecationWarnings = hasDeprecationWarnings;
exports.getDeprecatedCount = getDeprecatedCount;
exports.performSupersession = performSupersession;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
const context_hub_1 = require("./context-hub");
const audit_log_1 = require("./audit-log");
const pending_reviews_1 = require("../knowledge/pending-reviews");
const knowledge_linker_1 = require("./knowledge-linker");
const db_1 = require("../knowledge/db");
const parser_1 = require("../knowledge/parser");
// ==============================================================================
// HELPERS
// ==============================================================================
/**
 * Check if a knowledge entry is linked to any active WP other than the excluded one.
 */
function hasActiveWpLink(workpackageKnowledge, knowledgeId, excludeWpId) {
    return Object.entries(workpackageKnowledge)
        .some(([wpId, wpLinks]) => wpId !== excludeWpId &&
        wpLinks.some(l => l.id === knowledgeId && l.status === 'active'));
}
// ==============================================================================
// DEPRECATE ON WORKPACKAGE DEFER
// ==============================================================================
/**
 * Propagate deprecation when a workpackage is deferred.
 *
 * Options:
 * - 'deprecate': Mark all linked knowledge as deprecated
 * - 'warn': Add deprecation warnings but don't change status
 * - 'none': Do nothing (for manual review)
 *
 * @param input - Deprecation input
 * @returns Deprecation result
 */
async function deprecateOnDefer(input) {
    const { basePath, sessionId, sessionNumber, deferredWorkpackageSystemId, action } = input;
    const timestamp = new Date().toISOString();
    try {
        const domainsUpdated = [];
        // Load sync state
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        const syncState = syncManager.getState();
        // Get links for the deferred workpackage
        const links = syncState.links.workpackageKnowledge[deferredWorkpackageSystemId] ?? [];
        if (links.length === 0) {
            return {
                status: 'no_links',
                affectedEntries: [],
                warnings: [],
                domainsUpdated: [],
                timestamp
            };
        }
        const affectedEntries = [];
        const warnings = [];
        // Process each linked knowledge entry
        for (const link of links) {
            if (hasActiveWpLink(syncState.links.workpackageKnowledge, link.id, deferredWorkpackageSystemId)) {
                warnings.push(`${link.id}: Skipped - linked to another active workpackage`);
                continue;
            }
            affectedEntries.push(link.id);
            if (action === 'deprecate') {
                // Update link status directly in sync state (avoid reload)
                link.status = 'deprecated';
                // Add to deprecated references
                if (!syncState.knowledge.deprecatedReferences.includes(link.id)) {
                    syncState.knowledge.deprecatedReferences.push(link.id);
                }
                warnings.push(`${link.id}: Deprecated due to workpackage deferral`);
            }
            else if (action === 'warn') {
                // Add to deprecated references list
                if (!syncState.knowledge.deprecatedReferences.includes(link.id)) {
                    syncState.knowledge.deprecatedReferences.push(link.id);
                }
                warnings.push(`${link.id}: Warning - linked to deferred workpackage`);
            }
        }
        // Save updated sync state
        syncManager.save();
        domainsUpdated.push('sync', 'knowledge');
        // Log audit entry
        const auditLogger = new audit_log_1.AuditLogger(basePath, sessionId, sessionNumber);
        auditLogger.log({
            domain: 'knowledge',
            action: 'deprecate',
            trigger: 'scope_change',
            target: deferredWorkpackageSystemId,
            metadata: {
                event: 'deprecation_propagated',
                action,
                affectedCount: affectedEntries.length,
                affectedEntries
            }
        });
        return {
            status: 'success',
            affectedEntries,
            warnings,
            domainsUpdated,
            timestamp
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            status: 'error',
            affectedEntries: [],
            warnings: [],
            domainsUpdated: [],
            timestamp,
            error: `Deprecation propagation failed: ${errorMessage}`
        };
    }
}
// ==============================================================================
// SUPERSEDE KNOWLEDGE
// ==============================================================================
/**
 * Mark a knowledge entry as superseded by another.
 *
 * Optionally migrates links from the old entry to the new one.
 *
 * @param input - Supersession input
 * @returns Supersession result
 */
async function supersedeKnowledge(input) {
    const { basePath, sessionId, sessionNumber, oldKnowledgeId, newKnowledgeId, migrateLinks = false } = input;
    const timestamp = new Date().toISOString();
    try {
        const domainsUpdated = [];
        // Load sync state
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        const syncState = syncManager.getState();
        // Find all links for the old knowledge entry
        const oldLinks = (0, knowledge_linker_1.getLinksForKnowledge)(basePath, oldKnowledgeId);
        if (oldLinks.length === 0 && !migrateLinks) {
            // No links to process, just mark as superseded
            return {
                status: 'success',
                domainsUpdated: [],
                timestamp
            };
        }
        let linksMigrated = 0;
        // Process each link - update directly in sync state
        for (const link of oldLinks) {
            // Mark old link as superseded in sync state
            const wpLinks = syncState.links.workpackageKnowledge[link.workpackageId];
            if (wpLinks) {
                const oldLink = wpLinks.find(l => l.id === oldKnowledgeId);
                if (oldLink) {
                    oldLink.status = 'superseded';
                }
            }
            if (migrateLinks) {
                // Create new link for the superseding entry
                const newLinks = syncState.links.workpackageKnowledge[link.workpackageId] ?? [];
                // Check if new entry not already linked
                if (!newLinks.some(l => l.id === newKnowledgeId)) {
                    const newLink = {
                        id: newKnowledgeId,
                        workpackageId: link.workpackageId,
                        phaseId: link.phaseId,
                        title: `Supersedes ${oldKnowledgeId}`,
                        linkedAt: timestamp,
                        linkedBy: 'auto',
                        status: 'active',
                        deprecation_type: null
                    };
                    if (!syncState.links.workpackageKnowledge[link.workpackageId]) {
                        syncState.links.workpackageKnowledge[link.workpackageId] = [];
                    }
                    syncState.links.workpackageKnowledge[link.workpackageId].push(newLink);
                    linksMigrated++;
                }
            }
        }
        // Add old entry to deprecated references
        if (!syncState.knowledge.deprecatedReferences.includes(oldKnowledgeId)) {
            syncState.knowledge.deprecatedReferences.push(oldKnowledgeId);
        }
        // Save sync state
        syncManager.save();
        domainsUpdated.push('sync', 'knowledge');
        // Log audit entry
        const auditLogger = new audit_log_1.AuditLogger(basePath, sessionId, sessionNumber);
        auditLogger.log({
            domain: 'knowledge',
            action: 'supersede',
            trigger: 'manual',
            target: oldKnowledgeId,
            newValue: newKnowledgeId,
            metadata: {
                event: 'knowledge_superseded',
                migrateLinks,
                linksMigrated
            }
        });
        return {
            status: 'success',
            linksMigrated: migrateLinks ? linksMigrated : undefined,
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
            error: `Supersession failed: ${errorMessage}`
        };
    }
}
// ==============================================================================
// SUPERSESSION CHAIN TRAVERSAL (R3.3b)
// ==============================================================================
/**
 * Resolve a supersession chain to its terminal entry.
 *
 * Follows superseded_by links in the knowledge DB from a starting entry
 * to the final (non-superseded) entry. Cycle-safe via visited set.
 *
 * @param basePath - Project root directory
 * @param startId - Knowledge entry ID to start from
 * @param maxDepth - Maximum chain depth (default 20)
 * @returns Terminal entry ID, or startId if no chain exists
 */
function resolveSupersessionChain(basePath, startId, maxDepth = 20, existingDb) {
    let db = null;
    try {
        if (existingDb) {
            db = existingDb;
        }
        else {
            const clearDir = path.join(basePath, '.clear');
            db = new db_1.KnowledgeDatabase(clearDir);
            const initialized = db.initialize();
            if (!initialized) {
                return startId;
            }
        }
        const visited = new Set();
        let currentId = startId;
        let prevId = startId;
        for (let depth = 0; depth < maxDepth; depth++) {
            if (visited.has(currentId)) {
                // Cycle detected — return entry before the cycle
                return prevId;
            }
            visited.add(currentId);
            const entry = db.getEntry(currentId);
            if (!entry || !entry.superseded_by) {
                // Terminal entry found (no further supersession)
                return currentId;
            }
            prevId = currentId;
            currentId = entry.superseded_by;
        }
        // maxDepth exceeded — return last found
        return currentId;
    }
    catch {
        return startId;
    }
    finally {
        // Only close if we opened the DB ourselves
        if (db && !existingDb) {
            db.close();
        }
    }
}
// ==============================================================================
// DEPRECATION WARNINGS
// ==============================================================================
/**
 * Get all deprecation warnings from sync state.
 *
 * For superseded entries, resolves the supersession chain to the terminal
 * entry and includes it in the warning. Differentiates between 'historic'
 * (WP-deferred) and 'obsolete' (superseded) deprecation types.
 *
 * @param basePath - Project root directory
 * @returns Array of deprecation warnings
 */
function getDeprecationWarnings(basePath) {
    try {
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        const syncState = syncManager.getState();
        const warnings = [];
        // Check all links for deprecated/superseded status
        for (const [wpId, links] of Object.entries(syncState.links.workpackageKnowledge)) {
            for (const link of links) {
                if (link.status === 'deprecated' || link.status === 'superseded') {
                    // Determine deprecation type from link or infer from status
                    const depType = link.deprecation_type === 'obsolete' || link.status === 'superseded'
                        ? 'obsolete'
                        : 'historic';
                    const warning = {
                        knowledgeId: link.id,
                        title: link.title,
                        reason: depType === 'historic' ? 'Linked workpackage deferred' : 'Superseded by newer entry',
                        workpackageSystemId: wpId,
                        suggestedAction: depType === 'historic'
                            ? 'Review if still relevant'
                            : 'Use superseding entry instead',
                        deprecation_type: depType
                    };
                    // For superseded entries, resolve chain to terminal entry
                    if (depType === 'obsolete') {
                        const terminal = resolveSupersessionChain(basePath, link.id);
                        if (terminal !== link.id) {
                            warning.supersededBy = terminal;
                        }
                    }
                    warnings.push(warning);
                }
            }
        }
        // Also include entries in deprecatedReferences that may not have links
        for (const id of syncState.knowledge.deprecatedReferences) {
            if (!warnings.some(w => w.knowledgeId === id)) {
                warnings.push({
                    knowledgeId: id,
                    title: '',
                    reason: 'Marked as deprecated',
                    workpackageSystemId: '',
                    suggestedAction: 'Review if still relevant',
                    deprecation_type: 'historic'
                });
            }
        }
        // K2.7 DB-backed filter (defense-in-depth): drop entries the user has
        // already resolved via supersession or explicit dismissal. Supersession IS
        // the review action — once an entry is superseded, it no longer needs to
        // surface as a deprecation warning anywhere in the system.
        //
        // Filters applied:
        //   (b) superseded_by set in DB — eager drain should have caught this, but
        //       this is defense-in-depth for sync-state that got out of sync
        //   (c) supersession_reviewed = true in DB — user has acknowledged via `dismiss`
        //
        // Fail-open: if DB is unavailable, pass warnings through unfiltered so the
        // user still sees something rather than silently losing warnings.
        const clearDir = path.join(basePath, '.clear');
        const db = new db_1.KnowledgeDatabase(clearDir);
        const dbOk = db.initialize();
        try {
            if (!dbOk)
                return warnings;
            const filtered = [];
            for (const warning of warnings) {
                const entry = db.getEntry(warning.knowledgeId);
                if (entry) {
                    if (entry.supersession_reviewed)
                        continue;
                    if (entry.superseded_by)
                        continue;
                }
                filtered.push(warning);
            }
            return filtered;
        }
        finally {
            if (dbOk)
                db.close();
        }
    }
    catch {
        return [];
    }
}
/**
 * Check whether a knowledge entry is "orphan" from the perspective of the
 * session-start deprecation banner:
 *   - its markdown file is missing, OR
 *   - related_files is non-empty AND none of the referenced files exist on disk.
 *
 * Entries with no related_files array are NOT considered orphan (we can't judge
 * from missing metadata alone — keep the warning so the user can decide).
 *
 * @param basePath - Project root directory
 * @param id - Knowledge entry ID (e.g., "TD-001")
 */
function isOrphanDeprecation(basePath, id) {
    const entryFile = path.join(basePath, '.clear', 'knowledge', 'entries', `${id}.md`);
    if (!fs.existsSync(entryFile))
        return true;
    try {
        const content = fs.readFileSync(entryFile, 'utf-8');
        const parsed = (0, parser_1.parseFrontmatter)(content);
        if (!parsed)
            return false;
        const relatedFiles = parsed.frontmatter.related_files;
        if (!relatedFiles || relatedFiles.length === 0)
            return false;
        const anyExists = relatedFiles.some(rf => {
            const resolved = path.isAbsolute(rf) ? rf : path.join(basePath, rf);
            return fs.existsSync(resolved);
        });
        return !anyExists;
    }
    catch {
        return false;
    }
}
/**
 * Clear deprecation warnings for a knowledge entry.
 *
 * @param basePath - Project root directory
 * @param knowledgeId - Knowledge entry ID
 * @returns true if cleared
 */
function clearDeprecationWarning(basePath, knowledgeId) {
    try {
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        const syncState = syncManager.getState();
        // Remove from deprecatedReferences
        const index = syncState.knowledge.deprecatedReferences.indexOf(knowledgeId);
        if (index !== -1) {
            syncState.knowledge.deprecatedReferences.splice(index, 1);
        }
        // Update any deprecated links back to active
        for (const links of Object.values(syncState.links.workpackageKnowledge)) {
            const link = links.find(l => l.id === knowledgeId);
            if (link && link.status === 'deprecated') {
                link.status = 'active';
            }
        }
        syncManager.save();
        return true;
    }
    catch {
        return false;
    }
}
// ==============================================================================
// CONVENIENCE FUNCTIONS
// ==============================================================================
/**
 * Create a deprecation handler for use with workpackage defer.
 *
 * @param basePath - Project root directory
 * @param action - Default action to take
 * @returns Handler function
 */
function createDeprecationHandler(basePath, action = 'warn') {
    return async (sessionId, sessionNumber, deferredWorkpackageSystemId) => {
        return deprecateOnDefer({
            basePath,
            sessionId,
            sessionNumber,
            deferredWorkpackageSystemId,
            action
        });
    };
}
/**
 * Check if any knowledge entries have deprecation warnings.
 *
 * @param basePath - Project root directory
 * @returns true if there are deprecation warnings
 */
function hasDeprecationWarnings(basePath) {
    const warnings = getDeprecationWarnings(basePath);
    return warnings.length > 0;
}
/**
 * Get count of deprecated knowledge entries.
 *
 * @param basePath - Project root directory
 * @returns Count of deprecated entries
 */
function getDeprecatedCount(basePath) {
    const warnings = getDeprecationWarnings(basePath);
    return warnings.length;
}
/**
 * Single entry point for ALL supersession side effects.
 *
 * Updates atomically across all stores:
 * 1. Knowledge DB — status='superseded', superseded_by, superseded_at, deprecation_type='obsolete'
 * 2. Markdown frontmatter — status, superseded_by on old entry
 * 3. Sync-state — WP link migration (old→new), old link status='superseded' + deprecation_type='obsolete'
 * 4. Reverse file-knowledge index — updated for new entry with merged related_files
 *
 * @param basePath - Project root directory
 * @param oldId - Knowledge entry being superseded
 * @param newId - Knowledge entry that supersedes
 * @param options - Session context and migration flag
 */
async function performSupersession(basePath, oldId, newId, options) {
    const { sessionId, sessionNumber } = options;
    const timestamp = new Date().toISOString();
    // Validate IDs at boundary (SEC-002: prevent path traversal). Drift-proof
    // delegation to parser.isValidId — sourced from KNOWLEDGE_TYPE_PREFIXES so
    // K3 expansion types (IW/PROC/SH) accepted automatically. D-K3.5-01.
    if (!(0, parser_1.isValidId)(oldId) || !(0, parser_1.isValidId)(newId)) {
        return {
            status: 'error',
            domainsUpdated: [],
            linksMigrated: 0,
            relatedFilesInherited: [],
            warnings: [],
            timestamp,
            error: `Invalid knowledge ID format: oldId=${oldId}, newId=${newId}`
        };
    }
    const domainsUpdated = [];
    const warnings = [];
    let linksMigrated = 0;
    const relatedFilesInherited = [];
    const fs = await Promise.resolve().then(() => __importStar(require('fs')));
    // Determine migrateLinks: explicit option > config > default true
    let migrateLinks = options.migrateLinks;
    if (migrateLinks === undefined) {
        try {
            const configPath = path.join(basePath, '.clear', 'config', 'sync.yaml');
            if (fs.existsSync(configPath)) {
                const yaml = await Promise.resolve().then(() => __importStar(require('js-yaml')));
                const configContent = fs.readFileSync(configPath, 'utf-8');
                const config = yaml.load(configContent, { schema: yaml.JSON_SCHEMA });
                migrateLinks = config?.knowledgeLinking?.autoMigrateSuperseded ?? types_1.DEFAULT_SYNC_CONFIG.knowledgeLinking.autoMigrateSuperseded;
            }
            else {
                migrateLinks = types_1.DEFAULT_SYNC_CONFIG.knowledgeLinking.autoMigrateSuperseded;
            }
        }
        catch {
            migrateLinks = true;
        }
    }
    // === 1. Knowledge DB updates ===
    try {
        const clearDir = path.join(basePath, '.clear');
        const db = new db_1.KnowledgeDatabase(clearDir);
        const dbInitialized = db.initialize();
        if (dbInitialized) {
            db.updateEntryStatus(oldId, 'superseded', newId);
            db.updateSupersessionFields(oldId, timestamp, 'obsolete');
            domainsUpdated.push('knowledge');
            db.close();
        }
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        warnings.push(`DB update failed: ${msg}`);
    }
    // === 2. Markdown frontmatter updates ===
    try {
        const clearDir = path.join(basePath, '.clear');
        const knowledgeDir = path.join(clearDir, 'knowledge', 'entries');
        const oldFilePath = path.join(knowledgeDir, `${oldId}.md`);
        const newFilePath = path.join(knowledgeDir, `${newId}.md`);
        const oldUpdated = (0, parser_1.updateKnowledgeFile)(oldFilePath, {
            status: 'superseded',
            superseded_by: newId
        });
        if (oldUpdated) {
            const { parseFrontmatter } = await Promise.resolve().then(() => __importStar(require('../knowledge/parser')));
            if (fs.existsSync(oldFilePath)) {
                const oldContent = fs.readFileSync(oldFilePath, 'utf-8');
                const oldParsed = parseFrontmatter(oldContent);
                const oldRelatedFiles = oldParsed?.frontmatter?.related_files ?? [];
                if (oldRelatedFiles.length > 0 && fs.existsSync(newFilePath)) {
                    const newContent = fs.readFileSync(newFilePath, 'utf-8');
                    const newParsed = parseFrontmatter(newContent);
                    const newRelatedFiles = newParsed?.frontmatter?.related_files ?? [];
                    // Merge: new entry's files take precedence, old entry's appended (deduped)
                    const merged = [...newRelatedFiles];
                    for (const f of oldRelatedFiles) {
                        if (!merged.includes(f)) {
                            merged.push(f);
                            relatedFilesInherited.push(f);
                        }
                    }
                    if (relatedFilesInherited.length > 0) {
                        (0, parser_1.updateKnowledgeFile)(newFilePath, {
                            related_files: merged
                        });
                    }
                }
            }
        }
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        warnings.push(`Markdown update failed: ${msg}`);
    }
    // === 3. Sync-state link migration ===
    try {
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        const syncState = syncManager.getState();
        for (const [wpId, wpLinks] of Object.entries(syncState.links.workpackageKnowledge)) {
            const oldLink = wpLinks.find(l => l.id === oldId);
            if (oldLink) {
                oldLink.status = 'superseded';
                oldLink.deprecation_type = 'obsolete';
                if (migrateLinks) {
                    if (!wpLinks.some(l => l.id === newId)) {
                        const newLink = {
                            id: newId,
                            workpackageId: wpId,
                            phaseId: oldLink.phaseId,
                            title: `Supersedes ${oldId}`,
                            linkedAt: timestamp,
                            linkedBy: 'auto',
                            status: 'active',
                            deprecation_type: null
                        };
                        wpLinks.push(newLink);
                        linksMigrated++;
                    }
                }
            }
        }
        // K2.7: Supersession clears the deprecation surface for the old entry.
        // Once the user has replaced old→new, the old entry is superseded (tracked
        // via DB superseded_by + status). It should NOT remain in deprecatedReferences
        // — that array is for entries needing user review, and the supersession IS
        // the review action.
        syncManager.removeDeprecatedReference(oldId);
        syncManager.save();
        if (!domainsUpdated.includes('sync'))
            domainsUpdated.push('sync');
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        warnings.push(`Sync-state update failed: ${msg}`);
    }
    // K2.7 P5 (AC17): Drain oldId from pending-reviews.json. Supersession is the
    // review action — carry-over surface for oldId becomes stale once old→new
    // is recorded. Isolated try so drain failure does not block supersession.
    try {
        (0, pending_reviews_1.drainPendingReview)(path.join(basePath, '.clear'), oldId);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        warnings.push(`Pending-reviews drain failed for ${oldId}: ${msg}`);
    }
    // === 4. Audit log ===
    try {
        const auditLogger = new audit_log_1.AuditLogger(basePath, sessionId, sessionNumber);
        auditLogger.log({
            domain: 'knowledge',
            action: 'supersede',
            trigger: 'manual',
            target: oldId,
            newValue: newId,
            metadata: {
                event: 'unified_supersession',
                migrateLinks,
                linksMigrated,
                relatedFilesInherited: relatedFilesInherited.length,
                warnings: warnings.length > 0 ? warnings : undefined
            }
        });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        warnings.push(`Audit log failed: ${msg}`);
    }
    // Determine overall status
    const status = warnings.length === 0
        ? 'success'
        : domainsUpdated.length > 0
            ? 'partial'
            : 'error';
    return {
        status,
        domainsUpdated,
        linksMigrated,
        relatedFilesInherited,
        warnings,
        timestamp,
        error: status === 'error' ? `All domains failed: ${warnings.join('; ')}` : undefined
    };
}
//# sourceMappingURL=deprecation.js.map