"use strict";
/**
 * Cross-Domain Sync Type Definitions
 *
 * Types for the P1.6 Cross-Domain Synchronization system including:
 * - Dual-ID architecture (systemId + displayId)
 * - Shared context hub
 * - Audit logging
 * - Error handling
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 5.2.
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
exports.ERROR_HANDLERS = exports.DEFAULT_SYNC_CONFIG = exports.DEFAULT_AUDIT_INDEX = exports.DEFAULT_SYNC_STATE = void 0;
exports.generateWorkpackageSystemId = generateWorkpackageSystemId;
exports.generatePhaseSystemId = generatePhaseSystemId;
exports.generateSystemIdFromLegacy = generateSystemIdFromLegacy;
exports.calculateDisplayId = calculateDisplayId;
exports.isWorkpackage = isWorkpackage;
exports.isWorkpackageSystemId = isWorkpackageSystemId;
exports.isPhaseSystemId = isPhaseSystemId;
exports.createDefaultSyncState = createDefaultSyncState;
exports.createDefaultAuditIndex = createDefaultAuditIndex;
exports.isAuditEntry = isAuditEntry;
exports.isSyncState = isSyncState;
exports.isKnowledgeLink = isKnowledgeLink;
const crypto = __importStar(require("crypto"));
// ==============================================================================
// DUAL-ID UTILITY FUNCTIONS
// ==============================================================================
/**
 * Generate a new system ID for a workpackage
 * @returns System ID in format "wp-{uuid}"
 */
function generateWorkpackageSystemId() {
    return `wp-${crypto.randomUUID().slice(0, 8)}`;
}
/**
 * Generate a new system ID for a phase
 * @returns System ID in format "ph-{uuid}"
 */
function generatePhaseSystemId() {
    return `ph-${crypto.randomUUID().slice(0, 8)}`;
}
/**
 * Generate a system ID from a legacy display ID (for migration)
 * Uses a deterministic hash to ensure consistent migration
 * @param displayId - The legacy display ID (e.g., "P1.4" or "Phase-1")
 * @param type - The entity type ("workpackage" or "phase")
 * @returns System ID based on the display ID
 */
