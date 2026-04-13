"use strict";
/**
 * Workpackage Create CLI (P2.9a)
 *
 * Implements /cf-workpackage create command for creating new workpackages.
 * Wraps insertWorkpackage() from sync/plan-propagate.ts.
 * Based on P2.9a Feature Brief Section 2.6
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
exports.TitleValidationError = exports.PhaseNotFoundError = exports.NoPlanError = exports.VALID_PRIORITIES = exports.VALID_TYPES = exports.MAX_TITLE_LENGTH = void 0;
exports.validateTitleLength = validateTitleLength;
exports.isValidType = isValidType;
exports.isValidPriority = isValidPriority;
exports.runCreateWorkpackageCLI = runCreateWorkpackageCLI;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const validation_1 = require("../../validation");
const registry_1 = require("../../plan/registry");
const registry_2 = require("../registry");
const plan_propagate_1 = require("../../sync/plan-propagate");
// ==============================================================================
// CONSTANTS
// ==============================================================================
/** Maximum length for workpackage title */
exports.MAX_TITLE_LENGTH = 80;
/** Valid workpackage types */
exports.VALID_TYPES = [
    'feature', 'bugfix', 'refactor', 'documentation', 'infrastructure'
];
/** Valid priorities */
exports.VALID_PRIORITIES = [
    'critical', 'high', 'medium', 'low'
];
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
 * Error thrown when phase is not found
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
 * Error thrown when title validation fails
 */
class TitleValidationError extends Error {
    constructor(message, providedTitle, suggestedTitle) {
        super(message);
        this.providedTitle = providedTitle;
        this.suggestedTitle = suggestedTitle;
        this.name = 'TitleValidationError';
    }
}
exports.TitleValidationError = TitleValidationError;
// ==============================================================================
// VALIDATION
// ==============================================================================
/**
 * Validate title length
 * @param title - Title to validate
 * @returns Validation result with suggested alternative if too long
 */
function validateTitleLength(title) {
    if (title.length <= exports.MAX_TITLE_LENGTH) {
        return { valid: true };
    }
    const suggested = title.substring(0, exports.MAX_TITLE_LENGTH - 3).trim() + '...';
    return { valid: false, suggested };
}
/**
 * Validate workpackage type
 * @param type - Type to validate
 * @returns true if valid
 */
function isValidType(type) {
    return exports.VALID_TYPES.includes(type);
}
/**
 * Validate workpackage priority
 * @param priority - Priority to validate
 * @returns true if valid
 */
function isValidPriority(priority) {
    return exports.VALID_PRIORITIES.includes(priority);
}
// ==============================================================================
// OUTPUT FORMATTING
// ==============================================================================
/**
 * Format success message
 */
function formatSuccessMessage(displayId, title, phaseId, phaseName, type, priority, systemId) {
    const lines = [];
    lines.push(`✅ Workpackage created: ${displayId} - "${title}"`);
    lines.push('');
    lines.push(`Phase: ${phaseId} - ${phaseName}`);
    lines.push(`Type: ${type}`);
    lines.push(`Priority: ${priority}`);
    lines.push(`System ID: ${systemId}`);
    lines.push('');
    lines.push('Next steps:');
    lines.push(`  1. Edit the workpackage to add description and deliverables`);
    lines.push(`  2. Use /cf-workpackage start ${displayId} when ready to begin`);
    return lines.join('\n');
}
/**
 * Format validation error message
 */
function formatValidationMessage(providedTitle, suggestedTitle) {
    const lines = [];
    lines.push(`❌ Title exceeds ${exports.MAX_TITLE_LENGTH} characters (currently: ${providedTitle.length})`);
    lines.push('');
    lines.push(`Provided: "${providedTitle}"`);
    if (suggestedTitle) {
        lines.push('');
        lines.push(`Suggestion: "${suggestedTitle}"`);
    }
    lines.push('');
    lines.push('Please provide a shorter title or accept the suggestion.');
    return lines.join('\n');
}
/**
 * Format phase not found error
 */
function formatPhaseNotFoundMessage(phaseId, availablePhases) {
    const lines = [];
    lines.push(`❌ Phase not found: ${phaseId}`);
    lines.push('');
    lines.push('Available phases:');
    for (const phase of availablePhases) {
        lines.push(`  - ${phase}`);
    }
    return lines.join('\n');
}
// ==============================================================================
// INTERNAL HELPERS
// ==============================================================================
/**
 * Calculate the insert position for a new workpackage within a phase.
 * If afterId is provided, inserts after that workpackage.
 * Otherwise, appends at the end of the phase.
 */
