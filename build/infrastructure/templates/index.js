"use strict";
/**
 * Template Generation System
 *
 * Provides Handlebars-based template generation with JSON Schema validation
 * for CLEAR framework resources (workpackages, knowledge bases, plans, handoffs).
 *
 * @module infrastructure/templates
 *
 * @example
 * ```typescript
 * import { TemplateEngine, SessionHandoffData } from './infrastructure/templates';
 *
 * const engine = new TemplateEngine();
 * await engine.initialize();
 *
 * const data: SessionHandoffData = {
 *   sessionNumber: 7,
 *   date: '2025-11-26',
 *   workpackage: 'A1.5',
 *   tokensEnd: 65,
 *   status: 'complete',
 *   summary: 'Completed template generation system',
 *   completed: [{ path: 'src/templates/', description: 'Template engine' }],
 *   nextSteps: ['Write tests', 'Create templates'],
 * };
 *
 * const result = await engine.render('session-handoff', data);
 * if (result.success) {
 *   console.log(result.content);
 * }
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateValidationError = exports.TemplateValidator = exports.TemplateEngineError = exports.TemplateEngine = exports.defaultTemplateLogger = void 0;
// Types
var types_1 = require("./types");
Object.defineProperty(exports, "defaultTemplateLogger", { enumerable: true, get: function () { return types_1.defaultTemplateLogger; } });
// Engine
var engine_1 = require("./engine");
Object.defineProperty(exports, "TemplateEngine", { enumerable: true, get: function () { return engine_1.TemplateEngine; } });
Object.defineProperty(exports, "TemplateEngineError", { enumerable: true, get: function () { return engine_1.TemplateEngineError; } });
// Validator
var validator_1 = require("./validator");
Object.defineProperty(exports, "TemplateValidator", { enumerable: true, get: function () { return validator_1.TemplateValidator; } });
Object.defineProperty(exports, "TemplateValidationError", { enumerable: true, get: function () { return validator_1.TemplateValidationError; } });
//# sourceMappingURL=index.js.map