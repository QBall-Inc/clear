/**
 * Cross-Domain Sync Module (P1.6)
 *
 * Provides cross-domain synchronization, audit logging, and state management
 * for the CLEAR framework.
 *
 * @module infrastructure/sync
 */
export { DualIdEntity, WorkpackageDualId, PhaseDualId, WorkpackageStatus, PhaseStatus, generateWorkpackageSystemId, generatePhaseSystemId, generateSystemIdFromLegacy, calculateDisplayId, isWorkpackage, isWorkpackageSystemId, isPhaseSystemId, SyncState, SessionSummary, WorkpackageSummary, PreviousWorkpackage, PauseReason, PlanSummary, KnowledgeSummary, CrossDomainLinks, StateHashes, DEFAULT_SYNC_STATE, createDefaultSyncState, KnowledgeLink, KnowledgeLinkStatus, AuditEntry, AuditIndex, AuditIndexEntry, AuditDomain, AuditAction, AuditTrigger, DEFAULT_AUDIT_INDEX, createDefaultAuditIndex, SyncConfig, SyncMode, AuditConfig, ChangeDetectionConfig, ErrorHandlingConfig, KnowledgeLinkingConfig, CrossDomainSyncConfig, DEFAULT_SYNC_CONFIG, ErrorCategory, ErrorHandler, ErrorContext, UserOption, ERROR_HANDLERS, SyncStatus, SyncResult, DomainSyncResult, ChangeDetectionResult, PositionUpdate, InsertResult, ReorderResult, IssueSeverity, ValidationIssue, DebugReport, isAuditEntry, isSyncState, isKnowledgeLink } from './types';
export { SyncStateManager, createSyncStateManager } from './context-hub';
export { AuditLogger, createAuditLogger, createSessionStartEntry, createWorkpackageActivationEntry, createKnowledgeLinkEntry, createSyncCompleteEntry } from './audit-log';
export { syncSession, createSessionSyncHandler, hasSessionChanged, SessionSyncInput, SessionSyncResult, SessionSyncStatus } from './session-sync';
export { rollupPlanProgress, createPlanRollupHandler, getUpcomingMilestones, PlanRollupInput, PlanRollupResult, PlanRollupStatus, MilestoneAchievement } from './plan-rollup';
export { insertWorkpackage, deferWorkpackage, reorderWorkpackage, createInsertHandler, createDeferHandler, createReorderHandler, validatePosition, getMaxPosition, InsertWorkpackageInput, InsertWorkpackageResult, DeferWorkpackageInput, DeferWorkpackageResult, ReorderWorkpackageInput, ReorderWorkpackageResult, PropagationStatus } from './plan-propagate';
export { linkKnowledge, unlinkKnowledge, getKnowledgeByWorkpackage, getKnowledgeByPhase, getWorkpackagesWithKnowledge, updateLinkStatus, isKnowledgeLinked, getLinksForKnowledge, createAutoLinkHandler, LinkKnowledgeInput, LinkKnowledgeResult, UnlinkKnowledgeInput, UnlinkKnowledgeResult, QueryByWorkpackageInput, QueryByPhaseInput, KnowledgeLinkSummary } from './knowledge-linker';
export { deprecateOnDefer, supersedeKnowledge, getDeprecationWarnings, clearDeprecationWarning, hasDeprecationWarnings, getDeprecatedCount, createDeprecationHandler, DeprecateOnDeferInput, DeprecateOnDeferResult, SupersedeKnowledgeInput, SupersedeKnowledgeResult, DeprecationWarning } from './deprecation';
export { DebugCLI, main as runDebugCLI, DebugOptions, RepairResult } from './cli/debug-cli';
export { SyncError, ErrorHandlerService, createErrorHandler, withRetry, calculateBackoff, sleep, categorizeError, buildErrorContext, parseUserChoice, formatErrorForUser, getManualRepairSteps, USER_OPTIONS, RetryState, RetryResult, UserChoice, ErrorHandlingResult } from './error-handler';
//# sourceMappingURL=index.d.ts.map