function generateSystemIdFromLegacy(displayId, type) {
    // Create a simple hash from the display ID for deterministic migration
    let hash = 0;
    for (let i = 0; i < displayId.length; i++) {
        const char = displayId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    const hashHex = Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
    return type === 'workpackage' ? `wp-${hashHex}` : `ph-${hashHex}`;
}
/**
 * Calculate display ID from entity
 *
 * For workpackages: P{phasePosition}.{wpPosition} (e.g., "P1.4")
 * For phases: Phase-{position} (e.g., "Phase-1")
 *
 * @param entity - The workpackage or phase entity
 * @param phases - Map of phase systemId to phase (required for workpackages)
 * @returns The calculated display ID
 */
function calculateDisplayId(entity, phases) {
    if ('phase' in entity && phases) {
        // Workpackage: P{phasePosition}.{wpPosition}
        const phase = phases.get(entity.phase);
        if (!phase) {
            return `P?.${entity.position}`;
        }
        return `P${phase.position}.${entity.position}`;
    }
    // Phase: Phase-{position}
    return `Phase-${entity.position}`;
}
/**
 * Check if an entity is a workpackage (has phase reference)
 */
function isWorkpackage(entity) {
    return 'phase' in entity;
}
/**
 * Check if a system ID is a workpackage ID
 */
function isWorkpackageSystemId(systemId) {
    return systemId.startsWith('wp-');
}
/**
 * Check if a system ID is a phase ID
 */
function isPhaseSystemId(systemId) {
    return systemId.startsWith('ph-');
}
/**
 * Create a fresh default sync state with current timestamps.
 * Replaces the old const to avoid stale `new Date()` evaluated at module load.
 * Returns deep copies of all nested objects.
 */
function createDefaultSyncState() {
    return {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        lastFullSync: new Date().toISOString(),
        session: {
            id: '',
            number: 0,
            tokensUsed: 0,
            status: 'active'
        },
        workpackage: {
            systemId: '',
            displayId: '',
            title: '',
            progress: 0,
            sessionId: ''
        },
        plan: {
            activePhaseSystemId: '',
            activePhaseDisplayId: '',
            phaseProgress: 0,
            blockers: []
        },
        knowledge: {
            recentEntries: [],
            pendingCaptures: 0,
            deprecatedReferences: []
        },
        links: {
            workpackageKnowledge: {}
        }
    };
}
/** @deprecated Use createDefaultSyncState() for fresh timestamps */
exports.DEFAULT_SYNC_STATE = createDefaultSyncState();
/**
 * Create a fresh default audit index with current timestamp.
 * Replaces the old const to avoid stale `new Date()` evaluated at module load.
 */
function createDefaultAuditIndex() {
    return {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        sessions: []
    };
}
/** @deprecated Use createDefaultAuditIndex() for fresh timestamps */
exports.DEFAULT_AUDIT_INDEX = createDefaultAuditIndex();
/**
 * Default cross-domain sync configuration
 */
exports.DEFAULT_SYNC_CONFIG = {
    audit: {
        retentionSessions: 10,
        maxFileSizeMb: 5,
        logFormat: 'jsonl'
    },
    errorHandling: {
        maxRetries: 3,
        retryBackoffMs: 100,
        autoRepair: true
    },
    knowledgeLinking: {
        autoLinkWorkpackage: true,
        autoLinkPhase: true,
        propagateDeprecation: true,
        autoMigrateSuperseded: true
    }
};
/**
 * Error handlers by category
 */
exports.ERROR_HANDLERS = {
    parse_error: {
        retryable: false,
        autoRepairPossible: true,
        repairAction: 'Attempt to fix syntax errors'
    },
    file_missing: {
        retryable: true,
        maxRetries: 2,
        autoRepairPossible: true,
        repairAction: 'Recreate with defaults'
    },
    corrupt: {
        retryable: false,
        autoRepairPossible: true,
        repairAction: 'Restore from backup or recreate'
    },
    reference_invalid: {
        retryable: false,
        autoRepairPossible: true,
        repairAction: 'Unlink orphaned reference'
    },
    permission: {
        retryable: false,
        autoRepairPossible: false,
        repairAction: 'User must fix permissions'
    },
    schema_migration: {
        retryable: true,
        maxRetries: 1,
        autoRepairPossible: true,
        repairAction: 'Run pending migrations'
    },
    systemid_missing: {
        retryable: false,
        autoRepairPossible: true,
        repairAction: 'Generate systemId for legacy entity'
    },
    position_invalid: {
        retryable: false,
        autoRepairPossible: true,
        repairAction: 'Recalculate positions'
    },
    circular_reference: {
        retryable: false,
        autoRepairPossible: false,
        repairAction: 'User must break circular reference'
    }
};
// ==============================================================================
// TYPE GUARDS
// ==============================================================================
/**
 * Type guard for AuditEntry
 */
function isAuditEntry(obj) {
    if (!obj || typeof obj !== 'object')
        return false;
    const entry = obj;
    return (typeof entry.timestamp === 'string' &&
        typeof entry.sessionId === 'string' &&
        typeof entry.sessionNumber === 'number' &&
        typeof entry.domain === 'string' &&
        typeof entry.action === 'string' &&
        typeof entry.target === 'string' &&
        typeof entry.trigger === 'string');
}
/**
 * Type guard for SyncState
 */
function isSyncState(obj) {
    if (!obj || typeof obj !== 'object')
        return false;
    const ctx = obj;
    return (typeof ctx.version === 'string' &&
        typeof ctx.lastUpdated === 'string' &&
        ctx.session !== undefined &&
        ctx.workpackage !== undefined &&
        ctx.plan !== undefined &&
        ctx.knowledge !== undefined);
}
/**
 * Type guard for KnowledgeLink
 */
function isKnowledgeLink(obj) {
    if (!obj || typeof obj !== 'object')
        return false;
    const link = obj;
    return (typeof link.id === 'string' &&
        typeof link.workpackageId === 'string' &&
        typeof link.phaseId === 'string' &&
        typeof link.linkedAt === 'string' &&
        typeof link.status === 'string');
}
//# sourceMappingURL=types.js.map