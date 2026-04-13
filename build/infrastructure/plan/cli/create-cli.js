"use strict";
/**
 * Plan Create CLI (P2.9a)
 *
 * Implements /cf-plan create command for creating new master plans.
 * Based on P2.9a Feature Brief Section 2.4
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
exports.NameValidationError = exports.PlanExistsError = exports.MAX_NAME_LENGTH = void 0;
exports.validateNameLength = validateNameLength;
exports.sanitizePlanName = sanitizePlanName;
exports.generatePlanSkeleton = generatePlanSkeleton;
exports.generatePlanState = generatePlanState;
exports.runCreatePlanCLI = runCreatePlanCLI;
const path = __importStar(require("path"));
const validation_1 = require("../../validation");
const types_1 = require("../types");
const writer_1 = require("../writer");
const parser_1 = require("../parser");
const types_2 = require("../../sync/types");
// ==============================================================================
// CONSTANTS
// ==============================================================================
/** Maximum length for plan name */
exports.MAX_NAME_LENGTH = 80;
// ==============================================================================
// ERROR TYPES
// ==============================================================================
/**
 * Error thrown when plan already exists
 */
class PlanExistsError extends Error {
    constructor(planPath) {
        super(`Master plan already exists at: ${planPath}`);
        this.planPath = planPath;
        this.name = 'PlanExistsError';
    }
}
exports.PlanExistsError = PlanExistsError;
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
 * Validate plan name length
 * @param name - Name to validate
 * @returns Validation result with suggested alternative if too long
 */
function validateNameLength(name) {
    if (name.length <= exports.MAX_NAME_LENGTH) {
        return { valid: true };
    }
    // Create a suggested shorter name
    const suggested = name.substring(0, exports.MAX_NAME_LENGTH - 3).trim() + '...';
    return { valid: false, suggested };
}
/**
 * Sanitize plan name for use in file paths
 * @param name - Raw name
 * @returns Sanitized name
 */
function sanitizePlanName(name) {
    return name
        .trim()
        .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid filename chars
        .replace(/\s+/g, ' '); // Normalize whitespace
}
// ==============================================================================
// SKELETON GENERATION
// ==============================================================================
/**
 * Generate initial master plan skeleton
 * @param projectName - Name of the project
 * @returns Master plan skeleton
 */
function generatePlanSkeleton(projectName) {
    const phaseSystemId = (0, types_2.generatePhaseSystemId)();
    const initialPhase = {
        id: 'Phase-1',
        systemId: phaseSystemId,
        position: 1,
        name: 'Getting Started',
        status: 'not_started',
        workpackages: [],
        weights: {},
        dependencies: []
    };
    return {
        version: '1.0.0',
        projectName: projectName,
        status: 'draft',
        activePhase: 'Phase-1',
        activeWorkpackage: '',
        phases: [initialPhase],
        milestones: []
    };
}
/**
 * Generate initial plan state
 * @param planName - Name of the plan
 * @param phaseSystemId - System ID of initial phase
 * @returns Plan state
 */
function generatePlanState(planName, phaseSystemId) {
    const now = new Date().toISOString();
    return {
        ...(0, types_1.createDefaultPlanState)(),
        activePlanId: planName,
        activePhaseId: 'Phase-1',
        activePhaseSystemId: phaseSystemId,
        startedAt: now,
        lastActivity: now
    };
}
// ==============================================================================
// OUTPUT FORMATTING
// ==============================================================================
/**
 * Format success message
 */
function formatSuccessMessage(planName, filesCreated, backupPath) {
    const lines = [];
    lines.push(`✅ Master plan created: ${planName}`);
    lines.push('');
    lines.push('Files created:');
    for (const file of filesCreated) {
        lines.push(`  ${file}`);
    }
    if (backupPath) {
        lines.push('');
        lines.push(`Previous plan backed up to: ${backupPath}`);
    }
    lines.push('');
    lines.push('Next steps:');
    lines.push('  1. Edit master-plan.yaml to add objectives and milestones');
    lines.push('  2. Use /cf-plan addPhase to create additional phases');
    lines.push('  3. Use /cf-workpackage create to add workpackages to phases');
    return lines.join('\n');
}
/**
 * Format exists error message
 */
