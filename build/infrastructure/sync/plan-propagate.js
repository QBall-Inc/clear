"use strict";
/**
 * Plan → Workpackage Propagation (WF-2b)
 *
 * Propagates plan scope changes to workpackages using dual-ID architecture.
 * Handles insert, defer, and reorder operations with position management.
 *
 * Key Principle: With dual-ID architecture, "renumbering" only affects position
 * fields. System IDs and all references remain unchanged.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.3.
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
exports.updateWorkpackageFileStatus = updateWorkpackageFileStatus;
exports.insertWorkpackage = insertWorkpackage;
exports.deferWorkpackage = deferWorkpackage;
exports.reorderWorkpackage = reorderWorkpackage;
exports.createInsertHandler = createInsertHandler;
exports.createDeferHandler = createDeferHandler;
exports.createReorderHandler = createReorderHandler;
exports.validatePosition = validatePosition;
exports.getMaxPosition = getMaxPosition;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const registry_1 = require("../workpackage/registry");
const registry_2 = require("../plan/registry");
const writer_1 = require("../plan/writer");
const context_hub_1 = require("./context-hub");
const audit_log_1 = require("./audit-log");
const deprecation_1 = require("./deprecation");
const types_1 = require("./types");
// ==============================================================================
// CONSTANTS
// ==============================================================================
const WORKPACKAGES_DIR = 'workpackages';
const REGISTRY_FILE = 'registry.yaml';
/**
 * Atomically apply display ID renames to a phase's workpackages[] and weights.
 * Uses map-based single-pass to avoid sequential indexOf collisions
 * (e.g., P1.1→P1.3 would collide with P1.3→P1.2 if applied sequentially).
 */
function applyDisplayIdChanges(phase, changes) {
    if (changes.length === 0)
        return;
    const renameMap = new Map(changes.map(c => [c.oldDisplayId, c.newDisplayId]));
    // Atomic rename in workpackages[]
    if (phase.workpackages) {
        phase.workpackages = phase.workpackages.map(id => renameMap.get(id) ?? id);
    }
    // Atomic rename in weights
    if (phase.weights) {
        const newWeights = {};
        for (const [key, value] of Object.entries(phase.weights)) {
            newWeights[renameMap.get(key) ?? key] = value;
        }
        phase.weights = newWeights;
    }
}
/**
 * Load and parse the workpackage registry YAML file.
 * Centralises the repeated yaml.load() + cast pattern.
 *
 * @param registryPath - Absolute path to registry.yaml
 * @returns Parsed registry object
 */
function loadRegistryYaml(registryPath) {
    const content = fs.readFileSync(registryPath, 'utf-8');
    return yaml.load(content, { schema: yaml.JSON_SCHEMA });
}
/**
 * Resolve the numeric position of a phase from the master plan.
 *
 * @param clearDir - Absolute path to .clear directory
 * @param phaseSystemId - Phase systemId to look up
 * @returns Phase position (defaults to 1 if not found)
 */
function resolvePhasePosition(clearDir, phaseSystemId) {
    const planRegistry = new registry_2.PlanRegistryManager(clearDir);
    const plan = planRegistry.loadPlan();
    if (plan) {
        const phase = plan.phases.find(p => p.systemId === phaseSystemId);
        return phase?.position ?? 1;
    }
    return 1;
}
/**
 * Shift positions of workpackages at or after a given position by +1.
 * Used when inserting a new workpackage pushes downstream entries forward.
 *
 * @param phaseWorkpackages - Registry entries in the target phase
 * @param insertPosition - Position at which the new WP is being inserted
 * @param phasePosition - Numeric phase position for display ID calculation
 * @returns Tuple of [positionUpdates, displayIdChanges]
 */
