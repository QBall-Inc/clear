/**
 * Plan Writer Module
 *
 * Writes master plan YAML and markdown files to the filesystem.
 * Part of P2.9a Creation Commands.
 */
import { MasterPlan } from './types';
/**
 * Options for writing master plan
 */
export interface WritePlanOptions {
    /** Create backup of existing file before overwrite */
    backup?: boolean;
    /** Create parent directories if they don't exist */
    createDirs?: boolean;
}
/**
 * Result of write operation
 */
export interface WritePlanResult {
    status: 'success' | 'error';
    yamlPath: string;
    backupPath?: string;
    error?: string;
}
/**
 * Write a master plan to YAML file
 *
 * @param cwd - Project root directory
 * @param plan - Master plan to write
 * @param options - Write options
 * @returns Write result with file paths
 */
export declare function writeMasterPlan(cwd: string, plan: MasterPlan, options?: WritePlanOptions): WritePlanResult;
/**
 * Check if a master plan file exists
 *
 * @param cwd - Project root directory
 * @returns true if master-plan.yaml exists
 */
export declare function masterPlanExists(cwd: string): boolean;
//# sourceMappingURL=writer.d.ts.map