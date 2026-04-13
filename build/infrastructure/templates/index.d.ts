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
export { TemplateCategory, KnowledgeTemplateType, PlanTemplateType, TemplateName, TemplateMetadata, CompiledTemplate, TemplateValidationResult, TemplateRenderResult, TemplateEngineOptions, TemplateLogger, defaultTemplateLogger, BaseTemplateData, SessionHandoffData, WorkpackageData, TechnicalDecisionData, BusinessRuleData, ArchitecturalPatternData, LessonsLearnedData, MasterPlanData, SprintPlanData, TemplateData, TemplateDataMap, } from './types';
export { TemplateEngine, TemplateEngineError } from './engine';
export { TemplateValidator, TemplateValidatorOptions, TemplateValidationError, } from './validator';
//# sourceMappingURL=index.d.ts.map