function shiftDownstreamPositions(phaseWorkpackages, insertPosition, phasePosition) {
    const positionUpdates = [];
    const displayIdChanges = [];
    for (const wp of phaseWorkpackages) {
        const currentPosition = wp.position ?? 0;
        if (currentPosition >= insertPosition) {
            const oldDisplayId = `P${phasePosition}.${currentPosition}`;
            const newPosition = currentPosition + 1;
            const newDisplayId = `P${phasePosition}.${newPosition}`;
            positionUpdates.push({
                systemId: wp.systemId ?? wp.id,
                oldPosition: currentPosition,
                newPosition
            });
            displayIdChanges.push({
                systemId: wp.systemId ?? wp.id,
                oldDisplayId,
                newDisplayId
            });
            wp.position = newPosition;
        }
    }
    return [positionUpdates, displayIdChanges];
}
/**
 * Create and write a new workpackage definition file to disk.
 *
 * @param workpackagePath - Absolute path for the new YAML file
 * @param params - Workpackage properties
 */
function createWorkpackageFile(workpackagePath, params) {
    // Convert simple deliverable strings to structured Deliverable entries
    // Default weight: 1 (equal weight) so calculateProgress() produces meaningful percentages
    const deliverables = (params.deliverables_text ?? []).map((text, i) => ({
        id: `deliverable-${i + 1}`,
        pattern: '',
        weight: 1,
        status: 'not_started',
        description: text
    }));
    const workpackageEntry = {
        id: params.displayId,
        systemId: params.systemId,
        position: params.position,
        phase: params.phaseSystemId,
        title: params.title,
        status: 'not_started',
        type: params.type,
        priority: params.priority,
        description: params.description,
        scope: {
            in_scope: params.scope_in ?? [],
            out_of_scope: params.scope_out ?? []
        },
        dependencies: {
            upstream: [],
            downstream: []
        },
        deliverables,
        acceptance_criteria: params.acceptance_criteria ?? [],
        verification: params.verification,
        notes: params.notes
    };
    fs.writeFileSync(workpackagePath, yaml.dump(workpackageEntry, {
        indent: 2,
        lineWidth: 100,
        noRefs: true
    }), 'utf-8');
}
/**
 * Sort registry workpackages by phase (alphabetical) then position (numeric).
 *
 * @param registry - Registry object whose workpackages array will be sorted in place
 */
function sortRegistryByPhaseAndPosition(registry) {
    registry.workpackages.sort((a, b) => {
        if (a.phase !== b.phase) {
            return (a.phase ?? '').localeCompare(b.phase ?? '');
        }
        return (a.position ?? 0) - (b.position ?? 0);
    });
}
/**
 * Save registry to disk, log an audit entry, and persist sync state.
 *
 * @param registryPath - Absolute path to registry.yaml
 * @param registry - Registry data to write
 * @param auditLogger - Audit logger instance
 * @param auditEntry - Audit log payload
 * @param basePath - Project root (for SyncStateManager)
 * @param domainsUpdated - Accumulator for domains updated (mutated in place)
 */
function saveRegistryAuditSync(registryPath, registry, auditLogger, auditEntry, basePath, domainsUpdated) {
    fs.writeFileSync(registryPath, yaml.dump(registry), 'utf-8');
    if (!domainsUpdated.includes('workpackage')) {
        domainsUpdated.push('workpackage');
    }
    auditLogger.log(auditEntry);
    domainsUpdated.push('plan');
    const syncManager = new context_hub_1.SyncStateManager(basePath);
    syncManager.load();
    syncManager.save();
    domainsUpdated.push('sync');
}
/**
 * Decrement positions of workpackages downstream from a deferred position.
 * Also updates the display ID (`wp.id`) on each shifted entry.
 *
 * @param registryWorkpackages - Full registry workpackages array
 * @param phaseSystemId - Phase the deferred WP belongs to
 * @param deferredPosition - Position of the deferred WP
 * @param phasePosition - Numeric phase position for display ID calculation
 * @returns Tuple of [positionUpdates, displayIdChanges]
 */
