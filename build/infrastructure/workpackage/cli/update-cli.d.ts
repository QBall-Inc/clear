#!/usr/bin/env npx ts-node
/**
 * Workpackage Update CLI
 *
 * Programmatic mutation surface for workpackage YAMLs. Two modes:
 *   1. WP-level field updates (status, description, acceptance_criteria,
 *      deliverables, verification, notes, scope, dependencies)
 *   2. Per-deliverable mutation (status, description, weight, pattern)
 *
 * Standalone CLI matching the existing workpackage CLI pattern (lifecycle-cli,
 * progress-cli, status-cli, create-cli, deps-cli, load-cli). NOT router-mediated.
 *
 * Usage:
 *   update-cli <wp-id> --status=complete
 *   update-cli <wp-id> --description="..." --acceptance-criteria-file=acs.json
 *   update-cli <wp-id> deliverable <del-id> --status=in_progress --weight=2
 */
import { writeWorkpackageAtomic } from '../parser';
interface ArrayFieldSource {
    inline?: string;
    file?: string;
}
interface UpdateOptions {
    clearDir: string;
    cwd: string;
    sessionId: string;
    sessionNumber: number;
    force: boolean;
    wpId: string;
    deliverableId?: string;
    status?: string;
    type?: string;
    priority?: string;
    title?: string;
    description?: string;
    descriptionFile?: string;
    acceptanceCriteria?: ArrayFieldSource;
    deliverables?: ArrayFieldSource;
    verification?: ArrayFieldSource;
    notes?: ArrayFieldSource;
    inScope?: ArrayFieldSource;
    outOfScope?: ArrayFieldSource;
    upstream?: ArrayFieldSource;
    downstream?: ArrayFieldSource;
    weight?: string;
    pattern?: string;
}
interface FieldChange {
    field: string;
    oldValue: unknown;
    newValue: unknown;
}
export interface UpdateOutput {
    status: 'success' | 'error' | 'no_changes';
    action?: 'update-workpackage' | 'update-deliverable';
    wpId?: string;
    deliverableId?: string;
    changes?: FieldChange[];
    error?: string;
    additionalContext?: string;
}
export { writeWorkpackageAtomic };
export declare function runUpdateCLI(options: UpdateOptions): Promise<UpdateOutput>;
interface ParseArgsResult {
    options: UpdateOptions;
    errors: string[];
}
declare function parseArgs(argv: string[]): ParseArgsResult;
export { parseArgs };
//# sourceMappingURL=update-cli.d.ts.map