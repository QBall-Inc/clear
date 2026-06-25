#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge Link/Unlink CLI
 *
 * CLI tools for manually linking and unlinking knowledge entries
 * to/from workpackages.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/link-cli.ts link <id> --to <wp> --clear-dir=/path/.clear
 *   npx ts-node src/infrastructure/knowledge/cli/link-cli.ts unlink <id> --clear-dir=/path/.clear
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
exports.InvalidLinkError = exports.WorkpackageNotFoundError = exports.KnowledgeNotFoundError = void 0;
exports.validateEntryForLinking = validateEntryForLinking;
exports.runLinkCLI = runLinkCLI;
exports.runUnlinkCLI = runUnlinkCLI;
exports.runBackfillCLI = runBackfillCLI;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const db_1 = require("../db");
const parser_1 = require("../parser");
const validation_1 = require("../../validation");
const registry_1 = require("../../workpackage/registry");
const parser_2 = require("../../workpackage/parser");
const update_cli_1 = require("../../workpackage/cli/update-cli");
const audit_log_1 = require("../../sync/audit-log");
const knowledge_linker_1 = require("../../sync/knowledge-linker");
const sanitize_path_1 = require("../../cli/sanitize-path");
/**
 * Knowledge not found error
 */
class KnowledgeNotFoundError extends Error {
    constructor(id) {
        super(`Knowledge entry not found: ${id}`);
        this.id = id;
        this.name = 'KnowledgeNotFoundError';
    }
}
exports.KnowledgeNotFoundError = KnowledgeNotFoundError;
/**
 * Workpackage not found error
 */
class WorkpackageNotFoundError extends Error {
    constructor(id) {
        super(`Workpackage not found: ${id}`);
        this.id = id;
        this.name = 'WorkpackageNotFoundError';
    }
}
exports.WorkpackageNotFoundError = WorkpackageNotFoundError;
/**
 * Invalid link operation error
 */
class InvalidLinkError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidLinkError';
    }
}
exports.InvalidLinkError = InvalidLinkError;
/**
 * Validate knowledge entry for linking
 * @param entry - Knowledge entry
 * @returns True if valid for linking
 * @throws InvalidLinkError if entry cannot be linked
 */
function validateEntryForLinking(entry) {
    if (entry.status === 'deprecated') {
        throw new InvalidLinkError(`Cannot link deprecated entry ${entry.id}. Deprecated entries are no longer valid.`);
    }
    return true;
}
// ==============================================================================
// WP-PS7 phase_a (S188): three-surface link round-trip helpers
//
// Persists the WP↔entry link across all three surfaces:
//   1. SQLite entries.workpackage_id (canonical FK — set via db.linkToWorkpackage)
//   2. .md frontmatter linked_workpackages?: string[] (multi-value, disk source-of-truth)
//   3. WP YAML knowledge?: string[] (bidirectional discovery)
//
// All three writes are idempotent (dedup on append; no-op on already-present).
// Partial-state failure rolls back via the orchestrator below (AC10).
// ==============================================================================
function resolveEntryFilePath(clearDir, entryId) {
    // SEC-01 (POST-92): Guard against path traversal via malicious entryId.
    // Real exploitability requires the entryId to also exist in the DB
    // (db.getEntry returns null otherwise), but the validation gap is real
    // and a defense-in-depth check at the join boundary is cheap.
    if (entryId.includes('/') || entryId.includes('\\') || entryId.includes('..')) {
        throw new Error(`Invalid entry ID (contains path separator or traversal segment): ${entryId}`);
    }
    return path.join(clearDir, 'knowledge', 'entries', `${entryId}.md`);
}
function readLinkedWorkpackages(entryFilePath) {
    if (!fs.existsSync(entryFilePath))
        return [];
    const content = fs.readFileSync(entryFilePath, 'utf-8');
    const parsed = (0, parser_1.parseFrontmatter)(content);
    if (!parsed)
        return [];
    const lw = parsed.frontmatter.linked_workpackages;
    if (lw === undefined || lw === null)
        return [];
    return Array.isArray(lw) ? [...lw] : [String(lw)];
}
function mergeDedup(existing, add) {
    if (existing.includes(add))
        return existing;
    return [...existing, add];
}
function removeIfPresent(existing, remove) {
    return existing.filter(id => id !== remove);
}
function resolveWPYamlPath(clearDir, wpRegistry, wpEntry) {
    const allEntries = wpRegistry.getAllWorkpackages();
    const registryEntry = allEntries.find(e => e.id === wpEntry.id || (wpEntry.systemId !== undefined && e.systemId === wpEntry.systemId));
    const fileName = registryEntry?.file || `${wpEntry.systemId || wpEntry.id}.yaml`;
    return path.join(clearDir, 'workpackages', fileName);
}
/**
 * Append a knowledge entry ID to a workpackage YAML's knowledge[] array.
 * Idempotent: returns false (no write performed) if entryId already present.
 * Returns true on successful write.
 */