function decrementDownstreamPositions(registryWorkpackages, phaseSystemId, deferredPosition, phasePosition) {
    const positionUpdates = [];
    const displayIdChanges = [];
    for (const wp of registryWorkpackages) {
        if (wp.phase === phaseSystemId && (wp.position ?? 0) > deferredPosition) {
            const currentPosition = wp.position ?? 0;
            const oldDisplayId = `P${phasePosition}.${currentPosition}`;
            const newPosition = currentPosition - 1;
            const newDisplayId = `P${phasePosition}.${newPosition}`;
            positionUpdates.push({
                systemId: wp.systemId ?? wp.id,
                oldPosition: currentPosition,
                newPosition
            });
            displayIdChanges.push({
                systemId: wp.systemId ?? wp.id,
                oldDisplayId,
                newDisplayId
            });
            wp.position = newPosition;
            wp.id = newDisplayId;
        }
    }
    return [positionUpdates, displayIdChanges];
}
/**
 * Update the status field inside a workpackage YAML file on disk.
 * Reads the existing YAML, modifies only the status field, and writes back
 * to preserve all other fields (NFR1: field preservation).
 *
 * @param wpFilePath - Absolute path to the workpackage YAML file
 * @param newStatus - New status value to write
 * @throws Re-throws errors so callers can log them (R4 fix: bare catch removed)
 */
function updateWorkpackageFileStatus(wpFilePath, newStatus) {
    if (fs.existsSync(wpFilePath)) {
        const wpContent = fs.readFileSync(wpFilePath, 'utf-8');
        const wpData = yaml.load(wpContent, { schema: yaml.JSON_SCHEMA });
        wpData.status = newStatus;
        fs.writeFileSync(wpFilePath, yaml.dump(wpData), 'utf-8');
    }
}
/**
 * Look up knowledge entries linked to a workpackage via sync state.
 *
 * @param basePath - Project root directory
 * @param systemId - Workpackage systemId to check
 * @returns Array of linked knowledge IDs
 */
function findLinkedKnowledge(basePath, systemId) {
    const syncManager = new context_hub_1.SyncStateManager(basePath);
    syncManager.load();
    const syncState = syncManager.getState();
    return syncState.links.workpackageKnowledge[systemId]?.map((l) => l.id) ?? [];
}
/**
 * Apply position shifts for a reorder operation.
 * Handles both move-down (oldPosition < newPosition) and move-up
 * (oldPosition > newPosition) directions with a single code path.
 *
 * @param phaseWorkpackages - Registry entries in the same phase (non-deferred)
 * @param workpackageSystemId - SystemId of the WP being moved
 * @param oldPosition - Current position of the target WP
 * @param newPosition - Desired position for the target WP
 * @param phasePosition - Numeric phase position for display ID calculation
 * @returns Tuple of [positionUpdates, displayIdChanges]
 */
