/**
 * Knowledge Infrastructure Module
 *
 * Exports all knowledge management utilities for use by
 * knowledge automation scripts.
 */
export * from './types';
export { KnowledgeDatabase, exportJsonIndex, importJsonIndex } from './db';
export { tokenize, computeTermFrequency, computeIdf, computeTfIdfVector, cosineSimilarity, TfIdfIndex } from './tfidf';
export { parseFrontmatter, parseKnowledgeFile, scanKnowledgeFiles, parseAllKnowledgeFiles, generateKnowledgeMarkdown, writeKnowledgeFile, updateKnowledgeFile, getNextId, isValidId, getTypeFromId } from './parser';
export { loadPatternsConfig, detectSearchIntent, detectCaptureTrigger, detectConfirmation, inferTags, getPendingCaptureConfig, generateSuggestedTitle, clearPatternsCache, getSearchPatterns, getCapturePatterns, getTagInferenceMap } from './patterns';
//# sourceMappingURL=index.d.ts.map