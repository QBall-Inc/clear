"use strict";
/**
 * Bulwark Plan Import Transformer
 *
 * Transforms a Bulwark plan-creation output (plan_v*.md YAML block or standalone YAML)
 * into CLEAR's MasterPlan format + per-workpackage detail for cf-workpackage create.
 *
 * Field mapping (Bulwark → CLEAR):
 *   version        → MasterPlan.version
 *   project_name   → MasterPlan.projectName (snake_case → camelCase)
 *   status         → MasterPlan.status
 *   phases[].id    → Phase.id
 *   phases[].name  → Phase.name
 *   phases[].status → Phase.status (PhaseStatus enum)
 *   phases[].workpackages → Phase.workpackages (object[] → string[] of WP names)
 *   phases[].weights → Phase.weights
 *   phases[].dependencies → Phase.dependencies
 *   milestones[]   → Milestone[] (direct mapping)
 *
 * WP detail (per-workpackage, for cf-workpackage create):
 *   Extracted from plan WP objects or enriched-structure.yaml if present.
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
exports.isBulwarkPlan = isBulwarkPlan;
exports.validateBulwarkPlan = validateBulwarkPlan;
exports.extractYamlFromMarkdown = extractYamlFromMarkdown;
exports.parseBulwarkPlanContent = parseBulwarkPlanContent;
exports.loadBulwarkPlan = loadBulwarkPlan;
exports.loadEnrichedStructure = loadEnrichedStructure;
exports.transformBulwarkPlan = transformBulwarkPlan;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const types_1 = require("../sync/types");
// ==============================================================================
// VALIDATION
// ==============================================================================
/**
 * Validate that parsed YAML is a Bulwark plan (has phases with workpackage objects)
 */
function isBulwarkPlan(data) {
    if (!data || typeof data !== 'object')
        return false;
    const obj = data;
    if (!Array.isArray(obj.phases))
        return false;
    // At least one phase must have workpackages as objects (not strings)
    const phases = obj.phases;
    return phases.some(p => {
        if (!p || typeof p !== 'object')
            return false;
        const phase = p;
        if (!Array.isArray(phase.workpackages))
            return false;
        return phase.workpackages.length === 0 || (typeof phase.workpackages[0] === 'object' &&
            phase.workpackages[0] !== null);
    });
}
/**
 * Validate required fields for a Bulwark plan
 */
function validateBulwarkPlan(plan) {
    const errors = [];
    if (!plan.phases || plan.phases.length === 0) {
        errors.push('Plan must have at least one phase');
    }
    if (plan.phases) {
        for (const phase of plan.phases) {
            if (!phase.id)
                errors.push(`Phase missing id`);
            if (!phase.name)
                errors.push(`Phase ${phase.id ?? '?'} missing name`);
        }
    }
    return errors;
}
// ==============================================================================
// PARSING
// ==============================================================================
/**
 * Extract YAML block from a plan_v*.md file (fenced code block)
 */
function extractYamlFromMarkdown(content) {
    // Match ```yaml ... ``` block
    const match = content.match(/```yaml\s*\n([\s\S]*?)\n```/);
    return match ? match[1] : null;
}
/**
 * Parse a Bulwark plan from YAML content string
 */
function parseBulwarkPlanContent(content) {
    const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid YAML: expected object');
    }
    return parsed;
}
/**
 * Load a Bulwark plan from a file path.
 * Supports both .yaml files and .md files (extracts YAML block).
 */
function loadBulwarkPlan(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Plan file not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
    const ext = path.extname(filePath).toLowerCase();
    let yamlContent;
    if (ext === '.md') {
        const extracted = extractYamlFromMarkdown(content);
        if (!extracted) {
            throw new Error(`No YAML block found in markdown file: ${filePath}`);
        }
        yamlContent = extracted;
    }
    else {
        yamlContent = content;
    }
    return parseBulwarkPlanContent(yamlContent);
}
/**
 * Try to load enriched-structure.yaml from a plan directory
 * (output of Bulwark plan-to-tasks synthesizer)
 */
function loadEnrichedStructure(planDir) {
    // Check common locations
    const candidates = [
        path.join(planDir, 'enriched-structure.yaml'),
        path.join(planDir, 'enriched-structure.yml')
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            try {
                const content = fs.readFileSync(candidate, 'utf-8').replace(/\r\n/g, '\n');
                const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
                return extractWorkpackageDetails(parsed);
            }
            catch {
                // Fall through to plan-level extraction
            }
        }
    }
    return null;
}
/**
 * Extract workpackage details from enriched-structure.yaml
 */
