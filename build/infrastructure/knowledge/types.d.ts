/**
 * Knowledge Management Type Definitions
 *
 * Types for knowledge entries, indexing, and search operations.
 */
/**
 * Knowledge entry types
 */
export type KnowledgeType = 'technical-decision' | 'business-rule' | 'architectural-pattern' | 'lesson-learned' | 'institutional-wiki' | 'stakeholder' | 'process';
/**
 * Knowledge entry status
 */
export type KnowledgeStatus = 'active' | 'pending' | 'superseded' | 'deprecated' | 'archived';
/**
 * ID prefixes for each knowledge type
 */
export declare const KNOWLEDGE_TYPE_PREFIXES: Record<KnowledgeType, string>;
/**
 * All valid knowledge types as a runtime array.
 * Derived from KNOWLEDGE_TYPE_PREFIXES via `keyof typeof` so the two sources
 * cannot drift and the cast is TS-verified rather than asserted.
 */
export declare const KNOWLEDGE_TYPES: readonly KnowledgeType[];
/**
 * Drift-proof example-ID list for "Invalid entry ID format" error messages.
 * Sourced from KNOWLEDGE_TYPE_PREFIXES; centralized here so the four CLIs
 * (capture, delete, deprecate, dismiss) all surface the same prefix matrix.
 * LINT-K3.5-03 fix.
 *
 * @returns A comma-separated list of example IDs, e.g.
 *   "TD-001, BR-001, PAT-001, LES-001, IW-001, SH-001, PROC-001"
 */
export declare function formatValidIdExamples(): string;
/**
 * All valid knowledge statuses as a runtime array.
 * Mirrors the KnowledgeStatus union — keep in sync if statuses change.
 */
export declare const KNOWLEDGE_STATUSES: readonly KnowledgeStatus[];
/**
 * Filename regex for VALID knowledge entry markdown files.
 * Derived from KNOWLEDGE_TYPE_PREFIXES values so the prefix set cannot drift.
 * Digit-count (\\d{3}) mirrors isValidId in parser.ts — both surfaces must
 * change together if entry IDs ever exceed 3 digits.
 *
 * Consumed by status-cli to enumerate filenames under the "malformed-prefix"
 * Anomalies category.
 */
export declare const VALID_ENTRY_FILENAME_REGEX: RegExp;
/**
 * Type guard: validate a value is a valid KnowledgeType.
 * Use at parse boundaries instead of `as KnowledgeType` casts.
 */
export declare function isKnowledgeType(v: unknown): v is KnowledgeType;
/**
 * Type guard: validate a value is a valid KnowledgeStatus.
 * Use at parse boundaries instead of `as KnowledgeStatus` casts.
 */
export declare function isKnowledgeStatus(v: unknown): v is KnowledgeStatus;
/**
 * Knowledge entry as stored in markdown frontmatter
 */
export interface KnowledgeEntryFrontmatter {
    id: string;
    title: string;
    type: KnowledgeType;
    status: KnowledgeStatus;
    tags: string[];
    created: string;
    created_session: number;
    modified?: string;
    supersedes?: string | null;
    superseded_by?: string | null;
    description: string;
    alternatives_considered?: string[];
    related_files?: string[];
    schema_version?: number;
    surfaced_count?: number;
    supersession_reviewed?: boolean;
    source?: string | null;
    source_updated?: string | null;
    scope?: string | null;
    entity_type?: string | null;
    role?: string | null;
    owns?: string | string[] | null;
    slug?: string | null;
    contact?: string | null;
    trigger_event?: string | null;
    frequency?: string | null;
    tools?: string | null;
    automation_hook?: string | null;
    promotion_status?: string | null;
    linked_workpackages?: string[] | string | null;
}
/**
 * Required frontmatter fields for a parseable knowledge entry.
 * MUST stay in sync with parser.ts — the parser returns null when any of
 * these are missing. Consumed by status-cli to enumerate entries missing
 * required fields under the "missing-required-fields" Anomalies category.
 */
export declare const REQUIRED_FRONTMATTER_FIELDS: readonly (keyof KnowledgeEntryFrontmatter)[];
/**
 * Knowledge entry as stored in SQLite index
 */
export interface KnowledgeEntry {
    id: string;
    type: KnowledgeType;
    title: string;
    status: KnowledgeStatus;
    tags: string[];
    created: string;
    created_session: number;
    modified: string | null;
    supersedes: string | null;
    superseded_by: string | null;
    description: string;
    file_path: string;
    tfidf_vector: TfIdfVector;
    workpackage_id: string | null;
    phase_id: string | null;
    deprecated_at: string | null;
    deprecated_reason: string | null;
    archived_at: string | null;
    deprecation_type: 'obsolete' | 'superseded' | null;
    superseded_at: string | null;
    schema_version: number;
    surfaced_count: number;
    supersession_reviewed: boolean;
    source: string | null;
    source_updated: string | null;
    scope: string | null;
    entity_type: string | null;
    role: string | null;
    owns: string | null;
    contact: string | null;
    trigger_event: string | null;
    frequency: string | null;
    tools: string | null;
    automation_hook: string | null;
    promotion_status: string | null;
}
/**
 * Knowledge entry row from SQLite (raw)
 */
