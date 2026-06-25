/**
 * Plan Update CLI (R4.2c)
 *
 * Implements /cf-plan update command for programmatic plan state updates.
 * Supports: --active-phase, --milestone + --status, --rollup.
 */
import { PlanRegistryManager } from '../registry';
import type { AuditLogger } from '../../sync/audit-log';
interface UpdateOptions {
    clearDir: string;
    cwd: string;
    activePhase?: string;
    milestone?: string;
    milestoneStatus?: string;
    milestoneRequires?: string;
    rollup?: boolean;
    changelog?: boolean;
    changelogType?: string;
    changelogMilestone?: string;
    changelogPhase?: string;
    changelogDetail?: string;
    sessionId: string;
    sessionNumber: number;
}
/**
 * Update CLI output.
 *
 * Dual-mode envelope: `additionalContext` is the Claude Code hook spec
 * (consumed when invoked from a hook script that pipes stdout verbatim);
 * `message` is the canonical CLI shape (read by skill jq queries). Both
 * carry identical human-readable text — populated by `withEnvelope` at
 * the CLI boundary so individual return sites stay terse.
 */
export interface UpdateOutput {
    success?: boolean;
    message?: string;
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
 * Set a milestone's status in plan.json and master-plan.yaml.
 *
 * Accepts complete / in_progress / not_started (reversibility — a milestone
 * declared complete can be walked back). The lockstep two-surface write, and
 * clearing completedAt on any non-complete status, is owned by
 * registry.setMilestoneStatus, so this function no longer does its own YAML
 * write-back (the prior two-store divergence is closed at the writer).
 */
export declare function updateMilestone(registry: PlanRegistryManager, milestoneId: string, status: string): UpdateOutput;
/**
 * Edit a milestone's `requires` list (AC16-AC18, AC23-AC24, AC27).
 *
 * Parses comma-separated IDs from --requires=<list>, de-duplicates,
 * validates each ID exists in plan.phases[].workpackages OR plan.milestones,
 * replaces milestone.requires entirely, writes back to master-plan.yaml.
 *
 * Audit action: 'edit-requires' (distinguishes from 'update-milestone' status-complete).
 *
 * Empty list rejected (AC23) — clearing requires would orphan the milestone's
 * completion gating, so it requires an explicit future flag.
 */
export declare function updateMilestoneRequires(registry: PlanRegistryManager, milestoneId: string, requiresRaw: string, cwd: string, auditLogger?: AuditLogger): UpdateOutput;
/**
 * Run the update CLI
 */
export declare function runUpdateCLI(options: UpdateOptions): Promise<UpdateOutput>;
export {};
//# sourceMappingURL=update-cli.d.ts.map