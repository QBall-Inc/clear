#!/usr/bin/env npx ts-node
/**
 * Knowledge CLI Router
 *
 * Routes /cf-knowledge subcommands to appropriate CLI handlers.
 * Provides unified entry point for all knowledge operations.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/router.ts [subcommand] [args] --clear-dir=/path/.clear
 */
/**
 * Router result
 */
export interface RouterResult {
    success: boolean;
    output: string;
    subcommand: string;
}
/**
 * Session context propagated from CLI invocation through to lifecycle CLIs.
 * Both fields must be present for downstream CLIs to emit audit log entries.
 */
export interface SessionContext {
    sessionId?: string;
    sessionNumber?: number;
}
/**
 * Parse command line arguments. Extracts router-level flags (--clear-dir,
 * --session-id, --session-number) and returns the remaining tokens as the
 * subcommand + subArgs. Session flags are router-level rather than per-handler
 * so every handler receives consistent session context without each having to
 * reimplement the parse.
 */
export declare function parseRouterArgs(args: string[]): {
    subcommand: string;
    subArgs: string[];
    clearDir: string;
    session: SessionContext;
};
/**
 * Route to appropriate subcommand handler
 */
export declare function routeCommand(args: string[]): Promise<RouterResult>;
//# sourceMappingURL=router.d.ts.map