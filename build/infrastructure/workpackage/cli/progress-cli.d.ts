#!/usr/bin/env npx ts-node
/**
 * Workpackage Progress CLI Tool (P2.7)
 *
 * Two interfaces:
 * 1. Hook-based: Tracks progress within active workpackage, validates scope.
 *    Called by workpackage-progress.sh bash wrapper.
 *    Usage: npx ts-node progress-cli.ts --clear-dir=<path> [--file=<path>] [--deliverable=<id>] [--complete]
 *
 * 2. Slash command: View/update progress, validate for completion.
 *    Commands: progress [--set N], validate
 */
import { WorkpackageRegistryManager } from '../registry';
import { WorkpackageRegistryEntry } from '../types';
export interface SlashProgressResult {
    success: boolean;
    workpackage?: WorkpackageRegistryEntry;
    progress: number;
    deliverables?: SlashDeliverableInfo[];
    message: string;
}
export interface SlashDeliverableInfo {
    id: string;
    pattern: string;
    status: 'not_started' | 'in_progress' | 'complete';
    completedAt?: string;
}
export interface SlashValidateResult {
    success: boolean;
    workpackage?: WorkpackageRegistryEntry;
    valid: boolean;
    issues: string[];
    warnings: string[];
    message: string;
}
/**
 * View or update workpackage progress (slash command interface)
 *
 * @param registry - Workpackage registry manager
 * @param setProgress - Optional progress value to set (0-100)
 * @returns Progress result
 */
export declare function slashProgressCommand(registry: WorkpackageRegistryManager, setProgress?: number): Promise<SlashProgressResult>;
/**
 * Validate if current workpackage meets completion criteria (slash command interface)
 *
 * @param registry - Workpackage registry manager
 * @returns Validate result
 */
export declare function slashValidateCommand(registry: WorkpackageRegistryManager): Promise<SlashValidateResult>;
export interface SlashProgressCLIOptions {
    clearDir: string;
}
/**
 * Run progress CLI slash command
 */
export declare function runSlashProgressCLI(subcommand: string, args: string[], options: SlashProgressCLIOptions): Promise<string>;
//# sourceMappingURL=progress-cli.d.ts.map