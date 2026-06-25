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
 * Author (or idempotently ensure) the CLEAR-managed .clear/.gitignore.
 *
 * Called by initializeProject() during a fresh init, and by the session-start
 * self-heal (init-cli --ensure-gitignore) to backfill consumers initialized before
 * this shipped. Idempotent: when CLEAR_GITIGNORE_ANCHOR is already present the file
 * is left byte-for-byte untouched; otherwise the managed block is appended to any
 * existing .gitignore (preserving user-authored lines) or a new file is created.
 * Writes ONLY inside the consumer's CLEAR-owned .clear/ tree — never the consumer's
 * root .gitignore.
 *
 * @param projectDir - Project (consumer repo) root
 * @returns true if the file was created/updated; false if already present (no-op)
 * @throws if .clear/.gitignore is a symlink (refuses to follow)
 */
export declare function ensureClearGitignore(projectDir: string): boolean;
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
 * Create initial sync state for a freshly-initialized project.
 *
 * Null-meaning contract (consumed by validators in
 * src/infrastructure/sync/context-hub.ts:validate and
 * src/infrastructure/sync/cli/debug-cli.ts:validateSyncState):
 *   - workpackage: null   → "no active WP yet" (fresh init has no WP)
 *   - plan: null          → "no plan created yet"
 *   - lastFullSync: null  → "no full sync ever performed"
 *
 * Validators MUST guard for these null values; accessing
 * `state.workpackage.systemId` directly throws a TypeError on fresh init.
 *
 * Type-system note: Two divergent SyncState interfaces currently exist:
 * (a) src/infrastructure/init/types.ts — declares workpackage/plan as
 *     nullable (`{...} | null`) and matches what this function writes;
 * (b) src/infrastructure/sync/types.ts — declares them non-nullable and
 *     matches the in-memory shape used by SyncStateManager.
 * Consolidating the two definitions is tracked separately.
 *
 * @param sessionId - Session ID
 * @returns Sync state object (conforms to init/types.ts SyncState)
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
 * Update project's CLAUDE.md with CLEAR governance + framework registry block.
 *
 * Two-step injection:
 * 1. Binding contract line: if existing `# Binding Contract` heading (any level,
 *    case-insensitive) is found, insert CLEAR's one-line @-mention under it
 *    (preserving heading level, no duplication if line already present). If no
 *    existing heading, prepend a new `# Binding Contract` H1 with the line.
 * 2. CLEAR Framework section: append the full block (Skill Registry + 3 protocols)
 *    at the end of the file.
 *
 * Idempotency: presence of `# CLEAR Framework` H1 anywhere in the file causes
 * the entire injection to be skipped on re-run.
 *
 * Note: This updates the USER'S project CLAUDE.md, not clear-framework's.
 *
 * @param projectDir - Project directory
 */
export declare function updateProjectClaudeMd(projectDir: string): void;
/**
 * Update project's .claude/rules/rules.md with CLEAR-unique rules section.
 *
 * Append-only contract: existing rules.md content is never modified. Creates the
 * file (and parent .claude/rules/ directory) if absent. Appends `## CLEAR Framework
 * Rules` section if not already present.
 *
 * Idempotency: presence of `## CLEAR Framework Rules` H2 anywhere in the file
 * causes the append to be skipped on re-run.
 *
 * @param projectDir - Project directory
 */
export declare function updateProjectRulesMd(projectDir: string): void;
/**
 * Run post-initialization checks
 *
 * @param projectDir - Project directory
 * @returns Array of check results
 */
export declare function runPostInitChecks(projectDir: string): PostInitCheck[];
/**
 * Counts of user-content artifacts inside .clear/ used by the destruction
 * preview. NOT a full enumeration — only the categories the user-facing
 * preview mentions. Per AC8.
 */
export interface ClearContentsCounts {
    knowledgeEntries: number;
    workpackages: number;
    sessionHandoffs: number;
    auditLogFiles: number;
}
/**
 * Count the user-visible artifacts in .clear/ for the destruction preview.
 *
 * Categories (per AC8):
 *   - knowledge entries: files under .clear/knowledge/entries/ (excludes
 *     index.db, index.json, .schemas/, and .gitkeep — those are framework
 *     infrastructure, not user content)
 *   - workpackages: files under .clear/workpackages/ (excludes .gitkeep)
 *   - session handoffs: files under .clear/sessions/ (excludes .gitkeep)
 *   - audit log files: files under .clear/audit/ (jsonl per session, plus
 *     hook-errors.log + hooks.log; counted as "audit log files" because
 *     line-counting jsonl entries can be expensive on large logs and the
 *     category is sufficient signal for the destruction preview)
 */
export declare function countClearContents(projectDir: string): ClearContentsCounts;
/**
 * Emit the destruction preview to stderr per AC8 format.
 *
 * Always emitted even when --yes (AC9) — preserves audit-trail visibility
 * for the destructive operation regardless of prompt-skip mode.
 */
export declare function emitDestructionPreview(counts: ClearContentsCounts, plannedBackupPath: string): void;
/**
 * Read a single line from stdin via readline. The prompt itself is written
 * to stderr (not stdout) so the CLI's JSON stdout output remains clean.
 *
 * @returns true iff the user responded with exactly 'y' or 'yes' (case-insensitive,
 *          trimmed). Any other input — including 'N', empty string, EOF, or
 *          non-y/yes text — returns false. AC8 default-no posture.
 */
export declare function promptForConfirmation(): Promise<boolean>;
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