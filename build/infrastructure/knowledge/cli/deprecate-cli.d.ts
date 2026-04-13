#!/usr/bin/env npx ts-node
/**
 * Knowledge Deprecate CLI
 *
 * CLI tool for deprecating knowledge entries with impact analysis.
 * Deprecation is human-initiated only - marks knowledge as outdated
 * when no replacement exists.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/deprecate-cli.ts <id> --clear-dir=/path/.clear
 *   npx ts-node src/infrastructure/knowledge/cli/deprecate-cli.ts <id> --reason="Outdated approach" --clear-dir=/path/.clear
 *   npx ts-node src/infrastructure/knowledge/cli/deprecate-cli.ts <id> --force --clear-dir=/path/.clear
 */
import { KnowledgeDatabase } from '../db';
import { KnowledgeEntry } from '../types';
/**
 * Deprecation impact analysis result
 */
export interface DeprecationImpact {
    workpackages: Array<{
        systemId: string;
        displayId: string;
    }>;
    otherEntries: Array<{
        id: string;
        title: string;
        relationship: 'supersedes' | 'superseded_by';
    }>;
    hasReferences: boolean;
}
/**
 * Deprecate operation result
 */
export interface DeprecateResult {
    success: boolean;
    output: string;
    entryId?: string;
    impact?: DeprecationImpact;
    deprecated?: boolean;
}
/**
 * Knowledge not found error
 */
export declare class KnowledgeNotFoundError extends Error {
    readonly id: string;
    constructor(id: string);
}
/**
 * Invalid deprecation error
 */
export declare class InvalidDeprecationError extends Error {
    constructor(message: string);
}
/**
 * Get deprecation impact analysis for a knowledge entry
 * @param db - Knowledge database
 * @param entryId - Knowledge entry ID
 * @returns Impact analysis
 */
export declare function getDeprecationImpact(db: KnowledgeDatabase, entryId: string): DeprecationImpact;
/**
 * Format impact analysis for display
 * @param impact - Deprecation impact
 * @returns Formatted string
 */
export declare function formatImpactAnalysis(impact: DeprecationImpact): string;
/**
 * Validate entry for deprecation
 * @param entry - Knowledge entry
 * @throws InvalidDeprecationError if entry cannot be deprecated
 */
export declare function validateEntryForDeprecation(entry: KnowledgeEntry): void;
/**
 * Run deprecate CLI
 * @param clearDir - Path to .clear directory
 * @param entryId - Knowledge entry ID to deprecate
 * @param options - Deprecation options
 * @returns Deprecate result
 */
export declare function runDeprecateCLI(clearDir: string, entryId: string, options?: {
    reason?: string;
    force?: boolean;
    sessionId?: string;
    sessionNumber?: number;
}): Promise<DeprecateResult>;
//# sourceMappingURL=deprecate-cli.d.ts.map