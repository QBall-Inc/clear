/**
 * Deprecation Propagation (WF-3b)
 *
 * Propagates knowledge deprecation status to linked workpackages.
 * Handles supersession chains and generates warnings for linked items.
 *
 * Key Features:
 * - Mark linked knowledge as deprecated when workpackage deferred
 * - Propagate supersession through references
 * - Generate deprecation warnings in sync state
 * - Support auto-migration of superseded references
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.5.
 */
import { AuditDomain } from './types';
import { KnowledgeDatabase } from '../knowledge/db';
/**
 * Input for deprecating knowledge when workpackage deferred
 */
export interface DeprecateOnDeferInput {
    /** Project root directory */
    basePath: string;
    /** Current Claude Code session GUID */
    sessionId: string;
    /** Current CLEAR session number */
    sessionNumber: number;
    /** Deferred workpackage systemId */
    deferredWorkpackageSystemId: string;
    /** Action to take on linked knowledge */
    action: 'deprecate' | 'warn' | 'none';
}
/**
 * Result of deprecation propagation
 */
export interface DeprecateOnDeferResult {
    /** Operation status */
    status: 'success' | 'error' | 'no_links';
    /** Knowledge entries affected */
    affectedEntries: string[];
    /** Warnings generated */
    warnings: string[];
    /** Domains updated */
    domainsUpdated: AuditDomain[];
    /** Operation timestamp */
    timestamp: string;
    /** Error message */
    error?: string;
}
/**
 * Input for superseding a knowledge entry
 */
export interface SupersedeKnowledgeInput {
    /** Project root directory */
    basePath: string;
    /** Current Claude Code session GUID */
    sessionId: string;
    /** Current CLEAR session number */
    sessionNumber: number;
    /** Knowledge entry being superseded */
    oldKnowledgeId: string;
    /** New knowledge entry that supersedes */
    newKnowledgeId: string;
    /** Whether to migrate links from old to new */
    migrateLinks?: boolean;
}
/**
 * Result of supersession
 */
export interface SupersedeKnowledgeResult {
    /** Operation status */
    status: 'success' | 'error' | 'not_found';
    /** Links migrated (if migrateLinks was true) */
    linksMigrated?: number;
    /** Domains updated */
    domainsUpdated: AuditDomain[];
    /** Operation timestamp */
    timestamp: string;
    /** Error message */
    error?: string;
}
/**
 * Deprecation warning
 */
export interface DeprecationWarning {
    /** Knowledge entry ID */
    knowledgeId: string;
    /** Knowledge entry title */
    title: string;
    /** Reason for deprecation */
    reason: string;
    /** Affected workpackage systemId */
    workpackageSystemId: string;
    /** Suggested action */
    suggestedAction: string;
    /** Superseded by — terminal entry after chain traversal (if applicable) */
    supersededBy?: string;
    /** Deprecation type: 'historic' for WP-deferred, 'obsolete' for superseded */
    deprecation_type?: 'historic' | 'obsolete';
}
/**
 * Propagate deprecation when a workpackage is deferred.
 *
 * Options:
 * - 'deprecate': Mark all linked knowledge as deprecated
 * - 'warn': Add deprecation warnings but don't change status
 * - 'none': Do nothing (for manual review)
 *
 * @param input - Deprecation input
 * @returns Deprecation result
 */
export declare function deprecateOnDefer(input: DeprecateOnDeferInput): Promise<DeprecateOnDeferResult>;
/**
 * Mark a knowledge entry as superseded by another.
 *
 * Optionally migrates links from the old entry to the new one.
 *
 * @param input - Supersession input
 * @returns Supersession result
 */
export declare function supersedeKnowledge(input: SupersedeKnowledgeInput): Promise<SupersedeKnowledgeResult>;
/**
 * Resolve a supersession chain to its terminal entry.
 *
 * Follows superseded_by links in the knowledge DB from a starting entry
 * to the final (non-superseded) entry. Cycle-safe via visited set.
 *
 * @param basePath - Project root directory
 * @param startId - Knowledge entry ID to start from
 * @param maxDepth - Maximum chain depth (default 20)
 * @returns Terminal entry ID, or startId if no chain exists
 */