function appendKnowledgeToWPYaml(clearDir, wpRegistry, wpEntry, entryId) {
    const wpFilePath = resolveWPYamlPath(clearDir, wpRegistry, wpEntry);
    const currentKnowledge = wpEntry.knowledge ?? [];
    if (currentKnowledge.includes(entryId)) {
        return false;
    }
    const updatedEntry = { ...wpEntry, knowledge: [...currentKnowledge, entryId] };
    (0, update_cli_1.writeWorkpackageAtomic)(wpFilePath, updatedEntry);
    return true;
}
/**
 * Remove a knowledge entry ID from a workpackage YAML's knowledge[] array.
 * Idempotent: returns false (no write performed) if entryId not present.
 * Returns true on successful write.
 */
function removeKnowledgeFromWPYaml(clearDir, wpRegistry, wpEntry, entryId) {
    const wpFilePath = resolveWPYamlPath(clearDir, wpRegistry, wpEntry);
    const currentKnowledge = wpEntry.knowledge ?? [];
    if (!currentKnowledge.includes(entryId)) {
        return false;
    }
    const filtered = currentKnowledge.filter(id => id !== entryId);
    const updatedEntry = {
        ...wpEntry,
        knowledge: filtered.length > 0 ? filtered : undefined,
    };
    (0, update_cli_1.writeWorkpackageAtomic)(wpFilePath, updatedEntry);
    return true;
}
/**
 * Run link CLI
 * @param clearDir - Path to .clear directory
 * @param entryId - Knowledge entry ID
 * @param workpackageId - Workpackage ID (display or system)
 * @param options - Optional audit configuration
 * @returns Link result
 */
