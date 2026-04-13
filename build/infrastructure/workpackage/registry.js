"use strict";
/**
 * Workpackage Registry
 *
 * Manages workpackage loading, dependency resolution, and progress tracking.
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
exports.WorkpackageRegistryManager = exports.WorkpackageRegistryError = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const parser_1 = require("./parser");
const types_1 = require("../sync/types");
/**
 * Error thrown during registry operations
 */
class WorkpackageRegistryError extends Error {
    constructor(message, workpackageId, details) {
        super(message);
        this.workpackageId = workpackageId;
        this.details = details;
        this.name = 'WorkpackageRegistryError';
    }
}
exports.WorkpackageRegistryError = WorkpackageRegistryError;
/**
 * Workpackage Registry Manager
 *
 * Dual-ID Architecture (P1.6): Supports both legacy display IDs and systemIds.
 * - Use getWorkpackage() for legacy id lookup (backward compatible)
 * - Use getWorkpackageBySystemId() for systemId lookup (preferred)
 * - Use resolveWorkpackage() to auto-detect ID type
 */
class WorkpackageRegistryManager {
    constructor(clearDir) {
        this.registry = null;
        /** Cache by legacy display ID */
        this.workpackageCache = new Map();
        /** Cache by systemId (P1.6) */
        this.systemIdCache = new Map();
        /** Map systemId → displayId for quick lookup */
        this.systemIdToDisplayId = new Map();
        this.clearDir = clearDir;
    }
    // ===========================================================================
    // Registry Loading
    // ===========================================================================
    /**
     * Get path to registry file
     */
    get registryPath() {
        return path.join(this.clearDir, 'workpackages', 'registry.yaml');
    }
    /**
     * Get path to state file
     */
    get statePath() {
        return path.join(this.clearDir, 'state', 'workpackage.json');
    }
    /**
     * Load the registry
     */
    loadRegistry() {
        if (!this.registry) {
            this.registry = (0, parser_1.parseRegistryFile)(this.registryPath);
        }
        return this.registry;
    }
    /**
     * Get all workpackages from registry
     */
    getAllWorkpackages() {
        return this.loadRegistry().workpackages;
    }
    /**
     * Get a workpackage by legacy display ID (loads full definition)
     * @param id - Legacy display ID (e.g., "P1.4")
     * @returns Workpackage entry or null
     */
    getWorkpackage(id) {
        // Check cache first
        if (this.workpackageCache.has(id)) {
            return this.workpackageCache.get(id);
        }
        // Find in registry
        const registry = this.loadRegistry();
        const entry = registry.workpackages.find(wp => wp.id === id);
        if (!entry) {
            return null;
        }
        // Load full definition — fall back to <id>.yaml if file field missing
        const fileName = entry.file || `${entry.id}.yaml`;
        const filePath = path.join(this.clearDir, 'workpackages', fileName);
        try {
            const workpackage = (0, parser_1.parseWorkpackageFile)(filePath);
            this.workpackageCache.set(id, workpackage);
            // Also cache by systemId if available (P1.6)
            if (workpackage.systemId) {
                this.systemIdCache.set(workpackage.systemId, workpackage);
                this.systemIdToDisplayId.set(workpackage.systemId, workpackage.id);
            }
            return workpackage;
        }
        catch (error) {
            // Re-throw parse errors (schema/content issues) — callers must handle them.
            // Only swallow file-not-found or unexpected IO errors as null.
            if (error instanceof parser_1.WorkpackageParseError && !error.message.includes('file not found')) {
                throw error;
            }
            console.error(`Failed to load workpackage ${id}:`, error);
            return null;
        }
    }
    /**
     * Get a workpackage by systemId (P1.6 Dual-ID Architecture)
     * @param systemId - System ID (e.g., "wp-a1b2c3d4")
     * @returns Workpackage entry or null
     */
    getWorkpackageBySystemId(systemId) {
        // Check systemId cache first
        if (this.systemIdCache.has(systemId)) {
            return this.systemIdCache.get(systemId);
        }
        // Find in registry by systemId
        const registry = this.loadRegistry();
        const entry = registry.workpackages.find(wp => wp.systemId === systemId);
        if (!entry) {
            return null;
        }
        // Load via display ID (which will cache by both IDs)
        return this.getWorkpackage(entry.id);
    }
    /**
     * Resolve a workpackage by either systemId or legacy display ID
     * Automatically detects which type of ID was provided
     * @param id - Either systemId (wp-*) or legacy display ID (P1.4)
     * @returns Workpackage entry or null
     */
    resolveWorkpackage(id) {
        if ((0, types_1.isWorkpackageSystemId)(id)) {
            return this.getWorkpackageBySystemId(id);
        }
        return this.getWorkpackage(id);
    }
    /**
     * Get the display ID for a systemId
     * @param systemId - System ID (e.g., "wp-a1b2c3d4")
     * @returns Display ID (e.g., "P1.4") or null if not found
     */
    getDisplayIdForSystemId(systemId) {
        // Check cache first
        if (this.systemIdToDisplayId.has(systemId)) {
            return this.systemIdToDisplayId.get(systemId);
        }
        // Try to load the workpackage
        const workpackage = this.getWorkpackageBySystemId(systemId);
        return workpackage?.id ?? null;
    }
    /**
     * Get the systemId for a display ID
     * @param displayId - Display ID (e.g., "P1.4")
     * @returns System ID or null if not found/not migrated
     */
    getSystemIdForDisplayId(displayId) {
        const workpackage = this.getWorkpackage(displayId);
        return workpackage?.systemId ?? null;
    }
    /**
     * Get workpackage status from registry
     */
    getWorkpackageStatus(id) {
        const registry = this.loadRegistry();
        const entry = registry.workpackages.find(wp => wp.id === id);
        return entry?.status ?? null;
    }
    // ===========================================================================
    // State Management
    // ===========================================================================
    /**
     * Load current state
     */
    loadState() {
        return (0, parser_1.parseStateFile)(this.statePath);
    }
    /**
     * Save state
     */
    saveState(state) {
        (0, parser_1.writeStateFile)(this.statePath, state);
    }
    /**
     * Get active workpackage ID
     */
    getActiveWorkpackageId() {
        return this.loadState().activeWorkpackage;
    }
    /**
     * Get active workpackage (full definition)
     */
    getActiveWorkpackage() {
        const id = this.getActiveWorkpackageId();
        if (!id)
            return null;
        return this.getWorkpackage(id);
    }
    /**
     * Set active workpackage
     * @param id - Either systemId (wp-*) or legacy display ID (P1.4)
     * @param sessionId - Current session ID
     * @returns Updated workpackage state
     */
    setActiveWorkpackage(id, sessionId) {
        // Support both systemId and display ID
        const workpackage = this.resolveWorkpackage(id);
        if (!workpackage) {
            throw new WorkpackageRegistryError('Workpackage not found', id);
        }
        const now = new Date().toISOString();
        const state = {
            activeWorkpackage: workpackage.id, // Always store display ID for backward compat
            activeWorkpackageSystemId: workpackage.systemId ?? null, // Store systemId if available (P1.6)
            activePhaseSystemId: workpackage.phase ?? null, // Store phase systemId if available (P1.6)
            startedAt: now,
            lastActivity: now,
            progress: 0,
            deliverables: {},
            scopeWarnings: [],
            sessionId
        };
        // Initialize deliverable states
        for (const deliverable of workpackage.deliverables) {
            state.deliverables[deliverable.id] = {
                status: deliverable.status
            };
        }
        this.saveState(state);
        return state;
    }
    // ===========================================================================
    // Dependency Resolution
    // ===========================================================================
    /**
     * Validate dependencies for a workpackage
     * @param id - Workpackage ID
     * @returns Validation result
     */
    validateDependencies(id) {
        const workpackage = this.getWorkpackage(id);
        if (!workpackage) {
            return {
                valid: false,
                blockedBy: [],
                softBlocked: [],
                missingDeliverables: {}
            };
        }
        const blockedBy = [];
        const softBlocked = [];
        const missingDeliverables = {};
        for (const dep of workpackage.dependencies.upstream) {
            const status = this.getWorkpackageStatus(dep.id);
            // Archived workpackages are considered "done" (soft-deleted) and don't block
            if (status !== 'complete' && status !== 'archived') {
                if (dep.type === 'hard') {
                    blockedBy.push(dep.id);
                }
                else {
                    softBlocked.push(dep.id);
                }
            }
            // Check specific deliverables if required
            if (dep.deliverables_needed && dep.deliverables_needed.length > 0) {
                const depWorkpackage = this.getWorkpackage(dep.id);
                if (depWorkpackage) {
                    const missing = [];
                    for (const deliverableId of dep.deliverables_needed) {
                        const deliverable = depWorkpackage.deliverables.find(d => d.id === deliverableId);
                        if (!deliverable || deliverable.status !== 'complete') {
                            missing.push(deliverableId);
                        }
                    }
                    if (missing.length > 0) {
                        missingDeliverables[dep.id] = missing;
                        if (dep.type === 'hard' && !blockedBy.includes(dep.id)) {
                            blockedBy.push(dep.id);
                        }
                    }
                }
            }
        }
        return {
            valid: blockedBy.length === 0,
            blockedBy,
            softBlocked,
            missingDeliverables
        };
    }
    /**
     * Detect circular dependencies using DFS
     * @param id - Starting workpackage ID
     * @returns Detection result with cycle path if found
     */
    detectCircularDependencies(id) {
        const visited = new Set();
        const recursionStack = new Set();
        const path = [];
        const dfs = (currentId) => {
            visited.add(currentId);
            recursionStack.add(currentId);
            path.push(currentId);
            const workpackage = this.getWorkpackage(currentId);
            if (workpackage) {
                for (const dep of workpackage.dependencies.upstream) {
                    if (!visited.has(dep.id)) {
                        const cycle = dfs(dep.id);
                        if (cycle)
                            return cycle;
                    }
                    else if (recursionStack.has(dep.id)) {
                        // Found cycle - return the cycle path
                        const cycleStart = path.indexOf(dep.id);
                        return [...path.slice(cycleStart), dep.id];
                    }
                }
            }
            path.pop();
            recursionStack.delete(currentId);
            return null;
        };
        const cycle = dfs(id);
        return {
            hasCircular: cycle !== null,
            cycle: cycle || []
        };
    }
    /**
     * Get workpackages that are ready to start (not blocked)
     */
    getUnblockedWorkpackages() {
        const registry = this.loadRegistry();
        const unblocked = [];
        for (const entry of registry.workpackages) {
            if (entry.status === 'complete')
                continue;
            if (entry.status === 'blocked')
                continue;
            const validation = this.validateDependencies(entry.id);
            if (validation.valid) {
                unblocked.push(entry);
            }
        }
        return unblocked;
    }
    /**
     * Get alternative workpackages when blocked
     */
    getAlternatives(blockedId) {
        const unblocked = this.getUnblockedWorkpackages();
        return unblocked
            .filter(wp => wp.id !== blockedId)
            .map(wp => wp.id);
    }
    /**
     * Resolve dependencies in topological order
     * @param id - Workpackage ID
     * @returns Ordered list of dependency IDs (dependencies first)
     */
    resolveDependencyOrder(id) {
        const result = [];
        const visited = new Set();
        const visit = (currentId) => {
            if (visited.has(currentId))
                return;
            visited.add(currentId);
            const workpackage = this.getWorkpackage(currentId);
            if (workpackage) {
                for (const dep of workpackage.dependencies.upstream) {
                    visit(dep.id);
                }
            }
            result.push(currentId);
        };
        visit(id);
        return result;
    }
    calculateProgress(id) {
        const workpackage = this.getWorkpackage(id);
        if (!workpackage) {
            return {
                progress: 0,
                completedDeliverables: [],
                pendingDeliverables: [],
                totalWeight: 0,
                completedWeight: 0
            };
        }
        const state = this.loadState();
        const deliverableStates = state.deliverables || {};
        let totalWeight = 0;
        let completedWeight = 0;
        const completedDeliverables = [];
        const pendingDeliverables = [];
        // Check if all weights are zero (legacy WPs created before R6.1)
        const allWeightsZero = workpackage.deliverables.every(d => d.weight === 0);
        const effectiveWeight = (w) => allWeightsZero ? 1 : w;
        for (const deliverable of workpackage.deliverables) {
            const weight = effectiveWeight(deliverable.weight);
            totalWeight += weight;
            const deliverableState = deliverableStates[deliverable.id];
            const status = deliverableState?.status ?? deliverable.status;
            if (status === 'complete') {
                completedWeight += weight;
                completedDeliverables.push(deliverable.id);
            }
            else if (status === 'in_progress') {
                completedWeight += weight * WorkpackageRegistryManager.IN_PROGRESS_WEIGHT_FACTOR;
                pendingDeliverables.push(deliverable.id);
            }
            else {
                pendingDeliverables.push(deliverable.id);
            }
        }
        const progress = totalWeight > 0 ? completedWeight / totalWeight : 0;
        return {
            progress,
            completedDeliverables,
            pendingDeliverables,
            totalWeight,
            completedWeight
        };
    }
    /**
     * Update a deliverable's status and recalculate progress.
     * Saves state twice: once to persist the status change, once with recalculated progress.
     * @param deliverableId - Deliverable ID
     * @param newState - New deliverable state to set
     * @returns Updated progress (0-1 scale)
     */
    updateDeliverableAndRecalculate(deliverableId, newState) {
        const state = this.loadState();
        if (!state.activeWorkpackage) {
            throw new WorkpackageRegistryError('No active workpackage');
        }
        state.deliverables[deliverableId] = newState;
        state.lastActivity = new Date().toISOString();
        // Save state FIRST so calculateProgress reads the updated values
        this.saveState(state);
        const progressResult = this.calculateProgress(state.activeWorkpackage);
        state.progress = progressResult.progress;
        this.saveState(state);
        return progressResult.progress;
    }
    /**
     * Mark a deliverable as in_progress (auto-triggered by PostToolUse hook on first file write).
     * No-op if already in_progress or complete.
     * @param deliverableId - Deliverable ID
     * @returns Updated progress (0-1 scale)
     */
    markDeliverableInProgress(deliverableId) {
        const state = this.loadState();
        if (!state.activeWorkpackage) {
            throw new WorkpackageRegistryError('No active workpackage');
        }
        const existing = state.deliverables[deliverableId];
        if (existing?.status === 'in_progress' || existing?.status === 'complete') {
            const progressResult = this.calculateProgress(state.activeWorkpackage);
            return progressResult.progress;
        }
        return this.updateDeliverableAndRecalculate(deliverableId, { status: 'in_progress' });
    }
    /**
     * Mark a deliverable as complete
     * @param deliverableId - Deliverable ID
     * @returns Updated progress (0-1 scale)
     */
    markDeliverableComplete(deliverableId) {
        return this.updateDeliverableAndRecalculate(deliverableId, {
            status: 'complete',
            completedAt: new Date().toISOString()
        });
    }
    // ===========================================================================
    // Scope Validation
    // ===========================================================================
    /**
     * Validate if a file is within workpackage scope
     * @param filePath - File path to check
     * @returns Scope validation result
     */
    validateScope(filePath) {
        const workpackage = this.getActiveWorkpackage();
        if (!workpackage) {
            return { valid: true, warnings: [], outOfScopeFiles: [] };
        }
        const normalizedPath = filePath.replace(/\\/g, '/');
        const warnings = [];
        const outOfScopeFiles = [];
        // Check if file matches out_of_scope patterns
        for (const pattern of workpackage.scope.out_of_scope) {
            if (this.matchesPattern(normalizedPath, pattern)) {
                outOfScopeFiles.push(filePath);
                warnings.push(`File ${filePath} is explicitly out of scope (matches: ${pattern})`);
            }
        }
        // Check if file matches in_scope patterns
        let matchesInScope = false;
        for (const pattern of workpackage.scope.in_scope) {
            if (this.matchesPattern(normalizedPath, pattern)) {
                matchesInScope = true;
                break;
            }
        }
        if (!matchesInScope && workpackage.scope.in_scope.length > 0) {
            outOfScopeFiles.push(filePath);
            warnings.push(`File ${filePath} does not match any in_scope patterns`);
        }
        // Try to find which workpackage this file belongs to
        let suggestedWorkpackage;
        if (outOfScopeFiles.length > 0) {
            for (const entry of this.getAllWorkpackages()) {
                const wp = this.getWorkpackage(entry.id);
                if (wp && wp.id !== workpackage.id) {
                    for (const pattern of wp.scope.in_scope) {
                        if (this.matchesPattern(normalizedPath, pattern)) {
                            suggestedWorkpackage = wp.id;
                            break;
                        }
                    }
                }
                if (suggestedWorkpackage)
                    break;
            }
        }
        return {
            valid: outOfScopeFiles.length === 0,
            warnings,
            outOfScopeFiles,
            suggestedWorkpackage
        };
    }
    /**
     * Match a file path against a glob-like pattern
     */
    matchesPattern(filePath, pattern) {
        // Convert glob pattern to regex
        // **/ matches any directory depth
        // * matches any characters except /
        const regexPattern = pattern
            .replace(/\*\*/g, '{{DOUBLE_STAR}}')
            .replace(/\*/g, '[^/]*')
            .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')
            .replace(/\//g, '\\/');
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(filePath);
    }
    /**
     * Match a file against deliverable patterns
     * @param filePath - File path to check
     * @returns Matching deliverable ID or null
     */
    matchFileToDeliverable(filePath) {
        const workpackage = this.getActiveWorkpackage();
        if (!workpackage)
            return null;
        const normalizedPath = filePath.replace(/\\/g, '/');
        for (const deliverable of workpackage.deliverables) {
            // Primary: match against explicit glob pattern
            if (deliverable.pattern && this.matchesPattern(normalizedPath, deliverable.pattern)) {
                return deliverable.id;
            }
            // Fallback: extract path from description (e.g., "src/foo/bar.ts — description")
            if (!deliverable.pattern) {
                const descPath = this.extractPathFromDescription(deliverable.description);
                if (descPath && normalizedPath.endsWith(descPath)) {
                    return deliverable.id;
                }
            }
        }
        return null;
    }
    /**
     * Extract a file path hint from a deliverable description.
     * Convention: description starts with a file path followed by ' — ', ' - ', or end of string.
     * @param description - Deliverable description text
     * @returns Extracted path or null
     */
    extractPathFromDescription(description) {
        if (!description)
            return null;
        const match = description.match(/^([\w./@-]+\.\w+)(?:\s[—-]\s|$)/);
        return match ? match[1] : null;
    }
    // ===========================================================================
    // Registry Mutation
    // ===========================================================================
    /**
     * Update a workpackage's status in registry.yaml on disk.
     * Reads the registry file, updates the matching entry's status, and writes back.
     *
     * @param id - Workpackage display ID or systemId
     * @param newStatus - New status to set
     * @throws WorkpackageRegistryError if workpackage not found in registry file
     */
    updateRegistryEntryStatus(id, newStatus) {
        const registryPath = this.registryPath;
        const content = fs.readFileSync(registryPath, 'utf-8');
        const registry = yaml.load(content, { schema: yaml.JSON_SCHEMA });
        const entry = registry.workpackages.find(wp => wp.id === id || wp.systemId === id);
        if (!entry) {
            throw new WorkpackageRegistryError('Workpackage not found in registry', id);
        }
        entry.status = newStatus;
        fs.writeFileSync(registryPath, yaml.dump(registry), 'utf-8');
        // Invalidate cached registry so next load picks up the change
        this.registry = null;
    }
    // ===========================================================================
    // Cache Management
    // ===========================================================================
    /**
     * Clear all caches
     */
    clearCache() {
        this.registry = null;
        this.workpackageCache.clear();
        this.systemIdCache.clear();
        this.systemIdToDisplayId.clear();
    }
    // ===========================================================================
    // Dual-ID Migration Helpers (P1.6)
    // ===========================================================================
    /**
     * Check if all workpackages in registry have systemIds
     * @returns true if all workpackages have systemIds
     */
    allWorkpackagesHaveSystemIds() {
        const registry = this.loadRegistry();
        return registry.workpackages.every(wp => wp.systemId && wp.systemId.startsWith('wp-'));
    }
    /**
     * Get workpackages missing systemIds (for migration)
     * @returns Array of workpackage display IDs that need migration
     */
    getWorkpackagesMissingSystemIds() {
        const registry = this.loadRegistry();
        return registry.workpackages
            .filter(wp => !wp.systemId || !wp.systemId.startsWith('wp-'))
            .map(wp => wp.id);
    }
    /**
     * Generate a systemId for a workpackage from its display ID
     * Uses deterministic hash for consistent migration
     * @param displayId - Display ID (e.g., "P1.4")
     * @returns Generated systemId
     */
    generateMigrationSystemId(displayId) {
        return (0, types_1.generateSystemIdFromLegacy)(displayId, 'workpackage');
    }
}
exports.WorkpackageRegistryManager = WorkpackageRegistryManager;
// ===========================================================================
// Progress Tracking
// ===========================================================================
/**
 * Calculate weighted progress for a workpackage
 * @param id - Workpackage ID
 * @returns Progress result
 */
/** Weight multiplier for in_progress deliverables (50% contribution) */
WorkpackageRegistryManager.IN_PROGRESS_WEIGHT_FACTOR = 0.5;
//# sourceMappingURL=registry.js.map