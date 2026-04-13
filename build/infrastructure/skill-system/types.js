"use strict";
/**
 * Core type definitions for the CLEAR skill infrastructure.
 * Skills are instruction documents (YAML frontmatter + Markdown) that tell Claude what to do.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircularDependencyError = exports.SkillValidationError = exports.SkillLoadError = exports.SkillError = void 0;
/**
 * Error classes for skill operations
 */
class SkillError extends Error {
    constructor(message, context) {
        super(message);
        this.context = context;
        this.name = 'SkillError';
    }
}
exports.SkillError = SkillError;
class SkillLoadError extends SkillError {
    constructor(message, skillName, context) {
        super(message, context);
        this.skillName = skillName;
        this.name = 'SkillLoadError';
    }
}
exports.SkillLoadError = SkillLoadError;
class SkillValidationError extends SkillError {
    constructor(message, errors, context) {
        super(message, context);
        this.errors = errors;
        this.name = 'SkillValidationError';
    }
}
exports.SkillValidationError = SkillValidationError;
class CircularDependencyError extends SkillError {
    constructor(message, cycle, context) {
        super(message, context);
        this.cycle = cycle;
        this.name = 'CircularDependencyError';
    }
}
exports.CircularDependencyError = CircularDependencyError;
//# sourceMappingURL=types.js.map