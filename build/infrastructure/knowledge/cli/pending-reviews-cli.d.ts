#!/usr/bin/env npx ts-node
/**
 * Pending-reviews CLI (K2.7 P5 + WP-PS2.2)
 *
 * Emits the session-start carry-over banner for knowledge entries that were
 * surfaced via PostToolUse but not actioned in the previous session. Parallels
 * warnings-cli.ts (P3 deprecation warnings) — both feed session-start's
 * additionalContext stream.
 *
 * WP-PS2.2 (POST-72): adds --ack=<id> and --ack-all write actions. These
 * acknowledge a pending-review carry-over WITHOUT touching deprecation state
 * (distinct from dismiss-cli which is for deprecation acknowledgments).
 *
 * Usage:
 *   Read-only banner (backward-compatible default):
 *     npx ts-node pending-reviews-cli.ts --clear-dir=/path/.clear
 *
 *   Acknowledge a single pending-review entry:
 *     npx ts-node pending-reviews-cli.ts --ack=<id> --clear-dir=/path/.clear
 *
 *   Acknowledge ALL pending-review entries:
 *     npx ts-node pending-reviews-cli.ts --ack-all --clear-dir=/path/.clear
 *
 * Output:
 *   - Default mode: empty (exit 0) when queue empty OR all entries filtered out by
 *     lazy check; multi-line banner text on stdout otherwise.
 *   - --ack mode: single-line confirmation on stdout; exit 0 on success or no-op;
 *     exit 1 on validation failure.
 *   - --ack-all mode: count message on stdout; exit 0.
 *
 * WP-PS2.2 corruption prevention: --ack does NOT call db.setSupersessionReviewed,
 * does NOT modify markdown frontmatter, does NOT touch sync-state.deprecatedReferences.
 * For deprecation acknowledgments use dismiss-cli.
 */
export interface AckResult {
    success: boolean;
    output: string;
    entryId?: string;
    drained?: boolean;
}
export interface AckAllResult {
    success: boolean;
    output: string;
    drainedCount: number;
    drainedIds: string[];
    failedIds: string[];
}
/**
 * Acknowledge a single pending-review entry by ID.
 *
 * Effects (WP-PS2.2 corruption-prevention contract):
 *   - Removes <entryId> from .clear/state/pending-reviews.json (via drainPendingReview)
 *   - Writes audit log entry with metadata.ack_target='pending_review' (distinguishes
 *     from deprecation-ack which uses oldValue/newValue on supersession_reviewed)
 *   - DOES NOT touch supersession_reviewed flag in DB or markdown frontmatter
 *   - DOES NOT touch sync-state.deprecatedReferences
 *
 * Idempotent: if <entryId> is not in pending-reviews.json, returns success with
 * no-op message and writes NO audit log entry (silent in audit).
 */
export declare function runAckCLI(clearDir: string, entryId: string, options?: {
    sessionId?: string;
    sessionNumber?: number;
}): Promise<AckResult>;
/**
 * Acknowledge ALL pending-review entries currently in the queue.
 *
 * Reads pending-reviews.json (with lazy file-existence filter), drains each
 * entry, writes one audit log entry per drain (correlated by AuditLogger
 * correlationId for grouping). Idempotent for empty queue.
 */
export declare function runAckAllCLI(clearDir: string, options?: {
    sessionId?: string;
    sessionNumber?: number;
}): Promise<AckAllResult>;
//# sourceMappingURL=pending-reviews-cli.d.ts.map