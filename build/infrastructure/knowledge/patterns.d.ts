/**
 * Pattern Loader for Knowledge Capture and Search
 *
 * Loads patterns from YAML configuration file, compiles regex patterns,
 * and provides detection functions for search intent and capture triggers.
 */
import { PatternsConfig, SearchPatternDef, CapturePatternDef, SearchIntentResult, CaptureDetectionResult, ConfirmationResult, TagInferenceMap } from './types';
/**
 * Load patterns configuration from YAML file
 * @param cwd - Project working directory (for user overrides)
 * @returns Parsed patterns configuration
 */
export declare function loadPatternsConfig(cwd?: string): PatternsConfig;
/**
 * Detect search intent in user text
 * @param text - User prompt text
 * @param cwd - Project working directory
 * @returns Search intent result with extracted query
 */
export declare function detectSearchIntent(text: string, cwd?: string): SearchIntentResult;
/**
 * Detect capture trigger in user text
 * @param text - User prompt text
 * @param cwd - Project working directory
 * @returns Capture detection result with extracted text and type
 */
export declare function detectCaptureTrigger(text: string, cwd?: string): CaptureDetectionResult;
/**
 * Detect confirmation response in user text
 * @param text - User prompt text (typically short response)
 * @param cwd - Project working directory
 * @returns Confirmation result
 */
export declare function detectConfirmation(text: string, cwd?: string): ConfirmationResult;
/**
 * Infer tags from text based on keyword mappings
 * @param text - Text to analyze for keywords
 * @param cwd - Project working directory
 * @returns Array of inferred tags
 */
export declare function inferTags(text: string, cwd?: string): string[];
/**
 * Get pending capture configuration
 * @param cwd - Project working directory
 * @returns Pending capture timeout configuration
 */
export declare function getPendingCaptureConfig(cwd?: string): import("./types").PendingCaptureConfig;
/**
 * Generate a suggested title from extracted text
 * @param text - Extracted text from capture pattern
 * @param _type - Knowledge type (reserved for future type-specific formatting)
 * @returns Suggested title (capitalized, truncated if needed)
 */
export declare function generateSuggestedTitle(text: string): string;
/**
 * Clear cached patterns (useful for testing or config reload)
 */
export declare function clearPatternsCache(): void;
/**
 * Get all search patterns (for testing/debugging)
 */
export declare function getSearchPatterns(cwd?: string): SearchPatternDef[];
/**
 * Get all capture patterns (for testing/debugging)
 */
export declare function getCapturePatterns(cwd?: string): CapturePatternDef[];
/**
 * Get tag inference map (for testing/debugging)
 */
export declare function getTagInferenceMap(cwd?: string): TagInferenceMap;
//# sourceMappingURL=patterns.d.ts.map