function applyPositionShift(phaseWorkpackages, workpackageSystemId, oldPosition, newPosition, phasePosition) {
    const positionUpdates = [];
    const displayIdChanges = [];
    const movingDown = newPosition > oldPosition;
    for (const wp of phaseWorkpackages) {
        const currentPos = wp.position ?? 0;
        const isTarget = wp.systemId === workpackageSystemId;
        if (isTarget) {
            positionUpdates.push({
                systemId: workpackageSystemId,
                oldPosition: oldPosition,
                newPosition: newPosition
            });
            displayIdChanges.push({
                systemId: workpackageSystemId,
                oldDisplayId: `P${phasePosition}.${oldPosition}`,
                newDisplayId: `P${phasePosition}.${newPosition}`
            });
            wp.position = newPosition;
            wp.id = `P${phasePosition}.${newPosition}`;
        }
        else if (movingDown && currentPos > oldPosition && currentPos <= newPosition) {
            // Items between old and new position shift up by 1
            const updatedPosition = currentPos - 1;
            positionUpdates.push({
                systemId: wp.systemId ?? wp.id,
                oldPosition: currentPos,
                newPosition: updatedPosition
            });
            displayIdChanges.push({
                systemId: wp.systemId ?? wp.id,
                oldDisplayId: `P${phasePosition}.${currentPos}`,
                newDisplayId: `P${phasePosition}.${updatedPosition}`
            });
            wp.position = updatedPosition;
            wp.id = `P${phasePosition}.${updatedPosition}`;
        }
        else if (!movingDown && currentPos >= newPosition && currentPos < oldPosition) {
            // Items between new and old position shift down by 1
            const updatedPosition = currentPos + 1;
            positionUpdates.push({
                systemId: wp.systemId ?? wp.id,
                oldPosition: currentPos,
                newPosition: updatedPosition
            });
            displayIdChanges.push({
                systemId: wp.systemId ?? wp.id,
                oldDisplayId: `P${phasePosition}.${currentPos}`,
                newDisplayId: `P${phasePosition}.${updatedPosition}`
            });
            wp.position = updatedPosition;
            wp.id = `P${phasePosition}.${updatedPosition}`;
        }
    }
    return [positionUpdates, displayIdChanges];
}
// ==============================================================================
// INSERT WORKPACKAGE
// ==============================================================================
/**
 * Insert a new workpackage at a specific position within a phase.
 *
 * Operations:
 * 1. Generate new systemId
 * 2. Determine insertion position
 * 3. Increment position of downstream workpackages
 * 4. Create new workpackage definition file
 * 5. Update registry.yaml
 * 6. Log audit entry
 *
 * @param input - Insert workpackage input
 * @returns Insert result
 */
async function insertWorkpackage(input) {
    const { basePath, sessionId, sessionNumber, phaseSystemId, insertPosition, title, description = '', type = 'feature', priority = 'medium', acceptance_criteria, verification, notes, deliverables_text, scope_in, scope_out } = input;
    const timestamp = new Date().toISOString();
    try {
        const clearDir = path.join(basePath, '.clear');
        const auditLogger = new audit_log_1.AuditLogger(basePath, sessionId, sessionNumber);
        const domainsUpdated = [];
        // Load registry
        const registryPath = path.join(clearDir, WORKPACKAGES_DIR, REGISTRY_FILE);
        const registry = loadRegistryYaml(registryPath);
        // Get workpackages in the target phase
        const phaseWorkpackages = registry.workpackages.filter(wp => wp.phase === phaseSystemId);
        // Generate new systemId
        const newSystemId = (0, types_1.generateWorkpackageSystemId)();
        // Get phase position for display ID calculation
        const phasePosition = resolvePhasePosition(clearDir, phaseSystemId);
        // Shift downstream workpackages
        const [positionUpdates, displayIdChanges] = shiftDownstreamPositions(phaseWorkpackages, insertPosition, phasePosition);
        // Calculate new workpackage display ID
        const newDisplayId = `P${phasePosition}.${insertPosition}`;
        // Create new registry entry
        const newRegistryEntry = {
            id: newDisplayId, // Legacy display ID for backward compatibility
            systemId: newSystemId,
            position: insertPosition,
            phase: phaseSystemId,
            title,
            status: 'not_started',
            file: `${newSystemId}.yaml`
        };
        // Add to registry and sort
        registry.workpackages.push(newRegistryEntry);
        sortRegistryByPhaseAndPosition(registry);
        // Create workpackage definition file
        const workpackagePath = path.join(clearDir, WORKPACKAGES_DIR, `${newSystemId}.yaml`);
        createWorkpackageFile(workpackagePath, {
            displayId: newDisplayId,
            systemId: newSystemId,
            position: insertPosition,
            phaseSystemId,
            title,
            description,
            type,
            priority,
            acceptance_criteria,
            verification,
            notes,
            deliverables_text,
            scope_in,
            scope_out
        });
        domainsUpdated.push('workpackage');
        // Save registry, log audit, update sync state
        saveRegistryAuditSync(registryPath, registry, auditLogger, {
            domain: 'workpackage',
            action: 'create',
            trigger: 'scope_change',
            target: newSystemId,
            targetDisplayId: newDisplayId,
            newValue: {
                title,
                position: insertPosition,
                phase: phaseSystemId
            },
            metadata: {
                event: 'workpackage_inserted',
                positionUpdates: positionUpdates.length,
                displayIdChanges: displayIdChanges.map(c => `${c.oldDisplayId}→${c.newDisplayId}`)
            }
        }, basePath, domainsUpdated);
        // Write-back to master-plan.yaml (fire-and-log — failure does not block)
        try {
            const planRegistry = new registry_2.PlanRegistryManager(clearDir);
            const plan = planRegistry.loadPlan();
            if (plan) {
                const phase = plan.phases.find(p => p.systemId === phaseSystemId || p.id === phaseSystemId);
                if (phase) {
                    // Add new display ID at the correct position (idempotency guard)
                    if (!phase.workpackages) {
                        phase.workpackages = [];
                    }
                    if (!phase.workpackages.includes(newDisplayId)) {
                        phase.workpackages.splice(insertPosition - 1, 0, newDisplayId);
                    }
                    // Add default weight
                    if (!phase.weights) {
                        phase.weights = {};
                    }
                    phase.weights[newDisplayId] = 100;
                    // Apply display ID changes atomically (avoids sequential collision)
                    applyDisplayIdChanges(phase, displayIdChanges);
                    (0, writer_1.writeMasterPlan)(basePath, plan);
                }
            }
        }
        catch (err) {
            process.stderr.write(`[insert] master-plan.yaml write-back failed: ${err instanceof Error ? err.message : err}\n`);
        }
        // Generate user message
        const message = generateInsertMessage(newDisplayId, newSystemId, displayIdChanges);
        return {
            status: 'success',
            newSystemId,
            newDisplayId,
            positionUpdates,
            displayIdChanges,
            domainsUpdated,
            timestamp,
            message
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            status: 'error',
            domainsUpdated: [],
            timestamp,
            error: `Insert workpackage failed: ${errorMessage}`
        };
    }
}
/**
 * Generate user-friendly message for insert operation
 */
