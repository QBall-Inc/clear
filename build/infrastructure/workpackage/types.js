"use strict";
/**
 * Workpackage Management Type Definitions
 *
 * Types for workpackage entries, dependencies, and progress tracking.
 * Based on P1.4 Feature Brief Section 5.1.
 * Updated Session 33 with Dual-ID Architecture support (P1.6).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWorkpackageSystemId = exports.generateSystemIdFromLegacy = exports.generateWorkpackageSystemId = exports.DEFAULT_WORKPACKAGE_CONFIG = exports.DEFAULT_WORKPACKAGE_STATE = void 0;
exports.createDefaultWorkpackageState = createDefaultWorkpackageState;
exports.hasDualIdSupport = hasDualIdSupport;
exports.getPreferredId = getPreferredId;
exports.isLegacyDisplayId = isLegacyDisplayId;
/**
 * Create a fresh default workpackage state with current timestamp.
 * Replaces the old const to avoid stale `new Date()` evaluated at module load.
 */
function createDefaultWorkpackageState() {
    return {
        activeWorkpackage: null,
        activeWorkpackageSystemId: null,
        activePhaseSystemId: null,
        startedAt: null,
        lastActivity: new Date().toISOString(),
        progress: 0,
        deliverables: {},
        scopeWarnings: [],
        sessionId: ''
    };
}
/** @deprecated Use createDefaultWorkpackageState() for fresh timestamps */
exports.DEFAULT_WORKPACKAGE_STATE = createDefaultWorkpackageState();
/**
 * Default workpackage configuration
 */
exports.DEFAULT_WORKPACKAGE_CONFIG = {
    registry: {
        location: '.clear/workpackages/registry.yaml',
        auto_discover: true,
        validate_on_load: true
    },
    dependencies: {
        strict_validation: true,
        check_deliverables: true,
        allow_soft_dependencies: true,
        max_depth: 10
    },
    progress: {
        auto_tracking: true,
        tracking_granularity: 'file',
        weighted_progress: true,
        include_tests: true
    },
    scope: {
        enforce_boundaries: true,
        warn_on_creep: true,
        allow_expansion: false
    },
    completion: {
        require_all_deliverables: true,
        require_tests_pass: true,
        min_coverage: 80,
        auto_unblock: true
    },
    context: {
        max_percentage: 15,
        load_knowledge: true,
        load_dependencies: true
    }
};
// ==============================================================================
// Dual-ID Utilities (P1.6)
// ==============================================================================
// Re-export dual-ID utilities from sync/types.ts for convenience
var types_1 = require("../sync/types");
Object.defineProperty(exports, "generateWorkpackageSystemId", { enumerable: true, get: function () { return types_1.generateWorkpackageSystemId; } });
Object.defineProperty(exports, "generateSystemIdFromLegacy", { enumerable: true, get: function () { return types_1.generateSystemIdFromLegacy; } });
Object.defineProperty(exports, "isWorkpackageSystemId", { enumerable: true, get: function () { return types_1.isWorkpackageSystemId; } });
/**
 * Check if a workpackage entry has dual-ID support
 * @param entry - Workpackage entry or registry entry
 * @returns true if systemId is present
 */
function hasDualIdSupport(entry) {
    return typeof entry.systemId === 'string' && entry.systemId.startsWith('wp-');
}
/**
 * Get the preferred ID for cross-domain references
 * Returns systemId if available, otherwise falls back to legacy id
 * @param entry - Workpackage entry or registry entry
 * @returns systemId or legacy id
 */
function getPreferredId(entry) {
    return entry.systemId || entry.id;
}
/**
 * Check if a string looks like a legacy display ID (P1.4 format)
 * @param id - ID to check
 * @returns true if matches P{n}.{n} pattern
 */
function isLegacyDisplayId(id) {
    return /^P\d+\.\d+$/.test(id);
}
//# sourceMappingURL=types.js.map