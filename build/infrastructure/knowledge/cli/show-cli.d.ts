#!/usr/bin/env npx ts-node
/**
 * Knowledge Show CLI
 *
 * CLI tool for displaying comprehensive details of a single knowledge entry.
 * Used by /cf-knowledge show <id>.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/show-cli.ts --clear-dir=/path/.clear --id=TD-048
 */
import { KnowledgeEntry } from '../types';
/**
 * Format a knowledge entry for detailed display
 * @param entry - Knowledge entry to format
 * @returns Formatted string output
 */
export declare function formatEntry(entry: KnowledgeEntry, options?: {
    relatedFiles?: string[];
    wpDisplayId?: string;
    phaseDisplayId?: string;
    clearDir?: string;
}): string;
/**
 * Run knowledge show CLI
 * @param clearDir - Path to .clear directory
 * @param id - Knowledge entry ID
 * @returns CLI result
 */
export declare function runShowCLI(clearDir: string, id: string): Promise<{
    success: boolean;
    output: string;
    entry?: KnowledgeEntry;
}>;
//# sourceMappingURL=show-cli.d.ts.map