function generateInsertMessage(newDisplayId, newSystemId, displayIdChanges) {
    let message = `Created ${newDisplayId} (${newSystemId}).`;
    if (displayIdChanges.length > 0) {
        const changes = displayIdChanges.map(c => `${c.oldDisplayId}→${c.newDisplayId}`).join(', ');
        message += ` Display IDs updated: ${changes}.`;
    }
    return message;
}
// ==============================================================================
// DEFER WORKPACKAGE
// ==============================================================================
/**
 * Defer a workpackage (mark as deferred, update positions).
 *
 * Operations:
 * 1. Mark workpackage as "deferred" (preserve systemId for audit trail)
 * 2. Decrement position of downstream workpackages
 * 3. Update registry.yaml status
 * 4. Check knowledge links and warn if found
 * 5. Log audit entry
 *
 * @param input - Defer workpackage input
 * @returns Defer result
 */
async function deferWorkpackage(input) {
    const { basePath, sessionId, sessionNumber, workpackageId, reason = '' } = input;
    const timestamp = new Date().toISOString();
    try {
        const clearDir = path.join(basePath, '.clear');
        const auditLogger = new audit_log_1.AuditLogger(basePath, sessionId, sessionNumber);
        const domainsUpdated = [];
        // Resolve workpackage via registry manager
        const wpRegistry = new registry_1.WorkpackageRegistryManager(clearDir);
        const workpackage = wpRegistry.resolveWorkpackage(workpackageId);
        if (!workpackage) {
            return {
                status: 'not_found',
                domainsUpdated: [],
                timestamp,
                error: `Workpackage not found: ${workpackageId}`
            };
        }
        const deferredSystemId = workpackage.systemId ?? workpackage.id;
        const deferredDisplayId = workpackage.id;
        const deferredPosition = workpackage.position ?? 0;
        const phaseSystemId = workpackage.phase ?? '';
        // Load registry file
        const registryPath = path.join(clearDir, WORKPACKAGES_DIR, REGISTRY_FILE);
        const registry = loadRegistryYaml(registryPath);
        // Get phase position for display ID calculation
        const phasePosition = resolvePhasePosition(clearDir, phaseSystemId);
        // Decrement positions of downstream workpackages
        const [positionUpdates, displayIdChanges] = decrementDownstreamPositions(registry.workpackages, phaseSystemId, deferredPosition, phasePosition);
        // Mark the workpackage as deferred
        const targetEntry = registry.workpackages.find(wp => wp.systemId === deferredSystemId || wp.id === workpackageId);
        if (targetEntry) {
            targetEntry.status = 'deferred';
        }
        // Check for knowledge links
        const linkedKnowledge = findLinkedKnowledge(basePath, deferredSystemId);
        // Save updated registry
        fs.writeFileSync(registryPath, yaml.dump(registry), 'utf-8');
        domainsUpdated.push('workpackage');
        // Update workpackage file status if it exists
        const wpFilePath = path.join(clearDir, WORKPACKAGES_DIR, `${deferredSystemId}.yaml`);
        updateWorkpackageFileStatus(wpFilePath, 'deferred');
        // Log audit entry
        auditLogger.log({
            domain: 'workpackage',
            action: 'defer',
            trigger: 'scope_change',
            target: deferredSystemId,
            targetDisplayId: deferredDisplayId,
            oldValue: workpackage.status,
            newValue: 'deferred',
            metadata: {
                event: 'workpackage_deferred',
                reason,
                positionUpdates: positionUpdates.length,
                linkedKnowledge: linkedKnowledge.length
            }
        });
        domainsUpdated.push('plan');
        // Update sync state
        const syncManager = new context_hub_1.SyncStateManager(basePath);
        syncManager.load();
        syncManager.save();
        domainsUpdated.push('sync');
        // Write-back to master-plan.yaml (fire-and-log — failure does not block)
        try {
            if (phaseSystemId && deferredDisplayId) {
                const planRegistry = new registry_2.PlanRegistryManager(clearDir);
                const plan = planRegistry.loadPlan();
                if (plan) {
                    const phase = plan.phases.find(p => p.systemId === phaseSystemId || p.id === phaseSystemId);
                    if (phase) {
                        // Remove deferred display ID from workpackages[]
                        if (phase.workpackages) {
                            const idx = phase.workpackages.indexOf(deferredDisplayId);
                            if (idx !== -1) {
                                phase.workpackages.splice(idx, 1);
                            }
                        }
                        // Remove weight entry
                        if (phase.weights) {
                            delete phase.weights[deferredDisplayId];
                        }
                        // Apply display ID changes atomically (avoids sequential collision)
                        applyDisplayIdChanges(phase, displayIdChanges);
                        (0, writer_1.writeMasterPlan)(basePath, plan);
                    }
                }
            }
        }
        catch (err) {
            process.stderr.write(`[defer] master-plan.yaml write-back failed: ${err instanceof Error ? err.message : err}\n`);
        }
        // Propagate deprecation warnings for linked knowledge
        let deprecationWarnings = [];
        if (linkedKnowledge.length > 0) {
            const deprecationResult = await (0, deprecation_1.deprecateOnDefer)({
                basePath,
                sessionId,
                sessionNumber,
                deferredWorkpackageSystemId: deferredSystemId,
                action: 'warn',
            });
            deprecationWarnings = deprecationResult.warnings;
        }
        // Generate user message
        const message = generateDeferMessage(deferredDisplayId, deferredSystemId, displayIdChanges, linkedKnowledge, deprecationWarnings);
        return {
            status: 'success',
            deferredSystemId,
            deferredDisplayId,
            positionUpdates,
            displayIdChanges,
            linkedKnowledge,
            domainsUpdated,
            timestamp,
            message
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            status: 'error',
            domainsUpdated: [],
            timestamp,
            error: `Defer workpackage failed: ${errorMessage}`
        };
    }
}
/**
 * Generate user-friendly message for defer operation
 */
