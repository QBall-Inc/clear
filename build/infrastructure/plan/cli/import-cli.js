"use strict";
/**
 * Plan Import CLI
 *
 * Implements /cf-plan import (Track A) — imports a Bulwark plan into CLEAR format.
 * Orchestrates: detect → parse → validate → transform → writeMasterPlan → batch WP create.
 * Atomic failure: if any step fails, no partial state remains.
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
exports.runImportPlanCLI = runImportPlanCLI;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const validation_1 = require("../../validation");
const writer_1 = require("../writer");
const parser_1 = require("../parser");
const types_1 = require("../types");
const import_transformer_1 = require("../import-transformer");
const plan_propagate_1 = require("../../sync/plan-propagate");
// ==============================================================================
// HELPERS
// ==============================================================================
/**
 * Resolve the plan file from a path that may be a file or directory
 */
function resolvePlanFile(planPath) {
    const stat = fs.statSync(planPath);
    if (stat.isFile()) {
        return planPath;
    }
    if (stat.isDirectory()) {
        // Look for plan_v*.md first, then plan.yaml, then plan.yml
        const files = fs.readdirSync(planPath);
        const planMd = files
            .filter(f => /^plan_v\d+\.md$/i.test(f))
            .sort()
            .pop(); // Latest version
        if (planMd)
            return path.join(planPath, planMd);
        for (const name of ['plan.yaml', 'plan.yml']) {
            if (files.includes(name))
                return path.join(planPath, name);
        }
        throw new Error(`No plan file found in directory: ${planPath}. Expected plan_v*.md, plan.yaml, or plan.yml`);
    }
    throw new Error(`Path is neither file nor directory: ${planPath}`);
}
/**
 * Get the plan directory (for enriched-structure.yaml lookup)
 */
function getPlanDir(planFilePath) {
    return path.dirname(planFilePath);
}
/**
 * Clean up partially created files on failure
 */
function cleanupOnFailure(cwd, createdFiles) {
    for (const file of createdFiles) {
        try {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        }
        catch {
            // Best effort cleanup
        }
    }
    // Remove master-plan.yaml if it was created
    const masterPlanPath = path.join(cwd, '.clear', 'plans', 'master-plan.yaml');
    try {
        if (fs.existsSync(masterPlanPath)) {
            fs.unlinkSync(masterPlanPath);
        }
    }
    catch {
        // Best effort
    }
}
/**
 * Format success message
 */
function formatSuccessMessage(filesCreated, wpCount, projectName, phaseCount, milestoneCount) {
    const lines = [];
    lines.push(`Plan imported: "${projectName}"`);
    lines.push('');
    lines.push(`Phases: ${phaseCount}`);
    lines.push(`Workpackages: ${wpCount}`);
    lines.push(`Milestones: ${milestoneCount}`);
    lines.push('');
    lines.push('Files created:');
    for (const file of filesCreated) {
        lines.push(`  ${file}`);
    }
    lines.push('');
    lines.push('Next: Use /cf-plan to view the imported plan.');
    return lines.join('\n');
}
// ==============================================================================
// MAIN OPERATION
// ==============================================================================
/**
 * Import a Bulwark plan into CLEAR format
 */
