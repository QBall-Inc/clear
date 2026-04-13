/**
 * Workpackage Create CLI (P2.9a)
 *
 * Implements /cf-workpackage create command for creating new workpackages.
 * Wraps insertWorkpackage() from sync/plan-propagate.ts.
 * Based on P2.9a Feature Brief Section 2.6
 */
import { WorkpackageType, WorkpackagePriority } from '../types';
/** Maximum length for workpackage title */
export declare const MAX_TITLE_LENGTH = 80;
/** Valid workpackage types */
export declare const VALID_TYPES: WorkpackageType[];
/** Valid priorities */
export declare const VALID_PRIORITIES: WorkpackagePriority[];
/**
 * Error thrown when plan doesn't exist
 */
export declare class NoPlanError extends Error {
    constructor();
}
/**
 * Error thrown when phase is not found
 */
export declare class PhaseNotFoundError extends Error {
    readonly phaseId: string;
    constructor(phaseId: string);
}
/**
 * Error thrown when title validation fails
 */
export declare class TitleValidationError extends Error {
    readonly providedTitle: string;
    readonly suggestedTitle?: string | undefined;
    constructor(message: string, providedTitle: string, suggestedTitle?: string | undefined);
}
export interface CreateWorkpackageInput {
    /** Project root directory */
    cwd: string;
    /** Target phase (display ID or system ID) */
    phaseId: string;
    /** Workpackage title (optional - derived if not provided) */
    title?: string;
    /** Insert after this workpackage ID */
    afterId?: string;
    /** Workpackage type */
    type?: WorkpackageType;
    /** Workpackage priority */
    priority?: WorkpackagePriority;
    /** Session ID for audit logging */
    sessionId?: string;
    /** Session number for audit logging */
    sessionNumber?: number;
    /** Description for the workpackage */
    description?: string;
    /** Rich fields (populated by Bulwark import or cf-plan create Track B) */
    acceptance_criteria?: string[];
    verification?: string[];
    notes?: string[];
    deliverables_text?: string[];
    scope_in?: string[];
    scope_out?: string[];
    /** When true, read rich fields from stdin JSON */
    fromStdin?: boolean;
}
export interface CreateWorkpackageOutput {
    status: 'success' | 'no_plan' | 'phase_not_found' | 'error';
    /** New workpackage display ID */
    workpackageId?: string;
    /** New workpackage system ID */
    workpackageSystemId?: string;
    /** Workpackage title */
    title?: string;
    /** Phase display ID */
    phaseId?: string;
    /** Workpackage type */
    type?: WorkpackageType;
    /** Workpackage priority */
    priority?: WorkpackagePriority;
    /** Error message */
    error?: string;
    /** Formatted message for display */
    additionalContext?: string;
}
/**
 * Validate title length
 * @param title - Title to validate
 * @returns Validation result with suggested alternative if too long
 */
export declare function validateTitleLength(title: string): {
    valid: boolean;
    suggested?: string;
};
/**
 * Validate workpackage type
 * @param type - Type to validate
 * @returns true if valid
 */
export declare function isValidType(type: string): type is WorkpackageType;
/**
 * Validate workpackage priority
 * @param priority - Priority to validate
 * @returns true if valid
 */
export declare function isValidPriority(priority: string): priority is WorkpackagePriority;
/**
 * Create a new workpackage
 *
 * @param input - Creation input
 * @returns Creation result
 */
export declare function runCreateWorkpackageCLI(input: CreateWorkpackageInput): Promise<CreateWorkpackageOutput>;
//# sourceMappingURL=create-cli.d.ts.map