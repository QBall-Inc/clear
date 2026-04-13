/**
 * Default Configuration Values
 *
 * Provides sensible defaults for all configuration options.
 * These values are derived from Appendix B of the feature brief.
 */
import type { ResourceLimits, FrameworkConfig, ClearConfig, TokenThresholds } from './types';
/**
 * Default resource limits
 * See Appendix B of feature brief for rationale
 */
export declare const DEFAULT_LIMITS: ResourceLimits;
/**
 * Default token thresholds for session management
 */
export declare const DEFAULT_TOKEN_THRESHOLDS: TokenThresholds;
/**
 * Default framework configuration
 */
export declare const DEFAULT_FRAMEWORK_CONFIG: FrameworkConfig;
/**
 * Complete default configuration
 */
export declare const DEFAULT_CONFIG: ClearConfig;
/**
 * Deep merge two objects, with source overriding target
 * @param target - Base object
 * @param source - Override object
 * @returns Merged object
 */
export declare function deepMerge<T>(target: T, source: Partial<T>): T;
/**
 * Apply defaults to a partial configuration
 * @param partial - Partial configuration to complete
 * @returns Complete configuration with defaults applied
 */
export declare function applyDefaults(partial: Partial<ClearConfig>): ClearConfig;
//# sourceMappingURL=defaults.d.ts.map