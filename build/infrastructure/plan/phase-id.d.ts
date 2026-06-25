/**
 * Phase display-ID referential helpers.
 *
 * A plan's phases are identified by a stable display ID (e.g. "Phase-1"). Several
 * surfaces REFERENCE a phase by that display ID — milestones[].phase, the
 * master-plan activePhase, plan.json activePhaseId, sync-state activePhaseDisplayId.
 * Those references must resolve to an existing phases[].id by EXACT string match
 * (every runtime consumer — registry.ts, progress-cli.ts, sync-bridge-cli.ts —
 * compares by exact equality). A reference that is merely a FORMAT variant of an
 * existing id ("phase_1" vs "Phase-1") therefore does NOT resolve and silently
 * orphans the milestone/active-phase from its phase.
 *
 * These pure helpers detect and deterministically normalize such format variants.
 * They are shared by the read-only detector (debug-cli --check-ids) and the
 * correction paths (debug-cli --repair, sync-bridge reconcile-plan) so detection
 * and repair use one definition. They are consistent BY CONSTRUCTION with the
 * phase-id cascade in phase-cli.ts (cascadePhaseIdChange), which maintains
 * phases[].id ⊇ milestones[].phase ⊇ activePhase in a single shared format: a
 * correct cascade leaves every reference exact-matching, so these checks never
 * flag it.
 */
import { MasterPlan } from './types';
/**
 * Normalize a phase display id to a separator- and case-agnostic comparison key.
 * "Phase-1" -> "phase1", "phase_1" -> "phase1". Two ids share a key iff they name
 * the same logical phase under different display formats.
 */
export declare function normalizePhaseIdKey(id: string): string;
/** Resolution status of a phase display-id reference against the canonical phase set. */
export type PhaseRefStatus = 'ok' | 'format-variant' | 'orphan';
export interface PhaseRefResolution {
    status: PhaseRefStatus;
    /** The canonical phases[].id this ref resolves to; null when orphan/ambiguous. */
    canonical: string | null;
}
/**
 * Resolve a phase display-id reference against the canonical phases[].id set.
 *
 * - 'ok'             — ref exactly matches a phase id.
 * - 'format-variant' — ref normalizes to EXACTLY ONE phase id but differs in literal
 *                      format; deterministically repairable to `canonical`.
 * - 'orphan'         — ref matches no phase id, OR normalizes ambiguously to more than
 *                      one distinct phase id; no deterministic repair (`canonical` null).
 *
 * @param ref      The reference string (e.g. a milestones[].phase value).
 * @param phaseIds The canonical phases[].id values.
 */
export declare function resolvePhaseRef(ref: string, phaseIds: string[]): PhaseRefResolution;
/** A single phase-reference correction made by {@link reconcileMasterPlanPhaseRefs}. */
export interface PhaseRefCorrection {
    /** Human-readable location, e.g. "milestones[M-1].phase" or "activePhase". */
    field: string;
    oldValue: string;
    newValue: string;
}
/**
 * Normalize every FORMAT-VARIANT phase reference inside a master-plan to its canonical
 * phases[].id, IN PLACE, and return the corrections made.
 *
 * Only 'format-variant' references (a unique normalized match) are rewritten — 'ok'
 * references are left untouched and 'orphan' references are left untouched (there is no
 * deterministic repair for a reference that names no existing phase). The phases[].id
 * values are the canonical source of truth and are NEVER changed here.
 *
 * Scope: this rewrites the two display-id reference surfaces that live IN
 * master-plan.yaml — milestones[].phase and activePhase. The projected surfaces
 * (plan.json activePhaseId, sync-state activePhaseDisplayId) are re-derived from this
 * canonical SOT by the caller's reconcile pipeline and are not mutated here.
 */
export declare function reconcileMasterPlanPhaseRefs(plan: MasterPlan): PhaseRefCorrection[];
//# sourceMappingURL=phase-id.d.ts.map