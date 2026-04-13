/**
 * Plan Phase CLI (P2.9a)
 *
 * Implements /cf-plan addPhase command for adding phases to master plan.
 * Based on P2.9a Feature Brief Section 2.5
 */
import { Phase } from '../types';
/** Maximum length for phase name */
export declare const MAX_NAME_LENGTH = 80;
/**
 * Error thrown when plan doesn't exist
 */
export declare class NoPlanError extends Error {
    constructor();
}
/**
 * Error thrown when phase ID is not found
 */
export declare class PhaseNotFoundError extends Error {
    readonly phaseId: string;
    constructor(phaseId: string);
}
/**
 * Error thrown when name validation fails
 */
export declare class NameValidationError extends Error {
    readonly providedName: string;
    readonly suggestedName?: string | undefined;
    constructor(message: string, providedName: string, suggestedName?: string | undefined);
}
export interface AddPhaseInput {
    /** Project root directory */
    cwd: string;
    /** Phase name (optional - derived if not provided) */
    name?: string;
    /** Insert after this phase ID (display or system ID) */
    afterId?: string;
    /** Session ID for audit logging */
    sessionId?: string;
}
export interface AddPhaseOutput {
    status: 'success' | 'no_plan' | 'not_found' | 'error';
    /** New phase display ID */
    phaseId?: string;
    /** New phase system ID */
    phaseSystemId?: string;
    /** Phase name */
    phaseName?: string;
    /** Position in plan */
    position?: number;
    /** Inserted after phase ID */
    afterPhase?: string;
    /** Error message */
    error?: string;
    /** Formatted message for display */
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
 * Create a new phase object
 * @param name - Phase name
 * @param position - Position (will be recalculated on insert)
 * @returns New phase object
 */
export declare function createPhase(name: string, position: number): Phase;
/**
 * Add a new phase to the master plan
 *
 * @param input - Add phase input
 * @returns Add phase result
 */
export declare function runAddPhaseCLI(input: AddPhaseInput): Promise<AddPhaseOutput>;
//# sourceMappingURL=phase-cli.d.ts.map