async function runLinkCLI(clearDir, entryId, workpackageId, options) {
    if (!clearDir) {
        return {
            success: false,
            output: 'Error: --clear-dir is required'
        };
    }
    if (!entryId) {
        return {
            success: false,
            output: 'Error: Knowledge entry ID is required'
        };
    }
    if (!workpackageId) {
        return {
            success: false,
            output: 'Error: Workpackage ID (--to) is required'
        };
    }
    const db = new db_1.KnowledgeDatabase(clearDir);
    const initialized = db.initialize();
    if (!initialized) {
        db.close();
        return {
            success: false,
            output: 'Error: Failed to initialize knowledge database'
        };
    }
    try {
        // Get and validate knowledge entry
        const entry = db.getEntry(entryId);
        if (!entry) {
            throw new KnowledgeNotFoundError(entryId);
        }
        validateEntryForLinking(entry);
        // Get and validate workpackage
        const wpRegistry = new registry_1.WorkpackageRegistryManager(clearDir);
        const workpackage = wpRegistry.resolveWorkpackage(workpackageId);
        if (!workpackage) {
            throw new WorkpackageNotFoundError(workpackageId);
        }
        // Check if workpackage is archived
        const wpStatus = wpRegistry.getWorkpackageStatus(workpackage.id);
        if (wpStatus === 'archived') {
            throw new InvalidLinkError(`Cannot link to archived workpackage ${workpackage.id}. Use an active workpackage.`);
        }
        // Get phase ID from workpackage
        const phaseId = workpackage.phase ?? null;
        const wpSystemId = workpackage.systemId ?? workpackage.id;
        // Check if already linked to this workpackage (idempotent)
        if (entry.workpackage_id === wpSystemId) {
            return {
                success: true,
                output: `✅ ${entryId} "${entry.title}" is already linked to ${workpackage.id}`,
                entryId,
                workpackageId: wpSystemId,
                phaseId: phaseId ?? undefined
            };
        }
        // Perform the link — Surface 1: SQLite DB
        const linked = db.linkToWorkpackage(entryId, wpSystemId, phaseId ?? '');
        if (!linked) {
            return {
                success: false,
                output: `Error: Failed to link ${entryId} to ${workpackage.id}`
            };
        }
        // WP-PS7 phase_a (S188): three-surface round-trip — Surfaces 2 + 3.
        // Track per-surface success so we can roll back atomically on partial failure.
        const entryFilePath = resolveEntryFilePath(clearDir, entryId);
        let mdWritten = false;
        let wpYamlWritten = false;
        let mdPreviousLinks = [];
        // If the .md file is absent, the entry is DB-only (transitional / test
        // fixture). Skip Surface 2 with mdWritten=false rather than treating as a
        // write failure — AC10 rollback applies to write FAILURES on existing
        // files, not to genuinely-absent disk surfaces. Phase_b migration handler
        // (AC16) back-fills the .md surface for these.
        const mdExists = fs.existsSync(entryFilePath);
        try {
            // Surface 2: .md frontmatter linked_workpackages (only if .md present)
            if (mdExists) {
                mdPreviousLinks = readLinkedWorkpackages(entryFilePath);
                const newLinks = mergeDedup(mdPreviousLinks, workpackage.id);
                if (newLinks.length !== mdPreviousLinks.length) {
                    const mdSuccess = (0, parser_1.updateKnowledgeFile)(entryFilePath, {
                        linked_workpackages: newLinks,
                    });
                    if (!mdSuccess) {
                        throw new Error(`Failed to write linked_workpackages to ${entryFilePath}`);
                    }
                    mdWritten = true;
                }
            }
            // Surface 3: WP YAML knowledge[]
            wpYamlWritten = appendKnowledgeToWPYaml(clearDir, wpRegistry, workpackage, entryId);
        }
        catch (writeErr) {
            // Rollback: undo any partial writes
            if (mdWritten) {
                try {
                    (0, parser_1.updateKnowledgeFile)(entryFilePath, { linked_workpackages: mdPreviousLinks });
                }
                catch {
                    // Rollback-of-rollback is best-effort; the throw below surfaces it
                }
            }
            db.unlinkFromWorkpackage(entryId);
            // STD-01 (POST-92): writeErr.message can carry absolute filesystem paths
            // (e.g., from underlying fs failures). Redact before envelope construction
            // to prevent path leak via R1 envelope mirror — same class as Stage 1c
            // Cluster A fixes for create-cli + phase-cli (S188).
            const rawErrMsg = writeErr instanceof Error ? writeErr.message : String(writeErr);
            const errMsg = (0, sanitize_path_1.redactProjectPath)(rawErrMsg, clearDir);
            return {
                success: false,
                output: `Error: partial-state write failure linking ${entryId} → ${workpackage.id}: ${errMsg}. All surfaces rolled back to pre-link state.`,
            };
        }
        // Surface 4 — intrinsic sync-state projection. See propagateKnowledgeLink's
        // JSDoc for the systemId precondition + active-phase fallback; it no-ops
        // (returns false) on an unresolvable phase rather than inject an invalid
        // link, so a skip is non-fatal (the three surfaces above already wrote).
        const syncLink = (0, knowledge_linker_1.buildSyncKnowledgeLink)({
            id: entryId,
            workpackageId: wpSystemId,
            phaseId: phaseId ?? '',
            title: entry.title,
            linkedBy: 'manual',
        });
        const syncPropagated = (0, knowledge_linker_1.propagateKnowledgeLink)(path.dirname(clearDir), wpSystemId, syncLink);
        if (!syncPropagated) {
            // entryId (argv) and workpackage.id (disk YAML) are untrusted text flowing
            // into Claude's context via stderr — sanitize to prevent terminal/log
            // injection (feedback_sanitize_for_context_scope).
            process.stderr.write(`[CLEAR] Note: sync-state link projection skipped for ${(0, validation_1.sanitizeForLog)(entryId)} → ${(0, validation_1.sanitizeForLog)(workpackage.id)} ` +
                `(no phase systemId resolved; DB, markdown, and WP-YAML surfaces written).\n`);
        }
        // Log audit entry if session info provided.
        // Guard on presence, not truthiness: sessionNumber 0 is the first session
        // of a project and must still emit the audit row.
        if (options?.sessionId && options?.sessionNumber !== undefined) {
            const auditLogger = new audit_log_1.AuditLogger(path.dirname(clearDir), options.sessionId, options.sessionNumber);
            auditLogger.logUpdate('knowledge', 'link', entryId, {
                targetDisplayId: entryId,
                oldValue: { workpackage_id: entry.workpackage_id },
                newValue: { workpackage_id: wpSystemId, phase_id: phaseId },
                trigger: 'user_prompt',
                metadata: {
                    workpackageDisplayId: workpackage.id,
                    operation: 'link',
                    markdownUpdated: mdWritten,
                    wpYamlUpdated: wpYamlWritten,
                },
            });
        }
        const lines = [];
        lines.push(`✅ ${entryId} "${entry.title}" linked to ${workpackage.id}`);
        lines.push('');
        lines.push('Updated:');
        lines.push(`  - SQLite workpackage_id: ${wpSystemId}`);
        if (phaseId) {
            lines.push(`  - SQLite phase_id: ${phaseId}`);
        }
        if (mdWritten) {
            lines.push(`  - .md frontmatter linked_workpackages: +${workpackage.id}`);
        }
        if (wpYamlWritten) {
            lines.push(`  - WP YAML knowledge: +${entryId}`);
        }
        lines.push('  - Audit log entry created');
        return {
            success: true,
            output: lines.join('\n'),
            entryId,
            workpackageId: wpSystemId,
            phaseId: phaseId ?? undefined,
            mdWritten,
            wpYamlWritten,
        };
    }
    catch (error) {
        if (error instanceof KnowledgeNotFoundError) {
            return {
                success: false,
                output: `Error: ${error.message}`
            };
        }
        if (error instanceof WorkpackageNotFoundError) {
            return {
                success: false,
                output: `Error: ${error.message}`
            };
        }
        if (error instanceof InvalidLinkError) {
            return {
                success: false,
                output: `Error: ${error.message}`
            };
        }
        throw error;
    }
    finally {
        db.close();
    }
}
/**
 * Run unlink CLI
 * @param clearDir - Path to .clear directory
 * @param entryId - Knowledge entry ID
 * @param options - Optional audit configuration
 * @returns Unlink result
 */
