#!/usr/bin/env npx ts-node
/**
 * Workpackage Registry Backfill CLI (RC1D — AC11)
 *
 * One-shot session-init backfill for fossil drift in registry.yaml: any entry with
 * status='complete' and progress<100 gets entry.progress=100 written directly.
 *
 * Status-derived progress, NOT calculateProgress recomputation: the canonical truth for a
 * status:complete WP is its terminal status; recomputing against now-empty state.deliverables
 * would return 0 for fossils (state only carries the active WP's deliverable map).
 *
 * Fast-skip via mtime+size composite cache so non-changing registries don't get re-scanned.
 * Atomic temp+mv write. Missing WP YAML files don't fail the run — they're logged to audit
 * and skipped (degraded mode).
 *
 * Usage:
 *   registry-backfill-cli --clear-dir=/path/.clear --session-id=<id> --session-number=<n>
 */
interface BackfillOptions {
    clearDir: string;
    sessionId: string;
    sessionNumber: number;
}
interface BackfillResult {
    status: 'success' | 'skipped_cache' | 'no_changes' | 'error';
    scanned: number;
    updated: number;
    skipped_missing_yaml: number;
    message?: string;
    error?: string;
}
export declare function runBackfill(options: BackfillOptions): BackfillResult;
declare function parseArgs(argv: string[]): BackfillOptions;
export { parseArgs };
//# sourceMappingURL=registry-backfill-cli.d.ts.map