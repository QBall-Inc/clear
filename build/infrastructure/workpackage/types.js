"use strict";
/**
 * Workpackage Management Type Definitions
 *
 * Types for workpackage entries, dependencies, and progress tracking.
 * Based on P1.4 Feature Brief Section 5.1.
 * Updated Session 33 with Dual-ID Architecture support (P1.6).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWorkpackageSystemId = exports.generateSystemIdFromLegacy = exports.generateWorkpackageSystemId = exports.DEFAULT_WORKPACKAGE_CONFIG = exports.DEFAULT_WORKPACKAGE_STATE = exports.WORKPACKAGE_PRIORITIES = exports.WORKPACKAGE_TYPES = void 0;
exports.isWorkpackageType = isWorkpackageType;
exports.isWorkpackagePriority = isWorkpackagePriority;
exports.createDefaultWorkpackageState = createDefaultWorkpackageState;
exports.hasDualIdSupport = hasDualIdSupport;
exports.getPreferredId = getPreferredId;
exports.isLegacyDisplayId = isLegacyDisplayId;
exports.formatWorkpackageId = formatWorkpackageId;
// ==============================================================================
// Runtime Enum Constants + Type Guards
// ==============================================================================
// Runtime enum literals are the single source of truth for the type/priority
// unions above. All write-path validators (create-cli, update-cli) and the
// read-path parser import these constants so a new value added here propagates
// without per-site edits.
exports.WORKPACKAGE_TYPES = [
    'feature', 'bugfix', 'refactor', 'documentation', 'infrastructure'
];
exports.WORKPACKAGE_PRIORITIES = [
    'critical', 'high', 'medium', 'low'
];
/**
 * Type guard: validate a string against the WorkpackageType union.
 */
function isWorkpackageType(type) {
    return exports.WORKPACKAGE_TYPES.includes(type);
}
/**
 * Type guard: validate a string against the WorkpackagePriority union.
 */
function isWorkpackagePriority(priority) {
    return exports.WORKPACKAGE_PRIORITIES.includes(priority);
}
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
/**
 * Format a workpackage ID for user-facing display.
 *
 * Counterpart to getPreferredId() — that helper is system-preferred for cross-domain
 * references; this one is user-preferred for messages, errors, and status output.
 *
 * Graceful degradation: when style='both' but entry.systemId is absent (undefined or
 * empty string — legacy WP entries pre-dating dual-ID support), the function returns
 * just entry.id. Callers requesting 'both' receive the richest representation
 * available without having to guard for the legacy case themselves.
 *
 * @param entry - Workpackage entry or registry entry (must carry .id; .systemId optional)
 * @param style - 'display' returns just the user-facing ID (e.g. "P5.1");
 *                'both' returns "P5.1 (wp-647a5f25)" when systemId is present,
 *                or just "P5.1" when systemId is absent (legacy fallback)
 * @returns Formatted ID string suitable for user-visible output
 */
function formatWorkpackageId(entry, style = 'display') {
    if (style === 'both' && entry.systemId) {
        return `${entry.id} (${entry.systemId})`;
    }
    return entry.id;
}
//# sourceMappingURL=types.js.map