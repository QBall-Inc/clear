/**
 * Workpackage State Machine (P2.7)
 *
 * Implements state transition validation for workpackage lifecycle management.
 * Based on P2.7 Feature Brief Section 3.
 */
import { WorkpackageStatus } from './types';
/**
 * Error thrown when an invalid state transition is attempted
 */
export declare class InvalidTransitionError extends Error {
    readonly from: WorkpackageStatus;
    readonly to: WorkpackageStatus;
    readonly reason: string;
    constructor(from: WorkpackageStatus, to: WorkpackageStatus, reason: string);
}
/**
 * Transition trigger types
 */
export type TransitionTrigger = 'start' | 'pause' | 'resume' | 'complete' | 'delete' | 'block' | 'unblock';
/**
 * Transition rule definition
 */
interface TransitionRule {
    /** Target status after transition */
    to: WorkpackageStatus;
    /** What triggers this transition */
    trigger: TransitionTrigger;
    /** Whether this transition requires force flag to override validations */
    requiresForce?: boolean;
    /** Whether this is an automatic (system) transition */
    automatic?: boolean;
    /** Additional conditions description */
    conditions?: string;
}
/**
 * Check if a transition is valid
 *
 * @param from - Current status
 * @param to - Target status
 * @returns true if transition is valid
 */
export declare function isValidTransition(from: WorkpackageStatus, to: WorkpackageStatus): boolean;
/**
 * Get the trigger required for a transition
 *
 * @param from - Current status
 * @param to - Target status
 * @returns Trigger type or null if transition invalid
 */
export declare function getTransitionTrigger(from: WorkpackageStatus, to: WorkpackageStatus): TransitionTrigger | null;
/**
 * Check if a transition is automatic (system-triggered)
 *
 * @param from - Current status
 * @param to - Target status
 * @returns true if transition is automatic
 */
export declare function isAutomaticTransition(from: WorkpackageStatus, to: WorkpackageStatus): boolean;
/**
 * Validate a transition and throw if invalid
 *
 * @param from - Current status
 * @param to - Target status
 * @throws InvalidTransitionError if transition is not valid
 */
export declare function validateTransition(from: WorkpackageStatus, to: WorkpackageStatus): void;
/**
 * Get all valid target statuses from a given status
 *
 * @param from - Current status
 * @returns Array of valid target statuses
 */
export declare function getValidTransitions(from: WorkpackageStatus): WorkpackageStatus[];
/**
 * Get detailed transition info for a status
 *
 * @param from - Current status
 * @returns Array of transition rules
 */
export declare function getTransitionRules(from: WorkpackageStatus): TransitionRule[];
/**
 * Check if a status represents an active/working state
 */
export declare function isActiveStatus(status: WorkpackageStatus): boolean;
/**
 * Check if a status represents a terminal state
 */
export declare function isTerminalStatus(status: WorkpackageStatus): boolean;
/**
 * Check if a status represents a blocked state
 */
export declare function isBlockedStatus(status: WorkpackageStatus): boolean;
/**
 * Check if a status can be started/resumed
 */
export declare function canStart(status: WorkpackageStatus): boolean;
/**
 * Check if a status can be paused
 */
export declare function canPause(status: WorkpackageStatus): boolean;
/**
 * Check if a status can be completed
 */
export declare function canComplete(status: WorkpackageStatus): boolean;
/**
 * Check if a status can be archived
 */
export declare function canArchive(status: WorkpackageStatus): boolean;
/**
 * Get a human-readable description of what can be done from a status
 */
export declare function getStatusActions(status: WorkpackageStatus): string[];
/**
 * All valid workpackage statuses
 */
export declare const ALL_STATUSES: readonly WorkpackageStatus[];
/**
 * Statuses that should be shown by default (excludes archived)
 */
export declare const DEFAULT_VISIBLE_STATUSES: readonly WorkpackageStatus[];
export {};
//# sourceMappingURL=state-machine.d.ts.map