/**
 * Configuration Integration
 *
 * Provides integration utilities for connecting Configuration to
 * HookOrchestrator, ContextManager, and other components.
 */
import { Configuration } from './config';
import type { OrchestratorConfig } from '../hooks/orchestrator';
/**
 * Extract HookOrchestrator configuration from a Configuration instance
 * @param config - Configuration instance
 * @returns OrchestratorConfig with values from Configuration
 */
export declare function getOrchestratorConfig(config: Configuration): OrchestratorConfig;
/**
 * Watch Configuration changes and update orchestrator config
 * @param config - Configuration instance to watch
 * @param updateFn - Function to call with new OrchestratorConfig when limits change
 * @returns Unsubscribe function
 */
export declare function watchOrchestratorConfig(config: Configuration, updateFn: (newConfig: Partial<OrchestratorConfig>) => void): () => void;
/**
 * Context manager limits extracted from Configuration
 */
export interface ContextLimits {
    /** Maximum context size in bytes */
    maxContextSize: number;
    /** Maximum writes per minute */
    maxWritesPerMinute: number;
}
/**
 * Extract ContextManager limits from Configuration
 * @param config - Configuration instance
 * @returns ContextLimits with values from Configuration
 */
export declare function getContextLimits(config: Configuration): ContextLimits;
/**
 * Watch Configuration changes and update context limits
 * @param config - Configuration instance to watch
 * @param updateFn - Function to call when context limits change
 * @returns Unsubscribe function
 */
export declare function watchContextLimits(config: Configuration, updateFn: (limits: Partial<ContextLimits>) => void): () => void;
/**
 * Hook executor limits extracted from Configuration
 */
export interface ExecutorLimits {
    /** Default timeout for hook execution */
    defaultTimeout: number;
    /** Maximum retry attempts */
    maxRetries: number;
}
/**
 * Extract HookExecutor limits from Configuration
 * @param config - Configuration instance
 * @returns ExecutorLimits with values from Configuration
 */
export declare function getExecutorLimits(config: Configuration): ExecutorLimits;
/**
 * Watch Configuration changes and update executor limits
 * @param config - Configuration instance to watch
 * @param updateFn - Function to call when executor limits change
 * @returns Unsubscribe function
 */
export declare function watchExecutorLimits(config: Configuration, updateFn: (limits: Partial<ExecutorLimits>) => void): () => void;
/**
 * Skill loader limits extracted from Configuration
 */
export interface SkillLoaderLimits {
    /** Maximum skill file size */
    maxSkillSize: number;
    /** Maximum dependencies per skill */
    maxDependencies: number;
    /** Maximum dependency depth */
    maxLoadDepth: number;
    /** Maximum skills in memory */
    maxSkillsLoaded: number;
}
/**
 * Extract SkillLoader limits from Configuration
 * @param config - Configuration instance
 * @returns SkillLoaderLimits with values from Configuration
 */
export declare function getSkillLoaderLimits(config: Configuration): SkillLoaderLimits;
/**
 * Watch Configuration changes and update skill loader limits
 * @param config - Configuration instance to watch
 * @param updateFn - Function to call when skill loader limits change
 * @returns Unsubscribe function
 */
export declare function watchSkillLoaderLimits(config: Configuration, updateFn: (limits: Partial<SkillLoaderLimits>) => void): () => void;
//# sourceMappingURL=integration.d.ts.map