export interface KnowledgeEntryRow {
    id: string;
    type: string;
    title: string;
    status: string;
    tags: string;
    created: string;
    created_session: number;
    modified: string | null;
    supersedes: string | null;
    superseded_by: string | null;
    description: string;
    file_path: string;
    tfidf_vector: string;
    workpackage_id: string | null;
    phase_id: string | null;
    deprecated_at: string | null;
    deprecated_reason: string | null;
    archived_at: string | null;
    deprecation_type: string | null;
    superseded_at: string | null;
    schema_version: number | null;
    surfaced_count: number | null;
    supersession_reviewed: number | null;
    source: string | null;
    source_updated: string | null;
    scope: string | null;
    entity_type: string | null;
    role: string | null;
    owns: string | null;
    contact: string | null;
    trigger_event: string | null;
    frequency: string | null;
    tools: string | null;
    automation_hook: string | null;
    promotion_status: string | null;
}
/**
 * Index metadata stored in SQLite
 */
export interface IndexMetadata {
    last_full_rebuild: string;
    last_full_rebuild_session: number;
    entry_count: number;
    idf_values: string;
}
/**
 * TF-IDF sparse vector (term -> weight)
 */
export type TfIdfVector = Record<string, number>;
/**
 * Search result with relevance score
 */
export interface SearchResult {
    entry: KnowledgeEntry;
    score: number;
    matchType: 'tag' | 'title' | 'tfidf';
}
/**
 * Token loading levels
 */
export type TokenLevel = 'minimal' | 'balanced' | 'comprehensive';
/**
 * Token level configuration
 */
export interface TokenLevelConfig {
    maxEntries: number;
    summaryThreshold: number;
}
/**
 * Token level configurations
 */
export declare const TOKEN_LEVEL_CONFIGS: Record<TokenLevel, TokenLevelConfig>;
/**
 * Knowledge configuration
 */
export interface KnowledgeConfig {
    loading: {
        level: TokenLevel;
    };
    index: {
        rebuild_threshold_days: number;
        rebuild_threshold_sessions: number;
    };
    capture: {
        require_confirmation: boolean;
        auto_detect_patterns: boolean;
        suggest_tags: boolean;
        check_supersession: boolean;
    };
    search: {
        enable_tfidf: boolean;
        max_results: number;
    };
}
/**
 * Default knowledge configuration
 */
export declare const DEFAULT_KNOWLEDGE_CONFIG: KnowledgeConfig;
/**
 * Index rebuild mode
 */
export type IndexMode = 'full' | 'incremental';
/**
 * Index operation result
 */
export interface IndexResult {
    success: boolean;
    mode: IndexMode;
    entriesProcessed: number;
    entriesAdded: number;
    entriesUpdated: number;
    entriesRemoved: number;
    duration: number;
    error?: string;
}
/**
 * Load operation result
 */
export interface LoadResult {
    success: boolean;
    entries: KnowledgeEntry[];
    level: TokenLevel;
    totalAvailable: number;
    error?: string;
}
/**
 * Search intent pattern definition (from YAML config)
 */
export interface SearchPatternDef {
    pattern: string;
    flags: string;
    description: string;
    capture_group: number;
}
/**
 * Capture decision pattern definition (from YAML config)
 */
export interface CapturePatternDef {
    pattern: string;
    flags: string;
    type: KnowledgeType;
    description: string;
    capture_group?: number;
    explicit?: boolean;
}
/**
 * Confirmation pattern definition (from YAML config)
 */
export interface ConfirmationPatternDef {
    pattern: string;
    flags: string;
    response: 'confirm' | 'cancel' | 'edit';
    description: string;
}
/**
 * Pending capture timeout configuration
 */
export interface PendingCaptureConfig {
    max_prompts_without_response: number;
    expire_after_minutes: number;
}
/**
 * Tag inference mappings (tag -> keywords)
 */
export type TagInferenceMap = Record<string, string[]>;
/**
 * Full patterns configuration (from YAML)
 */
export interface PatternsConfig {
    version: string;
    search: {
        intent_patterns: SearchPatternDef[];
    };
    capture: {
        decision_patterns: CapturePatternDef[];
        confirmation_patterns: ConfirmationPatternDef[];
        pending_capture: PendingCaptureConfig;
    };
    tag_inference: TagInferenceMap;
}
/**
 * Compiled regex pattern for runtime matching
 */
export interface CompiledPattern<T> {
    regex: RegExp;
    definition: T;
}
/**
 * Search intent match result
 */
export interface SearchIntentMatch {
    matched: true;
    query: string;
    pattern: SearchPatternDef;
}
/**
 * No search intent match
 */
export interface NoSearchIntentMatch {
    matched: false;
}
/**
 * Search intent detection result
 */
export type SearchIntentResult = SearchIntentMatch | NoSearchIntentMatch;
/**
 * Capture detection match result
 */
export interface CaptureMatch {
    matched: true;
    extractedText: string;
    suggestedType: KnowledgeType;
    pattern: CapturePatternDef;
    isExplicit: boolean;
}
/**
 * No capture match
 */
export interface NoCaptureMatch {
    matched: false;
}
/**
 * Capture detection result
 */
export type CaptureDetectionResult = CaptureMatch | NoCaptureMatch;
/**
 * Confirmation detection result
 */
export interface ConfirmationResult {
    detected: boolean;
    response?: 'confirm' | 'cancel' | 'edit';
}
/**
 * Pending capture state (stored in session state)
 */
export interface PendingCaptureState {
    step: 'awaiting_confirmation' | 'awaiting_tag_review' | 'awaiting_supersession';
    detected_at: string;
    suggested_title: string;
    suggested_type: KnowledgeType;
    suggested_tags: string[];
    original_text: string;
    prompts_since_detection: number;
    similar_entries?: string[];
    confirmed_tags?: string[];
    matched_pattern_description?: string;
}
//# sourceMappingURL=types.d.ts.map