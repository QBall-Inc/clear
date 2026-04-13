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
 * Parse command line arguments
 */
export declare function parseRouterArgs(args: string[]): {
    subcommand: string;
    subArgs: string[];
    clearDir: string;
};
/**
 * Route to appropriate subcommand handler
 */
export declare function routeCommand(args: string[]): Promise<RouterResult>;
//# sourceMappingURL=router.d.ts.map