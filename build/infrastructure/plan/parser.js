"use strict";
/**
 * Plan YAML and Markdown Parser
 *
 * Parses master-plan.yaml, master-plan.md, and phase detail files.
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
exports.PlanParseError = void 0;
exports.parseMasterPlanYaml = parseMasterPlanYaml;
exports.parseMasterPlanContent = parseMasterPlanContent;
exports.readMasterPlanMd = readMasterPlanMd;
exports.readPhaseDetail = readPhaseDetail;
exports.extractPlanSummary = extractPlanSummary;
exports.parseStateFile = parseStateFile;
exports.writeStateFile = writeStateFile;
exports.serializeMasterPlan = serializeMasterPlan;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const types_1 = require("./types");
/**
 * Error thrown during parsing
 */
class PlanParseError extends Error {
    constructor(message, file, details) {
        super(message);
        this.file = file;
        this.details = details;
        this.name = 'PlanParseError';
    }
}
exports.PlanParseError = PlanParseError;
// ==============================================================================
// YAML Parsing
// ==============================================================================
/**
 * Parse the master-plan.yaml file
 * @param filePath - Path to master-plan.yaml
 * @returns Parsed master plan or null if file doesn't exist
 * @throws PlanParseError if parsing fails
 */
function parseMasterPlanYaml(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    let content;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    catch (error) {
        throw new PlanParseError(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`, filePath);
    }
    return parseMasterPlanContent(content, filePath);
}
/**
 * Parse master plan YAML content
 * @param content - YAML content string
 * @param sourcePath - Source path for error messages
 * @returns Parsed master plan
 */
function parseMasterPlanContent(content, sourcePath) {
    // Normalize line endings
    const normalizedContent = content.replace(/\r\n/g, '\n');
    let parsed;
    try {
        parsed = yaml.load(normalizedContent, { schema: yaml.JSON_SCHEMA });
    }
    catch (error) {
        throw new PlanParseError(`Invalid YAML: ${error instanceof Error ? error.message : 'Unknown error'}`, sourcePath);
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new PlanParseError('Master plan must be a YAML object', sourcePath);
    }
    const data = parsed;
    // Parse and validate
    const masterPlan = {
        version: validateString(data.version, 'version', sourcePath, '1.0'),
        projectName: validateString(data.projectName, 'projectName', sourcePath, 'Unnamed Project'),
        status: validateString(data.status, 'status', sourcePath, 'active'),
        activePhase: validateString(data.activePhase, 'activePhase', sourcePath, ''),
        activeWorkpackage: validateString(data.activeWorkpackage, 'activeWorkpackage', sourcePath, ''),
        phases: parsePhases(data.phases, sourcePath),
        milestones: parseMilestones(data.milestones, sourcePath)
    };
    return masterPlan;
}
/**
 * Parse phases array
 *
 * Dual-ID Architecture (P1.6):
 * - Parses systemId and position if present in YAML
 * - Auto-generates systemId from legacy display ID if missing (migration support)
 */
function parsePhases(phases, sourcePath) {
    if (!Array.isArray(phases)) {
        return [];
    }
    return phases.map((p, i) => {
        if (!p || typeof p !== 'object') {
            throw new PlanParseError(`Phase ${i} is invalid`, sourcePath);
        }
        const entry = p;
        const id = validateString(entry.id, `phases[${i}].id`, sourcePath);
        // Dual-ID: Parse systemId or auto-generate from legacy ID
        let systemId;
        if (typeof entry.systemId === 'string' && entry.systemId.startsWith('ph-')) {
            systemId = entry.systemId;
        }
        else {
            // Auto-generate from display ID for migration support
            systemId = (0, types_1.generateSystemIdFromLegacy)(id, 'phase');
        }
        // Parse position (1-based index within plan)
        const position = typeof entry.position === 'number'
            ? entry.position
            : i + 1; // Default to array order if not specified
        return {
            id,
            systemId,
            position,
            name: validateString(entry.name, `phases[${i}].name`, sourcePath),
            status: validateEnum(entry.status, ['not_started', 'in_progress', 'complete', 'blocked', 'deferred'], `phases[${i}].status`, sourcePath, 'not_started'),
            progress: typeof entry.progress === 'number' ? entry.progress : undefined,
            workpackages: parseStringArray(entry.workpackages),
            weights: parseWeights(entry.weights),
            dependencies: entry.dependencies
                ? parseStringArray(entry.dependencies)
                : undefined,
            detailFile: entry.detailFile ? String(entry.detailFile) : undefined
        };
    });
}
/**
 * Parse weights object
 */
function parseWeights(weights) {
    if (!weights || typeof weights !== 'object') {
        return {};
    }
    const result = Object.create(null);
    for (const [key, value] of Object.entries(weights)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype')
            continue;
        result[key] = Number(value) || 0;
    }
    return result;
}
/**
 * Parse milestones array
 */
function parseMilestones(milestones, sourcePath) {
    if (!Array.isArray(milestones)) {
        return [];
    }
    return milestones.map((m, i) => {
        if (!m || typeof m !== 'object') {
            throw new PlanParseError(`Milestone ${i} is invalid`, sourcePath);
        }
        const entry = m;
        return {
            id: validateString(entry.id, `milestones[${i}].id`, sourcePath),
            name: validateString(entry.name, `milestones[${i}].name`, sourcePath),
            phase: validateString(entry.phase, `milestones[${i}].phase`, sourcePath),
            type: validateEnum(entry.type, ['major', 'minor', 'gate'], `milestones[${i}].type`, sourcePath, 'major'),
            requires: parseStringArray(entry.requires),
            status: validateEnum(entry.status, ['not_started', 'in_progress', 'complete', 'at_risk'], `milestones[${i}].status`, sourcePath, 'not_started'),
            targetDate: entry.targetDate ? String(entry.targetDate) : undefined,
            completedAt: entry.completedAt ? String(entry.completedAt) : undefined
        };
    });
}
// ==============================================================================
// Markdown Parsing
// ==============================================================================
/**
 * Read the master-plan.md summary file
 * @param filePath - Path to master-plan.md
 * @returns Markdown content or null if file doesn't exist
 */
function readMasterPlanMd(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        return fs.readFileSync(filePath, 'utf-8');
    }
    catch (error) {
        console.error('[plan-parser] readMasterPlanMd failed:', error);
        return null;
    }
}
/**
 * Read a phase detail file
 * @param filePath - Path to phase detail markdown file
 * @returns Markdown content or null if file doesn't exist
 */
function readPhaseDetail(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        return fs.readFileSync(filePath, 'utf-8');
    }
    catch (error) {
        console.error('[plan-parser] readPhaseDetail failed:', error);
        return null;
    }
}
/** Maximum character length for truncated plan summaries */
const MAX_SUMMARY_LENGTH = 500;
/**
 * Extract summary section from master-plan.md
 * Returns the "Current Status" section if found, otherwise first MAX_SUMMARY_LENGTH chars
 * @param content - Full markdown content
 * @returns Summary text
 */
function extractPlanSummary(content) {
    // Try to extract "Current Status" section
    const statusMatch = content.match(/## Current Status\s*\n([\s\S]*?)(?=\n## |\n# |$)/i);
    if (statusMatch) {
        return `## Current Status\n${statusMatch[1].trim()}`;
    }
    // Try to extract first section
    const firstSectionMatch = content.match(/^#[^#].*\n([\s\S]*?)(?=\n## |\n# |$)/);
    if (firstSectionMatch) {
        const text = firstSectionMatch[0].trim();
        if (text.length <= MAX_SUMMARY_LENGTH) {
            return text;
        }
        return text.substring(0, MAX_SUMMARY_LENGTH) + '...';
    }
    // Fallback to first MAX_SUMMARY_LENGTH chars
    if (content.length <= MAX_SUMMARY_LENGTH) {
        return content.trim();
    }
    return content.substring(0, MAX_SUMMARY_LENGTH).trim() + '...';
}
// ==============================================================================
// State File Parsing
// ==============================================================================
/**
 * Parse plan state from JSON file
 * @param filePath - Path to plan.json state file
 * @returns Parsed state or default
 *
 * Dual-ID Architecture (P1.6):
 * - Parses activePhaseSystemId if present
 */
function parseStateFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return (0, types_1.createDefaultPlanState)();
    }
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        return {
            activePlanId: parsed.activePlanId ?? '',
            activePhaseId: parsed.activePhaseId ?? '',
            activePhaseSystemId: parsed.activePhaseSystemId ?? null,
            startedAt: parsed.startedAt ?? new Date().toISOString(),
            lastActivity: parsed.lastActivity ?? new Date().toISOString(),
            phaseProgress: parsed.phaseProgress ?? {},
            milestones: parsed.milestones ?? {},
            multiSignalData: parsed.multiSignalData ?? {
                workpackages: 0,
                commits: 0,
                tests: 0,
                docs: 0,
                integration: 0
            },
            blockers: parsed.blockers ?? [],
            sessionId: parsed.sessionId ?? ''
        };
    }
    catch (error) {
        console.error('[plan-parser] parseStateFile failed:', error);
        return (0, types_1.createDefaultPlanState)();
    }
}
/**
 * Write plan state to JSON file
 * @param filePath - Path to plan.json
 * @param state - State to write
 */
function writeStateFile(filePath, state) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}
/**
 * Serialize a master plan back to YAML
 * @param plan - Master plan
 * @returns YAML string
 */
function serializeMasterPlan(plan) {
    return yaml.dump(plan, {
        indent: 2,
        lineWidth: 100,
        noRefs: true
    });
}
// ==============================================================================
// Validation Helpers
// ==============================================================================
function validateString(value, field, sourcePath, defaultValue) {
    if (typeof value === 'string') {
        return value.trim();
    }
    if (defaultValue !== undefined) {
        return defaultValue;
    }
    throw new PlanParseError(`Missing or invalid field: ${field}`, sourcePath);
}
function validateEnum(value, allowed, field, sourcePath, defaultValue) {
    if (typeof value === 'string' && allowed.includes(value)) {
        return value;
    }
    if (defaultValue !== undefined) {
        return defaultValue;
    }
    throw new PlanParseError(`Invalid ${field}: ${value}. Must be one of: ${allowed.join(', ')}`, sourcePath);
}
function parseStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map(v => String(v));
}
//# sourceMappingURL=parser.js.map