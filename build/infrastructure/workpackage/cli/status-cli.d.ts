/**
 * Workpackage Status CLI (P2.7)
 *
 * Implements status viewing commands: default, show, list
 * Based on P2.7 Feature Brief Sections 2.2-2.4
 */
import { WorkpackageRegistryEntry, WorkpackageStatus, WorkpackageEntry } from '../types';
/**
 * Format a workpackage status with icon
 */
export declare function formatStatus(status: WorkpackageStatus): string;
/**
 * Format progress percentage
 */
export declare function formatProgress(progress: number): string;
/**
 * Format a date string for display
 */
export declare function formatDate(isoDate: string | undefined): string;
/**
 * Format dependency status
 */
export declare function formatDependencyStatus(depId: string, status: WorkpackageStatus, progress?: number): string;
export interface ListOptions {
    all?: boolean;
    phase?: string;
    status?: WorkpackageStatus;
}
/**
 * List workpackages in table format
 */
export declare function listWorkpackages(entries: WorkpackageRegistryEntry[], options?: ListOptions, activeId?: string): string;
/**
 * Show detailed workpackage information
 */
export declare function showWorkpackage(entry: WorkpackageRegistryEntry, full?: WorkpackageEntry, deps?: Array<{
    id: string;
    status: WorkpackageStatus;
    progress?: number;
}>, linkedKnowledge?: string[]): string;
/**
 * Show active workpackage summary (default command)
 */
export declare function showActiveStatus(entry: WorkpackageRegistryEntry, phaseName?: string, deps?: Array<{
    id: string;
    status: WorkpackageStatus;
}>, linkedKnowledge?: string[]): string;
/**
 * Show message when no active workpackage
 */
export declare function showNoActiveWorkpackage(): string;
export interface StatusCLIOptions {
    clearDir: string;
    subcommand?: string;
    args?: string[];
}
/**
 * Run status CLI command
 */
export declare function runStatusCLI(options: StatusCLIOptions): Promise<string>;
//# sourceMappingURL=status-cli.d.ts.map