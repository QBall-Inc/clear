"use strict";
/**
 * Knowledge Management Type Definitions
 *
 * Types for knowledge entries, indexing, and search operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_KNOWLEDGE_CONFIG = exports.TOKEN_LEVEL_CONFIGS = exports.KNOWLEDGE_TYPE_PREFIXES = void 0;
/**
 * ID prefixes for each knowledge type
 */
exports.KNOWLEDGE_TYPE_PREFIXES = {
    'technical-decision': 'TD',
    'business-rule': 'BR',
    'architectural-pattern': 'PAT',
    'lesson-learned': 'LES'
};
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