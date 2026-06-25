#!/usr/bin/env npx ts-node
/**
 * Knowledge Status CLI
 *
 * CLI tool for displaying knowledge base overview and statistics.
 * Default command for /cf-knowledge.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/status-cli.ts --clear-dir=/path/.clear [--json]
 */
import { KnowledgeDatabase } from '../db';
import { KnowledgeType, KnowledgeStatus } from '../types';
/**
 * Anomaly enumeration surfaced under the "Anomalies" section in human-readable
 * output and as the `anomalies` object in JSON output. Empty categories emit
 * empty arrays (not absent keys) so downstream tooling sees a consistent
 * schema.
 */
export interface KnowledgeAnomalies {
    malformed_prefix: string[];
    missing_required_fields: Array<{
        entry_id: string;
        missing_fields: string[];
    }>;
    orphan_deprecated_refs: string[];
}
/**
 * Reconcile counts. Always rendered — even when all counts agree — so users
 * learn the Anomalies section exists.
 */
export interface KnowledgeCounts {
    files_on_disk: number;
    indexed: number;
    excluded: number;
}
/**
 * Knowledge base statistics.
 *
 * `byStatus` covers every KnowledgeStatus value; `byType` covers every
 * KnowledgeType value. Both are typed as `Record<UnionType, number>` so a
 * future status / type addition fails typecheck at this surface instead of
 * silently truncating downstream consumers.
 */
export interface KnowledgeStats {
    total: number;
    byStatus: Record<KnowledgeStatus, number>;
    byType: Record<KnowledgeType, number>;
    recentActivity: Array<{
        id: string;
        title: string;
        created: string;
        created_session: number;
        workpackage_id: string | null;
    }>;
    indexStatus: {
        lastRebuilt: string | null;
        lastSession: number | null;
        entriesIndexed: number;
    };
    anomalies: KnowledgeAnomalies;
    counts: KnowledgeCounts;
}
/**
 * Get knowledge base statistics
 * @param db - Knowledge database instance
 * @param clearDir - Path to .clear directory (used for Anomalies enumeration)
 * @returns Statistics object
 */
export declare function getKnowledgeStats(db: KnowledgeDatabase, clearDir: string): KnowledgeStats;
/**
 * Enumerate knowledge-base anomalies + compute reconcile counts. Four
 * categories:
 *   (1) malformed_prefix — filenames in entries/ not matching
 *       VALID_ENTRY_FILENAME_REGEX (imported from types.ts).
 *   (2) missing_required_fields — entries with valid filenames but missing
 *       one or more REQUIRED_FRONTMATTER_FIELDS (imported from types.ts).
 *   (3) orphan_deprecated_refs — IDs in
 *       sync-state.knowledge.deprecatedReferences with no corresponding
 *       .md file on disk.
 *   (4) counts — files_on_disk / indexed / excluded for the reconcile line.
 *
 * @internal Exported for testing
 */
export declare function getAnomalies(clearDir: string, db: KnowledgeDatabase): {
    anomalies: KnowledgeAnomalies;
    counts: KnowledgeCounts;
};
/**
 * Format statistics for display
 * @param stats - Knowledge statistics
 * @returns Formatted string output
 */
export declare function formatStats(stats: KnowledgeStats): string;
/**
 * Run knowledge status CLI
 * @param clearDir - Path to .clear directory
 * @param options - { json: boolean } — when true, emit JSON shape instead of human text
 * @returns CLI result
 */
export declare function runStatusCLI(clearDir: string, options?: {
    json?: boolean;
}): Promise<{
    success: boolean;
    output: string;
    stats?: KnowledgeStats;
}>;
//# sourceMappingURL=status-cli.d.ts.map