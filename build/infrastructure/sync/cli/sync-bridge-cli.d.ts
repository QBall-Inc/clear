/**
 * Sync Bridge CLI — Extensible dispatch bridge for hook-to-SyncStateManager wiring.
 *
 * Called by scripts/sync/sync-bridge.sh from hook dispatchers. Each hook invokes
 * a named operation via --op=<name>. The dispatch map routes to handler functions.
 *
 * ## Adding a new operation
 *
 * 1. Write a handler: `async function handleMyOp(manager, opts): Promise<OpResult>`
 * 2. Add to DISPATCH_MAP: `'my-op': handleMyOp`
 * 3. The handler receives a loaded SyncStateManager and parsed CLI options.
 *    Call manager.save() if the handler mutates state.
 *
 * ## Operations
 *
 * - update-workpackage: Update WP summary in sync-state after progress-cli
 * - update-knowledge:   Update knowledge summary after knowledge-capture
 * - link-knowledge:     Link knowledge entry to active WP (capture-time auto-linking)
 * - persist:            Save current sync-state to disk (flush dirty state)
 * - load:               Load sync-state from disk, output as JSON
 * - reconcile:          Detect and correct stale knowledge links at session start
 * - reconcile-knowledge: Rebuild the denormalized knowledge cache from source-of-truth (recovery)
 * - reconcile-plan:     Detect and correct plan/WP state drift at session start
 *
 * Usage: node sync-bridge-cli.js --clear-dir=<path> --op=<operation> [--data=<json>]
 */
export declare function main(args?: string[]): Promise<void>;
//# sourceMappingURL=sync-bridge-cli.d.ts.map