#!/usr/bin/env npx ts-node
/**
 * Knowledge Search CLI Tool
 *
 * Handles knowledge search requests with P1-P3 priority matching.
 * Called by knowledge-search.sh bash wrapper.
 *
 * Usage:
 *   npx ts-node search-cli.ts --clear-dir=<path> --query=<query> [--max-results=10]
 *   npx ts-node search-cli.ts --clear-dir=<path> --detect-only --text=<text>
 *
 * Modes:
 *   --detect-only: Check if text contains a search intent, return intent info
 *   (default): Perform search with P1-P3 priority matching
 */
import { SearchResult } from '../types';
/**
 * Format a single search result entry with status icon
 * @param result - Search result
 * @returns Formatted line
 */
export declare function formatSearchResultEntry(result: SearchResult): string;
//# sourceMappingURL=search-cli.d.ts.map