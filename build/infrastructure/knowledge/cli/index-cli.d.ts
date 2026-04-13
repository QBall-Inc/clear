#!/usr/bin/env npx ts-node
/**
 * Knowledge Index CLI
 *
 * CLI tool for building/rebuilding the knowledge index.
 * Called by knowledge-index.sh bash script.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/index-cli.ts --clear-dir=/path/.clear --mode=full
 *   npx ts-node src/infrastructure/knowledge/cli/index-cli.ts --clear-dir=/path/.clear --mode=incremental
 *   npx ts-node src/infrastructure/knowledge/cli/index-cli.ts --clear-dir=/path/.clear --check-thresholds --session=15
 */
import { KnowledgeDatabase } from '../db';
import { IndexResult } from '../types';
/**
 * Perform incremental index update
 * @internal Exported for inline use by capture-cli triggerIndexUpdate
 */
export declare function incrementalUpdate(db: KnowledgeDatabase, entriesDir: string): IndexResult;
//# sourceMappingURL=index-cli.d.ts.map