function resolveInsertPosition(clearDir, phaseSystemId, afterId) {
    const wpRegistry = new registry_2.WorkpackageRegistryManager(clearDir);
    const registry = wpRegistry.loadRegistry();
    if (afterId) {
        const afterWp = registry.workpackages.find(wp => wp.id === afterId || wp.systemId === afterId);
        if (afterWp && afterWp.position !== undefined) {
            return afterWp.position + 1;
        }
        return 1;
    }
    // Insert at end of phase
    const phaseWps = registry.workpackages.filter(wp => wp.phase === phaseSystemId);
    return phaseWps.length + 1;
}
// ==============================================================================
// MAIN OPERATION
// ==============================================================================
/**
 * Create a new workpackage
 *
 * @param input - Creation input
 * @returns Creation result
 */
async function runCreateWorkpackageCLI(input) {
    const validatedCwd = (0, validation_1.validateBasePath)(input.cwd);
    const { phaseId, title, afterId, type = 'feature', priority = 'medium', sessionId = 'unknown', sessionNumber = 0, description, acceptance_criteria, verification, notes, deliverables_text, scope_in, scope_out } = input;
    const cwd = validatedCwd;
    const clearDir = path.join(cwd, '.clear');
    // Load plan
    const planRegistry = new registry_1.PlanRegistryManager(clearDir);
    const plan = planRegistry.loadPlan();
    if (!plan) {
        return {
            status: 'no_plan',
            error: 'No master plan found',
            additionalContext: 'No master plan found. Use /cf-plan create first.'
        };
    }
    // Find target phase
    const phase = plan.phases.find(p => p.id === phaseId || p.systemId === phaseId);
    if (!phase) {
        const availablePhases = plan.phases.map(p => `${p.id} (${p.systemId})`);
        return {
            status: 'phase_not_found',
            error: `Phase not found: ${phaseId}`,
            additionalContext: formatPhaseNotFoundMessage(phaseId, availablePhases)
        };
    }
    // Validate title if provided
    const wpTitle = title?.trim() || 'New Workpackage';
    const validation = validateTitleLength(wpTitle);
    if (!validation.valid) {
        return {
            status: 'error',
            error: `Title exceeds ${exports.MAX_TITLE_LENGTH} characters`,
            additionalContext: formatValidationMessage(wpTitle, validation.suggested)
        };
    }
    try {
        // Calculate insert position
        const insertPosition = resolveInsertPosition(clearDir, phase.systemId ?? phase.id, afterId);
        // Call insertWorkpackage from sync/plan-propagate
        const result = await (0, plan_propagate_1.insertWorkpackage)({
            basePath: cwd,
            sessionId,
            sessionNumber,
            phaseSystemId: phase.systemId ?? phase.id,
            insertPosition,
            title: wpTitle,
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
        if (result.status !== 'success') {
            return {
                status: 'error',
                error: result.error || result.message || 'Failed to create workpackage',
                additionalContext: result.message || 'An error occurred during workpackage creation'
            };
        }
        if (!result.newDisplayId || !result.newSystemId) {
            return {
                status: 'error',
                error: 'Insert succeeded but IDs missing',
                additionalContext: 'Workpackage was created but display/system IDs were not returned'
            };
        }
        return {
            status: 'success',
            workpackageId: result.newDisplayId,
            workpackageSystemId: result.newSystemId,
            title: wpTitle,
            phaseId: phase.id,
            type,
            priority,
            additionalContext: formatSuccessMessage(result.newDisplayId, wpTitle, phase.id, phase.name, type, priority, result.newSystemId)
        };
    }
    catch (error) {
        return {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            additionalContext: `Failed to create workpackage: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
// ==============================================================================
// CLI MAIN BLOCK
// ==============================================================================
function parseArgs() {
    const argv = process.argv.slice(2);
    let cwd = '.';
    let phaseId = '';
    let title;
    let afterId;
    let type;
    let priority;
    let sessionId = 'unknown';
    let sessionNumber = 0;
    let description;
    let fromStdin = false;
    for (const arg of argv) {
        if (arg.startsWith('--cwd='))
            cwd = arg.substring('--cwd='.length);
        else if (arg.startsWith('--phase='))
            phaseId = arg.substring('--phase='.length);
        else if (arg.startsWith('--title='))
            title = arg.substring('--title='.length);
        else if (arg.startsWith('--after='))
            afterId = arg.substring('--after='.length);
        else if (arg.startsWith('--type='))
            type = arg.substring('--type='.length);
        else if (arg.startsWith('--priority='))
            priority = arg.substring('--priority='.length);
        else if (arg.startsWith('--session-id='))
            sessionId = arg.substring('--session-id='.length);
        else if (arg.startsWith('--session-number='))
            sessionNumber = parseInt(arg.substring('--session-number='.length), 10) || 0;
        else if (arg.startsWith('--description='))
            description = arg.substring('--description='.length);
        else if (arg === '--from-stdin')
            fromStdin = true;
    }
    return { cwd, phaseId, title, afterId, type, priority, sessionId, sessionNumber, description, fromStdin };
}
/**
 * Read JSON payload from stdin (synchronous).
 * Used when --from-stdin flag is set.
 */
function readStdinJson() {
    const fd = fs.openSync('/dev/stdin', 'r');
    const chunks = [];
    const buf = Buffer.alloc(4096);
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
        chunks.push(buf.subarray(0, bytesRead));
    }
    fs.closeSync(fd);
    const raw = Buffer.concat(chunks).toString('utf-8').trim();
    if (!raw) {
        throw new Error('No JSON received on stdin');
    }
    return JSON.parse(raw);
}
/**
 * Merge stdin JSON payload into CreateWorkpackageInput.
 * Stdin fields override args where both are present.
 */
function mergeStdinInput(base, json) {
    return {
        ...base,
        phaseId: typeof json.phaseId === 'string' ? json.phaseId : base.phaseId,
        title: typeof json.title === 'string' ? json.title : base.title,
        afterId: typeof json.afterId === 'string' ? json.afterId : base.afterId,
        type: typeof json.type === 'string' ? json.type : base.type,
        priority: typeof json.priority === 'string' ? json.priority : base.priority,
        description: typeof json.description === 'string' ? json.description : base.description,
        acceptance_criteria: Array.isArray(json.acceptance_criteria) ? json.acceptance_criteria.map(String) : base.acceptance_criteria,
        verification: Array.isArray(json.verification) ? json.verification.map(String) : base.verification,
        notes: Array.isArray(json.notes) ? json.notes.map(String) : base.notes,
        deliverables_text: Array.isArray(json.deliverables_text) ? json.deliverables_text.map(String) : base.deliverables_text,
        scope_in: Array.isArray(json.scope_in) ? json.scope_in.map(String) : base.scope_in,
        scope_out: Array.isArray(json.scope_out) ? json.scope_out.map(String) : base.scope_out,
    };
}
// Main execution — only run when invoked directly
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: create-cli.js [options]',
                '',
                'Creates a new workpackage in the specified phase.',
                '',
                'Options:',
                '  --cwd=<path>                 Project root directory (default: .)',
                '  --phase=<phase-id>           Target phase ID (required)',
                '  --title=<title>              Workpackage title (required)',
                '  --after=<wp-id>              Insert after this workpackage ID',
                '  --type=<type>                Workpackage type',
                '  --priority=<priority>        Workpackage priority',
                '  --description=<text>         Workpackage description',
                '  --session-id=<id>            Current session identifier',
                '  --session-number=<number>    Current session number',
                '  --from-stdin                 Read rich fields from stdin as JSON',
                '',
                'Stdin JSON fields (with --from-stdin):',
                '  phaseId, title, afterId, type, priority, description,',
                '  acceptance_criteria[], verification[], notes[],',
                '  deliverables_text[], scope_in[], scope_out[]',
            ].join('\n')
        }));
        process.exit(0);
    }
    let input = parseArgs();
    // --from-stdin: merge rich fields from stdin JSON
    if (input.fromStdin) {
        try {
            const json = readStdinJson();
            input = mergeStdinInput(input, json);
        }
        catch (err) {
            console.error(JSON.stringify({
                error: `Failed to read stdin JSON: ${err instanceof Error ? err.message : 'Unknown error'}`
            }));
            process.exit(1);
        }
    }
    if (!input.phaseId) {
        console.error(JSON.stringify({
            error: 'Usage: create-cli.js --cwd=<path> --phase=<id> [--title=<title>] [--from-stdin] [--type=<type>] [--priority=<priority>]'
        }));
        process.exit(1);
    }
    runCreateWorkpackageCLI(input)
        .then(result => {
        console.log(JSON.stringify(result));
    })
        .catch(error => {
        console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
        process.exit(1);
    });
}
//# sourceMappingURL=create-cli.js.map