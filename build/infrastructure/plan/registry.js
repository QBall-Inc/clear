"use strict";
/**
 * Plan Registry Manager
 *
 * Manages plan loading, multi-signal progress tracking, milestone detection,
 * and blocker identification.
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
exports.PlanRegistryManager = exports.PlanRegistryError = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const child_process_1 = require("child_process");
const types_1 = require("./types");
const parser_1 = require("./parser");
/**
 * Error thrown during registry operations
 */
/** Commit count ceiling for normalizing activity score (0-1) */
const COMMIT_ACTIVITY_CEILING = 50;
/** Default test score when tests directory exists but no recent run data */
const TEST_EXISTS_DEFAULT_SCORE = 0.5;
class PlanRegistryError extends Error {
    constructor(message, planId, details) {
        super(message);
        this.planId = planId;
        this.details = details;
        this.name = 'PlanRegistryError';
    }
}
exports.PlanRegistryError = PlanRegistryError;
/**
 * Plan Registry Manager
 *
 * Updated Session 34 with Dual-ID Architecture support (P1.6):
 * - Phases can be referenced by displayId (Phase-1) or systemId (ph-a1b2c3d4)
 * - SystemId is immutable and preferred for cross-domain references
 * - DisplayId is calculated from position for human readability
 */
class PlanRegistryManager {
    constructor(clearDir, weights, thresholds) {
        this.masterPlan = null;
        // Dual-ID caches (P1.6)
        this.phaseByDisplayId = new Map();
        this.phaseBySystemId = new Map();
        this.clearDir = clearDir;
        this.projectRoot = path.resolve(clearDir, '..');
        this.progressWeights = weights ?? { ...types_1.DEFAULT_PROGRESS_WEIGHTS };
        this.riskThresholds = thresholds ?? { ...types_1.DEFAULT_RISK_THRESHOLDS };
    }
    // ===========================================================================
    // Path Helpers
    // ===========================================================================
    get plansDir() {
        return path.join(this.clearDir, 'plans');
    }
    get masterPlanYamlPath() {
        return path.join(this.plansDir, 'master-plan.yaml');
    }
    get masterPlanMdPath() {
        return path.join(this.plansDir, 'master-plan.md');
    }
    get statePath() {
        return path.join(this.clearDir, 'state', 'plan.json');
    }
    get workpackageStatePath() {
        return path.join(this.clearDir, 'state', 'workpackage.json');
    }
    // ===========================================================================
    // Plan Loading
    // ===========================================================================
    /**
     * Load the master plan (parsed from YAML)
     * @returns Master plan or null if not found
     */
    loadPlan() {
        if (!this.masterPlan) {
            this.masterPlan = (0, parser_1.parseMasterPlanYaml)(this.masterPlanYamlPath);
            // Build dual-ID caches when plan is loaded
            this.buildPhaseCaches();
        }
        return this.masterPlan;
    }
    /**
     * Build phase caches for dual-ID lookups (P1.6)
     */
    buildPhaseCaches() {
        this.phaseByDisplayId.clear();
        this.phaseBySystemId.clear();
        if (!this.masterPlan)
            return;
        for (const phase of this.masterPlan.phases) {
            // Cache by display ID (legacy)
            this.phaseByDisplayId.set(phase.id, phase);
            // Cache by system ID if present
            if (phase.systemId) {
                this.phaseBySystemId.set(phase.systemId, phase);
            }
        }
    }
    /**
     * Load the plan summary (from master-plan.md)
     * @returns Summary text or empty string
     */
    loadPlanSummary() {
        const content = (0, parser_1.readMasterPlanMd)(this.masterPlanMdPath);
        if (!content) {
            return '';
        }
        return (0, parser_1.extractPlanSummary)(content);
    }
    /**
     * Load phase detail file on-demand
     * @param phaseId - Phase ID to load
     * @returns Phase detail content or null
     */
    loadPhaseDetail(phaseId) {
        const plan = this.loadPlan();
        if (!plan)
            return null;
        const phase = plan.phases.find(p => p.id === phaseId);
        if (!phase?.detailFile)
            return null;
        const detailPath = path.join(this.plansDir, phase.detailFile);
        return (0, parser_1.readPhaseDetail)(detailPath);
    }
    /**
     * Get a phase by ID (legacy display ID lookup)
     */
    getPhase(phaseId) {
        const plan = this.loadPlan();
        if (!plan)
            return null;
        return plan.phases.find(p => p.id === phaseId) ?? null;
    }
    // ===========================================================================
    // Dual-ID Lookups (P1.6)
    // ===========================================================================
    /**
     * Get a phase by system ID
     * @param systemId - System ID (e.g., "ph-a1b2c3d4")
     * @returns Phase or null if not found
     */
    getPhaseBySystemId(systemId) {
        this.loadPlan(); // Ensure caches are built
        return this.phaseBySystemId.get(systemId) ?? null;
    }
    /**
     * Resolve a phase by either system ID or display ID
     * Auto-detects the ID type and returns the phase
     * @param id - Either a systemId (ph-xxx) or displayId (Phase-N)
     * @returns Phase or null if not found
     */
    resolvePhase(id) {
        this.loadPlan(); // Ensure caches are built
        // Check if it's a system ID
        if ((0, types_1.isPhaseSystemId)(id)) {
            return this.phaseBySystemId.get(id) ?? null;
        }
        // Otherwise try as display ID
        return this.phaseByDisplayId.get(id) ?? null;
    }
    /**
     * Get display ID for a system ID
     * @param systemId - System ID to look up
     * @returns Display ID or null if not found
     */
    getDisplayIdForSystemId(systemId) {
        const phase = this.getPhaseBySystemId(systemId);
        return phase?.id ?? null;
    }
    /**
     * Get system ID for a display ID
     * @param displayId - Display ID to look up
     * @returns System ID or null if not found
     */
    getSystemIdForDisplayId(displayId) {
        const phase = this.getPhase(displayId);
        return phase?.systemId ?? null;
    }
    /**
     * Check if all phases have system IDs (for migration detection)
     * @returns true if all phases have systemId
     */
    allPhasesHaveSystemIds() {
        const plan = this.loadPlan();
        if (!plan)
            return true; // No plan = nothing to migrate
        return plan.phases.every(phase => (0, types_1.hasDualIdSupport)(phase));
    }
    /**
     * Get phases missing system IDs
     * @returns Array of phases without systemId
     */
    getPhasesMissingSystemIds() {
        const plan = this.loadPlan();
        if (!plan)
            return [];
        return plan.phases.filter(phase => !(0, types_1.hasDualIdSupport)(phase));
    }
    /**
     * Generate a migration system ID from a legacy display ID
     * Uses deterministic hash for consistent migration
     * @param displayId - Legacy display ID (e.g., "Phase-1")
     * @returns System ID (e.g., "ph-abc12345")
     */
    generateMigrationSystemId(displayId) {
        return (0, types_1.generateSystemIdFromLegacy)(displayId, 'phase');
    }
    /**
     * Get a milestone by ID
     */
    getMilestone(milestoneId) {
        const plan = this.loadPlan();
        if (!plan)
            return null;
        return plan.milestones.find(m => m.id === milestoneId) ?? null;
    }
    /**
     * Get the active phase
     */
    getActivePhase() {
        const plan = this.loadPlan();
        if (!plan)
            return null;
        return this.getPhase(plan.activePhase);
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
     * Initialize or update state from plan
     *
     * Dual-ID Architecture (P1.6):
     * - Stores both activePhaseId (display ID) and activePhaseSystemId
     * - SystemId is preferred for cross-domain references
     */
    initializeState(sessionId) {
        const plan = this.loadPlan();
        const existingState = this.loadState();
        if (!plan) {
            return { ...(0, types_1.createDefaultPlanState)(), sessionId };
        }
        // Get active phase and its systemId (P1.6)
        const activePhase = this.getPhase(plan.activePhase);
        const activePhaseSystemId = activePhase?.systemId ?? null;
        const now = new Date().toISOString();
        const state = {
            activePlanId: 'master-plan',
            activePhaseId: plan.activePhase,
            activePhaseSystemId,
            startedAt: existingState.startedAt || now,
            lastActivity: now,
            phaseProgress: existingState.phaseProgress || {},
            milestones: existingState.milestones || {},
            multiSignalData: existingState.multiSignalData || {
                workpackages: 0,
                commits: 0,
                tests: 0,
                docs: 0,
                integration: 0
            },
            blockers: [],
            sessionId
        };
        // Initialize phase progress for all phases
        for (const phase of plan.phases) {
            if (!(phase.id in state.phaseProgress)) {
                state.phaseProgress[phase.id] = 0;
            }
        }
        // Initialize milestone states
        for (const milestone of plan.milestones) {
            if (!(milestone.id in state.milestones)) {
                state.milestones[milestone.id] = { status: milestone.status };
            }
        }
        this.saveState(state);
        return state;
    }
    // ===========================================================================
    // Progress Tracking
    // ===========================================================================
    /**
     * Get workpackage progress from P1.4 state
     * @returns Map of workpackage ID to progress (0-1)
     *
     * Data sources (in priority order):
     * 1. workpackage.json - active workpackage's current progress
     * 2. registry.yaml - historical completion status (complete/in_progress/not_started)
     *
     * Note: Both sources are read independently. registry.yaml is the authoritative
     * source for completion status, while workpackage.json provides real-time progress.
     */
    getWorkpackageProgress() {
        const result = Object.create(null);
        // First, read registry.yaml for historical completion status
        // This is the authoritative source for workpackage completion
        try {
            const registryPath = path.join(this.clearDir, 'workpackages', 'registry.yaml');
            if (fs.existsSync(registryPath)) {
                const registryContent = fs.readFileSync(registryPath, 'utf-8');
                const registry = yaml.load(registryContent, { schema: yaml.JSON_SCHEMA });
                if (registry?.workpackages) {
                    for (const wp of registry.workpackages) {
                        if (wp.status === 'complete') {
                            result[wp.id] = 1.0;
                        }
                        else if (wp.status === 'not_started') {
                            result[wp.id] = 0;
                        }
                        // in_progress status: leave for workpackage.json to provide actual progress
                    }
                }
            }
        }
        catch {
            // Silent fallback - registry read failure shouldn't block progress calculation
        }
        // Then, read workpackage.json for active workpackage's current progress
        // This provides real-time progress for the currently active workpackage
        try {
            if (fs.existsSync(this.workpackageStatePath)) {
                const content = fs.readFileSync(this.workpackageStatePath, 'utf-8');
                const wpState = JSON.parse(content);
                // The active workpackage progress overrides registry status
                if (wpState.activeWorkpackage && typeof wpState.progress === 'number') {
                    result[wpState.activeWorkpackage] = wpState.progress;
                }
            }
        }
        catch {
            // Silent fallback - state read failure shouldn't block progress calculation
        }
        return result;
    }
    /**
     * Calculate phase progress from workpackage weights
     * @param phaseId - Phase ID
     * @returns Phase progress result
     */
    calculatePhaseProgress(phaseId) {
        const phase = this.getPhase(phaseId);
        if (!phase) {
            return {
                phaseId,
                progress: 0,
                completedWorkpackages: [],
                pendingWorkpackages: [],
                totalWeight: 0,
                completedWeight: 0
            };
        }
        const wpProgress = this.getWorkpackageProgress();
        let totalWeight = 0;
        let completedWeight = 0;
        const completedWorkpackages = [];
        const pendingWorkpackages = [];
        for (const wpId of phase.workpackages) {
            const weight = phase.weights[wpId] ?? 1;
            totalWeight += weight;
            const progress = wpProgress[wpId] ?? 0;
            completedWeight += weight * progress;
            if (progress >= 1.0) {
                completedWorkpackages.push(wpId);
            }
            else {
                pendingWorkpackages.push(wpId);
            }
        }
        const overallProgress = totalWeight > 0 ? completedWeight / totalWeight : 0;
        return {
            phaseId,
            progress: overallProgress,
            completedWorkpackages,
            pendingWorkpackages,
            totalWeight,
            completedWeight
        };
    }
    /**
     * Get commit activity since phase start
     * @returns Normalized activity score (0-1)
     */
    getCommitActivity() {
        try {
            const state = this.loadState();
            const startDate = state.startedAt ? new Date(state.startedAt) : new Date();
            // Get commit count since phase start
            const result = (0, child_process_1.execFileSync)('git', ['log', '--oneline', '--since', startDate.toISOString()], { cwd: this.projectRoot, encoding: 'utf-8' });
            const commitCount = result.split('\n').filter(Boolean).length;
            // Normalize: assume COMMIT_ACTIVITY_CEILING+ commits = 100% activity
            return Math.min(1, commitCount / COMMIT_ACTIVITY_CEILING);
        }
        catch {
            return 0;
        }
    }
    /**
     * Get test status from npm test result
     * @returns Normalized test score (0-1)
     */
    getTestStatus() {
        try {
            // Try to find a test results file or last npm test output
            const testResultPath = path.join(this.clearDir, 'state', 'test-results.json');
            if (fs.existsSync(testResultPath)) {
                const content = fs.readFileSync(testResultPath, 'utf-8');
                const results = JSON.parse(content);
                if (results.passed && results.total) {
                    return results.passed / results.total;
                }
            }
            // Fallback: check if tests directory exists and has files
            const testsDir = path.join(this.projectRoot, 'tests');
            if (fs.existsSync(testsDir)) {
                return TEST_EXISTS_DEFAULT_SCORE; // Tests exist but no recent run
            }
            return 0;
        }
        catch {
            return 0;
        }
    }
    /**
     * Get documentation coverage
     * @returns Normalized docs score (0-1)
     */
    getDocsCoverage() {
        try {
            const plan = this.loadPlan();
            if (!plan)
                return 0;
            // Check for key documentation files
            const docsToCheck = [
                'README.md',
                'CLAUDE.md',
                'docs/index.md',
                '.clear/plans/master-plan.md'
            ];
            const projectRoot = this.projectRoot;
            let found = 0;
            for (const doc of docsToCheck) {
                const docPath = path.join(projectRoot, doc);
                if (fs.existsSync(docPath)) {
                    found++;
                }
            }
            return found / docsToCheck.length;
        }
        catch {
            return 0;
        }
    }
    /**
     * Get integration status
     * @returns Normalized integration score (0-1)
     */
    getIntegrationStatus() {
        // Check for integration markers
        const plan = this.loadPlan();
        if (!plan)
            return 0;
        // Count completed milestones as integration markers
        const state = this.loadState();
        let completed = 0;
        let total = 0;
        for (const milestone of plan.milestones) {
            if (milestone.type === 'major' || milestone.type === 'gate') {
                total++;
                const milestoneState = state.milestones[milestone.id];
                if (milestoneState?.status === 'complete') {
                    completed++;
                }
            }
        }
        return total > 0 ? completed / total : 0;
    }
    /**
     * Calculate multi-signal progress
     * @returns Multi-signal result with weighted progress
     */
    calculateMultiSignalProgress() {
        const signals = {
            workpackages: this.calculatePhaseProgress(this.loadPlan()?.activePhase ?? '').progress,
            commits: this.getCommitActivity(),
            tests: this.getTestStatus(),
            docs: this.getDocsCoverage(),
            integration: this.getIntegrationStatus()
        };
        const weights = this.progressWeights;
        const weightedProgress = signals.workpackages * weights.workpackages +
            signals.commits * weights.commits +
            signals.tests * weights.tests +
            signals.docs * weights.documentation +
            signals.integration * weights.integration;
        // Calculate confidence based on signal availability
        let signalsAvailable = 0;
        if (signals.workpackages > 0)
            signalsAvailable++;
        if (signals.commits > 0)
            signalsAvailable++;
        if (signals.tests > 0)
            signalsAvailable++;
        if (signals.docs > 0)
            signalsAvailable++;
        if (signals.integration > 0)
            signalsAvailable++;
        const confidence = signalsAvailable / 5;
        return {
            weightedProgress,
            signals,
            confidence
        };
    }
    // ===========================================================================
    // Milestone Tracking
    // ===========================================================================
    /**
     * Check milestone status
     * @param milestoneId - Milestone ID
     * @returns Milestone check result
     */
    checkMilestoneStatus(milestoneId) {
        const milestone = this.getMilestone(milestoneId);
        if (!milestone) {
            return {
                milestoneId,
                status: 'not_started',
                requirementsMet: [],
                requirementsPending: [],
                atRisk: false
            };
        }
        const wpProgress = this.getWorkpackageProgress();
        const requirementsMet = [];
        const requirementsPending = [];
        for (const reqId of milestone.requires) {
            const progress = wpProgress[reqId] ?? 0;
            if (progress >= 1.0) {
                requirementsMet.push(reqId);
            }
            else {
                requirementsPending.push(reqId);
            }
        }
        // Determine status
        let status;
        if (requirementsPending.length === 0) {
            status = 'complete';
        }
        else if (requirementsMet.length > 0) {
            status = 'in_progress';
        }
        else {
            status = 'not_started';
        }
        // Check for risk (time vs progress)
        let atRisk = false;
        let riskReason;
        if (milestone.targetDate && status !== 'complete') {
            const targetDate = new Date(milestone.targetDate);
            const now = new Date();
            const state = this.loadState();
            const startDate = new Date(state.startedAt);
            const totalDuration = targetDate.getTime() - startDate.getTime();
            const elapsed = now.getTime() - startDate.getTime();
            const timeConsumed = totalDuration > 0 ? elapsed / totalDuration : 0;
            const progress = requirementsMet.length / milestone.requires.length;
            const threshold = (milestone.type === 'major' || milestone.type === 'gate')
                ? this.riskThresholds.majorYellow
                : this.riskThresholds.minorYellow;
            if (timeConsumed > threshold && progress < threshold) {
                atRisk = true;
                riskReason = `${Math.round(timeConsumed * 100)}% time consumed with only ${Math.round(progress * 100)}% progress`;
            }
        }
        return {
            milestoneId,
            status,
            requirementsMet,
            requirementsPending,
            atRisk,
            riskReason
        };
    }
    /**
     * Mark a milestone as complete
     * @param milestoneId - Milestone ID
     */
    markMilestoneComplete(milestoneId) {
        const state = this.loadState();
        state.milestones[milestoneId] = {
            status: 'complete',
            completedAt: new Date().toISOString()
        };
        state.lastActivity = new Date().toISOString();
        this.saveState(state);
    }
    /**
     * Get milestone risk assessment
     * @param milestoneId - Milestone ID
     * @returns Risk data
     */
    getMilestoneRisk(milestoneId) {
        const milestone = this.getMilestone(milestoneId);
        if (!milestone?.targetDate) {
            return { timeConsumed: 0, progress: 0 };
        }
        const wpProgress = this.getWorkpackageProgress();
        let totalProgress = 0;
        for (const reqId of milestone.requires) {
            totalProgress += wpProgress[reqId] ?? 0;
        }
        const progress = milestone.requires.length > 0
            ? totalProgress / milestone.requires.length
            : 0;
        const targetDate = new Date(milestone.targetDate);
        const now = new Date();
        const state = this.loadState();
        const startDate = new Date(state.startedAt);
        const totalDuration = targetDate.getTime() - startDate.getTime();
        const elapsed = now.getTime() - startDate.getTime();
        const timeConsumed = totalDuration > 0 ? elapsed / totalDuration : 0;
        return { timeConsumed, progress };
    }
    // ===========================================================================
    // Blocker Detection
    // ===========================================================================
    /**
     * Detect blockers for a phase
     * @param phaseId - Phase ID (optional, defaults to active)
     * @returns List of blockers
     */
    detectBlockers(phaseId) {
        const plan = this.loadPlan();
        if (!plan)
            return [];
        const targetPhaseId = phaseId ?? plan.activePhase;
        const phase = this.getPhase(targetPhaseId);
        if (!phase)
            return [];
        const blockers = [];
        // Note: wpProgress available for future workpackage-level blocker detection
        // Check phase dependencies
        if (phase.dependencies) {
            for (const depPhaseId of phase.dependencies) {
                const depPhase = this.getPhase(depPhaseId);
                if (depPhase && depPhase.status !== 'complete') {
                    blockers.push({
                        type: 'dependency',
                        blocking: depPhaseId,
                        blocked: targetPhaseId,
                        severity: 'high',
                        description: `Phase ${depPhaseId} must complete before ${targetPhaseId}`
                    });
                }
            }
        }
        // Check for workpackage dependencies within phase
        // (Would need workpackage registry integration for detailed checks)
        // Check milestone risks
        for (const milestone of plan.milestones) {
            if (milestone.phase !== targetPhaseId)
                continue;
            const risk = this.getMilestoneRisk(milestone.id);
            if (risk.timeConsumed > 0) {
                const threshold = (milestone.type === 'major' || milestone.type === 'gate')
                    ? this.riskThresholds.majorRed
                    : this.riskThresholds.minorYellow;
                if (risk.timeConsumed > threshold && risk.progress < risk.timeConsumed * 0.8) {
                    blockers.push({
                        type: 'milestone_risk',
                        milestone: milestone.id,
                        timeConsumed: risk.timeConsumed,
                        progress: risk.progress,
                        severity: (milestone.type === 'major' || milestone.type === 'gate') ? 'high' : 'medium',
                        description: `Milestone ${milestone.id} at risk: ${Math.round(risk.timeConsumed * 100)}% time, ${Math.round(risk.progress * 100)}% done`
                    });
                }
            }
        }
        return blockers;
    }
    /**
     * Generate suggestions for resolving blockers
     * @param blockers - List of blockers
     * @returns Suggested actions
     */
    generateSuggestions(blockers) {
        const suggestions = [];
        for (const blocker of blockers) {
            switch (blocker.type) {
                case 'dependency':
                    suggestions.push(`Complete ${blocker.blocking} before continuing with ${blocker.blocked}`);
                    break;
                case 'milestone_risk':
                    if (blocker.timeConsumed && blocker.timeConsumed > 0.8) {
                        suggestions.push(`Consider scope reduction for milestone ${blocker.milestone}`);
                    }
                    else {
                        suggestions.push(`Prioritize ${blocker.milestone} requirements to stay on track`);
                    }
                    break;
                case 'resource':
                    suggestions.push(`Address resource constraint: ${blocker.description}`);
                    break;
                case 'decision':
                    suggestions.push(`Resolve pending decision: ${blocker.description}`);
                    break;
            }
        }
        return suggestions;
    }
    // ===========================================================================
    // Cache Management
    // ===========================================================================
    /**
     * Clear cached plan data
     */
    clearCache() {
        this.masterPlan = null;
        this.phaseByDisplayId.clear();
        this.phaseBySystemId.clear();
    }
}
exports.PlanRegistryManager = PlanRegistryManager;
//# sourceMappingURL=registry.js.map