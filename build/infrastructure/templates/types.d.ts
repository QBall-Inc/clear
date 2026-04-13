/**
 * Template System Types
 *
 * Type definitions for the CLEAR framework template generation system.
 * Templates enforce consistent structure across all framework resources.
 *
 * @module infrastructure/templates/types
 */
/**
 * Template categories supported by the system
 */
export type TemplateCategory = 'session' | 'workpackage' | 'knowledge' | 'plan';
/**
 * Knowledge base template subtypes
 */
export type KnowledgeTemplateType = 'technical-decision' | 'business-rule' | 'architectural-pattern' | 'lessons-learned';
/**
 * Plan template subtypes
 */
export type PlanTemplateType = 'master-plan' | 'sprint-plan';
/**
 * All available template names
 */
export type TemplateName = 'session-handoff' | 'workpackage' | KnowledgeTemplateType | PlanTemplateType;
/**
 * Template metadata stored in frontmatter or separately
 */
export interface TemplateMetadata {
    /** Template name/identifier */
    name: TemplateName;
    /** Semantic version */
    version: string;
    /** Template category */
    category: TemplateCategory;
    /** Human-readable description */
    description: string;
    /** JSON Schema reference for validation */
    schemaPath: string;
    /** Required fields that must be provided */
    requiredFields: string[];
    /** Optional fields with defaults */
    optionalFields: string[];
}
/**
 * Compiled template ready for rendering
 */
export interface CompiledTemplate {
    /** Template metadata */
    metadata: TemplateMetadata;
    /** Raw template content (Handlebars source) */
    source: string;
    /** Compiled Handlebars template function */
    render: (data: Record<string, unknown>) => string;
}
/**
 * Result of template validation
 */
export interface TemplateValidationResult {
    /** Whether validation passed */
    valid: boolean;
    /** Validation error messages */
    errors: string[];
    /** Non-blocking warnings */
    warnings: string[];
}
/**
 * Result of template rendering
 */
export interface TemplateRenderResult {
    /** Whether rendering succeeded */
    success: boolean;
    /** Rendered content (if successful) */
    content?: string;
    /** Error message (if failed) */
    error?: string;
    /** Template used */
    templateName: TemplateName;
    /** Timestamp of rendering */
    renderedAt: string;
}
/**
 * Options for template engine operations
 */
export interface TemplateEngineOptions {
    /** Base path for template files */
    templatesPath?: string;
    /** Base path for schema files */
    schemasPath?: string;
    /** Whether to cache compiled templates */
    cacheTemplates?: boolean;
    /** Whether to validate data before rendering */
    validateBeforeRender?: boolean;
    /** Custom Handlebars helpers to register */
    helpers?: Record<string, (...args: unknown[]) => unknown>;
}
/**
 * Logger interface for template operations
 */
export interface TemplateLogger {
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
}
/**
 * Default no-op logger
 */
export declare const defaultTemplateLogger: TemplateLogger;
/**
 * Base interface for all template data
 */
export interface BaseTemplateData {
    /** Auto-generated or provided ID */
    id?: string;
    /** Creation timestamp (auto-set if not provided) */
    createdAt?: string;
    /** Last update timestamp */
    updatedAt?: string;
}
/**
 * Session handoff template data
 */
export interface SessionHandoffData extends BaseTemplateData {
    /** Session number */
    sessionNumber: number;
    /** Session date (YYYY-MM-DD) */
    date: string;
    /** Active workpackage ID */
    workpackage: string;
    /** Token usage percentage at end */
    tokensEnd: number;
    /** Session status */
    status: 'complete' | 'partial' | 'interrupted';
    /** Summary of session work */
    summary: string;
    /** Completed items with descriptions */
    completed: Array<{
        path: string;
        description: string;
    }>;
    /** Technical decisions made */
    technicalDecisions?: Array<{
        decision: string;
        reason: string;
    }>;
    /** Patterns established */
    patternsEstablished?: Array<{
        name: string;
        description: string;
    }>;
    /** Next steps for following session */
    nextSteps: string[];
    /** Unresolved blockers */
    blockers?: string[];
    /** Open questions */
    questions?: string[];
    /** Learnings from this session */
    learnings?: string[];
    /** Patterns observed during this session */
    patternsObserved?: string[];
    /** Session metrics */
    metrics?: {
        productionLines?: number;
        testLines?: number;
        filesCreated?: number;
        testsPassing?: number;
        testsTotal?: number;
    };
}
/**
 * Workpackage template data
 */