function generateDeferMessage(displayId, systemId, displayIdChanges, linkedKnowledge, deprecationWarnings = []) {
    let message = `${displayId} (${systemId}) deferred.`;
    if (displayIdChanges.length > 0) {
        const changes = displayIdChanges.map(c => `${c.oldDisplayId}→${c.newDisplayId}`).join(', ');
        message += ` Display IDs updated: ${changes}.`;
    }
    if (linkedKnowledge.length > 0) {
        message += ` Warning: ${linkedKnowledge.length} knowledge entries linked to deferred workpackage.`;
    }
    if (deprecationWarnings.length > 0) {
        message += '\n\nDeprecation warnings:\n' + deprecationWarnings.map(w => `  - ${w}`).join('\n');
    }
    return message;
}
// ==============================================================================
// REORDER WORKPACKAGES
// ==============================================================================
/**
 * Reorder a workpackage within its phase.
 *
 * Operations:
 * 1. Calculate new positions for all affected workpackages
 * 2. Update position fields in registry
 * 3. Log audit entry
 *
 * @param input - Reorder workpackage input
 * @returns Reorder result
 */
async function reorderWorkpackage(input) {
    const { basePath, sessionId, sessionNumber, workpackageSystemId, newPosition } = input;
    const timestamp = new Date().toISOString();
    try {
        const clearDir = path.join(basePath, '.clear');
        const auditLogger = new audit_log_1.AuditLogger(basePath, sessionId, sessionNumber);
        const domainsUpdated = [];
        // Load registry
        const registryPath = path.join(clearDir, WORKPACKAGES_DIR, REGISTRY_FILE);
        const registry = loadRegistryYaml(registryPath);
        // Find the workpackage to move
        const targetWp = registry.workpackages.find(wp => wp.systemId === workpackageSystemId);
        if (!targetWp) {
            return {
                status: 'not_found',
                domainsUpdated: [],
                timestamp,
                error: `Workpackage not found: ${workpackageSystemId}`
            };
        }
        const oldPosition = targetWp.position ?? 0;
        const phaseSystemId = targetWp.phase ?? '';
        if (oldPosition === newPosition) {
            return {
                status: 'success',
                positionUpdates: [],
                displayIdChanges: [],
                domainsUpdated: [],
                timestamp,
                message: 'No change needed - already at target position.'
            };
        }
        // Get phase position for display ID calculation
        const phasePosition = resolvePhasePosition(clearDir, phaseSystemId);
        // Get all non-deferred workpackages in the same phase
        const phaseWorkpackages = registry.workpackages.filter(wp => wp.phase === phaseSystemId && wp.status !== 'deferred');
        // Apply position shifts (unified move-up and move-down logic)
        const [positionUpdates, displayIdChanges] = applyPositionShift(phaseWorkpackages, workpackageSystemId, oldPosition, newPosition, phasePosition);
        // Sort registry by phase and position
        sortRegistryByPhaseAndPosition(registry);
        // Save registry, log audit, update sync state
        saveRegistryAuditSync(registryPath, registry, auditLogger, {
            domain: 'workpackage',
            action: 'reorder',
            trigger: 'scope_change',
            target: workpackageSystemId,
            oldValue: oldPosition,
            newValue: newPosition,
            metadata: {
                event: 'workpackage_reordered',
                affectedWorkpackages: positionUpdates.length,
                displayIdChanges: displayIdChanges.map(c => `${c.oldDisplayId}→${c.newDisplayId}`)
            }
        }, basePath, domainsUpdated);
        // Write-back to master-plan.yaml (fire-and-log — failure does not block)
        try {
            const planRegistry = new registry_2.PlanRegistryManager(clearDir);
            const plan = planRegistry.loadPlan();
            if (plan) {
                const phase = plan.phases.find(p => p.systemId === phaseSystemId || p.id === phaseSystemId);
                if (phase) {
                    // Apply display ID changes atomically (avoids sequential collision)
                    applyDisplayIdChanges(phase, displayIdChanges);
                    (0, writer_1.writeMasterPlan)(basePath, plan);
                }
            }
        }
        catch (err) {
            process.stderr.write(`[reorder] master-plan.yaml write-back failed: ${err instanceof Error ? err.message : err}\n`);
        }
        // Generate user message
        const message = generateReorderMessage(displayIdChanges);
        return {
            status: 'success',
            positionUpdates,
            displayIdChanges,
            domainsUpdated,
            timestamp,
            message
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            status: 'error',
            domainsUpdated: [],
            timestamp,
            error: `Reorder workpackage failed: ${errorMessage}`
        };
    }
}
/**
 * Generate user-friendly message for reorder operation
 */
