"use strict";
/**
 * Workpackage State Machine (P2.7)
 *
 * Implements state transition validation for workpackage lifecycle management.
 * Based on P2.7 Feature Brief Section 3.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_VISIBLE_STATUSES = exports.ALL_STATUSES = exports.InvalidTransitionError = void 0;
exports.isValidTransition = isValidTransition;
exports.getTransitionTrigger = getTransitionTrigger;
exports.isAutomaticTransition = isAutomaticTransition;
exports.validateTransition = validateTransition;
exports.getValidTransitions = getValidTransitions;
exports.getTransitionRules = getTransitionRules;
exports.isActiveStatus = isActiveStatus;
exports.isTerminalStatus = isTerminalStatus;
exports.isBlockedStatus = isBlockedStatus;
exports.canStart = canStart;
exports.canPause = canPause;
exports.canComplete = canComplete;
exports.canArchive = canArchive;
exports.getStatusActions = getStatusActions;
// ==============================================================================
// ERROR TYPES
// ==============================================================================
/**
 * Error thrown when an invalid state transition is attempted
 */
class InvalidTransitionError extends Error {
    constructor(from, to, reason) {
        super(`Cannot transition from '${from}' to '${to}': ${reason}`);
        this.from = from;
        this.to = to;
        this.reason = reason;
        this.name = 'InvalidTransitionError';
    }
}
exports.InvalidTransitionError = InvalidTransitionError;
/**
 * Valid transitions from each status
 *
 * Based on P2.7 Feature Brief Section 3.3 State Transition Diagram
 */
const TRANSITION_RULES = {
    not_started: [
        { to: 'in_progress', trigger: 'start', conditions: 'Dependencies satisfied or --force' },
        { to: 'blocked', trigger: 'block', automatic: true, conditions: 'Hard dependency incomplete' },
        { to: 'archived', trigger: 'delete', conditions: 'User confirmation' }
    ],
    in_progress: [
        { to: 'paused', trigger: 'pause' },
        { to: 'complete', trigger: 'complete', conditions: 'Validation passes or --force' },
        // Note: in_progress -> archived requires pause first (see canTransition logic)
    ],
    paused: [
        { to: 'in_progress', trigger: 'start' },
        { to: 'in_progress', trigger: 'resume' },
        { to: 'archived', trigger: 'delete', conditions: 'User confirmation' }
    ],
    blocked: [
        { to: 'in_progress', trigger: 'unblock', automatic: true, conditions: 'Blocking deps complete' },
        { to: 'not_started', trigger: 'unblock', automatic: true, conditions: 'Blocking deps complete' },
        { to: 'archived', trigger: 'delete', conditions: 'User confirmation' }
    ],
    complete: [
        { to: 'archived', trigger: 'delete', conditions: 'User confirmation' }
    ],
    deferred: [
        { to: 'not_started', trigger: 'start', conditions: 'Reactivate deferred workpackage' },
        { to: 'in_progress', trigger: 'start', conditions: 'Reactivate and start' },
        { to: 'archived', trigger: 'delete', conditions: 'User confirmation' }
    ],
    archived: [
    // No transitions out of archived (future: restore command)
    ]
};
// ==============================================================================
// VALIDATION FUNCTIONS
// ==============================================================================
/**
 * Check if a transition is valid
 *
 * @param from - Current status
 * @param to - Target status
 * @returns true if transition is valid
 */
function isValidTransition(from, to) {
    // Same status is always "valid" (no-op)
    if (from === to) {
        return true;
    }
    // Special case: in_progress -> archived requires pause first
    if (from === 'in_progress' && to === 'archived') {
        return false;
    }
    const rules = TRANSITION_RULES[from];
    return rules.some(rule => rule.to === to);
}
/**
 * Get the trigger required for a transition
 *
 * @param from - Current status
 * @param to - Target status
 * @returns Trigger type or null if transition invalid
 */
function getTransitionTrigger(from, to) {
    if (from === to) {
        return null;
    }
    const rules = TRANSITION_RULES[from];
    const rule = rules.find(r => r.to === to);
    return rule?.trigger ?? null;
}
/**
 * Check if a transition is automatic (system-triggered)
 *
 * @param from - Current status
 * @param to - Target status
 * @returns true if transition is automatic
 */
function isAutomaticTransition(from, to) {
    const rules = TRANSITION_RULES[from];
    const rule = rules.find(r => r.to === to);
    return rule?.automatic ?? false;
}
/**
 * Validate a transition and throw if invalid
 *
 * @param from - Current status
 * @param to - Target status
 * @throws InvalidTransitionError if transition is not valid
 */
function validateTransition(from, to) {
    if (from === to) {
        return; // No-op, always valid
    }
    // Special case: in_progress -> archived
    if (from === 'in_progress' && to === 'archived') {
        throw new InvalidTransitionError(from, to, 'Cannot archive active workpackage. Pause it first.');
    }
    // Special case: archived -> anything
    if (from === 'archived') {
        throw new InvalidTransitionError(from, to, 'Cannot transition from archived status. Use restore command (future feature).');
    }
    if (!isValidTransition(from, to)) {
        throw new InvalidTransitionError(from, to, `No valid transition path exists from '${from}' to '${to}'`);
    }
}
/**
 * Get all valid target statuses from a given status
 *
 * @param from - Current status
 * @returns Array of valid target statuses
 */
function getValidTransitions(from) {
    const rules = TRANSITION_RULES[from];
    return [...new Set(rules.map(r => r.to))];
}
/**
 * Get detailed transition info for a status
 *
 * @param from - Current status
 * @returns Array of transition rules
 */
function getTransitionRules(from) {
    return TRANSITION_RULES[from];
}
// ==============================================================================
// STATUS HELPERS
// ==============================================================================
/**
 * Check if a status represents an active/working state
 */
function isActiveStatus(status) {
    return status === 'in_progress';
}
/**
 * Check if a status represents a terminal state
 */
function isTerminalStatus(status) {
    return status === 'complete' || status === 'archived';
}
/**
 * Check if a status represents a blocked state
 */
function isBlockedStatus(status) {
    return status === 'blocked';
}
/**
 * Check if a status can be started/resumed
 */
function canStart(status) {
    return status === 'not_started' || status === 'paused' || status === 'deferred';
}
/**
 * Check if a status can be paused
 */
function canPause(status) {
    return status === 'in_progress';
}
/**
 * Check if a status can be completed
 */
function canComplete(status) {
    return status === 'in_progress';
}
/**
 * Check if a status can be archived
 */
function canArchive(status) {
    // All statuses except in_progress can be archived
    // in_progress must be paused first
    return status !== 'in_progress' && status !== 'archived';
}
/**
 * Get a human-readable description of what can be done from a status
 */
function getStatusActions(status) {
    const actions = [];
    if (canStart(status)) {
        actions.push('start');
    }
    if (canPause(status)) {
        actions.push('pause');
    }
    if (canComplete(status)) {
        actions.push('complete');
    }
    if (canArchive(status)) {
        actions.push('delete (archive)');
    }
    return actions;
}
// ==============================================================================
// ALL STATUSES CONSTANT
// ==============================================================================
/**
 * All valid workpackage statuses
 */
exports.ALL_STATUSES = [
    'not_started',
    'in_progress',
    'paused',
    'blocked',
    'complete',
    'deferred',
    'archived'
];
/**
 * Statuses that should be shown by default (excludes archived)
 */
exports.DEFAULT_VISIBLE_STATUSES = [
    'not_started',
    'in_progress',
    'paused',
    'blocked',
    'complete',
    'deferred'
];
//# sourceMappingURL=state-machine.js.map