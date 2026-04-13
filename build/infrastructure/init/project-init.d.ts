/**
 * Core Project Initialization Logic
 *
 * Orchestrates the complete /cf-init flow:
 * 1. Project detection
 * 2. Directory scaffolding
 * 3. Manifest creation
 * 4. Session 0 initialization
 * 5. Hook configuration
 * 6. CLAUDE.md update (for user's project)
 * 7. Post-init checks
 *
 * Based on P2.1 Feature Brief v1.1.0.
 */
import { ProjectState, InitOptions, InitializationResult, PostInitCheck, SessionState, SessionHistory, SyncState, ClearConfig, InitError } from './types';
/**
 * Detect the current state of a project
 *
 * @param projectDir - Project directory to check
 * @returns Project state with details
 */
export declare function detectProjectState(projectDir: string): ProjectState;
/**
 * Create the .clear/ directory structure
 *
 * @param projectDir - Project directory
 * @throws Error if creation fails
 */
export declare function createDirectoryStructure(projectDir: string): void;
/**
 * Create Session 0 state (initialization session)
 *
 * @param sessionId - Generated init session ID
 * @returns Session state object
 */
export declare function createSession0State(sessionId: string): SessionState;
/**
 * Create initial session history
 *
 * @param sessionId - Session ID
 * @param startTime - Session start time
 * @returns Session history object
 */
export declare function createSessionHistory(sessionId: string, startTime: string): SessionHistory;
/**
 * Create initial sync state
 *
 * @param sessionId - Session ID
 * @returns Sync state object
 */
export declare function createSyncState(sessionId: string): SyncState;
/**
 * Create default configuration
 *
 * @returns Default configuration object
 */
export declare function createDefaultConfig(): ClearConfig;
/**
 * Write all initial state files
 *
 * @param projectDir - Project directory
 * @param sessionId - Generated session ID
 */
export declare function writeStateFiles(projectDir: string, sessionId: string): void;
/**
 * Update project's CLAUDE.md with session resume instructions
 *
 * Note: This updates the USER'S project CLAUDE.md, not clear-framework's.
 *
 * @param projectDir - Project directory
 */
export declare function updateProjectClaudeMd(projectDir: string): void;
/**
 * Run post-initialization checks
 *
 * @param projectDir - Project directory
 * @returns Array of check results
 */
export declare function runPostInitChecks(projectDir: string): PostInitCheck[];
/**
 * Initialize CLEAR in a project
 *
 * @param options - Initialization options
 * @returns Initialization result
 */
export declare function initializeProject(options: InitOptions): Promise<InitializationResult>;
/**
 * Create a structured initialization error
 *
 * @param code - Error code
 * @param context - Additional context
 * @returns Structured error object
 */
export declare function createInitError(code: InitError['code'], context: unknown): InitError;
/**
 * Format initialization result for display
 *
 * @param result - Initialization result
 * @returns Formatted string for display
 */
export declare function formatInitResult(result: InitializationResult): string;
//# sourceMappingURL=project-init.d.ts.map