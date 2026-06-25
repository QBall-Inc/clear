/**
 * Plan Phase CLI
 *
 * Granular mutation surface for plan phases. Subcommands:
 *   list           Enumerate phases (read-only)
 *   show           Show full phase detail (read-only)
 *   add            Add a new phase (--name REQUIRED)
 *   rename         Rename an existing phase
 *   mark-complete  Set phase status to 'complete' (idempotent)
 *   delete         Remove a phase + reindex (double opt-in via --yes-i-mean-it)
 *
 * Default with no subcommand is `list` — eliminates the historical
 * phantom-phase risk where invoking with no args silently called `add`.
 */
import { MasterPlan, Phase, PlanState } from '../types';
import { SyncState } from '../../sync/types';
import type { AuditLogger } from '../../sync/audit-log';
/** Maximum length for phase name */
export declare const MAX_NAME_LENGTH = 80;
/** Subcommands supported by phase-cli */
export declare const PHASE_SUBCOMMANDS: readonly ["list", "show", "add", "rename", "mark-complete", "delete", "remove-workpackage"];
export type PhaseSubcommand = (typeof PHASE_SUBCOMMANDS)[number];
export interface PhaseCLIOptions {
    cwd: string;
    sessionId: string;
    sessionNumber: number;
}
export interface AddPhaseInput {
    /** Project root directory */
    cwd: string;
    /** Phase name (required) */
    name: string;
    /** Insert after this phase ID (display or system ID) */
    afterId?: string;
    /** Session identity for audit logging */
    sessionId?: string;
    sessionNumber?: number;
}
/**
 * Phase-CLI subcommand output.
 *
 * Dual-mode envelope: `additionalContext` is the Claude Code hook spec
 * (consumed when invoked from a hook script that pipes stdout verbatim);
 * `message` is the canonical CLI shape (read by skill jq queries). Both
 * carry identical human-readable text — populated by `withEnvelope` at
 * the CLI boundary so individual return sites stay terse and `status`
 * stays as the rich internal-dispatch enum.
 */
export interface SubcommandOutput {
    success?: boolean;
    message?: string;
    status: 'success' | 'no_plan' | 'not_found' | 'error' | 'invalid_args';
    /** Optional new phase metadata (add-only fields) */
    phaseId?: string;
    phaseSystemId?: string;
    phaseName?: string;
    position?: number;
    afterPhase?: string;
    /** Old/new value pairs for mutations */
    oldValue?: unknown;
    newValue?: unknown;
    /** Subcommand that produced this output */
    subcommand?: PhaseSubcommand;
    /** Error message (when status is not 'success') */
    error?: string;
    /** Formatted multi-line message for display */
    additionalContext?: string;
}
/**
 * Validate phase name length
 * @param name - Name to validate
 * @returns Validation result with suggested alternative if too long
 */
export declare function validateNameLength(name: string): {
    valid: boolean;
    suggested?: string;
};
/**
 * Find phase by display ID or system ID
 * @param phases - Array of phases
 * @param id - Display or system ID
 * @returns Phase and index, or null if not found
 */
export declare function findPhaseById(phases: Phase[], id: string): {
    phase: Phase;
    index: number;
} | null;
/**
 * Insert a new phase and reindex positions
 * @param phases - Existing phases
 * @param newPhase - Phase to insert
 * @param afterIndex - Insert after this index (-1 for beginning, undefined for end)
 * @returns Updated phases array
 */
export declare function insertPhaseAtPosition(phases: Phase[], newPhase: Phase, afterIndex?: number): Phase[];
/**
 * Remove a phase at the given index and reindex remaining positions only.
 * Surviving phases keep their display IDs verbatim — deleting a phase never
 * renumbers the IDs of the phases that remain (positions shift to stay contiguous).
 */
export declare function removePhaseAtIndex(phases: Phase[], removeIndex: number): Phase[];
/**
 * Detect the phase display-ID naming convention from a plan's existing phases.
 * Returns the prefix + separator of the first parseable `<prefix><sep><number>`
 * ID (e.g. "Phase-1" → { prefix: "Phase", separator: "-" }; "phase_2" →
 * { prefix: "phase", separator: "_" }). Defaults to canonical `Phase` + `-`
 * for an empty plan or one with no parseable convention.
 */
export declare function detectPhaseIdConvention(phases: Phase[]): {
    prefix: string;
    separator: string;
};
/**
 * Mint the next collision-free phase display ID: the maximum numeric suffix
 * across existing IDs + 1, in the plan's detected convention. Position-independent —
 * minting never collides with or gaps against an existing ID. An empty plan mints
 * the convention default (`Phase-1`).
 */
export declare function mintNextPhaseId(phases: Phase[]): string;
/**
 * Create a new phase object with a caller-minted display ID.
 * @param name - Phase name
 * @param position - Initial position (reindexed on insert)
 * @param id - Display ID, minted collision-free by the caller via {@link mintNextPhaseId}
 * @returns New phase object
 */
export declare function createPhase(name: string, position: number, id: string): Phase;
/**
 * The single mutator permitted to CHANGE an existing phase's display ID.
 *
 * Pure: it updates and returns the three in-memory structures it is handed; the
 * caller owns persistence (no filesystem I/O here). When a phase's display ID
 * changes, it updates the active-phase referential-integrity surfaces in one
 * atomic pass:
 *   1. phases[].id (the rename itself)
 *   2. milestones[].phase
 *   3. master-plan activePhase + plan-state activePhaseId
 *   4. sync-state activePhaseDisplayId
 * The immutable systemId surfaces (activePhaseSystemId) are intentionally left
 * untouched — a display-ID change must not perturb the stable cross-domain ID.
 *
 * Dormant on add/delete (both preserve existing IDs); ships as defense-in-depth
 * and as the substrate for a future phase-rename affordance. NOTE: a real rename
 * affordance must ALSO extend this cascade to the other display-ID reference
 * surfaces a rename would orphan — workpackage `phase` fields and phase
 * `dependencies[]` entries that reference phases by display ID — which lie
 * outside the active-phase invariant this function currently maintains.
 */
export declare function cascadePhaseIdChange(oldId: string, newId: string, surfaces: {
    plan: MasterPlan;
    planState: PlanState;
    syncState: SyncState;
}): {
    plan: MasterPlan;
    planState: PlanState;
    syncState: SyncState;
};
/**
 * `phase-cli add --name=<name>` — REJECTS missing --name (no silent default).
 *
 * Synchronous despite the legacy `Promise` wrapping — no awaits in body.
 * The CLI dispatcher (runPhaseCLI) is async; sync results auto-wrap.
 */
export declare function runAddPhase(input: AddPhaseInput, auditLogger?: AuditLogger): SubcommandOutput;
interface ParsedArgs {
    subcommand: string;
    showHelp: boolean;
    cwd: string;
    flags: Map<string, string>;
    flagsBool: Set<string>;
    explicitSessionId?: string;
    explicitSessionNumber?: number;
}
/**
 * Dispatch a phase-cli subcommand. Exposed for tests + future composition.
 *
 * The explicit return type pins the dispatch contract: every switch arm MUST
 * resolve to a SubcommandOutput. Combined with the never-typed default arm,
 * this makes phase_b additions to PHASE_SUBCOMMANDS surface as compile errors
 * rather than silent Promise<undefined> at runtime.
 */
export declare function runPhaseCLI(parsed: ParsedArgs): Promise<SubcommandOutput>;
export {};
//# sourceMappingURL=phase-cli.d.ts.map