export declare function resolveSupersessionChain(basePath: string, startId: string, maxDepth?: number, existingDb?: KnowledgeDatabase): string;
/**
 * Get all deprecation warnings from sync state.
 *
 * For superseded entries, resolves the supersession chain to the terminal
 * entry and includes it in the warning. Differentiates between 'historic'
 * (WP-deferred) and 'obsolete' (superseded) deprecation types.
 *
 * @param basePath - Project root directory
 * @returns Array of deprecation warnings
 */
export declare function getDeprecationWarnings(basePath: string): DeprecationWarning[];
/**
 * Check whether a knowledge entry is "orphan" from the perspective of the
 * session-start deprecation banner:
 *   - its markdown file is missing, OR
 *   - related_files is non-empty AND none of the referenced files exist on disk.
 *
 * Entries with no related_files array are NOT considered orphan (we can't judge
 * from missing metadata alone — keep the warning so the user can decide).
 *
 * @param basePath - Project root directory
 * @param id - Knowledge entry ID (e.g., "TD-001")
 */
export declare function isOrphanDeprecation(basePath: string, id: string): boolean;
/**
 * Clear deprecation warnings for a knowledge entry.
 *
 * @param basePath - Project root directory
 * @param knowledgeId - Knowledge entry ID
 * @returns true if cleared
 */
export declare function clearDeprecationWarning(basePath: string, knowledgeId: string): boolean;
/**
 * Create a deprecation handler for use with workpackage defer.
 *
 * @param basePath - Project root directory
 * @param action - Default action to take
 * @returns Handler function
 */
export declare function createDeprecationHandler(basePath: string, action?: 'deprecate' | 'warn' | 'none'): (sessionId: string, sessionNumber: number, deferredWorkpackageSystemId: string) => Promise<DeprecateOnDeferResult>;
/**
 * Check if any knowledge entries have deprecation warnings.
 *
 * @param basePath - Project root directory
 * @returns true if there are deprecation warnings
 */
export declare function hasDeprecationWarnings(basePath: string): boolean;
/**
 * Get count of deprecated knowledge entries.
 *
 * @param basePath - Project root directory
 * @returns Count of deprecated entries
 */
export declare function getDeprecatedCount(basePath: string): number;
/**
 * Options for performSupersession
 */
export interface PerformSupersessionOptions {
    /** Session ID for audit logging */
    sessionId: string;
    /** Session number for audit logging */
    sessionNumber: number;
    /** Whether to migrate WP links from old to new entry (default: read from config) */
    migrateLinks?: boolean;
}
/**
 * Result of performSupersession
 */
export interface PerformSupersessionResult {
    /** 'success' = all domains updated, 'partial' = some failed (check warnings), 'error' = validation or total failure */
    status: 'success' | 'partial' | 'error';
    /** Domains that were successfully updated */
    domainsUpdated: AuditDomain[];
    /** Number of WP links migrated from old to new entry */
    linksMigrated: number;
    /** related_files inherited from old entry */
    relatedFilesInherited: string[];
    /** Per-domain failure messages (present when status is 'partial') */
    warnings: string[];
    timestamp: string;
    error?: string;
}
/**
 * Single entry point for ALL supersession side effects.
 *
 * Updates atomically across all stores:
 * 1. Knowledge DB — status='superseded', superseded_by, superseded_at, deprecation_type='obsolete'
 * 2. Markdown frontmatter — status, superseded_by on old entry
 * 3. Sync-state — WP link migration (old→new), old link status='superseded' + deprecation_type='obsolete'
 * 4. Reverse file-knowledge index — updated for new entry with merged related_files
 *
 * @param basePath - Project root directory
 * @param oldId - Knowledge entry being superseded
 * @param newId - Knowledge entry that supersedes
 * @param options - Session context and migration flag
 */
export declare function performSupersession(basePath: string, oldId: string, newId: string, options: PerformSupersessionOptions): Promise<PerformSupersessionResult>;
//# sourceMappingURL=deprecation.d.ts.map