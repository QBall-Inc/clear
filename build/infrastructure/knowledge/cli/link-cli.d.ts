#!/usr/bin/env npx ts-node
/**
 * Knowledge Link/Unlink CLI
 *
 * CLI tools for manually linking and unlinking knowledge entries
 * to/from workpackages.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/link-cli.ts link <id> --to <wp> --clear-dir=/path/.clear
 *   npx ts-node src/infrastructure/knowledge/cli/link-cli.ts unlink <id> --clear-dir=/path/.clear
 */
import { KnowledgeEntry } from '../types';
/**
 * Link operation result
 *
 * mdWritten + wpYamlWritten expose per-surface telemetry so callers
 * (e.g., capture-cli's auto-link path — WP-PS7 phase_b AC14) can gate
 * user-facing "(linked to Y)" messaging on all-three-surface success.
 */
export interface LinkResult {
    success: boolean;
    output: string;
    entryId?: string;
    workpackageId?: string;
    phaseId?: string;
    mdWritten?: boolean;
    wpYamlWritten?: boolean;
}
/**
 * Unlink operation result
 */
export interface UnlinkResult {
    success: boolean;
    output: string;
    entryId?: string;
    previousWorkpackageId?: string;
}
/**
 * Knowledge not found error
 */
export declare class KnowledgeNotFoundError extends Error {
    readonly id: string;
    constructor(id: string);
}
/**
 * Workpackage not found error
 */
export declare class WorkpackageNotFoundError extends Error {
    readonly id: string;
    constructor(id: string);
}
/**
 * Invalid link operation error
 */
export declare class InvalidLinkError extends Error {
    constructor(message: string);
}
/**
 * Validate knowledge entry for linking
 * @param entry - Knowledge entry
 * @returns True if valid for linking
 * @throws InvalidLinkError if entry cannot be linked
 */
export declare function validateEntryForLinking(entry: KnowledgeEntry): boolean;
/**
 * Run link CLI
 * @param clearDir - Path to .clear directory
 * @param entryId - Knowledge entry ID
 * @param workpackageId - Workpackage ID (display or system)
 * @param options - Optional audit configuration
 * @returns Link result
 */
export declare function runLinkCLI(clearDir: string, entryId: string, workpackageId: string, options?: {
    sessionId?: string;
    sessionNumber?: number;
}): Promise<LinkResult>;
/**
 * Run unlink CLI
 * @param clearDir - Path to .clear directory
 * @param entryId - Knowledge entry ID
 * @param options - Optional audit configuration
 * @returns Unlink result
 */
export declare function runUnlinkCLI(clearDir: string, entryId: string, options?: {
    sessionId?: string;
    sessionNumber?: number;
}): Promise<UnlinkResult>;
/**
 * Back-fill result counts.
 */
export interface BackfillResult {
    success: boolean;
    output: string;
    examined: number;
    backfilled: number;
    skipped: number;
    errors: number;
}
/**
 * Run the workpackage-link back-fill migration.
 * @param clearDir - Path to .clear directory
 * @param options - Optional session context for audit logging
 */
export declare function runBackfillCLI(clearDir: string, options?: {
    sessionId?: string;
    sessionNumber?: number;
}): Promise<BackfillResult>;
//# sourceMappingURL=link-cli.d.ts.map