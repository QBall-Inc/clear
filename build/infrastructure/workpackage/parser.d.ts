/**
 * Workpackage YAML Parser
 *
 * Parses workpackage definition files and registry files.
 * Updated Session 33 with Dual-ID Architecture support (P1.6).
 */
import { WorkpackageEntry, WorkpackageRegistry, WorkpackageState } from './types';
/**
 * Error thrown during parsing
 */
export declare class WorkpackageParseError extends Error {
    readonly file: string;
    readonly details?: Record<string, unknown> | undefined;
    constructor(message: string, file: string, details?: Record<string, unknown> | undefined);
}
/**
 * Parse a workpackage definition file
 * @param filePath - Path to the workpackage YAML file
 * @returns Parsed workpackage entry
 * @throws WorkpackageParseError if parsing fails
 */
export declare function parseWorkpackageFile(filePath: string): WorkpackageEntry;
/**
 * Parse workpackage YAML content
 * @param content - YAML content string
 * @param sourcePath - Source path for error messages
 * @returns Parsed workpackage entry
 */
export declare function parseWorkpackageContent(content: string, sourcePath: string): WorkpackageEntry;
/**
 * Parse the registry YAML file
 * @param filePath - Path to registry.yaml
 * @returns Parsed registry
 */
export declare function parseRegistryFile(filePath: string): WorkpackageRegistry;
/**
 * Parse workpackage state from JSON file
 * @param filePath - Path to workpackage.json state file
 * @returns Parsed state or default
 */
export declare function parseStateFile(filePath: string): WorkpackageState;
/**
 * Write workpackage state to JSON file
 * @param filePath - Path to workpackage.json
 * @param state - State to write
 */
export declare function writeStateFile(filePath: string, state: WorkpackageState): void;
/**
 * Serialize a workpackage entry back to YAML
 * @param entry - Workpackage entry
 * @returns YAML string
 */
export declare function serializeWorkpackage(entry: WorkpackageEntry): string;
//# sourceMappingURL=parser.d.ts.map