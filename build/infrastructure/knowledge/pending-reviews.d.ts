export interface PendingReviewEntry {
    entry_id: string;
    trigger: string;
    file_path: string;
    added_at: string;
    source_tool: string;
}
export interface PendingReviewsFile {
    version: '1.0';
    entries: PendingReviewEntry[];
}
/**
 * Append a pending-review entry. Deduped by entry_id — if an entry with the
 * same entry_id already exists, the call is a no-op (preserves original added_at).
 * Returns true if the entry was newly added, false if it was already present.
 */
export declare function appendPendingReview(clearDir: string, entry: PendingReviewEntry): boolean;
/**
 * Drain (remove) a pending-review entry by entry_id. No-op if not present.
 * Returns true if an entry was removed.
 */
export declare function drainPendingReview(clearDir: string, entryId: string): boolean;
/**
 * Read pending-reviews entries with lazy file-existence filter applied.
 * Entries whose knowledge markdown file no longer exists are filtered out
 * of the returned list but NOT removed from the queue (preserves queue
 * integrity — the entry may be recreated later).
 */
export declare function readPendingReviews(clearDir: string): PendingReviewEntry[];
//# sourceMappingURL=pending-reviews.d.ts.map