function formatExistsMessage(planPath) {
    const lines = [];
    lines.push('❌ Master plan already exists');
    lines.push('');
    lines.push(`Location: ${planPath}`);
    lines.push('');
    lines.push('Options:');
    lines.push('  1. Use --force to overwrite (creates backup)');
    lines.push('  2. Edit the existing plan directly');
    return lines.join('\n');
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
 * Create a new master plan
 *
 * @param input - Creation input
 * @returns Creation result
 */
async function runCreatePlanCLI(input) {
    const { name, force = false } = input;
    const cwd = (0, validation_1.validateBasePath)(input.cwd);
    // Check if plan already exists
    if ((0, writer_1.masterPlanExists)(cwd) && !force) {
        const planPath = path.join(cwd, '.clear', 'plans', 'master-plan.yaml');
        return {
            status: 'exists',
            error: 'Master plan already exists',
            additionalContext: formatExistsMessage(planPath)
        };
    }
    // Validate name if provided
    const planName = name ? sanitizePlanName(name) : 'Untitled Project';
    const validation = validateNameLength(planName);
    if (!validation.valid) {
        return {
            status: 'error',
            error: `Name exceeds ${exports.MAX_NAME_LENGTH} characters`,
            additionalContext: formatValidationMessage(planName, validation.suggested)
        };
    }
    try {
        // Generate skeleton
        const plan = generatePlanSkeleton(planName);
        const initialPhase = plan.phases[0];
        if (!initialPhase?.systemId) {
            return {
                status: 'error',
                error: 'Failed to generate initial phase with systemId',
                additionalContext: 'Internal error: plan skeleton generation produced an invalid phase.'
            };
        }
        const phaseSystemId = initialPhase.systemId;
        // Write plan YAML
        const writeResult = (0, writer_1.writeMasterPlan)(cwd, plan, {
            backup: force,
            createDirs: true
        });
        if (writeResult.status === 'error') {
            return {
                status: 'error',
                error: writeResult.error,
                additionalContext: `Failed to write master plan: ${writeResult.error}`
            };
        }
        // Write plan state
        const state = generatePlanState(planName, phaseSystemId);
        const statePath = path.join(cwd, '.clear', 'state', 'plan.json');
        (0, parser_1.writeStateFile)(statePath, state);
        const filesCreated = [
            '.clear/plans/master-plan.yaml',
            '.clear/state/plan.json'
        ];
        // Log to audit trail (optional - requires sessionId)
        // Note: AuditLogger requires sessionNumber which is not part of CreatePlanInput
        // For now, audit logging is deferred until sessionNumber is added to input
        return {
            status: 'success',
            planName,
            filesCreated,
            backupPath: writeResult.backupPath,
            additionalContext: formatSuccessMessage(planName, filesCreated, writeResult.backupPath)
        };
    }
    catch (error) {
        return {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            additionalContext: `Failed to create plan: ${error instanceof Error ? error.message : 'Unknown error'}`
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
    let force = false;
    let sessionId = 'unknown';
    for (const arg of argv) {
        if (arg.startsWith('--cwd='))
            cwd = arg.substring('--cwd='.length);
        else if (arg.startsWith('--name='))
            name = arg.substring('--name='.length);
        else if (arg === '--force')
            force = true;
        else if (arg.startsWith('--session-id='))
            sessionId = arg.substring('--session-id='.length);
    }
    return { cwd, name, force, sessionId };
}
// Main execution — only run when invoked directly
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: create-cli.js [options]',
                '',
                'Creates a new plan scaffold in the project.',
                '',
                'Options:',
                '  --cwd=<path>                 Project root directory (default: .)',
                '  --name=<name>                Plan name',
                '  --force                      Overwrite existing plan',
                '  --session-id=<id>            Current session identifier',
            ].join('\n')
        }));
        process.exit(0);
    }
    const input = parseArgs();
    runCreatePlanCLI(input)
        .then(result => {
        console.log(JSON.stringify(result));
    })
        .catch(error => {
        console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
        process.exit(1);
    });
}
//# sourceMappingURL=create-cli.js.map