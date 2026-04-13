/**
 * Plan YAML and Markdown Parser
 *
 * Parses master-plan.yaml, master-plan.md, and phase detail files.
 */
import { MasterPlan, PlanState } from './types';
/**
 * Error thrown during parsing
 */
export declare class PlanParseError extends Error {
    readonly file: string;
    readonly details?: Record<string, unknown> | undefined;
    constructor(message: string, file: string, details?: Record<string, unknown> | undefined);
}
/**
 * Parse the master-plan.yaml file
 * @param filePath - Path to master-plan.yaml
 * @returns Parsed master plan or null if file doesn't exist
 * @throws PlanParseError if parsing fails
 */
export declare function parseMasterPlanYaml(filePath: string): MasterPlan | null;
/**
 * Parse master plan YAML content
 * @param content - YAML content string
 * @param sourcePath - Source path for error messages
 * @returns Parsed master plan
 */
export declare function parseMasterPlanContent(content: string, sourcePath: string): MasterPlan;
/**
 * Read the master-plan.md summary file
 * @param filePath - Path to master-plan.md
 * @returns Markdown content or null if file doesn't exist
 */
export declare function readMasterPlanMd(filePath: string): string | null;
/**
 * Read a phase detail file
 * @param filePath - Path to phase detail markdown file
 * @returns Markdown content or null if file doesn't exist
 */
export declare function readPhaseDetail(filePath: string): string | null;
/**
 * Extract summary section from master-plan.md
 * Returns the "Current Status" section if found, otherwise first MAX_SUMMARY_LENGTH chars
 * @param content - Full markdown content
 * @returns Summary text
 */
export declare function extractPlanSummary(content: string): string;
/**
 * Parse plan state from JSON file
 * @param filePath - Path to plan.json state file
 * @returns Parsed state or default
 *
 * Dual-ID Architecture (P1.6):
 * - Parses activePhaseSystemId if present
 */
export declare function parseStateFile(filePath: string): PlanState;
/**
 * Write plan state to JSON file
 * @param filePath - Path to plan.json
 * @param state - State to write
 */
export declare function writeStateFile(filePath: string, state: PlanState): void;
/**
 * Serialize a master plan back to YAML
 * @param plan - Master plan
 * @returns YAML string
 */
export declare function serializeMasterPlan(plan: MasterPlan): string;
//# sourceMappingURL=parser.d.ts.map