/**
 * Session-start dashboard renderer (WP-PS4 AD-03).
 *
 * Pure function: renderDashboard(syncState, sessionInfo, ctx) -> string.
 * No I/O. All data resolution happens in dashboard-cli.ts (AD-04).
 *
 * Determinism (AC7): same inputs produce byte-identical output. Critical
 * for golden-file fixtures, git diffs, screenshot consistency, and the
 * inline-budget byte-offset assertion (AC11).
 *
 * ANSI palette mirrors scripts/statusline.sh for visual continuity.
 * Visible-width math strips ANSI before measuring so column alignment
 * is unaffected by color content.
 */
import type { SyncState } from '../sync/types';
export declare const SUMMARY_LINE_MAX = 3;
export interface DashboardContext {
    pendingReviewCount: number;
    phaseName: string;
    recentEntryTitles: Map<string, string>;
    lastSessionSummary: string[];
    lastSessionNumber: number | null;
    lastSessionDate: string | null;
}
export interface DashboardSessionInfo {
    clearSessionNumber: number;
    tokensUsed: number;
    status: string;
}
export declare function renderDashboard(syncState: SyncState, sessionInfo: DashboardSessionInfo, ctx: DashboardContext): string;
//# sourceMappingURL=dashboard.d.ts.map