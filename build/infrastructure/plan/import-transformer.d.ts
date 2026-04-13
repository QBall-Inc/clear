/**
 * Bulwark Plan Import Transformer
 *
 * Transforms a Bulwark plan-creation output (plan_v*.md YAML block or standalone YAML)
 * into CLEAR's MasterPlan format + per-workpackage detail for cf-workpackage create.
 *
 * Field mapping (Bulwark → CLEAR):
 *   version        → MasterPlan.version
 *   project_name   → MasterPlan.projectName (snake_case → camelCase)
 *   status         → MasterPlan.status
 *   phases[].id    → Phase.id
 *   phases[].name  → Phase.name
 *   phases[].status → Phase.status (PhaseStatus enum)
 *   phases[].workpackages → Phase.workpackages (object[] → string[] of WP names)
 *   phases[].weights → Phase.weights
 *   phases[].dependencies → Phase.dependencies
 *   milestones[]   → Milestone[] (direct mapping)
 *
 * WP detail (per-workpackage, for cf-workpackage create):
 *   Extracted from plan WP objects or enriched-structure.yaml if present.
 */
import { MasterPlan } from './types';
/** Bulwark plan workpackage (as found in plan YAML) */
export interface BulwarkWorkpackage {
    id: string;
    name: string;
    description?: string;
    status?: string;
    estimated_sessions?: number;
    confidence?: string;
    dependencies?: string[];
    detail_file?: string;
    note?: string;
}
/** Bulwark plan phase (as found in plan YAML) */
export interface BulwarkPhase {
    id: string;
    name: string;
    status?: string;
    workpackages?: BulwarkWorkpackage[];
    weights?: Record<string, number>;
    dependencies?: string[];
}
/** Bulwark plan milestone */
export interface BulwarkMilestone {
    id: string;
    name: string;
    phase: string;
    type?: string;
    requires?: string[];
    status?: string;
    note?: string;
}
/** Bulwark plan risk */
export interface BulwarkRisk {
    id: string;
    description: string;
    severity?: string;
    mitigation?: string;
}
/** Top-level Bulwark plan structure */
export interface BulwarkPlan {
    version?: string;
    project_name?: string;
    created?: string;
    created_by?: string;
    status?: string;
    phases?: BulwarkPhase[];
    milestones?: BulwarkMilestone[];
    risks?: BulwarkRisk[];
    kill_criteria?: string[];
    dependency_graph?: {
        critical_path?: string[];
        parallel_opportunities?: unknown[];
    };
}
/** Enriched workpackage detail from plan-to-tasks synthesizer */
export interface EnrichedWorkpackageDetail {
    id: string;
    name: string;
    acceptance_criteria?: string[];
    deliverables?: string[];
    verification?: string[];
    notes?: string[];
    estimated_sessions?: number;
}
/** Import result: CLEAR MasterPlan + per-WP detail for cf-workpackage create */
export interface ImportTransformResult {
    masterPlan: MasterPlan;
    workpackageDetails: WorkpackageImportDetail[];
}
/** Per-workpackage detail for cf-workpackage create */
export interface WorkpackageImportDetail {
    /** WP name (used as title in cf-workpackage create) */
    title: string;
    /** Phase ID this WP belongs to */
    phaseId: string;
    /** Phase systemId for insertion */
    phaseSystemId: string;
    /** Description from plan */
    description: string;
    /** Acceptance criteria */
    acceptance_criteria: string[];
    /** Verification steps */
    verification: string[];
    /** Notes with source attribution */
    notes: string[];
    /** Deliverable descriptions (simple strings) */
    deliverables_text: string[];
    /** Estimated sessions */
    estimated_sessions: number;
    /** Confidence level */
    confidence: string;
    /** Dependencies (WP IDs) */
    dependencies: string[];
}
/**
 * Validate that parsed YAML is a Bulwark plan (has phases with workpackage objects)
 */
export declare function isBulwarkPlan(data: unknown): data is BulwarkPlan;
/**
 * Validate required fields for a Bulwark plan
 */
export declare function validateBulwarkPlan(plan: BulwarkPlan): string[];
/**
 * Extract YAML block from a plan_v*.md file (fenced code block)
 */
export declare function extractYamlFromMarkdown(content: string): string | null;
/**
 * Parse a Bulwark plan from YAML content string
 */
export declare function parseBulwarkPlanContent(content: string): BulwarkPlan;
/**
 * Load a Bulwark plan from a file path.
 * Supports both .yaml files and .md files (extracts YAML block).
 */
export declare function loadBulwarkPlan(filePath: string): BulwarkPlan;
/**
 * Try to load enriched-structure.yaml from a plan directory
 * (output of Bulwark plan-to-tasks synthesizer)
 */
export declare function loadEnrichedStructure(planDir: string): EnrichedWorkpackageDetail[] | null;
/**
 * Transform a Bulwark plan into CLEAR's MasterPlan + workpackage details.
 *
 * @param bulwarkPlan - Parsed Bulwark plan
 * @param enrichedDetails - Optional enriched WP details from plan-to-tasks
 * @returns ImportTransformResult with MasterPlan and per-WP details
 */
export declare function transformBulwarkPlan(bulwarkPlan: BulwarkPlan, enrichedDetails?: EnrichedWorkpackageDetail[] | null): ImportTransformResult;
//# sourceMappingURL=import-transformer.d.ts.map