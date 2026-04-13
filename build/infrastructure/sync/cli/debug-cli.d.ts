/**
 * Debug CLI for Cross-Domain Sync (WF-7)
 *
 * Provides validation commands for diagnosing and repairing CLEAR state issues.
 * Implements the /cf-debug slash command functionality.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.9.
 */
import { DebugReport, ValidationIssue, AuditDomain } from '../types';
/**
 * Options for debug validation
 */
export interface DebugOptions {
    /** Focus on a specific domain */
    domain?: AuditDomain;
    /** Attempt auto-repair of issues */
    repair?: boolean;
    /** Check dual-ID integrity specifically */
    checkIds?: boolean;
    /** Verbose output */
    verbose?: boolean;
}
/**
 * Repair result
 */
export interface RepairResult {
    /** Issues that were repaired */
    repaired: ValidationIssue[];
    /** Issues that could not be repaired */
    failed: ValidationIssue[];
}
/**
 * DebugCLI provides validation and repair functionality for CLEAR state.
 */
export declare class DebugCLI {
    private basePath;
    private clearDir;
    constructor(basePath: string);
    /**
     * Run full diagnostic validation
     * @param options - Debug options
     * @returns Debug report with all issues found
     */
    validate(options?: DebugOptions): Promise<DebugReport>;
    /**
     * Attempt to repair auto-repairable issues
     * @param report - Debug report with issues to repair
     * @returns Repair result
     */
    repair(report: DebugReport): Promise<RepairResult>;
    private validateSyncState;
    private validateWorkpackages;
    private validatePlan;
    private validateKnowledge;
    private validateDualIds;
    /**
     * Validate cross-domain references - check that referenced entities exist
     * GAP-08: Enhanced to verify entity existence, not just format
     */
    private validateCrossDomainReferences;
    /**
     * Load all existing workpackage systemIds from registry
     */
    private loadWorkpackageSystemIds;
    /**
     * Load all existing phase systemIds from master-plan.yaml
     */
    private loadPhaseSystemIds;
    private repairIssue;
    /**
     * Repair position gaps in master-plan.yaml by renumbering sequentially
     * Preserves systemIds - only position values change
     */
    private repairPositionGaps;
    private repairSyncState;
    private createDirectory;
    private clearDirExists;
    private calculateStateHashes;
    private getAuditStatus;
    private buildReport;
    /**
     * Format report for console output
     */
    formatReport(report: DebugReport): string;
}
/**
 * Main CLI entry point
 */
export declare function main(args: string[]): Promise<void>;
//# sourceMappingURL=debug-cli.d.ts.map