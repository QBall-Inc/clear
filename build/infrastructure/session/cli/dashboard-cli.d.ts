#!/usr/bin/env npx ts-node
/**
 * Session-start dashboard CLI (WP-PS4 AD-04).
 *
 * Thin wrapper around src/infrastructure/session/dashboard.ts. Resolves all
 * I/O from CLEAR consumer artifacts and hands a fully-populated
 * DashboardContext to the pure renderer.
 *
 * Sources (all under <clearDir>):
 *   - state/sync-state.json         -> SyncState (workpackage, plan, knowledge, links)
 *   - state/session.json            -> session number, status, token estimate
 *   - state/pending-reviews.json    -> pendingReviewCount (via readPendingReviews)
 *   - plans/master-plan.yaml        -> active phase name (per D-10 path correction)
 *   - knowledge/index.db            -> recent entry titles (per D-11 + DB filename)
 *   - sessions/session_*.md         -> latest handoff Summary + N + date (per D-13/D-16)
 *
 * Non-fatal: any missing or unparseable source falls back to empty-state
 * rendering for that section (per WP-PS4 AC9). The dashboard always prints.
 *
 * Usage:
 *   node dashboard-cli.js --clear-dir=/path/.clear
 *   npx ts-node dashboard-cli.ts --clear-dir=/path/.clear
 */
/**
 * Extract the first non-empty `maxLines` content lines from the cf-handoff
 * `## Summary` section. Section names follow cf-handoff canonical per
 * scripts/session/session-handoff.sh:191 — NOT Bulwark dev-style.
 */
export declare function extractSummaryLines(content: string, maxLines: number): string[];
export declare function runDashboardCLI(clearDir: string): string;
//# sourceMappingURL=dashboard-cli.d.ts.map