function generateReorderMessage(displayIdChanges) {
    if (displayIdChanges.length === 0) {
        return 'No changes applied.';
    }
    const changes = displayIdChanges.map(c => `${c.oldDisplayId}→${c.newDisplayId}`).join(', ');
    return `Reordered: ${changes}`;
}
// ==============================================================================
// CONVENIENCE FUNCTIONS
// ==============================================================================
/**
 * Create an insert handler for use with hooks/CLI
 * @param basePath - Project root directory
 * @returns Function that performs workpackage insertion
 */
function createInsertHandler(basePath) {
    return async (sessionId, sessionNumber, phaseSystemId, insertPosition, title, options) => {
        return insertWorkpackage({
            basePath,
            sessionId,
            sessionNumber,
            phaseSystemId,
            insertPosition,
            title,
            ...options
        });
    };
}
/**
 * Create a defer handler for use with hooks/CLI
 * @param basePath - Project root directory
 * @returns Function that performs workpackage deferral
 */
function createDeferHandler(basePath) {
    return async (sessionId, sessionNumber, workpackageId, reason) => {
        return deferWorkpackage({
            basePath,
            sessionId,
            sessionNumber,
            workpackageId,
            reason
        });
    };
}
/**
 * Create a reorder handler for use with hooks/CLI
 * @param basePath - Project root directory
 * @returns Function that performs workpackage reordering
 */