function extractWorkpackageDetails(data) {
    const details = [];
    const enriched = data.enriched_structure;
    const phases = (enriched?.phases ?? data.phases);
    if (!Array.isArray(phases))
        return details;
    for (const phase of phases) {
        if (!phase || typeof phase !== 'object')
            continue;
        const p = phase;
        const wps = p.workpackages;
        if (!Array.isArray(wps))
            continue;
        for (const wp of wps) {
            if (!wp || typeof wp !== 'object')
                continue;
            const w = wp;
            details.push({
                id: String(w.id ?? ''),
                name: String(w.name ?? ''),
                acceptance_criteria: Array.isArray(w.acceptance_criteria) ? w.acceptance_criteria.map(String) : undefined,
                deliverables: Array.isArray(w.deliverables) ? w.deliverables.map(String) : undefined,
                verification: Array.isArray(w.verification) ? w.verification.map(String) : undefined,
                notes: Array.isArray(w.notes) ? w.notes.map(String) : undefined,
                estimated_sessions: typeof w.estimated_sessions === 'number' ? w.estimated_sessions : undefined
            });
        }
    }
    return details;
}
// ==============================================================================
// TRANSFORMATION
// ==============================================================================
/** Map Bulwark status strings to CLEAR PhaseStatus */
function mapPhaseStatus(status) {
    const map = {
        'not_started': 'not_started',
        'in_progress': 'in_progress',
        'completed': 'complete',
        'complete': 'complete',
        'blocked': 'blocked',
        'deferred': 'deferred'
    };
    return map[status ?? ''] ?? 'not_started';
}
/** Map Bulwark milestone status to CLEAR MilestoneStatus */
function mapMilestoneStatus(status) {
    const map = {
        'not_started': 'not_started',
        'in_progress': 'in_progress',
        'completed': 'complete',
        'complete': 'complete',
        'at_risk': 'at_risk'
    };
    return map[status ?? ''] ?? 'not_started';
}
/** Map Bulwark milestone type to CLEAR MilestoneType */
function mapMilestoneType(type) {
    if (type === 'minor')
        return 'minor';
    if (type === 'gate')
        return 'gate';
    return 'major';
}
/**
 * Transform a Bulwark plan into CLEAR's MasterPlan + workpackage details.
 *
 * @param bulwarkPlan - Parsed Bulwark plan
 * @param enrichedDetails - Optional enriched WP details from plan-to-tasks
 * @returns ImportTransformResult with MasterPlan and per-WP details
 */
function transformBulwarkPlan(bulwarkPlan, enrichedDetails) {
    // Build enriched lookup by WP ID
    const enrichedMap = new Map();
    if (enrichedDetails) {
        for (const detail of enrichedDetails) {
            enrichedMap.set(detail.id, detail);
        }
    }
    const clearPhases = [];
    const workpackageDetails = [];
    for (let i = 0; i < (bulwarkPlan.phases?.length ?? 0); i++) {
        const bPhase = bulwarkPlan.phases[i];
        const phaseSystemId = (0, types_1.generatePhaseSystemId)();
        // Extract WP names for Phase.workpackages (string[])
        const wpNames = (bPhase.workpackages ?? []).map(wp => wp.name);
        // Build weights from WP names (equal weight if not specified)
        const weights = {};
        if (bPhase.weights) {
            Object.assign(weights, bPhase.weights);
        }
        else if (bPhase.workpackages && bPhase.workpackages.length > 0) {
            const equalWeight = 1 / bPhase.workpackages.length;
            for (const wp of bPhase.workpackages) {
                weights[wp.name] = equalWeight;
            }
        }
        clearPhases.push({
            id: bPhase.id,
            systemId: phaseSystemId,
            position: i + 1,
            name: bPhase.name,
            status: mapPhaseStatus(bPhase.status),
            workpackages: wpNames,
            weights,
            dependencies: bPhase.dependencies
        });
        // Build per-WP detail
        for (const bWp of bPhase.workpackages ?? []) {
            const enriched = enrichedMap.get(bWp.id);
            workpackageDetails.push({
                title: bWp.name,
                phaseId: bPhase.id,
                phaseSystemId,
                description: bWp.description ?? '',
                acceptance_criteria: enriched?.acceptance_criteria ?? [],
                verification: enriched?.verification ?? [],
                notes: buildNotes(bWp, enriched),
                deliverables_text: enriched?.deliverables ?? [],
                estimated_sessions: enriched?.estimated_sessions ?? bWp.estimated_sessions ?? 1,
                confidence: bWp.confidence ?? 'medium',
                dependencies: bWp.dependencies ?? []
            });
        }
    }
    // Transform milestones
    const clearMilestones = (bulwarkPlan.milestones ?? []).map(bm => ({
        id: bm.id,
        name: bm.name,
        phase: bm.phase,
        type: mapMilestoneType(bm.type),
        requires: bm.requires ?? [],
        status: mapMilestoneStatus(bm.status)
    }));
    const masterPlan = {
        version: bulwarkPlan.version ?? '1.0',
        projectName: bulwarkPlan.project_name ?? 'Imported Plan',
        status: bulwarkPlan.status ?? 'not_started',
        activePhase: '',
        activeWorkpackage: '',
        phases: clearPhases,
        milestones: clearMilestones
    };
    return { masterPlan, workpackageDetails };
}
/**
 * Build notes array from plan WP + enriched data
 */
function buildNotes(bWp, enriched) {
    const notes = [];
    if (enriched?.notes) {
        notes.push(...enriched.notes);
    }
    if (bWp.note) {
        notes.push(bWp.note);
    }
    if (bWp.confidence) {
        notes.push(`Confidence: ${bWp.confidence}`);
    }
    return notes;
}
//# sourceMappingURL=import-transformer.js.map