"use strict";
/**
 * Knowledge Management Type Definitions
 *
 * Types for knowledge entries, indexing, and search operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_KNOWLEDGE_CONFIG = exports.TOKEN_LEVEL_CONFIGS = exports.REQUIRED_FRONTMATTER_FIELDS = exports.VALID_ENTRY_FILENAME_REGEX = exports.KNOWLEDGE_STATUSES = exports.KNOWLEDGE_TYPES = exports.KNOWLEDGE_TYPE_PREFIXES = void 0;
exports.formatValidIdExamples = formatValidIdExamples;
exports.isKnowledgeType = isKnowledgeType;
exports.isKnowledgeStatus = isKnowledgeStatus;
/**
 * ID prefixes for each knowledge type
 */
exports.KNOWLEDGE_TYPE_PREFIXES = {
    'technical-decision': 'TD',
    'business-rule': 'BR',
    'architectural-pattern': 'PAT',
    'lesson-learned': 'LES',
    'institutional-wiki': 'IW',
    'stakeholder': 'SH',
    'process': 'PROC'
};
/**
 * All valid knowledge types as a runtime array.
 * Derived from KNOWLEDGE_TYPE_PREFIXES via `keyof typeof` so the two sources
 * cannot drift and the cast is TS-verified rather than asserted.
 */
exports.KNOWLEDGE_TYPES = Object.keys(exports.KNOWLEDGE_TYPE_PREFIXES);
/**
 * Drift-proof example-ID list for "Invalid entry ID format" error messages.
 * Sourced from KNOWLEDGE_TYPE_PREFIXES; centralized here so the four CLIs
 * (capture, delete, deprecate, dismiss) all surface the same prefix matrix.
 * LINT-K3.5-03 fix.
 *
 * @returns A comma-separated list of example IDs, e.g.
 *   "TD-001, BR-001, PAT-001, LES-001, IW-001, SH-001, PROC-001"
 */
function formatValidIdExamples() {
    return Object.values(exports.KNOWLEDGE_TYPE_PREFIXES).map(p => `${p}-001`).join(', ');
}
/**
 * All valid knowledge statuses as a runtime array.
 * Mirrors the KnowledgeStatus union — keep in sync if statuses change.
 */
exports.KNOWLEDGE_STATUSES = ['active', 'pending', 'superseded', 'deprecated', 'archived'];
/**
 * Filename regex for VALID knowledge entry markdown files.
 * Derived from KNOWLEDGE_TYPE_PREFIXES values so the prefix set cannot drift.
 * Digit-count (\\d{3}) mirrors isValidId in parser.ts — both surfaces must
 * change together if entry IDs ever exceed 3 digits.
 *
 * Consumed by status-cli to enumerate filenames under the "malformed-prefix"
 * Anomalies category.
 */
exports.VALID_ENTRY_FILENAME_REGEX = new RegExp(`^(${Object.values(exports.KNOWLEDGE_TYPE_PREFIXES).join('|')})-\\d{3}\\.md$`);
/**
 * Type guard: validate a value is a valid KnowledgeType.
 * Use at parse boundaries instead of `as KnowledgeType` casts.
 */
function isKnowledgeType(v) {
    return typeof v === 'string' && exports.KNOWLEDGE_TYPES.includes(v);
}
/**
 * Type guard: validate a value is a valid KnowledgeStatus.
 * Use at parse boundaries instead of `as KnowledgeStatus` casts.
 */
function isKnowledgeStatus(v) {
    return typeof v === 'string' && exports.KNOWLEDGE_STATUSES.includes(v);
}
/**
 * Required frontmatter fields for a parseable knowledge entry.
 * MUST stay in sync with parser.ts — the parser returns null when any of
 * these are missing. Consumed by status-cli to enumerate entries missing
 * required fields under the "missing-required-fields" Anomalies category.
 */
exports.REQUIRED_FRONTMATTER_FIELDS = ['id', 'title', 'type'];
/**
 * Token level configurations
 */
exports.TOKEN_LEVEL_CONFIGS = {
    minimal: { maxEntries: 3, summaryThreshold: 1 },
    balanced: { maxEntries: 5, summaryThreshold: 3 },
    comprehensive: { maxEntries: 10, summaryThreshold: 5 }
};
/**
 * Default knowledge configuration
 */
exports.DEFAULT_KNOWLEDGE_CONFIG = {
    loading: {
        level: 'balanced'
    },
    index: {
        rebuild_threshold_days: 5,
        rebuild_threshold_sessions: 10
    },
    capture: {
        require_confirmation: true,
        auto_detect_patterns: true,
        suggest_tags: true,
        check_supersession: true
    },
    search: {
        enable_tfidf: true,
        max_results: 10
    }
};
//# sourceMappingURL=types.js.map