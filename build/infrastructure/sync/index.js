"use strict";
/**
 * Cross-Domain Sync Module (P1.6)
 *
 * Provides cross-domain synchronization, audit logging, and state management
 * for the CLEAR framework.
 *
 * @module infrastructure/sync
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeprecationWarnings = exports.supersedeKnowledge = exports.deprecateOnDefer = exports.createAutoLinkHandler = exports.getLinksForKnowledge = exports.isKnowledgeLinked = exports.updateLinkStatus = exports.getWorkpackagesWithKnowledge = exports.getKnowledgeByPhase = exports.getKnowledgeByWorkpackage = exports.unlinkKnowledge = exports.linkKnowledge = exports.getMaxPosition = exports.validatePosition = exports.createReorderHandler = exports.createDeferHandler = exports.createInsertHandler = exports.reorderWorkpackage = exports.deferWorkpackage = exports.insertWorkpackage = exports.getUpcomingMilestones = exports.createPlanRollupHandler = exports.rollupPlanProgress = exports.hasSessionChanged = exports.createSessionSyncHandler = exports.syncSession = exports.createSyncCompleteEntry = exports.createKnowledgeLinkEntry = exports.createWorkpackageActivationEntry = exports.createSessionStartEntry = exports.createAuditLogger = exports.AuditLogger = exports.createSyncStateManager = exports.SyncStateManager = exports.isKnowledgeLink = exports.isSyncState = exports.isAuditEntry = exports.ERROR_HANDLERS = exports.DEFAULT_SYNC_CONFIG = exports.createDefaultAuditIndex = exports.DEFAULT_AUDIT_INDEX = exports.createDefaultSyncState = exports.DEFAULT_SYNC_STATE = exports.isPhaseSystemId = exports.isWorkpackageSystemId = exports.isWorkpackage = exports.calculateDisplayId = exports.generateSystemIdFromLegacy = exports.generatePhaseSystemId = exports.generateWorkpackageSystemId = void 0;
exports.USER_OPTIONS = exports.getManualRepairSteps = exports.formatErrorForUser = exports.parseUserChoice = exports.buildErrorContext = exports.categorizeError = exports.sleep = exports.calculateBackoff = exports.withRetry = exports.createErrorHandler = exports.ErrorHandlerService = exports.SyncError = exports.runDebugCLI = exports.DebugCLI = exports.createDeprecationHandler = exports.getDeprecatedCount = exports.hasDeprecationWarnings = exports.clearDeprecationWarning = void 0;
// Types
var types_1 = require("./types");
// Dual-ID utilities
Object.defineProperty(exports, "generateWorkpackageSystemId", { enumerable: true, get: function () { return types_1.generateWorkpackageSystemId; } });
Object.defineProperty(exports, "generatePhaseSystemId", { enumerable: true, get: function () { return types_1.generatePhaseSystemId; } });
Object.defineProperty(exports, "generateSystemIdFromLegacy", { enumerable: true, get: function () { return types_1.generateSystemIdFromLegacy; } });
Object.defineProperty(exports, "calculateDisplayId", { enumerable: true, get: function () { return types_1.calculateDisplayId; } });
Object.defineProperty(exports, "isWorkpackage", { enumerable: true, get: function () { return types_1.isWorkpackage; } });
Object.defineProperty(exports, "isWorkpackageSystemId", { enumerable: true, get: function () { return types_1.isWorkpackageSystemId; } });
Object.defineProperty(exports, "isPhaseSystemId", { enumerable: true, get: function () { return types_1.isPhaseSystemId; } });
Object.defineProperty(exports, "DEFAULT_SYNC_STATE", { enumerable: true, get: function () { return types_1.DEFAULT_SYNC_STATE; } });
Object.defineProperty(exports, "createDefaultSyncState", { enumerable: true, get: function () { return types_1.createDefaultSyncState; } });
Object.defineProperty(exports, "DEFAULT_AUDIT_INDEX", { enumerable: true, get: function () { return types_1.DEFAULT_AUDIT_INDEX; } });
Object.defineProperty(exports, "createDefaultAuditIndex", { enumerable: true, get: function () { return types_1.createDefaultAuditIndex; } });
Object.defineProperty(exports, "DEFAULT_SYNC_CONFIG", { enumerable: true, get: function () { return types_1.DEFAULT_SYNC_CONFIG; } });
Object.defineProperty(exports, "ERROR_HANDLERS", { enumerable: true, get: function () { return types_1.ERROR_HANDLERS; } });
// Type guards
Object.defineProperty(exports, "isAuditEntry", { enumerable: true, get: function () { return types_1.isAuditEntry; } });
Object.defineProperty(exports, "isSyncState", { enumerable: true, get: function () { return types_1.isSyncState; } });
Object.defineProperty(exports, "isKnowledgeLink", { enumerable: true, get: function () { return types_1.isKnowledgeLink; } });
// Sync State Manager (WF-4)
var context_hub_1 = require("./context-hub");
Object.defineProperty(exports, "SyncStateManager", { enumerable: true, get: function () { return context_hub_1.SyncStateManager; } });
Object.defineProperty(exports, "createSyncStateManager", { enumerable: true, get: function () { return context_hub_1.createSyncStateManager; } });
// Audit Logger (WF-6)
var audit_log_1 = require("./audit-log");
Object.defineProperty(exports, "AuditLogger", { enumerable: true, get: function () { return audit_log_1.AuditLogger; } });
Object.defineProperty(exports, "createAuditLogger", { enumerable: true, get: function () { return audit_log_1.createAuditLogger; } });
Object.defineProperty(exports, "createSessionStartEntry", { enumerable: true, get: function () { return audit_log_1.createSessionStartEntry; } });
Object.defineProperty(exports, "createWorkpackageActivationEntry", { enumerable: true, get: function () { return audit_log_1.createWorkpackageActivationEntry; } });
Object.defineProperty(exports, "createKnowledgeLinkEntry", { enumerable: true, get: function () { return audit_log_1.createKnowledgeLinkEntry; } });
Object.defineProperty(exports, "createSyncCompleteEntry", { enumerable: true, get: function () { return audit_log_1.createSyncCompleteEntry; } });
// Session Sync (WF-1)
var session_sync_1 = require("./session-sync");
Object.defineProperty(exports, "syncSession", { enumerable: true, get: function () { return session_sync_1.syncSession; } });
Object.defineProperty(exports, "createSessionSyncHandler", { enumerable: true, get: function () { return session_sync_1.createSessionSyncHandler; } });
Object.defineProperty(exports, "hasSessionChanged", { enumerable: true, get: function () { return session_sync_1.hasSessionChanged; } });
// Plan Roll-up (WF-2a)
var plan_rollup_1 = require("./plan-rollup");
Object.defineProperty(exports, "rollupPlanProgress", { enumerable: true, get: function () { return plan_rollup_1.rollupPlanProgress; } });
Object.defineProperty(exports, "createPlanRollupHandler", { enumerable: true, get: function () { return plan_rollup_1.createPlanRollupHandler; } });
Object.defineProperty(exports, "getUpcomingMilestones", { enumerable: true, get: function () { return plan_rollup_1.getUpcomingMilestones; } });
// Plan → Workpackage Propagation (WF-2b)
var plan_propagate_1 = require("./plan-propagate");
Object.defineProperty(exports, "insertWorkpackage", { enumerable: true, get: function () { return plan_propagate_1.insertWorkpackage; } });
Object.defineProperty(exports, "deferWorkpackage", { enumerable: true, get: function () { return plan_propagate_1.deferWorkpackage; } });
Object.defineProperty(exports, "reorderWorkpackage", { enumerable: true, get: function () { return plan_propagate_1.reorderWorkpackage; } });
Object.defineProperty(exports, "createInsertHandler", { enumerable: true, get: function () { return plan_propagate_1.createInsertHandler; } });
Object.defineProperty(exports, "createDeferHandler", { enumerable: true, get: function () { return plan_propagate_1.createDeferHandler; } });
Object.defineProperty(exports, "createReorderHandler", { enumerable: true, get: function () { return plan_propagate_1.createReorderHandler; } });
Object.defineProperty(exports, "validatePosition", { enumerable: true, get: function () { return plan_propagate_1.validatePosition; } });
Object.defineProperty(exports, "getMaxPosition", { enumerable: true, get: function () { return plan_propagate_1.getMaxPosition; } });
// Knowledge Linking (WF-3a)
var knowledge_linker_1 = require("./knowledge-linker");
Object.defineProperty(exports, "linkKnowledge", { enumerable: true, get: function () { return knowledge_linker_1.linkKnowledge; } });
Object.defineProperty(exports, "unlinkKnowledge", { enumerable: true, get: function () { return knowledge_linker_1.unlinkKnowledge; } });
Object.defineProperty(exports, "getKnowledgeByWorkpackage", { enumerable: true, get: function () { return knowledge_linker_1.getKnowledgeByWorkpackage; } });
Object.defineProperty(exports, "getKnowledgeByPhase", { enumerable: true, get: function () { return knowledge_linker_1.getKnowledgeByPhase; } });
Object.defineProperty(exports, "getWorkpackagesWithKnowledge", { enumerable: true, get: function () { return knowledge_linker_1.getWorkpackagesWithKnowledge; } });
Object.defineProperty(exports, "updateLinkStatus", { enumerable: true, get: function () { return knowledge_linker_1.updateLinkStatus; } });
Object.defineProperty(exports, "isKnowledgeLinked", { enumerable: true, get: function () { return knowledge_linker_1.isKnowledgeLinked; } });
Object.defineProperty(exports, "getLinksForKnowledge", { enumerable: true, get: function () { return knowledge_linker_1.getLinksForKnowledge; } });
Object.defineProperty(exports, "createAutoLinkHandler", { enumerable: true, get: function () { return knowledge_linker_1.createAutoLinkHandler; } });
// Deprecation Propagation (WF-3b)
var deprecation_1 = require("./deprecation");
Object.defineProperty(exports, "deprecateOnDefer", { enumerable: true, get: function () { return deprecation_1.deprecateOnDefer; } });
Object.defineProperty(exports, "supersedeKnowledge", { enumerable: true, get: function () { return deprecation_1.supersedeKnowledge; } });
Object.defineProperty(exports, "getDeprecationWarnings", { enumerable: true, get: function () { return deprecation_1.getDeprecationWarnings; } });
Object.defineProperty(exports, "clearDeprecationWarning", { enumerable: true, get: function () { return deprecation_1.clearDeprecationWarning; } });
Object.defineProperty(exports, "hasDeprecationWarnings", { enumerable: true, get: function () { return deprecation_1.hasDeprecationWarnings; } });
Object.defineProperty(exports, "getDeprecatedCount", { enumerable: true, get: function () { return deprecation_1.getDeprecatedCount; } });
Object.defineProperty(exports, "createDeprecationHandler", { enumerable: true, get: function () { return deprecation_1.createDeprecationHandler; } });
// Debug CLI (WF-7)
var debug_cli_1 = require("./cli/debug-cli");
Object.defineProperty(exports, "DebugCLI", { enumerable: true, get: function () { return debug_cli_1.DebugCLI; } });
Object.defineProperty(exports, "runDebugCLI", { enumerable: true, get: function () { return debug_cli_1.main; } });
// Error Handler (WF-5)
var error_handler_1 = require("./error-handler");
Object.defineProperty(exports, "SyncError", { enumerable: true, get: function () { return error_handler_1.SyncError; } });
Object.defineProperty(exports, "ErrorHandlerService", { enumerable: true, get: function () { return error_handler_1.ErrorHandlerService; } });
Object.defineProperty(exports, "createErrorHandler", { enumerable: true, get: function () { return error_handler_1.createErrorHandler; } });
Object.defineProperty(exports, "withRetry", { enumerable: true, get: function () { return error_handler_1.withRetry; } });
Object.defineProperty(exports, "calculateBackoff", { enumerable: true, get: function () { return error_handler_1.calculateBackoff; } });
Object.defineProperty(exports, "sleep", { enumerable: true, get: function () { return error_handler_1.sleep; } });
Object.defineProperty(exports, "categorizeError", { enumerable: true, get: function () { return error_handler_1.categorizeError; } });
Object.defineProperty(exports, "buildErrorContext", { enumerable: true, get: function () { return error_handler_1.buildErrorContext; } });
Object.defineProperty(exports, "parseUserChoice", { enumerable: true, get: function () { return error_handler_1.parseUserChoice; } });
Object.defineProperty(exports, "formatErrorForUser", { enumerable: true, get: function () { return error_handler_1.formatErrorForUser; } });
Object.defineProperty(exports, "getManualRepairSteps", { enumerable: true, get: function () { return error_handler_1.getManualRepairSteps; } });
Object.defineProperty(exports, "USER_OPTIONS", { enumerable: true, get: function () { return error_handler_1.USER_OPTIONS; } });
//# sourceMappingURL=index.js.map