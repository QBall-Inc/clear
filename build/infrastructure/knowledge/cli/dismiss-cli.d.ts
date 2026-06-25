#!/usr/bin/env npx ts-node
/**
 * Knowledge Dismiss CLI (K2.7)
 *
 * CLI tool for dismissing a deprecation surfacing warning without superseding
 * or deleting the entry. Used when the user has reviewed the deprecation and
 * confirmed no replacement is needed.
 *
 * Effects:
 *   - Sets supersession_reviewed = true in SQLite (DB-backed flag)
 *   - Writes supersession_reviewed: true to markdown frontmatter (round-trippable)
 *   - Removes entry from sync-state deprecatedReferences (stops surfacing)
 *   - Writes audit log entry
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/dismiss-cli.ts <id> --clear-dir=/path/.clear
 */
/**
 * Dismiss operation result
 */
export interface DismissResult {
    success: boolean;
    output: string;
    entryId?: string;
    dismissed?: boolean;
}
/**
 * Run dismiss CLI
 */
export declare function runDismissCLI(clearDir: string, entryId: string, options?: {
    reason?: string;
    sessionId?: string;
    sessionNumber?: number;
}): Promise<DismissResult>;
//# sourceMappingURL=dismiss-cli.d.ts.map