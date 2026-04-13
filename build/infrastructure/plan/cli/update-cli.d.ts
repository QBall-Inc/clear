/**
 * Plan Update CLI (R4.2c)
 *
 * Implements /cf-plan update command for programmatic plan state updates.
 * Supports: --active-phase, --milestone + --status, --rollup.
 */
import { PlanRegistryManager } from '../registry';
interface UpdateOptions {
    clearDir: string;
    cwd: string;
    activePhase?: string;
    milestone?: string;
    milestoneStatus?: string;
    rollup?: boolean;
    changelog?: boolean;
    changelogType?: string;
    changelogMilestone?: string;
    changelogPhase?: string;
    changelogDetail?: string;
    sessionId: string;
    sessionNumber: number;
}
export interface UpdateOutput {
    status: 'success' | 'no_plan' | 'error';
    action?: string;
    details?: Record<string, unknown>;
    additionalContext?: string;
    error?: string;
}
/**
 * Update the active phase in plan.json and master-plan.yaml
 *
 * POST-31 fix: writes back to master-plan.yaml so that registry.getActivePhase()
 * (which reads from YAML) returns the correct phase on subsequent invocations.
 */
export declare function updateActivePhase(registry: PlanRegistryManager, phaseId: string, cwd: string): UpdateOutput;
/**
 * Mark a milestone as complete in plan.json and master-plan.yaml
 *
 * K0.1 finding: same two-store divergence as POST-31.
 * markMilestoneComplete() writes JSON only — this function adds YAML write-back.
 */
export declare function updateMilestone(registry: PlanRegistryManager, milestoneId: string, status: string, cwd: string): UpdateOutput;
/**
 * Run the update CLI
 */
export declare function runUpdateCLI(options: UpdateOptions): Promise<UpdateOutput>;
export {};
//# sourceMappingURL=update-cli.d.ts.map