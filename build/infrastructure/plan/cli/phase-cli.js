"use strict";
/**
 * Plan Phase CLI (P2.9a)
 *
 * Implements /cf-plan addPhase command for adding phases to master plan.
 * Based on P2.9a Feature Brief Section 2.5
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
exports.NameValidationError = exports.PhaseNotFoundError = exports.NoPlanError = exports.MAX_NAME_LENGTH = void 0;
exports.validateNameLength = validateNameLength;
exports.findPhaseById = findPhaseById;
exports.insertPhaseAtPosition = insertPhaseAtPosition;
exports.createPhase = createPhase;
exports.runAddPhaseCLI = runAddPhaseCLI;
const path = __importStar(require("path"));
const registry_1 = require("../registry");
const writer_1 = require("../writer");
const types_1 = require("../../sync/types");
// ==============================================================================
// CONSTANTS
// ==============================================================================
/** Maximum length for phase name */
exports.MAX_NAME_LENGTH = 80;
// ==============================================================================
// ERROR TYPES
// ==============================================================================
/**
 * Error thrown when plan doesn't exist
 */
class NoPlanError extends Error {
    constructor() {
        super('No master plan found. Use /cf-plan create first.');
        this.name = 'NoPlanError';
    }
}
exports.NoPlanError = NoPlanError;
/**
 * Error thrown when phase ID is not found
 */
class PhaseNotFoundError extends Error {
    constructor(phaseId) {
        super(`Phase not found: ${phaseId}`);
        this.phaseId = phaseId;
        this.name = 'PhaseNotFoundError';
    }
}
exports.PhaseNotFoundError = PhaseNotFoundError;
/**
 * Error thrown when name validation fails
 */
class NameValidationError extends Error {
    constructor(message, providedName, suggestedName) {
        super(message);
        this.providedName = providedName;
        this.suggestedName = suggestedName;
        this.name = 'NameValidationError';
    }
}
exports.NameValidationError = NameValidationError;
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
    // Reindex all positions and display IDs
    result.forEach((phase, idx) => {
        phase.position = idx + 1;
        phase.id = `Phase-${phase.position}`;
    });
    return result;
}
/**
 * Create a new phase object
 * @param name - Phase name
 * @param position - Position (will be recalculated on insert)
 * @returns New phase object
 */
function createPhase(name, position) {
    return {
        id: `Phase-${position}`,
        systemId: (0, types_1.generatePhaseSystemId)(),
        position,
        name,
        status: 'not_started',
        workpackages: [],
        weights: {},
        dependencies: []
    };
}
// ==============================================================================
// OUTPUT FORMATTING
// ==============================================================================
/**
 * Format success message
 */
function formatSuccessMessage(phases, newPhase, afterPhaseId) {
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
        const reindexNote = !isNew && phase.position !== phases.indexOf(phase) + 1 ? ' (reindexed)' : '';
        lines.push(`  ${phase.id}: ${phase.name} [${statusIcon}]${marker}${reindexNote}`);
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
// ==============================================================================
// MAIN OPERATION
// ==============================================================================
/**
 * Add a new phase to the master plan
 *
 * @param input - Add phase input
 * @returns Add phase result
 */
async function runAddPhaseCLI(input) {
    const { cwd, name, afterId } = input;
    // Load existing plan
    const clearDir = path.join(cwd, '.clear');
    const registry = new registry_1.PlanRegistryManager(clearDir);
    const plan = registry.loadPlan();
    if (!plan) {
        return {
            status: 'no_plan',
            error: 'No master plan found',
            additionalContext: 'No master plan found. Use /cf-plan create first.'
        };
    }
    // Validate name if provided
    const phaseName = name?.trim() || 'New Phase';
    const validation = validateNameLength(phaseName);
    if (!validation.valid) {
        return {
            status: 'error',
            error: `Name exceeds ${exports.MAX_NAME_LENGTH} characters`,
            additionalContext: formatValidationMessage(phaseName, validation.suggested)
        };
    }
    try {
        // Find insertion point
        let afterIndex;
        let afterPhaseId;
        if (afterId) {
            const found = findPhaseById(plan.phases, afterId);
            if (!found) {
                return {
                    status: 'not_found',
                    error: `Phase not found: ${afterId}`,
                    additionalContext: `Phase "${afterId}" not found. Available phases:\n${plan.phases.map(p => `  - ${p.id} (${p.systemId})`).join('\n')}`
                };
            }
            afterIndex = found.index;
            afterPhaseId = found.phase.id;
        }
        // Create new phase
        const newPhase = createPhase(phaseName, plan.phases.length + 1);
        // Insert and reindex
        const updatedPhases = insertPhaseAtPosition(plan.phases, newPhase, afterIndex);
        // Update plan
        const updatedPlan = {
            ...plan,
            phases: updatedPhases
        };
        // Write updated plan
        const writeResult = (0, writer_1.writeMasterPlan)(cwd, updatedPlan);
        if (writeResult.status === 'error') {
            return {
                status: 'error',
                error: writeResult.error,
                additionalContext: `Failed to write plan: ${writeResult.error}`
            };
        }
        // Find the new phase after reindexing
        const insertedPhase = updatedPhases.find(p => p.systemId === newPhase.systemId);
        if (!insertedPhase) {
            throw new Error(`Phase with systemId ${newPhase.systemId} not found after insertion`);
        }
        // Log to audit trail (optional - requires sessionNumber)
        // Note: AuditLogger requires sessionNumber which is not part of AddPhaseInput
        // For now, audit logging is deferred until sessionNumber is added to input
        return {
            status: 'success',
            phaseId: insertedPhase.id,
            phaseSystemId: insertedPhase.systemId,
            phaseName: insertedPhase.name,
            position: insertedPhase.position,
            afterPhase: afterPhaseId,
            additionalContext: formatSuccessMessage(updatedPhases, insertedPhase, afterPhaseId)
        };
    }
    catch (error) {
        return {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            additionalContext: `Failed to add phase: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
// ==============================================================================
// CLI MAIN BLOCK
// ==============================================================================
function parseArgs() {
    const argv = process.argv.slice(2);
    let cwd = '.';
    let name;
    let afterId;
    let sessionId = 'unknown';
    for (const arg of argv) {
        if (arg.startsWith('--cwd='))
            cwd = arg.substring('--cwd='.length);
        else if (arg.startsWith('--name='))
            name = arg.substring('--name='.length);
        else if (arg.startsWith('--after='))
            afterId = arg.substring('--after='.length);
        else if (arg.startsWith('--session-id='))
            sessionId = arg.substring('--session-id='.length);
    }
    return { cwd, name, afterId, sessionId };
}
// Main execution — only run when invoked directly
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: phase-cli.js [options]',
                '',
                'Adds a new phase to the master plan.',
                '',
                'Options:',
                '  --cwd=<path>                 Project root directory (default: .)',
                '  --name=<name>                Phase name (required)',
                '  --after=<phase-id>           Insert after this phase ID',
                '  --session-id=<id>            Current session identifier',
            ].join('\n')
        }));
        process.exit(0);
    }
    const input = parseArgs();
    runAddPhaseCLI(input)
        .then(result => {
        console.log(JSON.stringify(result));
    })
        .catch(error => {
        console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
        process.exit(1);
    });
}
//# sourceMappingURL=phase-cli.js.map