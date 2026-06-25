#!/usr/bin/env npx ts-node
/**
 * Knowledge Delete CLI
 *
 * CLI tool for deleting knowledge entries with impact analysis and audit trail.
 * Follows deprecate-cli.ts pattern with additional file removal and index cleanup.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/delete-cli.ts <id> --reason="duplicate entry" --force --clear-dir=/path/.clear
 */
import { DeprecationImpact } from './deprecate-cli';
/**
 * Delete operation result
 */
export interface DeleteResult {
    success: boolean;
    output: string;
    entryId?: string;
    impact?: DeprecationImpact;
    deleted?: boolean;
}
/**
 * Run delete CLI
 * @param clearDir - Path to .clear directory
 * @param entryId - Knowledge entry ID to delete
 * @param options - Delete options
 * @returns Delete result
 */
export declare function runDeleteCLI(clearDir: string, entryId: string, options?: {
    reason?: string;
    force?: boolean;
    forceMalformed?: boolean;
    yesIMeanIt?: boolean;
    sessionId?: string;
    sessionNumber?: number;
}): Promise<DeleteResult>;
//# sourceMappingURL=delete-cli.d.ts.map