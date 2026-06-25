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
/** Commit count ceiling for normalizing activity score (output 0-100 percentage) */
const COMMIT_ACTIVITY_CEILING = 50;
/** Default test score (0-100 percentage) when tests directory exists but no recent run data */
const TEST_EXISTS_DEFAULT_SCORE = 50;
/**
 * Legacy phase ID pattern (e.g., "phase_5") — recognized for read-tolerance
 * normalization in resolvePhase. Canonical form is "Phase-N" (capital P + dash).
 * Non-canonical forms reach activePhase via legacy plan imports, hand-edits, or
 * plan-write-cli full-YAML rewrites with hand-edited content.
 */
const LEGACY_PHASE_ID_PATTERN = /^phase_([0-9]+)$/i;
/**
 * Module-scope guard: which legacy phase IDs have already been warned about
 * in this process. Without this, every progress-cli / load-cli / next-cli
 * invocation would emit a fresh stderr line for the same legacy ID — that's
 * 100+ warnings per session because resolvePhase is called from many sites.
 *
 * Keyed on the LEGACY id (e.g., "phase_5"), not the normalized one, so that
 * each distinct legacy variant gets one warning but a single variant doesn't
 * repeat.
 */
const warnedLegacyPhaseIds = new Set();
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
        // Try canonical display ID first ("Phase-N")
        const directHit = this.phaseByDisplayId.get(id);
        if (directHit) {
            return directHit;
        }
        // Read-tolerance: accept legacy snake_case "phase_N" by normalizing to
        // canonical "Phase-N". Only emit the one-time warning when the normalized
        // form actually resolves — a legacy variant for a non-existent N (e.g.,
        // "phase_99") returns null silently, identical to the canonical-form
        // not-found case.
        const legacyMatch = id.match(LEGACY_PHASE_ID_PATTERN);
        if (legacyMatch) {
            const normalized = `Phase-${legacyMatch[1]}`;
            const phase = this.phaseByDisplayId.get(normalized);
            if (phase) {
                if (!warnedLegacyPhaseIds.has(id)) {
                    warnedLegacyPhaseIds.add(id);
                    process.stderr.write(`[CLEAR] Legacy phase ID format detected ("${id}"). Resolved as "${normalized}". ` +
                        `Recommend a clean rewrite via plan-write-cli to canonical "Phase-N" format. ` +
                        `This warning appears once per process.\n`);
                }
                return phase;
            }
        }
        return null;
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
     *
     * Uses resolvePhase so non-canonical activePhase values (legacy snake_case
     * "phase_N" via plan import / hand-edit / plan-write-cli full-rewrite) still
     * resolve correctly instead of returning null and breaking next-cli +
     * progress-cli + state sync.
     */
    getActivePhase() {
        const plan = this.loadPlan();
        if (!plan)
            return null;
        return this.resolvePhase(plan.activePhase);
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
        // Get active phase and its systemId (P1.6) — resolvePhase tolerates
        // legacy snake_case activePhase values so the systemId field still gets
        // populated instead of silently falling to null.
        const activePhase = this.resolvePhase(plan.activePhase);
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
     * @returns Map of workpackage ID to progress (0-100 percentage)
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
                            result[wp.id] = 100;
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
        // resolvePhase tolerates legacy snake_case input ("phase_5") so callers
        // that pass plan.activePhase (potentially non-canonical) still get real
        // progress instead of the 0% sentinel.
        const phase = this.resolvePhase(phaseId);
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
            if (progress >= 100) {
                completedWorkpackages.push(wpId);
            }
            else {
                pendingWorkpackages.push(wpId);
            }
        }
        // overallProgress is sum(weight × percent) / sum(weight) = weighted-average-percent.
        // Math.round symmetric with the WP-level calculateProgress — every persisted /
        // observable progress field is integer 0-100.
        const overallProgress = totalWeight > 0 ? Math.round(completedWeight / totalWeight) : 0;
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
     * @returns Normalized activity score (0-100 percentage)
     */
    getCommitActivity() {
        try {
            const state = this.loadState();
            const startDate = state.startedAt ? new Date(state.startedAt) : new Date();
            // Get commit count since phase start
            const result = (0, child_process_1.execFileSync)('git', ['log', '--oneline', '--since', startDate.toISOString()], { cwd: this.projectRoot, encoding: 'utf-8' });
            const commitCount = result.split('\n').filter(Boolean).length;
            // Normalize: COMMIT_ACTIVITY_CEILING+ commits = 100% activity.
            return Math.round(Math.min(100, (commitCount / COMMIT_ACTIVITY_CEILING) * 100));
        }
        catch {
            return 0;
        }
    }
    /**
     * Get test status from npm test result
     * @returns Normalized test score (0-100 percentage)
     */
    getTestStatus() {
        try {
            // Try to find a test results file or last npm test output
            const testResultPath = path.join(this.clearDir, 'state', 'test-results.json');
            if (fs.existsSync(testResultPath)) {
                const content = fs.readFileSync(testResultPath, 'utf-8');
                const results = JSON.parse(content);
                if (results.passed && results.total) {
                    return Math.round((results.passed / results.total) * 100);
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
     * @returns Normalized docs score (0-100 percentage)
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
            return Math.round((found / docsToCheck.length) * 100);
        }
        catch {
            return 0;
        }
    }
    /**
     * Get integration status
     * @returns Normalized integration score (0-100 percentage)
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
        return total > 0 ? Math.round((completed / total) * 100) : 0;
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
            if (progress >= 100) {
                requirementsMet.push(reqId);
            }
            else {
                requirementsPending.push(reqId);
            }
        }
        // Determine status.
        //
        // A `major` (or `minor`) milestone auto-achieves: once every requirement is
        // met it reports `complete`.
        //
        // A `gate` milestone NEVER auto-achieves from requirements alone — completion
        // is a human declaration. When its requirements are all met it reports
        // `in_progress` ("ready to declare") UNLESS a human has already declared it,
        // recorded as the persisted plan.json `state.milestones[id].status`. An absent
        // declaration defaults to "needs declaration" (`in_progress`), never to legacy
        // auto-complete — the regression guard for every pre-existing consumer gate
        // that carries no manual-vs-auto marker (the type itself is the semantic; a
        // gate that wanted requires-driven completion would simply be a `major`).
        let status;
        if (requirementsPending.length === 0) {
            if (milestone.type === 'gate') {
                const declaredStatus = this.loadState().milestones[milestoneId]?.status;
                status = declaredStatus === 'complete' ? 'complete' : 'in_progress';
            }
            else {
                status = 'complete';
            }
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
            const timeConsumed = totalDuration > 0 ? Math.round((elapsed / totalDuration) * 100) : 0;
            const progress = Math.round((requirementsMet.length / milestone.requires.length) * 100);
            const threshold = (milestone.type === 'major' || milestone.type === 'gate')
                ? this.riskThresholds.majorYellow
                : this.riskThresholds.minorYellow;
            if (timeConsumed > threshold && progress < threshold) {
                atRisk = true;
                riskReason = `${timeConsumed}% time consumed with only ${progress}% progress`;
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
     * Set a milestone's status across BOTH persistence surfaces in lockstep:
     *
     *  - plan.json `state.milestones[id]` — the runtime source of truth that
     *    checkMilestoneStatus, the rollup, and lifecycle-cli read.
     *  - master-plan.yaml `milestone.status` — the durable seed re-applied to a
     *    fresh consumer's plan.json on first load.
     *
     * Keeping the two in agreement is the INV-2 invariant the gate-declaration
     * read-side depends on: the gate branch of checkMilestoneStatus trusts the
     * plan.json status only because this writer keeps it equal to master-plan.
     *
     * `completedAt` is stamped only for `complete`; any residual `completedAt` is
     * dropped for every other status so a reverted milestone leaves no drift in
     * either file.
     *
     * The master-plan write targets this registry's own `masterPlanYamlPath` (the
     * exact path it reads from), guaranteeing read/write symmetry regardless of
     * how `clearDir` was constructed.
     *
     * @param milestoneId - Milestone ID
     * @param status - Target status (complete | in_progress | not_started)
     */
    setMilestoneStatus(milestoneId, status) {
        const timestamp = new Date().toISOString();
        // Surface 1: plan.json (runtime source of truth)
        const state = this.loadState();
        const entry = { status };
        if (status === 'complete') {
            entry.completedAt = timestamp;
        }
        state.milestones[milestoneId] = entry;
        state.lastActivity = timestamp;
        this.saveState(state);
        // Surface 2: master-plan.yaml (durable seed) — lockstep
        const plan = this.loadPlan();
        const milestone = plan?.milestones.find(m => m.id === milestoneId);
        if (plan && milestone) {
            milestone.status = status;
            if (status === 'complete') {
                milestone.completedAt = timestamp;
            }
            else {
                delete milestone.completedAt;
            }
            try {
                fs.writeFileSync(this.masterPlanYamlPath, (0, parser_1.serializeMasterPlan)(plan), 'utf-8');
            }
            catch (err) {
                // Fire-and-log: plan.json (the runtime SOT) already persisted; surface
                // the YAML write failure without aborting the status change.
                process.stderr.write(`[registry] setMilestoneStatus master-plan write-back failed for ${milestoneId}: ${err instanceof Error ? err.message : String(err)}\n`);
            }
        }
    }
    /**
     * Mark a milestone as complete. Thin wrapper over setMilestoneStatus so the
     * lockstep two-surface write lives in one place; preserves existing callers.
     * @param milestoneId - Milestone ID
     */
    markMilestoneComplete(milestoneId) {
        this.setMilestoneStatus(milestoneId, 'complete');
    }
    /**
     * Get milestone risk assessment.
     * Both fields are 0-100 percentages: `timeConsumed` is the fraction of the
     * milestone timeline elapsed, `progress` is the average WP progress across
     * the milestone's required workpackages.
     *
     * @param milestoneId - Milestone ID
     * @returns Risk data with timeConsumed and progress both as 0-100 percentages
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
        // wpProgress values are 0-100 per the calculateProgress contract; the
        // unweighted average is therefore 0-100.
        const progress = milestone.requires.length > 0
            ? totalProgress / milestone.requires.length
            : 0;
        const targetDate = new Date(milestone.targetDate);
        const now = new Date();
        const state = this.loadState();
        const startDate = new Date(state.startedAt);
        const totalDuration = targetDate.getTime() - startDate.getTime();
        const elapsed = now.getTime() - startDate.getTime();
        const timeConsumed = totalDuration > 0 ? Math.round((elapsed / totalDuration) * 100) : 0;
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
        // resolvePhase covers legacy snake_case plan.activePhase + caller-provided
        // legacy targetPhaseId so blocker detection still functions instead of
        // silently returning an empty list.
        const phase = this.resolvePhase(targetPhaseId);
        if (!phase)
            return [];
        const blockers = [];
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
                // Flag when progress lags timeConsumed by more than 20%. Both operands
                // are 0-100, so 0.8 is a dimensionless lag-tolerance ratio, not a
                // pre-DR3 0-1 progress threshold (those are now 80/60/90 in RiskThresholds).
                if (risk.timeConsumed > threshold && risk.progress < risk.timeConsumed * 0.8) {
                    blockers.push({
                        type: 'milestone_risk',
                        milestone: milestone.id,
                        timeConsumed: risk.timeConsumed,
                        progress: risk.progress,
                        severity: (milestone.type === 'major' || milestone.type === 'gate') ? 'high' : 'medium',
                        description: `Milestone ${milestone.id} at risk: ${Math.round(risk.timeConsumed)}% time, ${Math.round(risk.progress)}% done`
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
                    if (blocker.timeConsumed && blocker.timeConsumed > 80) {
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