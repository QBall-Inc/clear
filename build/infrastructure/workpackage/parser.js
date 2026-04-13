"use strict";
/**
 * Workpackage YAML Parser
 *
 * Parses workpackage definition files and registry files.
 * Updated Session 33 with Dual-ID Architecture support (P1.6).
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
exports.WorkpackageParseError = void 0;
exports.parseWorkpackageFile = parseWorkpackageFile;
exports.parseWorkpackageContent = parseWorkpackageContent;
exports.parseRegistryFile = parseRegistryFile;
exports.parseStateFile = parseStateFile;
exports.writeStateFile = writeStateFile;
exports.serializeWorkpackage = serializeWorkpackage;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const types_1 = require("./types");
const types_2 = require("../sync/types");
/**
 * Error thrown during parsing
 */
class WorkpackageParseError extends Error {
    constructor(message, file, details) {
        super(message);
        this.file = file;
        this.details = details;
        this.name = 'WorkpackageParseError';
    }
}
exports.WorkpackageParseError = WorkpackageParseError;
/**
 * Parse a workpackage definition file
 * @param filePath - Path to the workpackage YAML file
 * @returns Parsed workpackage entry
 * @throws WorkpackageParseError if parsing fails
 */
function parseWorkpackageFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new WorkpackageParseError('Workpackage file not found', filePath);
    }
    let content;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    catch (error) {
        throw new WorkpackageParseError(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`, filePath);
    }
    return parseWorkpackageContent(content, filePath);
}
/**
 * Parse workpackage YAML content
 * @param content - YAML content string
 * @param sourcePath - Source path for error messages
 * @returns Parsed workpackage entry
 */
function parseWorkpackageContent(content, sourcePath) {
    // Normalize line endings
    const normalizedContent = content.replace(/\r\n/g, '\n');
    let parsed;
    try {
        parsed = yaml.load(normalizedContent, { schema: yaml.JSON_SCHEMA });
    }
    catch (error) {
        throw new WorkpackageParseError(`Invalid YAML: ${error instanceof Error ? error.message : 'Unknown error'}`, sourcePath);
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new WorkpackageParseError('Workpackage must be a YAML object', sourcePath);
    }
    const data = parsed;
    // Extract the display ID
    const displayId = validateString(data.id, 'id', sourcePath);
    // Validate and extract required fields
    const entry = {
        id: displayId,
        // Dual-ID fields (P1.6): parse if present, generate systemId if missing
        systemId: data.systemId
            ? validateOptionalString(data.systemId)
            : (0, types_2.generateSystemIdFromLegacy)(displayId, 'workpackage'),
        position: data.position !== undefined ? validateOptionalNumber(data.position) : undefined,
        phase: data.phase ? validateOptionalString(data.phase) : undefined,
        title: validateString(data.title, 'title', sourcePath),
        status: validateEnumLenient(data.status, ['not_started', 'in_progress', 'paused', 'complete', 'blocked', 'deferred', 'archived'], 'status', 'not_started'),
        type: data.type
            ? validateEnum(data.type, ['feature', 'bugfix', 'refactor', 'documentation', 'infrastructure'], 'type', sourcePath)
            : 'feature',
        priority: data.priority
            ? validateEnum(data.priority, ['critical', 'high', 'medium', 'low'], 'priority', sourcePath)
            : 'medium',
        description: data.description
            ? validateString(data.description, 'description', sourcePath)
            : (data.title ? String(data.title) : ''),
        scope: parseScope(data.scope),
        dependencies: parseDependencies(data.dependencies),
        deliverables: parseDeliverables(data.deliverables, sourcePath),
        acceptance_criteria: validateStringArray(data.acceptance_criteria, 'acceptance_criteria', sourcePath),
        verification: Array.isArray(data.verification)
            ? data.verification.map(String)
            : undefined,
        notes: Array.isArray(data.notes)
            ? data.notes.map(String)
            : undefined,
        knowledge_required: data.knowledge_required
            ? validateStringArray(data.knowledge_required, 'knowledge_required', sourcePath)
            : undefined
    };
    return entry;
}
/**
 * Parse the registry YAML file
 * @param filePath - Path to registry.yaml
 * @returns Parsed registry
 */
function parseRegistryFile(filePath) {
    if (!fs.existsSync(filePath)) {
        // Return empty registry if file doesn't exist
        return { workpackages: [] };
    }
    let content;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    catch (error) {
        throw new WorkpackageParseError(`Failed to read registry: ${error instanceof Error ? error.message : 'Unknown error'}`, filePath);
    }
    // Normalize line endings
    const normalizedContent = content.replace(/\r\n/g, '\n');
    let parsed;
    try {
        parsed = yaml.load(normalizedContent, { schema: yaml.JSON_SCHEMA });
    }
    catch (error) {
        throw new WorkpackageParseError(`Invalid registry YAML: ${error instanceof Error ? error.message : 'Unknown error'}`, filePath);
    }
    if (!parsed || typeof parsed !== 'object') {
        return { workpackages: [] };
    }
    const data = parsed;
    const workpackages = [];
    if (Array.isArray(data.workpackages)) {
        for (const wp of data.workpackages) {
            if (wp && typeof wp === 'object') {
                const entry = wp;
                const displayId = String(entry.id || '');
                workpackages.push({
                    id: displayId,
                    // Dual-ID fields (P1.6): parse if present, generate systemId if missing
                    systemId: entry.systemId
                        ? String(entry.systemId)
                        : (0, types_2.generateSystemIdFromLegacy)(displayId, 'workpackage'),
                    position: typeof entry.position === 'number' ? entry.position : undefined,
                    phase: entry.phase ? String(entry.phase) : undefined,
                    title: String(entry.title || entry.name || ''),
                    status: entry.status || 'not_started',
                    file: String(entry.file || ''),
                    blocked_by: Array.isArray(entry.blocked_by)
                        ? entry.blocked_by.map(String)
                        : undefined,
                    // P2.7 Lifecycle fields
                    progress: typeof entry.progress === 'number' ? entry.progress : undefined,
                    startedAt: entry.startedAt ? String(entry.startedAt) : undefined,
                    completedAt: entry.completedAt ? String(entry.completedAt) : undefined,
                    archivedAt: entry.archivedAt ? String(entry.archivedAt) : undefined,
                    linkedKnowledge: Array.isArray(entry.linkedKnowledge)
                        ? entry.linkedKnowledge.map(String)
                        : undefined
                });
            }
        }
    }
    return { workpackages };
}
/**
 * Parse workpackage state from JSON file
 * @param filePath - Path to workpackage.json state file
 * @returns Parsed state or default
 */
function parseStateFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return (0, types_1.createDefaultWorkpackageState)();
    }
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        return {
            activeWorkpackage: parsed.activeWorkpackage ?? null,
            // Dual-ID fields (P1.6)
            activeWorkpackageSystemId: parsed.activeWorkpackageSystemId ?? null,
            activePhaseSystemId: parsed.activePhaseSystemId ?? null,
            startedAt: parsed.startedAt ?? null,
            lastActivity: parsed.lastActivity ?? new Date().toISOString(),
            progress: parsed.progress ?? 0,
            deliverables: parsed.deliverables ?? Object.create(null),
            scopeWarnings: parsed.scopeWarnings ?? [],
            sessionId: parsed.sessionId ?? ''
        };
    }
    catch {
        return (0, types_1.createDefaultWorkpackageState)();
    }
}
/**
 * Write workpackage state to JSON file
 * @param filePath - Path to workpackage.json
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
 * Serialize a workpackage entry back to YAML
 * @param entry - Workpackage entry
 * @returns YAML string
 */
function serializeWorkpackage(entry) {
    return yaml.dump(entry, {
        indent: 2,
        lineWidth: 100,
        noRefs: true
    });
}
// ==============================================================================
// Validation Helpers
// ==============================================================================
function validateString(value, field, sourcePath) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new WorkpackageParseError(`Missing or invalid field: ${field}`, sourcePath);
    }
    return value.trim();
}
function validateEnum(value, allowed, field, sourcePath) {
    if (typeof value !== 'string' || !allowed.includes(value)) {
        throw new WorkpackageParseError(`Invalid ${field}: ${value}. Must be one of: ${allowed.join(', ')}`, sourcePath);
    }
    return value;
}
/**
 * Lenient enum validation — normalizes input before matching.
 * Handles mixed case ("Not Started" → "not_started") and spaces vs underscores.
 * Returns defaultValue if input is missing or unrecognized.
 */
function validateEnumLenient(value, allowed, _field, defaultValue) {
    if (typeof value !== 'string' || value.trim() === '') {
        return defaultValue;
    }
    const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
    if (allowed.includes(normalized)) {
        return normalized;
    }
    return defaultValue;
}
function validateStringArray(value, field, sourcePath) {
    if (!Array.isArray(value)) {
        throw new WorkpackageParseError(`Field ${field} must be an array`, sourcePath);
    }
    return value.map(v => String(v));
}
/**
 * Validate optional string field (P1.6 dual-ID support)
 */
function validateOptionalString(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== 'string') {
        return String(value);
    }
    return value.trim() || undefined;
}
/**
 * Validate optional number field (P1.6 dual-ID support)
 */
function validateOptionalNumber(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    const num = Number(value);
    if (isNaN(num)) {
        return undefined;
    }
    return num;
}
function parseScope(scope) {
    if (!scope || typeof scope !== 'object') {
        return { in_scope: [], out_of_scope: [] };
    }
    const s = scope;
    return {
        in_scope: Array.isArray(s.in_scope) ? s.in_scope.map(String) : [],
        out_of_scope: Array.isArray(s.out_of_scope) ? s.out_of_scope.map(String) : []
    };
}
function parseDependencies(deps) {
    if (!deps || typeof deps !== 'object') {
        return { upstream: [] };
    }
    const d = deps;
    const upstream = [];
    if (Array.isArray(d.upstream)) {
        for (const dep of d.upstream) {
            if (dep && typeof dep === 'object') {
                const entry = dep;
                upstream.push({
                    id: String(entry.id || ''),
                    type: entry.type || 'hard',
                    deliverables_needed: Array.isArray(entry.deliverables_needed)
                        ? entry.deliverables_needed.map(String)
                        : undefined,
                    description: entry.description ? String(entry.description) : undefined
                });
            }
        }
    }
    return { upstream };
}
function parseDeliverables(deliverables, sourcePath) {
    if (!Array.isArray(deliverables)) {
        throw new WorkpackageParseError('Deliverables must be an array', sourcePath);
    }
    return deliverables.map((d, i) => {
        // String deliverables: auto-wrap into structured object (Tolerant Reader)
        if (typeof d === 'string') {
            return {
                id: `deliverable-${i}`,
                pattern: '',
                weight: 0,
                status: 'not_started',
                description: d
            };
        }
        if (!d || typeof d !== 'object') {
            throw new WorkpackageParseError(`Deliverable ${i} is invalid`, sourcePath);
        }
        const entry = d;
        return {
            id: String(entry.id || `deliverable-${i}`),
            pattern: String(entry.pattern || ''),
            weight: Number(entry.weight) || 0,
            status: entry.status || 'not_started',
            description: entry.description ? String(entry.description) : undefined,
            completedAt: entry.completedAt ? String(entry.completedAt) : undefined
        };
    });
}
//# sourceMappingURL=parser.js.map