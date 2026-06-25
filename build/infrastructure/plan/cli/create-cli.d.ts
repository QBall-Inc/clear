/**
 * Plan Create CLI (P2.9a)
 *
 * Implements /cf-plan create command for creating new master plans.
 * Based on P2.9a Feature Brief Section 2.4
 */
import { MasterPlan, PlanState } from '../types';
/** Maximum length for plan name */
export declare const MAX_NAME_LENGTH = 80;
/**
 * Error thrown when plan already exists
 */
export declare class PlanExistsError extends Error {
    readonly planPath: string;
    constructor(planPath: string);
}
/**
 * Error thrown when name validation fails
 */
export declare class NameValidationError extends Error {
    readonly providedName: string;
    readonly suggestedName?: string | undefined;
    constructor(message: string, providedName: string, suggestedName?: string | undefined);
}
export interface CreatePlanInput {
    /** Project root directory */
    cwd: string;
    /** Plan name (optional - derived if not provided) */
    name?: string;
    /** Overwrite existing plan */
    force?: boolean;
    /** Session ID for audit logging */
    sessionId?: string;
}
/**
 * Create-plan CLI output.
 *
 * Dual-mode envelope: `additionalContext` is the Claude Code hook spec;
 * `message` is the canonical CLI shape (read by skill jq queries). Both
 * carry identical human-readable text — populated by `withEnvelope` at
 * the CLI boundary.
 */
export interface CreatePlanOutput {
    success?: boolean;
    message?: string;
    status: 'success' | 'exists' | 'error';
    /** Plan name used */
    planName?: string;
    /** Files created */
    filesCreated?: string[];
    /** Backup file path (if force was used) */
    backupPath?: string;
    /** Error message */
    error?: string;
    /** Formatted message for display */
    additionalContext?: string;
}
/**
 * Validate plan name length
 * @param name - Name to validate
 * @returns Validation result with suggested alternative if too long
 */
export declare function validateNameLength(name: string): {
    valid: boolean;
    suggested?: string;
};
/**
 * Sanitize plan name for use in file paths
 * @param name - Raw name
 * @returns Sanitized name
 */
export declare function sanitizePlanName(name: string): string;
/**
 * Generate initial master plan skeleton
 * @param projectName - Name of the project
 * @returns Master plan skeleton
 */
export declare function generatePlanSkeleton(projectName: string): MasterPlan;
/**
 * Generate initial plan state
 * @param planName - Name of the plan
 * @param phaseSystemId - System ID of initial phase
 * @returns Plan state
 */
export declare function generatePlanState(planName: string, phaseSystemId: string): PlanState;
/**
 * Create a new master plan
 *
 * @param input - Creation input
 * @returns Creation result
 */
export declare function runCreatePlanCLI(input: CreatePlanInput): Promise<CreatePlanOutput>;
//# sourceMappingURL=create-cli.d.ts.map