export interface WorkpackageData extends BaseTemplateData {
    /** Workpackage ID (e.g., A1, B2.3) */
    id: string;
    /** Brief title */
    title: string;
    /** Current status */
    status: 'not_started' | 'in_progress' | 'complete' | 'blocked';
    /** Workpackage type */
    type: 'infrastructure' | 'feature' | 'bugfix' | 'refactor' | 'documentation';
    /** Priority level */
    priority: 'critical' | 'high' | 'medium' | 'low';
    /** Full description */
    description: string;
    /** Upstream dependencies */
    dependencies?: Array<{
        workpackageId: string;
        type: 'hard' | 'soft';
        description?: string;
    }>;
    /** Success criteria checklist */
    successCriteria: string[];
    /** Estimated token usage */
    estimatedTokens?: number;
    /** Actual token usage (filled on completion) */
    actualTokens?: number;
    /** Assigned sub-agent */
    assignedTo?: string;
    /** Related resources */
    relatedResources?: {
        knowledgeBases?: string[];
        documentation?: string[];
        code?: string[];
    };
}
/**
 * Technical decision template data
 */
export interface TechnicalDecisionData extends BaseTemplateData {
    /** Decision ID (e.g., TD-0042) */
    id: string;
    /** Claude Code session ID that created this decision */
    sessionId: string;
    /** Decision title */
    title: string;
    /** Decision date */
    date: string;
    /** Current status */
    status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
    /** Category */
    category: 'architecture' | 'technology' | 'process' | 'tooling';
    /** Impact level */
    impact: 'breaking' | 'major' | 'minor' | 'patch';
    /** Context/background */
    context: string;
    /** The decision made */
    decision: string;
    /** Rationale for the decision */
    rationale: string;
    /** Alternatives considered */
    alternatives?: Array<{
        option: string;
        pros: string[];
        cons: string[];
        reasonRejected: string;
    }>;
    /** Trade-offs */
    tradeoffs?: {
        gaining: string[];
        sacrificing: string[];
    };
    /** Implementation notes */
    implementationNotes?: string;
    /** Related decisions */
    relatedDecisions?: string[];
}
/**
 * Business rule template data
 */
export interface BusinessRuleData extends BaseTemplateData {
    /** Rule ID (e.g., BR-0156) */
    id: string;
    /** Claude Code session ID that created this rule */
    sessionId: string;
    /** Rule name */
    name: string;
    /** Rule category */
    category: 'validation' | 'calculation' | 'authorization' | 'workflow';
    /** Priority */
    priority: 'mandatory' | 'recommended' | 'optional';
    /** Effective date */
    effectiveDate: string;
    /** Expiry date (if applicable) */
    expiryDate?: string;
    /** Source/authority for this rule */
    authority: string;
    /** Plain language rule statement */
    ruleStatement: string;
    /** Logic definition (pseudocode) */
    logic: string;
    /** Validation rules */
    validations: Array<{
        field: string;
        rule: string;
        errorMessage: string;
    }>;
    /** Exceptions to the rule */
    exceptions?: Array<{
        condition: string;
        override: string;
        approvalRequired: boolean;
    }>;
    /** Examples */
    examples?: Array<{
        scenario: string;
        input: Record<string, unknown>;
        result: string;
    }>;
}
/**
 * Architectural pattern template data
 */
export interface ArchitecturalPatternData extends BaseTemplateData {
    /** Pattern ID (e.g., AP-0023) */
    id: string;
    /** Claude Code session ID that documented this pattern */
    sessionId: string;
    /** Pattern name */
    name: string;
    /** Pattern type */
    type: 'creational' | 'structural' | 'behavioral' | 'architectural';
    /** Scope */
    scope: 'application' | 'module' | 'class' | 'function';
    /** Maturity */
    maturity: 'experimental' | 'proven' | 'deprecated';
    /** Problem context */
    context: string;
    /** Problem statement */
    problem: string;
    /** Solution description */
    solution: string;
    /** Solution structure */
    structure?: {
        components: Array<{
            name: string;
            responsibility: string;
            collaborators?: string[];
        }>;
    };
    /** Implementation example */
    implementation?: string;
    /** Consequences */
    consequences?: {
        benefits: string[];
        liabilities: string[];
    };
    /** Known uses in project */
    knownUses?: Array<{
        location: string;
        description: string;
    }>;
    /** Related patterns */
    relatedPatterns?: Array<{
        patternId: string;
        relationship: string;
        description: string;
    }>;
    /** Anti-patterns to avoid */
    antiPatterns?: string[];
}
/**
 * Lessons learned template data
 */