async function runUnlinkCLI(clearDir, entryId, options) {
    if (!clearDir) {
        return {
            success: false,
            output: 'Error: --clear-dir is required'
        };
    }
    if (!entryId) {
        return {
            success: false,
            output: 'Error: Knowledge entry ID is required'
        };
    }
    const db = new db_1.KnowledgeDatabase(clearDir);
    const initialized = db.initialize();
    if (!initialized) {
        db.close();
        return {
            success: false,
            output: 'Error: Failed to initialize knowledge database'
        };
    }
    try {
        // Get knowledge entry
        const entry = db.getEntry(entryId);
        if (!entry) {
            throw new KnowledgeNotFoundError(entryId);
        }
        // Check if already unlinked
        if (!entry.workpackage_id) {
            return {
                success: true,
                output: `${entryId} is not linked to any workpackage`,
                entryId
            };
        }
        const previousWorkpackageId = entry.workpackage_id;
        // Resolve display id for the previous workpackage (for .md frontmatter removal).
        // entry.workpackage_id is the systemId; we need the display id to match what
        // was stored in linked_workpackages[].
        const wpRegistry = new registry_1.WorkpackageRegistryManager(clearDir);
        const previousWP = wpRegistry.resolveWorkpackage(previousWorkpackageId);
        // Perform the unlink — Surface 1: SQLite DB
        const unlinked = db.unlinkFromWorkpackage(entryId);
        if (!unlinked) {
            return {
                success: false,
                output: `Error: Failed to unlink ${entryId}`
            };
        }
        // WP-PS7 phase_a (S188): three-surface unlink mirror — Surfaces 2 + 3.
        // Idempotent: removing a non-present link from .md or WP YAML is silent
        // success (mirrors WP-PS3 AC4 no-op semantics). Best-effort: if either
        // disk surface fails, log but do NOT roll back the DB unlink (the user
        // intent is "unlink"; partial cleanup is still progress in the right
        // direction).
        const entryFilePath = resolveEntryFilePath(clearDir, entryId);
        let mdCleaned = false;
        let wpYamlCleaned = false;
        if (previousWP) {
            try {
                const currentLinks = readLinkedWorkpackages(entryFilePath);
                if (currentLinks.includes(previousWP.id)) {
                    const newLinks = removeIfPresent(currentLinks, previousWP.id);
                    (0, parser_1.updateKnowledgeFile)(entryFilePath, { linked_workpackages: newLinks });
                    mdCleaned = true;
                }
            }
            catch {
                // Best-effort — DB unlink already succeeded
            }
            try {
                wpYamlCleaned = removeKnowledgeFromWPYaml(clearDir, wpRegistry, previousWP, entryId);
            }
            catch {
                // Best-effort — DB unlink already succeeded
            }
        }
        // Log audit entry if session info provided.
        // Guard on presence, not truthiness: sessionNumber 0 is the first session
        // of a project and must still emit the audit row.
        if (options?.sessionId && options?.sessionNumber !== undefined) {
            const auditLogger = new audit_log_1.AuditLogger(path.dirname(clearDir), options.sessionId, options.sessionNumber);
            auditLogger.logUpdate('knowledge', 'unlink', entryId, {
                targetDisplayId: entryId,
                oldValue: { workpackage_id: previousWorkpackageId },
                newValue: { workpackage_id: null },
                trigger: 'user_prompt',
                metadata: {
                    operation: 'unlink',
                    markdownUpdated: mdCleaned,
                    wpYamlUpdated: wpYamlCleaned,
                },
            });
        }
        const lines = [];
        lines.push(`✅ ${entryId} unlinked`);
        lines.push('');
        lines.push('Removed from:');
        lines.push('  - SQLite workpackage_id (canonical)');
        if (mdCleaned) {
            lines.push(`  - .md frontmatter linked_workpackages: -${previousWP?.id ?? previousWorkpackageId}`);
        }
        if (wpYamlCleaned) {
            lines.push(`  - WP YAML knowledge: -${entryId}`);
        }
        lines.push('');
        lines.push('The entry remains in the knowledge base but is no longer');
        lines.push('associated with any specific workpackage.');
        return {
            success: true,
            output: lines.join('\n'),
            entryId,
            previousWorkpackageId
        };
    }
    catch (error) {
        if (error instanceof KnowledgeNotFoundError) {
            return {
                success: false,
                output: `Error: ${error.message}`
            };
        }
        throw error;
    }
    finally {
        db.close();
    }
}
/**
 * Run the workpackage-link back-fill migration.
 * @param clearDir - Path to .clear directory
 * @param options - Optional session context for audit logging
 */
