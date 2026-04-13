/**
 * Plan Import CLI
 *
 * Implements /cf-plan import (Track A) — imports a Bulwark plan into CLEAR format.
 * Orchestrates: detect → parse → validate → transform → writeMasterPlan → batch WP create.
 * Atomic failure: if any step fails, no partial state remains.
 */
export interface ImportPlanInput {
    /** Project root directory */
    cwd: string;
    /** Path to Bulwark plan file (.md or .yaml) or plan directory */
    planPath: string;
    /** Overwrite existing master-plan.yaml */
    force?: boolean;
    /** Session ID for audit logging */
    sessionId?: string;
    /** Session number for audit logging */
    sessionNumber?: number;
    /** Skip WP creation (import plan structure only) */
    skipWorkpackages?: boolean;
}
export interface ImportPlanOutput {
    status: 'success' | 'exists' | 'invalid_plan' | 'error';
    /** Files created */
    filesCreated?: string[];
    /** Workpackages created */
    workpackagesCreated?: number;
    /** Error message */
    error?: string;
    /** Validation errors */
    validationErrors?: string[];
    /** Formatted message for display */
    additionalContext?: string;
}
/**
 * Import a Bulwark plan into CLEAR format
 */
export declare function runImportPlanCLI(input: ImportPlanInput): Promise<ImportPlanOutput>;
//# sourceMappingURL=import-cli.d.ts.map