async function runImportPlanCLI(input) {
    const cwd = (0, validation_1.validateBasePath)(input.cwd);
    const { planPath, force = false, sessionId = 'unknown', sessionNumber = 0, skipWorkpackages = false } = input;
    // Check if master plan already exists
    if (!force && (0, writer_1.masterPlanExists)(cwd)) {
        return {
            status: 'exists',
            error: 'Master plan already exists. Use force=true to overwrite.',
            additionalContext: 'A master plan already exists at .clear/plans/master-plan.yaml.\nUse force flag to overwrite.'
        };
    }
    // Resolve plan file
    let planFilePath;
    try {
        const resolvedPath = path.isAbsolute(planPath) ? planPath : path.resolve(cwd, planPath);
        planFilePath = resolvePlanFile(resolvedPath);
    }
    catch (error) {
        return {
            status: 'error',
            error: error instanceof Error ? error.message : 'Failed to resolve plan file',
            additionalContext: `Could not find plan file at: ${planPath}`
        };
    }
    // Load and validate Bulwark plan
    let bulwarkPlan;
    try {
        bulwarkPlan = (0, import_transformer_1.loadBulwarkPlan)(planFilePath);
    }
    catch (error) {
        return {
            status: 'invalid_plan',
            error: error instanceof Error ? error.message : 'Failed to parse plan',
            additionalContext: `Failed to parse Bulwark plan: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
    // Validate it's a Bulwark plan
    if (!(0, import_transformer_1.isBulwarkPlan)(bulwarkPlan)) {
        return {
            status: 'invalid_plan',
            error: 'Input is not a valid Bulwark plan (missing phases with workpackage objects)',
            additionalContext: 'The provided file does not contain a valid Bulwark plan structure.\nExpected: phases[] with workpackage objects containing id, name, dependencies.'
        };
    }
    // Validate required fields
    const validationErrors = (0, import_transformer_1.validateBulwarkPlan)(bulwarkPlan);
    if (validationErrors.length > 0) {
        return {
            status: 'invalid_plan',
            validationErrors,
            error: `Plan validation failed: ${validationErrors.join('; ')}`,
            additionalContext: `Plan validation failed:\n${validationErrors.map(e => `  - ${e}`).join('\n')}`
        };
    }
    // Try to load enriched WP details
    const planDir = getPlanDir(planFilePath);
    const enrichedDetails = (0, import_transformer_1.loadEnrichedStructure)(planDir);
    // Transform
    const { masterPlan, workpackageDetails } = (0, import_transformer_1.transformBulwarkPlan)(bulwarkPlan, enrichedDetails);
    // Write master plan (atomic: uses writeMasterPlan which handles dir creation)
    const writeResult = (0, writer_1.writeMasterPlan)(cwd, masterPlan, {
        backup: force,
        createDirs: true
    });
    if (writeResult.status !== 'success') {
        return {
            status: 'error',
            error: writeResult.error ?? 'Failed to write master plan',
            additionalContext: `Failed to write master-plan.yaml: ${writeResult.error ?? 'Unknown error'}`
        };
    }
    const filesCreated = [writeResult.yamlPath];
    if (writeResult.backupPath) {
        filesCreated.push(writeResult.backupPath);
    }
    // Write plan state
    try {
        const statePath = path.join(cwd, '.clear', 'state', 'plan.json');
        const stateDir = path.dirname(statePath);
        if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
        }
        const planState = (0, types_1.createDefaultPlanState)();
        (0, parser_1.writeStateFile)(statePath, planState);
        filesCreated.push(statePath);
    }
    catch {
        // State file failure is non-fatal, plan is already written
    }
    // Create workpackages if not skipped
    let workpackagesCreated = 0;
    if (!skipWorkpackages && workpackageDetails.length > 0) {
        const wpResult = await createWorkpackagesFromImport(cwd, workpackageDetails, sessionId, sessionNumber);
        if (wpResult.status === 'error') {
            // Atomic failure: clean up everything
            cleanupOnFailure(cwd, filesCreated);
            return {
                status: 'error',
                error: wpResult.error,
                additionalContext: `Plan import failed during workpackage creation: ${wpResult.error}\nAll files have been rolled back.`
            };
        }
        workpackagesCreated = wpResult.created;
        filesCreated.push(...wpResult.files);
    }
    return {
        status: 'success',
        filesCreated,
        workpackagesCreated,
        additionalContext: formatSuccessMessage(filesCreated, workpackagesCreated, masterPlan.projectName, masterPlan.phases.length, masterPlan.milestones.length)
    };
}
/**
 * Create workpackages from import details, one per WP, in phase order
 */
async function createWorkpackagesFromImport(cwd, details, sessionId, sessionNumber) {
    const files = [];
    let created = 0;
    // Group by phaseSystemId to insert in order
    const byPhase = new Map();
    for (const detail of details) {
        const existing = byPhase.get(detail.phaseSystemId) ?? [];
        existing.push(detail);
        byPhase.set(detail.phaseSystemId, existing);
    }
    for (const [phaseSystemId, phaseDetails] of byPhase) {
        for (let i = 0; i < phaseDetails.length; i++) {
            const detail = phaseDetails[i];
            const insertPosition = i + 1;
            try {
                const result = await (0, plan_propagate_1.insertWorkpackage)({
                    basePath: cwd,
                    sessionId,
                    sessionNumber,
                    phaseSystemId,
                    insertPosition,
                    title: detail.title,
                    description: detail.description,
                    type: 'feature',
                    priority: 'medium',
                    acceptance_criteria: detail.acceptance_criteria,
                    verification: detail.verification,
                    notes: detail.notes,
                    deliverables_text: detail.deliverables_text
                });
                if (result.status !== 'success') {
                    return {
                        status: 'error',
                        created,
                        files,
                        error: `Failed to create WP "${detail.title}": ${result.error ?? result.message}`
                    };
                }
                created++;
                if (result.newSystemId) {
                    files.push(path.join(cwd, '.clear', 'workpackages', `${result.newSystemId}.yaml`));
                }
            }
            catch (error) {
                return {
                    status: 'error',
                    created,
                    files,
                    error: `Exception creating WP "${detail.title}": ${error instanceof Error ? error.message : 'Unknown'}`
                };
            }
        }
    }
    return { status: 'success', created, files };
}
// ==============================================================================
// CLI ENTRY POINT
// ==============================================================================
function parseCliArgs() {
    const args = process.argv.slice(2);
    let cwd = '.';
    let planPath = '';
    let force = false;
    let sessionId = 'unknown';
    let sessionNumber = 0;
    let skipWorkpackages = false;
    for (const arg of args) {
        if (arg.startsWith('--cwd='))
            cwd = arg.slice(6);
        else if (arg.startsWith('--plan-path='))
            planPath = arg.slice(12);
        else if (arg === '--force')
            force = true;
        else if (arg.startsWith('--session-id='))
            sessionId = arg.slice(13);
        else if (arg.startsWith('--session-number='))
            sessionNumber = parseInt(arg.slice(17), 10) || 0;
        else if (arg === '--skip-workpackages')
            skipWorkpackages = true;
        else if (!arg.startsWith('--') && !planPath)
            planPath = arg;
    }
    return { cwd, planPath, force, sessionId, sessionNumber, skipWorkpackages };
}
async function main() {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        process.stdout.write(JSON.stringify({
            success: true,
            message: [
                'Usage: import-cli.js [options] [plan-path]',
                '',
                'Imports a Bulwark plan into the CLEAR plan system.',
                '',
                'Options:',
                '  --cwd=<path>                 Project root directory (default: .)',
                '  --plan-path=<path>           Path to plan file (also accepted as positional arg)',
                '  --force                      Overwrite existing plan data',
                '  --session-id=<id>            Current session identifier',
                '  --session-number=<number>    Current session number',
                '  --skip-workpackages          Import plan structure without workpackages',
            ].join('\n')
        }) + '\n');
        process.exit(0);
    }
    const input = parseCliArgs();
    if (!input.planPath) {
        const output = {
            status: 'error',
            error: 'No plan path provided',
            additionalContext: 'Usage: import-cli.ts --cwd=<project-root> --plan-path=<bulwark-plan> [--force] [--skip-workpackages]'
        };
        process.stdout.write(JSON.stringify(output) + '\n');
        return;
    }
    const result = await runImportPlanCLI(input);
    process.stdout.write(JSON.stringify(result) + '\n');
}
// Main execution — only run when invoked directly
if (require.main === module) {
    main().catch(error => {
        const output = {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
        process.stdout.write(JSON.stringify(output) + '\n');
        process.exit(1);
    });
}
//# sourceMappingURL=import-cli.js.map