"use strict";
/**
 * Type definitions for CLEAR hook infrastructure
 *
 * Hooks are event-driven automation mechanisms that allow skills to respond
 * to Claude Code events by generating and executing bash scripts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HookValidationError = exports.HookRegistrationError = exports.HookGenerationError = exports.HookError = void 0;
/**
 * Custom error for hook-related failures
 */
class HookError extends Error {
    constructor(message, namespace, context) {
        super(message);
        this.namespace = namespace;
        this.context = context;
        this.name = 'HookError';
        Object.setPrototypeOf(this, HookError.prototype);
    }
}
exports.HookError = HookError;
/**
 * Error during script generation
 */
class HookGenerationError extends HookError {
    constructor(message, namespace, context) {
        super(message, namespace, context);
        this.name = 'HookGenerationError';
        Object.setPrototypeOf(this, HookGenerationError.prototype);
    }
}
exports.HookGenerationError = HookGenerationError;
/**
 * Error during hook registration
 */
class HookRegistrationError extends HookError {
    constructor(message, namespace, context) {
        super(message, namespace, context);
        this.name = 'HookRegistrationError';
        Object.setPrototypeOf(this, HookRegistrationError.prototype);
    }
}
exports.HookRegistrationError = HookRegistrationError;
/**
 * Error during script validation
 */
class HookValidationError extends HookError {
    constructor(message, namespace, context) {
        super(message, namespace, context);
        this.name = 'HookValidationError';
        Object.setPrototypeOf(this, HookValidationError.prototype);
    }
}
exports.HookValidationError = HookValidationError;
//# sourceMappingURL=types.js.map