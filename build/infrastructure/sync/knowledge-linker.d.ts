/**
 * Knowledge ↔ Workpackage/Plan Linking (WF-3a)
 *
 * Maintains bidirectional links between knowledge entries and work items
 * using systemId references for stability.
 *
 * Key Features:
 * - Auto-link knowledge to active workpackage on capture
 * - Link by systemId (NOT display ID) for stability
 * - Query knowledge by workpackage/phase
 * - Track link status (active, deprecated, superseded)
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.4.
 */
import { KnowledgeLink, KnowledgeLinkStatus, AuditDomain } from './types';
/**
 * Input for linking knowledge to workpackage
 */
export interface LinkKnowledgeInput {
    /** Project root directory */
    basePath: string;
    /** Current Claude Code session GUID */
    sessionId: string;
    /** Current CLEAR session number */
    sessionNumber: number;
    /** Knowledge entry ID (e.g., "TD-025") */
    knowledgeId: string;
    /** Knowledge entry title */
    knowledgeTitle: string;
    /** Workpackage systemId to link to (optional, uses active if not specified) */
    workpackageSystemId?: string;
    /** Phase systemId (optional, uses active if not specified) */
    phaseSystemId?: string;
    /** Link source: auto (during capture) or manual (user specified) */
    linkedBy?: 'auto' | 'manual' | string;
}
/**
 * Result of link operation
 */
export interface LinkKnowledgeResult {
    /** Operation status */
    status: 'success' | 'error' | 'no_workpackage' | 'already_linked';
    /** Created link */
    link?: KnowledgeLink;
    /** Domains updated */
    domainsUpdated: AuditDomain[];
    /** Operation timestamp */
    timestamp: string;
    /** Error message */
    error?: string;
}
/**
 * Input for unlinking knowledge
 */
export interface UnlinkKnowledgeInput {
    /** Project root directory */
    basePath: string;
    /** Current Claude Code session GUID */
    sessionId: string;
    /** Current CLEAR session number */
    sessionNumber: number;
    /** Knowledge entry ID */
    knowledgeId: string;
    /** Workpackage systemId to unlink from */
    workpackageSystemId: string;
}
/**
 * Result of unlink operation
 */
export interface UnlinkKnowledgeResult {
    /** Operation status */
    status: 'success' | 'error' | 'not_found';
    /** Domains updated */
    domainsUpdated: AuditDomain[];
    /** Operation timestamp */
    timestamp: string;
    /** Error message */
    error?: string;
}
/**
 * Input for querying knowledge by workpackage
 */
export interface QueryByWorkpackageInput {
    /** Project root directory */
    basePath: string;
    /** Workpackage systemId */
    workpackageSystemId: string;
    /** Filter by link status (optional) */
    statusFilter?: KnowledgeLinkStatus;
}
/**
 * Input for querying knowledge by phase
 */
export interface QueryByPhaseInput {
    /** Project root directory */
    basePath: string;
    /** Phase systemId */
    phaseSystemId: string;
    /** Filter by link status (optional) */
    statusFilter?: KnowledgeLinkStatus;
}
/**
 * Knowledge link summary
 */
export interface KnowledgeLinkSummary {
    /** Knowledge entry ID */
    id: string;
    /** Knowledge entry title */
    title: string;
    /** Link status */
    status: KnowledgeLinkStatus;
    /** When linked */
    linkedAt: string;
    /** Entry type (TD, PAT, BR, LES) */
    entryType?: string;
}
/**
 * Link a knowledge entry to a workpackage.
 *
 * Uses systemId for stability - links survive plan restructuring.
 *
 * @param input - Link knowledge input
 * @returns Link result
 */
export declare function linkKnowledge(input: LinkKnowledgeInput): Promise<LinkKnowledgeResult>;
/**
 * Remove link between knowledge entry and workpackage.
 *
 * @param input - Unlink knowledge input
 * @returns Unlink result
 */
export declare function unlinkKnowledge(input: UnlinkKnowledgeInput): Promise<UnlinkKnowledgeResult>;
/**
 * Get all knowledge entries linked to a workpackage.
 *
 * @param input - Query input
 * @returns Array of knowledge link summaries
 */
export declare function getKnowledgeByWorkpackage(input: QueryByWorkpackageInput): KnowledgeLinkSummary[];
/**
 * Get all knowledge entries linked to a phase (across all workpackages in phase).
 *
 * @param input - Query input
 * @returns Array of knowledge link summaries
 */
export declare function getKnowledgeByPhase(input: QueryByPhaseInput): KnowledgeLinkSummary[];
/**
 * Get all workpackages that have knowledge linked.
 *
 * @param basePath - Project root directory
 * @returns Array of workpackage systemIds with link counts
 */
export declare function getWorkpackagesWithKnowledge(basePath: string): Array<{
    workpackageSystemId: string;
    linkCount: number;
    activeCount: number;
    deprecatedCount: number;
}>;
/**
 * Update the status of a knowledge link.
 *
 * @param basePath - Project root directory
 * @param knowledgeId - Knowledge entry ID
 * @param workpackageSystemId - Workpackage systemId
 * @param newStatus - New link status
 * @returns true if updated
 */
export declare function updateLinkStatus(basePath: string, knowledgeId: string, workpackageSystemId: string, newStatus: KnowledgeLinkStatus): boolean;
/**
 * Create an auto-link handler for use during knowledge capture.
 *
 * @param basePath - Project root directory
 * @returns Function that auto-links knowledge on capture
 */
export declare function createAutoLinkHandler(basePath: string): (sessionId: string, sessionNumber: number, knowledgeId: string, knowledgeTitle: string) => Promise<LinkKnowledgeResult>;
/**
 * Check if a knowledge entry is linked to any workpackage.
 *
 * @param basePath - Project root directory
 * @param knowledgeId - Knowledge entry ID
 * @returns true if linked to at least one workpackage
 */
export declare function isKnowledgeLinked(basePath: string, knowledgeId: string): boolean;
/**
 * Get all links for a knowledge entry.
 *
 * @param basePath - Project root directory
 * @param knowledgeId - Knowledge entry ID
 * @returns Array of links
 */
export declare function getLinksForKnowledge(basePath: string, knowledgeId: string): KnowledgeLink[];
//# sourceMappingURL=knowledge-linker.d.ts.map