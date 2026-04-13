#!/usr/bin/env npx ts-node
/**
 * Knowledge Supersede CLI
 *
 * CLI tool for creating supersession relationships between knowledge entries.
 * Supersession marks one entry as replaced by another, with chain depth limits.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/supersede-cli.ts <old> <new> --clear-dir=/path/.clear
 *   npx ts-node src/infrastructure/knowledge/cli/supersede-cli.ts <old> <new> --force --clear-dir=/path/.clear
 */
import { KnowledgeDatabase } from '../db';
import { KnowledgeEntry } from '../types';
/**
 * Maximum allowed supersession chain depth
 */
export declare const MAX_CHAIN_DEPTH = 3;
/**
 * Chain validation result
 */
export interface ChainValidation {
    valid: boolean;
    depth: number;
    chain: string[];
}
/**
 * Supersede operation result
 */
export interface SupersedeResult {
    success: boolean;
    output: string;
    oldEntryId?: string;
    newEntryId?: string;
    chainDepth?: number;
    superseded?: boolean;
}
/**
 * Knowledge not found error
 */
export declare class KnowledgeNotFoundError extends Error {
    readonly id: string;
    constructor(id: string);
}
/**
 * Chain depth exceeded error
 */
export declare class ChainDepthExceededError extends Error {
    readonly chain: string[];
    readonly depth: number;
    constructor(chain: string[], depth: number);
}
/**
 * Invalid supersession error
 */
export declare class InvalidSupersessionError extends Error {
    constructor(message: string);
}
/**
 * Validate supersession chain depth
 * @param db - Knowledge database
 * @param oldEntryId - Entry being superseded
 * @param newEntryId - Entry that supersedes
 * @returns Chain validation result
 */
export declare function validateChainDepth(db: KnowledgeDatabase, oldEntryId: string, newEntryId: string): ChainValidation;
/**
 * Validate entries for supersession
 * @param oldEntry - Entry being superseded
 * @param newEntry - Entry that supersedes
 * @throws InvalidSupersessionError if entries cannot be superseded
 */
export declare function validateEntriesForSupersession(oldEntry: KnowledgeEntry, newEntry: KnowledgeEntry): void;
/**
 * Format chain for display
 * @param chain - Array of entry IDs
 * @returns Formatted chain string
 */
export declare function formatChain(chain: string[]): string;
/**
 * Run supersede CLI
 * @param clearDir - Path to .clear directory
 * @param oldEntryId - Entry to be superseded
 * @param newEntryId - Entry that supersedes
 * @param options - Supersession options
 * @returns Supersede result
 */
export declare function runSupersedeCLI(clearDir: string, oldEntryId: string, newEntryId: string, options?: {
    force?: boolean;
    sessionId?: string;
    sessionNumber?: number;
}): Promise<SupersedeResult>;
//# sourceMappingURL=supersede-cli.d.ts.map