async function runBackfillCLI(clearDir, options) {
    if (!clearDir) {
        return {
            success: false,
            output: 'Error: --clear-dir is required',
            examined: 0, backfilled: 0, skipped: 0, errors: 0,
        };
    }
    const db = new db_1.KnowledgeDatabase(clearDir);
    const initialized = db.initialize();
    if (!initialized) {
        db.close();
        return {
            success: false,
            output: 'Error: Failed to initialize knowledge database',
            examined: 0, backfilled: 0, skipped: 0, errors: 0,
        };
    }
    // STD-003 (S189 stop-hook CR): align registry-failure handling with
    // fullRebuild's non-fatal pattern. Consumer projects without a workpackages/
    // directory yet would otherwise emit false-alarm session-start failures.
    // Treat missing registry as "nothing to back-fill" (success with 0 examined),
    // not as a hard error.
    let wpRegistry;
    try {
        wpRegistry = new registry_1.WorkpackageRegistryManager(clearDir);
    }
    catch {
        db.close();
        return {
            success: true,
            output: '[CLEAR] Workpackage link back-fill: workpackage registry unavailable; nothing to back-fill',
            examined: 0, backfilled: 0, skipped: 0, errors: 0,
        };
    }
    const auditLogger = (options?.sessionId && options?.sessionNumber !== undefined)
        ? new audit_log_1.AuditLogger(path.dirname(clearDir), options.sessionId, options.sessionNumber)
        : null;
    let examined = 0;
    let backfilled = 0;
    let skipped = 0;
    let errors = 0;
    try {
        const allEntries = db.getAllEntries();
        const dbLinkedEntries = allEntries.filter(e => e.workpackage_id !== null && e.workpackage_id !== '');
        for (const entry of dbLinkedEntries) {
            examined += 1;
            try {
                // TS-LINK-01 (S189 stop-hook CR): explicit loop-local narrowing rather
                // than non-null assertion. The filter at L666 guards null/empty, but
                // the narrowing protects against any future filter refactor decoupling
                // the guard from this assertion.
                const wpSystemId = entry.workpackage_id;
                if (!wpSystemId) {
                    skipped += 1;
                    continue;
                }
                const wp = wpRegistry.resolveWorkpackage(wpSystemId);
                if (!wp) {
                    // Orphan link — DB references a WP that no longer exists in registry.
                    // Skip silently; the DB column will eventually need cleanup but the
                    // migration's job is back-fill, not orphan repair.
                    skipped += 1;
                    continue;
                }
                const wpDisplayId = wp.id;
                const entryFilePath = resolveEntryFilePath(clearDir, entry.id);
                // Re-read the WP YAML fresh from disk so the knowledge[] array reflects
                // any appends made in EARLIER loop iterations against the same WP.
                // resolveWorkpackage's cache holds the pre-loop snapshot, so without a
                // fresh re-read every iteration would base its append on stale state
                // and the later write would clobber the earlier one (smoke test caught
                // exactly this — two back-fills to the same WP, only the last persisted).
                const wpFilePath = resolveWPYamlPath(clearDir, wpRegistry, wp);
                let freshWp = wp;
                try {
                    freshWp = (0, parser_2.parseWorkpackageFile)(wpFilePath);
                }
                catch {
                    // If fresh read fails, fall back to the cached entry — at worst, the
                    // appendKnowledgeToWPYaml call detects an already-present entry and
                    // no-ops, or it clobbers prior appends. Both paths are non-fatal.
                }
                // Surface 2: .md frontmatter. STD-001 (S189 stop-hook CR): read once,
                // reuse for both the needs-check and the write below.
                let mdNeeded = false;
                const mdExists = fs.existsSync(entryFilePath);
                const currentLinks = mdExists ? readLinkedWorkpackages(entryFilePath) : [];
                if (mdExists && !currentLinks.includes(wpDisplayId)) {
                    mdNeeded = true;
                }
                // If .md is absent (DB-only entry), we cannot back-fill it; skip the
                // surface and continue with WP YAML. The migration cannot synthesize
                // an entire .md file from scratch.
                // Surface 3: WP YAML knowledge[]
                const wpKnowledge = freshWp.knowledge ?? [];
                const wpNeeded = !wpKnowledge.includes(entry.id);
                if (!mdNeeded && !wpNeeded) {
                    skipped += 1;
                    continue;
                }
                let mdWrittenBackfill = false;
                let wpWrittenBackfill = false;
                if (mdNeeded) {
                    const newLinks = mergeDedup(currentLinks, wpDisplayId);
                    const ok = (0, parser_1.updateKnowledgeFile)(entryFilePath, { linked_workpackages: newLinks });
                    if (!ok) {
                        errors += 1;
                        continue;
                    }
                    mdWrittenBackfill = true;
                }
                if (wpNeeded) {
                    try {
                        wpWrittenBackfill = appendKnowledgeToWPYaml(clearDir, wpRegistry, freshWp, entry.id);
                    }
                    catch (wpErr) {
                        errors += 1;
                        const msg = wpErr instanceof Error ? wpErr.message : String(wpErr);
                        process.stderr.write(`[CLEAR] back-fill WP YAML write failed for ${entry.id}: ${(0, sanitize_path_1.redactProjectPath)(msg, clearDir)}\n`);
                        continue;
                    }
                }
                if (mdWrittenBackfill || wpWrittenBackfill) {
                    backfilled += 1;
                    if (auditLogger) {
                        try {
                            auditLogger.logUpdate('knowledge', 'link', entry.id, {
                                targetDisplayId: entry.id,
                                oldValue: { workpackage_id: wpSystemId },
                                newValue: { workpackage_id: wpSystemId },
                                trigger: 'session_start',
                                metadata: {
                                    workpackageDisplayId: wpDisplayId,
                                    operation: 'backfill',
                                    markdownUpdated: mdWrittenBackfill,
                                    wpYamlUpdated: wpWrittenBackfill,
                                },
                            });
                        }
                        catch {
                            // Audit failure is non-fatal — the back-fill itself succeeded.
                        }
                    }
                }
                else {
                    skipped += 1;
                }
            }
            catch (entryErr) {
                errors += 1;
                const msg = entryErr instanceof Error ? entryErr.message : String(entryErr);
                process.stderr.write(`[CLEAR] back-fill entry ${entry.id} failed: ${(0, sanitize_path_1.redactProjectPath)(msg, clearDir)}\n`);
            }
        }
        const lines = [];
        lines.push(`[CLEAR] Workpackage link back-fill complete:`);
        lines.push(`  examined:   ${examined}`);
        lines.push(`  backfilled: ${backfilled}`);
        lines.push(`  skipped:    ${skipped}`);
        if (errors > 0) {
            lines.push(`  errors:     ${errors}`);
        }
        return {
            success: errors === 0,
            output: lines.join('\n'),
            examined, backfilled, skipped, errors,
        };
    }
    finally {
        db.close();
    }
}
/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    let command = 'link';
    let entryId = '';
    let workpackageId = '';
    let clearDir = '';
    let sessionId = '';
    let sessionNumber;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === 'link' || arg === 'unlink' || arg === 'backfill') {
            command = arg;
        }
        else if (arg.startsWith('--to=')) {
            workpackageId = arg.split('=')[1];
        }
        else if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.split('=')[1];
        }
        else if (arg.startsWith('--session-id=')) {
            sessionId = arg.split('=')[1];
        }
        else if (arg.startsWith('--session-number=')) {
            const n = Number.parseInt(arg.split('=')[1], 10);
            if (!Number.isNaN(n))
                sessionNumber = n;
        }
        else if (!arg.startsWith('--') && !entryId) {
            entryId = arg;
        }
    }
    if (clearDir) {
        clearDir = (0, validation_1.validateBasePath)(clearDir);
    }
    return { command, entryId, workpackageId, clearDir, sessionId, sessionNumber };
}
// Main execution
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: link-cli.js <command> [entry-id] [options]',
                '',
                'Commands:',
                '  link                         Link a knowledge entry to a workpackage',
                '  unlink                       Unlink a knowledge entry from its workpackage',
                '  backfill                     One-time back-fill of disk surfaces for DB-only links',
                '                               (idempotent; safe to re-run; session-start invokes this)',
                '',
                'Arguments:',
                '  <entry-id>                   Knowledge entry ID (positional; omit for backfill)',
                '',
                'Options:',
                '  --to=<workpackage-id>        Target workpackage ID (required for link)',
                '  --clear-dir=<path>           Path to .clear directory (required)',
                '  --session-id=<id>            Session ID (enables audit logging)',
                '  --session-number=<n>         Session number (enables audit logging)',
            ].join('\n')
        }));
        process.exit(0);
    }
    const { command, entryId, workpackageId, clearDir, sessionId, sessionNumber } = parseArgs();
    if (command === 'link') {
        runLinkCLI(clearDir, entryId, workpackageId, { sessionId, sessionNumber }).then(result => {
            console.log(result.output);
            process.exit(result.success ? 0 : 1);
        });
    }
    else if (command === 'backfill') {
        runBackfillCLI(clearDir, { sessionId, sessionNumber }).then(result => {
            console.log(result.output);
            process.exit(result.success ? 0 : 1);
        });
    }
    else {
        runUnlinkCLI(clearDir, entryId).then(result => {
            console.log(result.output);
            process.exit(result.success ? 0 : 1);
        });
    }
}
//# sourceMappingURL=link-cli.js.map