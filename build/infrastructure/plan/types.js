"use strict";
/**
 * Plan Management Type Definitions
 *
 * Types for plan entries, phases, milestones, and progress tracking.
 * Based on P1.5 Feature Brief Section 5.2.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPhaseSystemId = exports.generateSystemIdFromLegacy = exports.generatePhaseSystemId = exports.DEFAULT_PLAN_CONFIG = exports.DEFAULT_RISK_THRESHOLDS = exports.DEFAULT_PROGRESS_WEIGHTS = exports.DEFAULT_PLAN_STATE = exports.DEFAULT_MULTI_SIGNAL_DATA = void 0;
exports.createDefaultPlanState = createDefaultPlanState;
exports.hasDualIdSupport = hasDualIdSupport;
exports.getPreferredId = getPreferredId;
exports.isLegacyPhaseDisplayId = isLegacyPhaseDisplayId;
/**
 * Default multi-signal data
 */
exports.DEFAULT_MULTI_SIGNAL_DATA = {
    workpackages: 0,
    commits: 0,
    tests: 0,
    docs: 0,
    integration: 0
};
/**
 * Create a fresh default plan state with current timestamps.
 * Replaces the old const to avoid stale `new Date()` evaluated at module load.
 */
function createDefaultPlanState() {
    return {
        activePlanId: '',
        activePhaseId: '',
        activePhaseSystemId: null,
        startedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        phaseProgress: {},
        milestones: {},
        multiSignalData: { ...exports.DEFAULT_MULTI_SIGNAL_DATA },
        blockers: [],
        sessionId: ''
    };
}
/** @deprecated Use createDefaultPlanState() for fresh timestamps */
exports.DEFAULT_PLAN_STATE = createDefaultPlanState();
/**
 * Default progress weights (from plan-defaults.yaml)
 */
exports.DEFAULT_PROGRESS_WEIGHTS = {
    workpackages: 0.4,
    commits: 0.2,
    tests: 0.2,
    documentation: 0.1,
    integration: 0.1
};
/**
 * Default risk thresholds (0-100 percentage)
 */
exports.DEFAULT_RISK_THRESHOLDS = {
    majorRed: 80,
    majorYellow: 60,
    minorYellow: 90
};
/**
 * Default plan configuration
 */
exports.DEFAULT_PLAN_CONFIG = {
    plan: {
        location: '.clear/plans/master-plan.yaml',
        changeLog: '.clear/plans/change-log.yaml',
        autoLoad: true,
        validateOnLoad: true
    },
    milestones: {
        riskThresholds: { ...exports.DEFAULT_RISK_THRESHOLDS },
        trackSuccessCriteria: true,
        requireCriteriaForCompletion: true
    },
    progress: {
        weights: { ...exports.DEFAULT_PROGRESS_WEIGHTS },
        updateFrequency: 'on_change',
        confidenceThreshold: 0.7
    },
    blockers: {
        autoDetection: true,
        suggestWorkarounds: true,
        trackResolutionTime: true
    }
};
// ==============================================================================
// Dual-ID Utilities (P1.6)
// ==============================================================================
// Re-export dual-ID utilities from sync/types.ts for convenience
var types_1 = require("../sync/types");
Object.defineProperty(exports, "generatePhaseSystemId", { enumerable: true, get: function () { return types_1.generatePhaseSystemId; } });
Object.defineProperty(exports, "generateSystemIdFromLegacy", { enumerable: true, get: function () { return types_1.generateSystemIdFromLegacy; } });
Object.defineProperty(exports, "isPhaseSystemId", { enumerable: true, get: function () { return types_1.isPhaseSystemId; } });
/**
 * Check if a phase entry has dual-ID support
 * @param entry - Phase entry
 * @returns true if systemId is present
 */
function hasDualIdSupport(entry) {
    return typeof entry.systemId === 'string' && entry.systemId.startsWith('ph-');
}
/**
 * Get the preferred ID for cross-domain references
 * Returns systemId if available, otherwise falls back to legacy id
 * @param entry - Phase entry
 * @returns systemId or legacy id
 */
function getPreferredId(entry) {
    return entry.systemId || entry.id;
}
/**
 * Check if a string looks like a legacy phase display ID (Phase-N format)
 * @param id - ID to check
 * @returns true if matches Phase-{n} pattern
 */
function isLegacyPhaseDisplayId(id) {
    return /^Phase-\d+$/.test(id);
}
//# sourceMappingURL=types.js.map