function createReorderHandler(basePath) {
    return async (sessionId, sessionNumber, workpackageSystemId, newPosition) => {
        return reorderWorkpackage({
            basePath,
            sessionId,
            sessionNumber,
            workpackageSystemId,
            newPosition
        });
    };
}
/**
 * Validate position within a phase
 * @param basePath - Project root directory
 * @param phaseSystemId - Phase systemId
 * @param position - Position to validate
 * @returns true if position is valid (1 to maxPosition + 1)
 */
function validatePosition(basePath, phaseSystemId, position) {
    try {
        const clearDir = path.join(basePath, '.clear');
        const registryPath = path.join(clearDir, WORKPACKAGES_DIR, REGISTRY_FILE);
        const registry = loadRegistryYaml(registryPath);
        const phaseWorkpackages = registry.workpackages.filter(wp => wp.phase === phaseSystemId && wp.status !== 'deferred');
        // Position must be >= 1 and <= maxPosition + 1 (for inserting at the end)
        return position >= 1 && position <= phaseWorkpackages.length + 1;
    }
    catch {
        return false;
    }
}
/**
 * Get the maximum position in a phase
 * @param basePath - Project root directory
 * @param phaseSystemId - Phase systemId
 * @returns Maximum position (0 if no workpackages)
 */
function getMaxPosition(basePath, phaseSystemId) {
    try {
        const clearDir = path.join(basePath, '.clear');
        const registryPath = path.join(clearDir, WORKPACKAGES_DIR, REGISTRY_FILE);
        const registry = loadRegistryYaml(registryPath);
        const phaseWorkpackages = registry.workpackages.filter(wp => wp.phase === phaseSystemId && wp.status !== 'deferred');
        return Math.max(0, ...phaseWorkpackages.map(wp => wp.position ?? 0));
    }
    catch {
        return 0;
    }
}
//# sourceMappingURL=plan-propagate.js.map