export interface LessonsLearnedData extends BaseTemplateData {
    /** Lesson ID (e.g., LL-0089) */
    id: string;
    /** Claude Code session ID that documented this lesson */
    sessionId: string;
    /** Brief title */
    title: string;
    /** Date occurred */
    dateOccurred: string;
    /** Date documented */
    dateDocumented: string;
    /** Severity */
    severity: 'critical' | 'major' | 'minor';
    /** Category */
    category: 'technical' | 'process' | 'communication' | 'planning';
    /** Project phase when occurred */
    projectPhase: 'planning' | 'development' | 'testing' | 'deployment';
    /** Situation description */
    situation: string;
    /** Action taken */
    action: string;
    /** Result of action */
    result: string;
    /** Recommendation */
    recommendation: string;
    /** Root cause analysis */
    rootCause?: {
        primaryCause: string;
        contributingFactors?: string[];
    };
    /** Preventive measures */
    preventiveMeasures?: Array<{
        measure: string;
        type: 'process' | 'tool' | 'training' | 'documentation';
        implementation: string;
    }>;
    /** When this lesson applies */
    appliesWhen?: string[];
    /** When this lesson doesn't apply */
    doesNotApplyWhen?: string[];
}
/**
 * Master plan template data
 */
export interface MasterPlanData extends BaseTemplateData {
    /** Plan version */
    version: string;
    /** Project name */
    projectName: string;
    /** Plan status */
    status: 'draft' | 'active' | 'completed' | 'abandoned';
    /** Plan owner */
    owner: string;
    /** Executive summary */
    summary: string;
    /** Business objectives */
    businessObjectives: Array<{
        id: string;
        description: string;
        successMetric: string;
        priority: 'critical' | 'high' | 'medium';
    }>;
    /** Technical objectives */
    technicalObjectives?: Array<{
        id: string;
        description: string;
        successMetric: string;
        priority: 'critical' | 'high' | 'medium';
    }>;
    /** Project phases */
    phases: Array<{
        id: string;
        name: string;
        description?: string;
        status: 'not_started' | 'in_progress' | 'complete';
        dependencies?: string[];
    }>;
    /** Milestones */
    milestones: Array<{
        id: string;
        name: string;
        phase: string;
        status: 'pending' | 'achieved' | 'missed';
        successCriteria?: string[];
    }>;
    /** Risk register */
    risks?: Array<{
        id: string;
        description: string;
        probability: 'high' | 'medium' | 'low';
        impact: 'severe' | 'moderate' | 'minor';
        mitigation: string;
    }>;
}
/**
 * Sprint plan template data
 */
export interface SprintPlanData extends BaseTemplateData {
    /** Sprint number */
    sprintNumber: number;
    /** Start date */
    startDate: string;
    /** End date */
    endDate: string;
    /** Duration in days */
    durationDays: number;
    /** Reference to master plan phase */
    phase: string;
    /** Sprint status */
    status: 'planning' | 'active' | 'completed' | 'cancelled';
    /** Primary goal */
    primaryGoal: {
        description: string;
        successCriteria: string;
    };
    /** Secondary goals */
    secondaryGoals?: Array<{
        description: string;
        successCriteria: string;
        priority: 'should_have' | 'nice_to_have';
    }>;
    /** Committed workpackages */
    workpackages: Array<{
        id: string;
        title: string;
        assignedTo?: string;
        estimatedTokens?: number;
        status: 'not_started' | 'in_progress' | 'complete';
        blockers?: string[];
    }>;
    /** Stretch workpackages */
    stretchWorkpackages?: Array<{
        id: string;
        title: string;
        description?: string;
    }>;
    /** Token budget */
    tokenBudget?: {
        budget: number;
        used: number;
        remaining: number;
    };
    /** Active blockers */
    blockers?: Array<{
        id: string;
        description: string;
        impact: string;
        owner?: string;
    }>;
    /** Retrospective (filled at sprint end) */
    retrospective?: {
        completedWorkpackages: string[];
        incompleteWorkpackages: string[];
        whatWentWell: string[];
        whatCouldImprove: string[];
        actionItems: Array<{
            action: string;
            owner: string;
        }>;
    };
}
/**
 * Union type for all template data
 */
export type TemplateData = SessionHandoffData | WorkpackageData | TechnicalDecisionData | BusinessRuleData | ArchitecturalPatternData | LessonsLearnedData | MasterPlanData | SprintPlanData;
/**
 * Map template names to their data types
 */
export interface TemplateDataMap {
    'session-handoff': SessionHandoffData;
    'workpackage': WorkpackageData;
    'technical-decision': TechnicalDecisionData;
    'business-rule': BusinessRuleData;
    'architectural-pattern': ArchitecturalPatternData;
    'lessons-learned': LessonsLearnedData;
    'master-plan': MasterPlanData;
    'sprint-plan': SprintPlanData;
}
//# sourceMappingURL=types.d.ts.map