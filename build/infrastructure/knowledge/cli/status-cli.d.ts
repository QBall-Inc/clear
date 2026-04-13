#!/usr/bin/env npx ts-node
/**
 * Knowledge Status CLI
 *
 * CLI tool for displaying knowledge base overview and statistics.
 * Default command for /cf-knowledge.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/status-cli.ts --clear-dir=/path/.clear
 */
import { KnowledgeDatabase } from '../db';
/**
 * Knowledge base statistics
 */
export interface KnowledgeStats {
    total: number;
    byStatus: {
        active: number;
        superseded: number;
        deprecated: number;
    };
    byType: {
        'technical-decision': number;
        'business-rule': number;
        'architectural-pattern': number;
        'lesson-learned': number;
    };
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
}
/**
 * Get knowledge base statistics
 * @param db - Knowledge database instance
 * @returns Statistics object
 */
export declare function getKnowledgeStats(db: KnowledgeDatabase): KnowledgeStats;
/**
 * Format statistics for display
 * @param stats - Knowledge statistics
 * @returns Formatted string output
 */
export declare function formatStats(stats: KnowledgeStats): string;
/**
 * Run knowledge status CLI
 * @param clearDir - Path to .clear directory
 * @returns CLI result
 */
export declare function runStatusCLI(clearDir: string): Promise<{
    success: boolean;
    output: string;
    stats?: KnowledgeStats;
}>;
//# sourceMappingURL=status-cli.d.ts.map