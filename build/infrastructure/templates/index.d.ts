/**
 * Template Generation System
 *
 * Provides Handlebars-based template generation with JSON Schema validation
 * for CLEAR framework resources (workpackages, knowledge bases, plans).
 *
 * @module infrastructure/templates
 *
 * @example
 * ```typescript
 * import { TemplateEngine, WorkpackageData } from './infrastructure/templates';
 *
 * const engine = new TemplateEngine();
 * await engine.initialize();
 *
 * const data: WorkpackageData = {
 *   id: 'A1',
 *   title: 'Skill Infrastructure Foundation',
 *   status: 'in_progress',
 *   type: 'infrastructure',
 *   priority: 'critical',
 *   description: 'Establish the meta-infrastructure for all skill development',
 *   successCriteria: ['Skill registry operational', 'Validation system working'],
 * };
 *
 * const result = await engine.render('workpackage', data);
 * if (result.success) {
 *   console.log(result.content);
 * }
 * ```
 */
export { TemplateCategory, KnowledgeTemplateType, PlanTemplateType, TemplateName, TemplateMetadata, CompiledTemplate, TemplateValidationResult, TemplateRenderResult, TemplateEngineOptions, TemplateLogger, defaultTemplateLogger, BaseTemplateData, WorkpackageData, TechnicalDecisionData, BusinessRuleData, ArchitecturalPatternData, LessonsLearnedData, MasterPlanData, SprintPlanData, TemplateData, TemplateDataMap, } from './types';
export { TemplateEngine, TemplateEngineError } from './engine';
export { TemplateValidator, TemplateValidatorOptions, TemplateValidationError, } from './validator';
//# sourceMappingURL=index.d.ts.map