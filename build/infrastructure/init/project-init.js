"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectProjectState = detectProjectState;
exports.createDirectoryStructure = createDirectoryStructure;
exports.ensureClearGitignore = ensureClearGitignore;
exports.createSession0State = createSession0State;
exports.createSessionHistory = createSessionHistory;
exports.createSyncState = createSyncState;
exports.createDefaultConfig = createDefaultConfig;
exports.writeStateFiles = writeStateFiles;
exports.updateProjectClaudeMd = updateProjectClaudeMd;
exports.updateProjectRulesMd = updateProjectRulesMd;
exports.runPostInitChecks = runPostInitChecks;
exports.countClearContents = countClearContents;
exports.emitDestructionPreview = emitDestructionPreview;
exports.promptForConfirmation = promptForConfirmation;
exports.initializeProject = initializeProject;
exports.createInitError = createInitError;
exports.formatInitResult = formatInitResult;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const yaml = __importStar(require("yaml"));
const types_1 = require("./types");
const manifest_1 = require("./manifest");
const hooks_config_1 = require("./hooks-config");
// ==============================================================================
// DIRECTORY STRUCTURE
// ==============================================================================
/** Directories to create under .clear/ */
const CLEAR_DIRECTORIES = [
    'config',
    'state',
    'sessions',
    'knowledge',
    'workpackages',
    'plans',
    'audit',
];
/** Files to create with .gitkeep */
const GITKEEP_DIRS = ['sessions', 'knowledge', 'workpackages', 'plans', 'audit'];
// ==============================================================================
// PROJECT DETECTION
// ==============================================================================
/**
 * Detect the current state of a project
 *
 * @param projectDir - Project directory to check
 * @returns Project state with details
 */
function detectProjectState(projectDir) {
    const clearDir = path.join(projectDir, '.clear');
    // Check if .clear/ exists
    if (!fs.existsSync(clearDir)) {
        return { state: 'greenfield' };
    }
    // Check if manifest exists
    if ((0, manifest_1.manifestExists)(projectDir)) {
        const manifest = (0, manifest_1.readManifest)(projectDir);
        if (manifest) {
            return {
                state: 'initialized',
                manifest,
                requiresForce: true,
            };
        }
        // Manifest file exists but couldn't be parsed
        return {
            state: 'unknown',
            error: 'Manifest file exists but could not be parsed',
        };
    }
    // .clear/ exists but no manifest
    return {
        state: 'unknown',
        error: 'Unrecognized .clear/ directory exists (no manifest file)',
    };
}
// ==============================================================================
// DIRECTORY SCAFFOLDING
// ==============================================================================
/**
 * Create the .clear/ directory structure
 *
 * @param projectDir - Project directory
 * @throws Error if creation fails
 */
function createDirectoryStructure(projectDir) {
    const clearDir = path.join(projectDir, '.clear');
    // Create all directories
    for (const dir of CLEAR_DIRECTORIES) {
        const fullPath = path.join(clearDir, dir);
        fs.mkdirSync(fullPath, { recursive: true });
    }
    // Create .gitkeep files
    for (const dir of GITKEEP_DIRS) {
        const gitkeepPath = path.join(clearDir, dir, '.gitkeep');
        fs.writeFileSync(gitkeepPath, '', 'utf-8');
    }
}
// ==============================================================================
// CLEAR-MANAGED .gitignore (WP-CB-D AC2)
// ==============================================================================
/**
 * Anchor line marking the CLEAR-managed block inside .clear/.gitignore. Its exact
 * presence makes ensureClearGitignore() a byte-for-byte no-op (idempotency anchor).
 * ASCII-only so it round-trips cleanly across consumer editors/encodings.
 */
const CLEAR_GITIGNORE_ANCHOR = '# CLEAR Framework managed ignores (do not edit this block)';
/**
 * CLEAR-managed .clear/.gitignore content. Excludes ONLY the knowledge index — a
 * rebuilt cache regenerated from .clear/knowledge/entries/ on session start — and
 * its SQLite journals. Without this, the binary DB + scratch files get swept into a
 * consumer's `git add -A` (polluting commits + causing binary merge conflicts in
 * shared repos, since git cannot merge a binary SQLite file). The knowledge SOURCE
 * (entries/*.md), plans, state, and sessions REMAIN committed — .clear/ is committed
 * by design (see GITKEEP_DIRS scaffolding above). The text fallback export
 * (.clear/knowledge/index.json) is intentionally NOT excluded: it is line-mergeable
 * and serves the SQLite-unavailable degraded-mode load path.
 */
const CLEAR_GITIGNORE_BLOCK = `${CLEAR_GITIGNORE_ANCHOR}
# The knowledge index is a rebuilt cache (regenerated from knowledge/entries/ on
# session start). Excluding the binary database and its SQLite journals keeps them
# out of commits and avoids binary merge conflicts in shared repos. Your knowledge
# SOURCE (knowledge/entries/*.md), plans, and state stay committed.
knowledge/index.db
knowledge/index.db-wal
knowledge/index.db-shm
`;
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
function ensureClearGitignore(projectDir) {
    const gitignorePath = path.join(projectDir, '.clear', '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        // Refuse to follow a symlink (mirrors the CLAUDE.md/rules.md symlink guards —
        // defense against a shared-env symlink redirecting the write outside .clear/).
        const stat = fs.lstatSync(gitignorePath);
        if (stat.isSymbolicLink()) {
            throw new Error(`ensureClearGitignore: .clear/.gitignore is a symlink (refusing to follow): ${gitignorePath}`);
        }
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        if (content.includes(CLEAR_GITIGNORE_ANCHOR)) {
            return false; // idempotent no-op — managed block already present
        }
        // Ensure exactly one blank line separates any pre-existing user content from the
        // managed block: add a trailing newline iff the content lacks one, then the `\n`
        // below contributes the blank line (both branches yield "<content>\n\n<block>").
        const trailingNewline = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
        fs.writeFileSync(gitignorePath, `${content}${trailingNewline}\n${CLEAR_GITIGNORE_BLOCK}`, 'utf-8');
        return true;
    }
    // No existing file — create it. The parent .clear/ is expected to exist (init
    // scaffolds it before this runs; the session-start self-heal runs only for
    // initialized projects). If .clear/ is somehow absent, fs.writeFileSync throws
    // ENOENT, which the non-fatal callers record without aborting init/session start.
    fs.writeFileSync(gitignorePath, CLEAR_GITIGNORE_BLOCK, 'utf-8');
    return true;
}
// ==============================================================================
// SESSION 0 INITIALIZATION
// ==============================================================================
/**
 * Create Session 0 state (initialization session)
 *
 * @param sessionId - Generated init session ID
 * @returns Session state object
 */
function createSession0State(sessionId) {
    const now = new Date().toISOString();
    return {
        sessionId,
        clearSessionNumber: 0,
        startTime: now,
        lastActivity: now,
        status: 'initializing',
        note: 'Session 0: CLEAR initialization session',
        tokenUsage: {
            estimate: 0,
            promptCount: 0,
            method: 'pending',
            consecutiveFailures: 0,
            cacheReadTokens: 0,
            warningShown: false,
            criticalShown: false,
            emergencyShown: false,
        },
        handoff: {
            prepared: false,
            documentPath: null,
        },
        thresholds: {
            warning: 0.60,
            critical: 0.75,
            emergency: 0.85,
        },
        contextWindow: {
            size: 200000,
            source: 'default',
            detectedModel: null,
            lastUpdated: null,
        },
    };
}
/**
 * Create initial session history
 *
 * @param sessionId - Session ID
 * @param startTime - Session start time
 * @returns Session history object
 */
function createSessionHistory(sessionId, startTime) {
    const date = startTime.slice(0, 10).replace(/-/g, '');
    return {
        lastSessionNumber: 0,
        sessions: [
            {
                sessionId,
                clearSessionNumber: 0,
                startTime,
                date,
                status: 'init',
                note: 'CLEAR initialized',
            },
        ],
    };
}
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
function createSyncState(sessionId) {
    const now = new Date().toISOString();
    return {
        version: '1.0',
        lastUpdated: now,
        lastFullSync: null,
        session: {
            id: sessionId,
            number: 0,
            tokensUsed: 0,
            status: 'initializing',
        },
        workpackage: null,
        plan: null,
        knowledge: {
            recentEntries: [],
            totalCount: 0,
        },
    };
}
/**
 * Create default configuration
 *
 * @returns Default configuration object
 */
function createDefaultConfig() {
    return {
        session: {
            token_thresholds: {
                warning: 0.60,
                critical: 0.75,
                emergency: 0.85,
            },
        },
        knowledge: {
            load_level: 'balanced',
        },
        sync: {
            frequency: 'on_change',
        },
    };
}
/**
 * Write all initial state files
 *
 * @param projectDir - Project directory
 * @param sessionId - Generated session ID
 */
function writeStateFiles(projectDir, sessionId) {
    const stateDir = path.join(projectDir, '.clear', 'state');
    const configDir = path.join(projectDir, '.clear', 'config');
    // Create session state
    const sessionState = createSession0State(sessionId);
    fs.writeFileSync(path.join(stateDir, 'session.json'), JSON.stringify(sessionState, null, 2), 'utf-8');
    // Create session history
    const sessionHistory = createSessionHistory(sessionId, sessionState.startTime);
    fs.writeFileSync(path.join(stateDir, 'session-history.json'), JSON.stringify(sessionHistory, null, 2), 'utf-8');
    // Create sync state
    const syncState = createSyncState(sessionId);
    fs.writeFileSync(path.join(stateDir, 'sync-state.json'), JSON.stringify(syncState, null, 2), 'utf-8');
    // Create default config
    const config = createDefaultConfig();
    const configContent = `# CLEAR Configuration
# Edit this file to customize CLEAR behavior

${yaml.stringify(config)}`;
    fs.writeFileSync(path.join(configDir, 'clear-config.yaml'), configContent, 'utf-8');
}
// ==============================================================================
// CLAUDE.MD + RULES.MD UPDATE (WP-DF2 AC1 / OBS-3)
// ==============================================================================
/**
 * One-line binding-contract pointer to rules.md. Inserted under the existing
 * `# Binding Contract` heading at any heading level (#, ##, ###) if found;
 * otherwise prepended with a new H1 heading.
 */
const CLEAR_BINDING_CONTRACT_LINE = 'All work in this project is governed by @.claude/rules/rules.md. Compliance is mandatory and non-negotiable. Failure to follow any rule in rules.md is a contract violation.';
/**
 * CLEAR Framework section appended to CLAUDE.md. Idempotency anchor: presence
 * of `# CLEAR Framework` H1 anywhere in CLAUDE.md causes the entire injection
 * (binding line + this block) to be skipped on re-run.
 */
const CLEAR_FRAMEWORK_SECTION = `# CLEAR Framework

All work in this project (sessions, plans, workpackages, knowledge) is orchestrated using the CLEAR Framework. Use of CLEAR Framework skills and CLIs is mandatory to ensure effective product planning, tracking, and development.

## CLEAR Skill & CLI Registry

CLEAR exposes capability through three layers: **user-invocable command skills** (the entry points), **overarching reference skills** (the domain logic the command skills load), and **CLIs** (the underlying execution layer the reference skills route to).

### Command Skills (user-invocable)

| Skill | Purpose |
|-------|---------|
| \`/cf-init\` | Initialize CLEAR in the project (one-time setup or reinitialize) |
| \`/cf-status\` | Display session status, token usage, and context health |
| \`/cf-workpackage\` | Workpackage lifecycle — view, list, create, start, pause, track progress, validate, complete, delete |
| \`/cf-plan\` | Plan management — status, progress, blockers, phases, next steps |
| \`/cf-knowledge\` | Knowledge base — search, view, capture, index, link, deprecate, supersede entries |
| \`/cf-handoff\` | Generate a session handoff document |
| \`/cf-reload\` | Reload CLEAR context after manual edits or context drift |
| \`/cf-debug\` | Run diagnostics on CLEAR state; optionally repair issues |
| \`/cf-help\` | Reference and guided walkthrough for CLEAR commands |

### Overarching Reference Skills

These are loaded by the command skills above; they encode the domain logic and routing rules for each area. Reference them directly when reasoning about how CLEAR handles a particular domain:

| Skill | Domain |
|-------|--------|
| \`session-management\` | Session lifecycle — token tracking, handoff preparation, early-end protocol |
| \`plan-management\` | Plan lifecycle — creation from briefs, Bulwark plan import, blocker resolution, next-step recommendations |
| \`workpackage-management\` | Workpackage lifecycle — start, pause, complete, defer, reorder, progress, dependency checks |
| \`knowledge-management\` | Knowledge actions — capture, search, link, deprecate, supersede, status |

### CLIs

CLIs live under \`$CLAUDE_PLUGIN_ROOT/build/infrastructure/<domain>/cli/\` across five domains: \`init\`, \`knowledge\`, \`plan\`, \`workpackage\`, \`sync\`. Invoke via \`node $CLAUDE_PLUGIN_ROOT/build/infrastructure/<domain>/cli/<name>-cli.js [args]\`.

**Every CLI supports \`--help\`.** Use it to discover flags, subcommands, and examples for any CLI:

\`\`\`bash
node $CLAUDE_PLUGIN_ROOT/build/infrastructure/knowledge/cli/capture-cli.js --help
\`\`\`

For a full listing of skills and CLIs, run \`/cf-help --full\`. For command-specific reference, run \`/cf-help <command>\` (e.g., \`/cf-help knowledge\`).

## Session Startup / Resume Protocol

When a CLEAR session starts or resumes (indicated by session context in \`additionalContext\`):

1. Read the prior session's handoff (path surfaced in session-start context, typically \`.clear/sessions/\`).
2. Read \`.clear/state/sync-state.json\` for active workpackage, plan state, and session metadata.
3. Greet the user with a brief summary:
   - Session number and project name
   - Active workpackage (if any) with progress
   - Last session's final state (1-2 sentences)
   - Top 2-3 next priorities from the active workpackage and plan
4. Outline the session plan and confirm with the user before beginning implementation.

## In-Session Protocol

- Use \`/cf-*\` skills for CLEAR operations. Reach for direct CLI invocation only when no skill covers the operation.
- Capture decisions, lessons, and patterns at the moment they emerge using \`/cf-knowledge\`. Do not defer capture to session end.
- Update workpackage progress as acceptance criteria complete using \`/cf-workpackage\`.
- Honor the rules.md contract at all times.
- Track token consumption against the checkpoints defined in rules.md (SR2). Run \`/cf-status\` at each checkpoint.

## Session End Protocol

1. Run \`/cf-handoff\` to generate the handoff document for the next session.
2. Update the plan with current status (active workpackage, progress, blockers).
3. Commit all session changes to git. Ask the user before pushing to remote.
4. Communicate next-session priorities to the user.
`;
/**
 * CLEAR-unique rules appended to .claude/rules/rules.md. Idempotency anchor:
 * presence of `## CLEAR Framework Rules` H2 anywhere in rules.md causes the
 * append to be skipped on re-run.
 *
 * Bulwark-covered rules (CS, T, V, ID, TR, OR, SA, SC, CN, WR1-WR2, SR1-SR4)
 * are deliberately omitted. Rule codes use CR- prefix to prevent collision
 * with Bulwark codes when both plugins append to the same file.
 */
const CLEAR_RULES_SECTION = `## CLEAR Framework Rules

The following rules are CLEAR-specific and govern session, plan, workpackage, and knowledge operations in this project. Per CLAUDE.md, compliance is mandatory; violations are contract violations.

### Skill Surface (CR-SS)

#### CR-SS-1: Skills Are the Preferred Surface for CLEAR Operations
Use \`/cf-*\` skills for CLEAR operations. Direct CLI invocation (\`node $CLAUDE_PLUGIN_ROOT/build/...\`) is reserved for operations that no skill covers, or for scripting outside an interactive session. Run any CLI with \`--help\` to discover its flags.

### Plan Rules (CR-PR)

#### CR-PR-1: Plan-Traceable Work
Every task and workpackage must trace to a phase or milestone in the active plan. Free-floating work is not allowed.

#### CR-PR-2: Plan State Reflects Reality
Update plan state (active workpackage, phase progress, blockers) as work progresses. Use \`/cf-plan\` and \`/cf-workpackage\` to keep state current. Do not let plan state drift from actual progress.

### Workpackage Rules (CR-WR)

#### CR-WR-1: Acceptance Criteria Are Verification Contracts
A workpackage is not complete until every acceptance criterion is verified. Mark progress only when AC verification passes.

### Knowledge Rules (CR-KR)

#### CR-KR-1: Capture in the Moment
Capture decisions, lessons, and patterns using \`/cf-knowledge\` at the moment they emerge. Session-end capture loses context and detail.

#### CR-KR-2: Link Knowledge to Artifacts
When capturing knowledge tied to specific files, use \`--add-related-file\` (repeatable) to establish bi-directional links. Use \`--session-id\` for session-scoped auto-linking.

#### CR-KR-3: Deprecate, Don't Delete
When a decision or pattern is superseded, use \`/cf-knowledge\` to deprecate or supersede the prior entry. Do not delete — the history is the audit trail.
`;
/**
 * Regex to detect an existing `# Binding Contract` heading at any level (H1-H3),
 * case-insensitive. Allows CLEAR's binding line to be inserted under a Bulwark-
 * authored or user-authored contract heading without creating a duplicate H1.
 *
 * S165 fix-batch FX-3 + FX-9: use `[ \t]+` / `[ \t]*` (not `\s+` / `\s*`) so the
 * regex cannot match across newlines (e.g., a `# Binding\nContract` typo would
 * have false-matched under the prior `\s+`). Renamed with CLEAR_ prefix to match
 * the project's constant-naming convention.
 */
const CLEAR_BINDING_CONTRACT_HEADING_RE = /^#{1,3}[ \t]+Binding[ \t]+Contract[ \t]*$/im;
/**
 * Idempotency anchor for `updateProjectClaudeMd`. Matches the H1 heading
 * `# CLEAR Framework` at line start only.
 *
 * S166 P0 fix: prior code used `content.includes('# CLEAR Framework')` which
 * was a substring of the legacy H2 `## CLEAR Framework - Session Resume
 * Instructions` (every pre-S165 CLEAR-initialized consumer project carries
 * this) — substring match returned true as a false-positive idempotency hit
 * and silently skipped the new governance block injection on migration.
 *
 * Case-sensitive H1-only: the upstream `CLEAR_FRAMEWORK_SECTION` always emits
 * `# CLEAR Framework` in this exact casing, so the matcher does not need an
 * `i` flag. The intentional asymmetry with `CLEAR_BINDING_CONTRACT_HEADING_RE`
 * (which is H1-H3 + case-insensitive) reflects different anchor uniqueness:
 * the framework H1 is CLEAR-injected only, never user-authored.
 */
const CLEAR_FRAMEWORK_H1_RE = /^# CLEAR Framework$/m;
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
function updateProjectClaudeMd(projectDir) {
    // S165 fix-batch FX-5: actionable fail-fast (CS3) when projectDir doesn't exist,
    // so direct callers (outside initializeProject's controlled flow) get a clear
    // error instead of a downstream ENOENT.
    if (!fs.existsSync(projectDir)) {
        throw new Error(`updateProjectClaudeMd: project directory does not exist: ${projectDir}`);
    }
    const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
    // S165 fix-batch FX-11: refuse symlinked CLAUDE.md. fs.writeFileSync follows
    // symlinks by default; in shared environments a malicious or accidental symlink
    // could write outside projectDir. lstatSync inspects the link itself.
    if (fs.existsSync(claudeMdPath)) {
        const stat = fs.lstatSync(claudeMdPath);
        if (stat.isSymbolicLink()) {
            throw new Error(`updateProjectClaudeMd: CLAUDE.md is a symlink (refusing to follow): ${claudeMdPath}`);
        }
    }
    let content = '';
    if (fs.existsSync(claudeMdPath)) {
        content = fs.readFileSync(claudeMdPath, 'utf-8');
        // Idempotency anchor — see CLEAR_FRAMEWORK_H1_RE docblock for the S166 P0
        // false-positive history that motivates the line-anchored H1 match.
        if (CLEAR_FRAMEWORK_H1_RE.test(content)) {
            return;
        }
    }
    // Step 1: Binding contract line
    // S165 fix-batch CR-4: removed dead `headingMatch.index !== undefined` guard —
    // RegExpExecArray.index is typed `number` and is always present on a successful exec.
    const headingMatch = CLEAR_BINDING_CONTRACT_HEADING_RE.exec(content);
    if (headingMatch) {
        // Existing heading found at any level — check whether our line is already
        // in the section body before inserting (avoid duplication when Bulwark also
        // references the same rules.md).
        const headingEndIdx = headingMatch.index + headingMatch[0].length;
        // Section body extends to the next H1-H3 heading or EOF
        const remainder = content.slice(headingEndIdx);
        const nextHeadingMatch = /^#{1,3}\s+/m.exec(remainder);
        const sectionEndIdx = nextHeadingMatch
            ? headingEndIdx + nextHeadingMatch.index
            : content.length;
        const sectionBody = content.slice(headingEndIdx, sectionEndIdx);
        if (!sectionBody.includes('@.claude/rules/rules.md')) {
            // Insert CLEAR's line directly after the heading. Trim leading newlines
            // from existing body so spacing stays clean.
            const before = content.slice(0, headingEndIdx);
            const after = content.slice(headingEndIdx).replace(/^\n+/, '');
            content = `${before}\n\n${CLEAR_BINDING_CONTRACT_LINE}\n\n${after}`;
        }
    }
    else {
        // No existing heading — prepend a new H1 + line. Preserve any existing
        // content underneath.
        const separator = content.length > 0 && !content.startsWith('\n') ? '\n' : '';
        content = `# Binding Contract\n\n${CLEAR_BINDING_CONTRACT_LINE}\n${separator}\n${content}`;
    }
    // Step 2: Append CLEAR Framework section
    if (content.length > 0 && !content.endsWith('\n')) {
        content += '\n';
    }
    content += `\n${CLEAR_FRAMEWORK_SECTION}`;
    fs.writeFileSync(claudeMdPath, content, 'utf-8');
}
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
function updateProjectRulesMd(projectDir) {
    // S165 fix-batch FX-5: actionable fail-fast (CS3) when projectDir doesn't exist.
    if (!fs.existsSync(projectDir)) {
        throw new Error(`updateProjectRulesMd: project directory does not exist: ${projectDir}`);
    }
    const rulesDir = path.join(projectDir, '.claude', 'rules');
    const rulesMdPath = path.join(rulesDir, 'rules.md');
    // S165 fix-batch FX-11: refuse symlinked rules.md (defense against shared-env
    // misuse). lstatSync inspects the link itself rather than following it.
    if (fs.existsSync(rulesMdPath)) {
        const stat = fs.lstatSync(rulesMdPath);
        if (stat.isSymbolicLink()) {
            throw new Error(`updateProjectRulesMd: rules.md is a symlink (refusing to follow): ${rulesMdPath}`);
        }
    }
    let content = '';
    if (fs.existsSync(rulesMdPath)) {
        content = fs.readFileSync(rulesMdPath, 'utf-8');
        // Idempotency: CLEAR section already present → skip.
        // NOTE: deliberate asymmetry with `updateProjectClaudeMd` (which uses the
        // line-anchored `CLEAR_FRAMEWORK_H1_RE` after the S166 P0 substring-bug
        // fix). `## CLEAR Framework Rules` has no shorter prefix that could appear
        // as a substring in a different heading; the H1 anchor `# CLEAR Framework`
        // does (legacy `## CLEAR Framework - Session Resume Instructions`).
        if (content.includes('## CLEAR Framework Rules')) {
            return;
        }
    }
    else {
        // Ensure parent dir exists before writing
        fs.mkdirSync(rulesDir, { recursive: true });
    }
    if (content.length > 0 && !content.endsWith('\n')) {
        content += '\n';
    }
    content += content.length > 0 ? `\n${CLEAR_RULES_SECTION}` : CLEAR_RULES_SECTION;
    fs.writeFileSync(rulesMdPath, content, 'utf-8');
}
// ==============================================================================
// POST-INIT CHECKS
// ==============================================================================
/**
 * Run post-initialization checks
 *
 * @param projectDir - Project directory
 * @returns Array of check results
 */
function runPostInitChecks(projectDir) {
    const checks = [];
    // Check for plan
    const plansDir = path.join(projectDir, '.clear', 'plans');
    const planFiles = fs.existsSync(plansDir)
        ? fs.readdirSync(plansDir).filter((f) => f !== '.gitkeep')
        : [];
    checks.push({
        name: 'plan_exists',
        passed: planFiles.length > 0,
        message: planFiles.length > 0
            ? `Plan found: ${planFiles[0]}`
            : 'No plan found. Create a plan manually or use /cf-plan create (Phase 2.9)',
    });
    // Check for workpackages
    const wpDir = path.join(projectDir, '.clear', 'workpackages');
    const wpFiles = fs.existsSync(wpDir)
        ? fs.readdirSync(wpDir).filter((f) => f !== '.gitkeep')
        : [];
    checks.push({
        name: 'workpackages_exist',
        passed: wpFiles.length > 0,
        message: wpFiles.length > 0
            ? `${wpFiles.length} workpackage(s) found`
            : 'No workpackages found. Workpackages will be auto-generated when you create a plan',
    });
    // Check for knowledge entries
    const knowledgeDir = path.join(projectDir, '.clear', 'knowledge');
    const knowledgeFiles = fs.existsSync(knowledgeDir)
        ? fs.readdirSync(knowledgeDir).filter((f) => f !== '.gitkeep')
        : [];
    checks.push({
        name: 'knowledge_exists',
        passed: knowledgeFiles.length > 0,
        message: knowledgeFiles.length > 0
            ? `${knowledgeFiles.length} knowledge entry/entries found`
            : 'Knowledge base is empty. Use /cf-knowledge capture to add entries',
    });
    return checks;
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
function countClearContents(projectDir) {
    const countDir = (subpath) => {
        const dir = path.join(projectDir, '.clear', ...subpath);
        if (!fs.existsSync(dir))
            return 0;
        return fs.readdirSync(dir).filter((n) => n !== '.gitkeep').length;
    };
    return {
        knowledgeEntries: countDir(['knowledge', 'entries']),
        workpackages: countDir(['workpackages']),
        sessionHandoffs: countDir(['sessions']),
        auditLogFiles: countDir(['audit']),
    };
}
/**
 * Emit the destruction preview to stderr per AC8 format.
 *
 * Always emitted even when --yes (AC9) — preserves audit-trail visibility
 * for the destructive operation regardless of prompt-skip mode.
 */
function emitDestructionPreview(counts, plannedBackupPath) {
    const lines = [
        '',
        '--reinit-clean will DELETE:',
        `  - ${counts.knowledgeEntries} knowledge entries`,
        `  - ${counts.workpackages} workpackages`,
        `  - ${counts.sessionHandoffs} session handoffs`,
        `  - ${counts.auditLogFiles} audit log files (one per session + hook logs)`,
        `  - Backup will be created at: ${plannedBackupPath}`,
        '  - Restore later with: cf-init --restore-from-backup',
        '',
    ];
    for (const line of lines) {
        process.stderr.write(line + '\n');
    }
}
/**
 * Read a single line from stdin via readline. The prompt itself is written
 * to stderr (not stdout) so the CLI's JSON stdout output remains clean.
 *
 * @returns true iff the user responded with exactly 'y' or 'yes' (case-insensitive,
 *          trimmed). Any other input — including 'N', empty string, EOF, or
 *          non-y/yes text — returns false. AC8 default-no posture.
 */
async function promptForConfirmation() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stderr,
        });
        rl.question('Continue? [y/N]: ', (answer) => {
            rl.close();
            const trimmed = answer.trim().toLowerCase();
            resolve(trimmed === 'y' || trimmed === 'yes');
        });
    });
}
// ==============================================================================
// INIT STEP HELPER
// ==============================================================================
/**
 * Execute a single initialization step with try/catch, step recording, and
 * early-return-on-failure semantics.
 *
 * On success the step is recorded and the function returns `undefined`.
 * On failure the step is recorded and an `InitializationResult` is returned
 * so the caller can propagate it immediately.
 *
 * @param stepName   - Name recorded in the steps array
 * @param action     - The work to perform (may throw)
 * @param errorCode  - InitError code used when the step fails
 * @param steps      - Mutable steps array (appended in-place)
 * @param baseResult - Partial result fields shared across all failure returns
 * @returns `undefined` on success, or an `InitializationResult` on failure
 */
function runInitStep(stepName, action, errorCode, steps, baseResult) {
    try {
        action();
        steps.push({ step: stepName, success: true });
        return undefined;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // Step 5 (configure_hooks) derives the error code from the message
        const resolvedCode = stepName === 'configure_hooks'
            ? (errorMessage.startsWith('SETTINGS_MERGE_FAIL')
                ? 'SETTINGS_MERGE_FAIL'
                : errorCode)
            : errorCode;
        steps.push({ step: stepName, success: false, error: errorMessage });
        return {
            success: false,
            projectName: baseResult.projectName,
            projectPath: baseResult.projectDir,
            projectId: baseResult.projectId,
            sessionId: baseResult.sessionId,
            steps,
            checks: [],
            error: createInitError(resolvedCode, error).message,
        };
    }
}
// ==============================================================================
// MAIN INITIALIZATION FUNCTION
// ==============================================================================
/**
 * Initialize CLEAR in a project
 *
 * @param options - Initialization options
 * @returns Initialization result
 */
async function initializeProject(options) {
    const { projectDir, force = false, clearVersion = manifest_1.CLEAR_VERSION, commandVersion = manifest_1.COMMAND_VERSION, skipPrompt = false, } = options;
    const steps = [];
    const projectName = path.basename(projectDir);
    let projectId = '';
    let sessionId = '';
    let backupPath;
    // Shared base fields for failure results — kept in sync with mutable locals
    const base = () => ({ projectName, projectDir, projectId, sessionId });
    try {
        // Step 1: Detect project state
        const state = detectProjectState(projectDir);
        steps.push({ step: 'detect_state', success: true });
        // Handle state-based logic. Both 'unknown' and 'initialized' represent
        // a pre-existing .clear/ directory that requires force-mode recovery to
        // proceed. The recovery sequence (preview → prompt → backup → remove)
        // is identical between the two; only the non-force error message differs.
        // Merging avoids drift between two near-duplicate recovery paths.
        if (state.state === 'unknown' || state.state === 'initialized') {
            if (!force) {
                if (state.state === 'unknown') {
                    return {
                        success: false,
                        projectName,
                        projectPath: projectDir,
                        projectId: '',
                        sessionId: '',
                        steps,
                        checks: [],
                        error: createInitError('UNKNOWN_CLEAR_STATE', state.error || '').message,
                    };
                }
                return {
                    success: false,
                    projectName,
                    projectPath: projectDir,
                    projectId: state.manifest?.clear.project_id || '',
                    sessionId: '',
                    steps,
                    checks: [],
                    error: createInitError('ALREADY_INITIALIZED', state.manifest).message,
                };
            }
            // Emit the destruction preview to stderr BEFORE any filesystem mutation.
            // Counts come from the current .clear/ via countClearContents. Compute
            // the backup path ONCE here and thread it into createBackup() so the
            // user-visible "Backup will be created at: X" matches the actual created
            // location byte-for-byte.
            const previewCounts = countClearContents(projectDir);
            const previewTs = new Date().toISOString().replace(/[:.]/g, '-');
            const plannedBackupPath = path.join(projectDir, `.clear.backup.${previewTs}`);
            emitDestructionPreview(previewCounts, plannedBackupPath);
            // --yes (skipPrompt=true) bypasses the [y/N] gate but the destruction
            // preview above ALWAYS emits for audit-trail visibility.
            if (!skipPrompt) {
                const confirmed = await promptForConfirmation();
                if (!confirmed) {
                    process.stderr.write('[CLEAR] Reinit cancelled — no changes made.\n');
                    return {
                        success: false,
                        cancelled: true,
                        projectName,
                        projectPath: projectDir,
                        projectId: state.manifest?.clear.project_id || '',
                        sessionId: '',
                        steps,
                        checks: [],
                    };
                }
            }
            // TOCTOU guard: re-detect state immediately before the destructive call.
            // The initial detection happens before the (potentially long) destruction
            // preview + user confirmation prompt. A concurrent CLEAR session could
            // legitimately change the .clear/ state between detection and backup —
            // for example, completing a fresh init on what we classified as 'unknown'.
            // Abort the destruction rather than back up an actively-being-written
            // directory that the user did not preview.
            const stateNow = detectProjectState(projectDir);
            if (stateNow.state !== state.state) {
                return {
                    success: false,
                    projectName,
                    projectPath: projectDir,
                    projectId: stateNow.manifest?.clear.project_id || '',
                    sessionId: '',
                    steps,
                    checks: [],
                    error: `CONCURRENT_STATE_CHANGE: .clear/ state changed from '${state.state}' to '${stateNow.state}' between detection and backup. Aborting to avoid destroying concurrent work. Re-run /cf-init --reinit-clean if the change was intentional.`,
                };
            }
            // Force mode: backup and remove existing
            try {
                backupPath = (0, manifest_1.createBackup)(projectDir, plannedBackupPath);
                steps.push({ step: 'create_backup', success: true });
                (0, manifest_1.removeExistingClear)(projectDir);
                steps.push({ step: 'remove_existing', success: true });
            }
            catch (error) {
                steps.push({
                    step: 'create_backup',
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
                return {
                    success: false,
                    projectName,
                    projectPath: projectDir,
                    projectId: state.manifest?.clear.project_id || '',
                    sessionId: '',
                    steps,
                    checks: [],
                    error: createInitError('BACKUP_FAIL', error).message,
                };
            }
        }
        // Step 2: Create directory structure
        let stepResult = runInitStep('create_directories', () => createDirectoryStructure(projectDir), 'DIRECTORY_CREATE_FAIL', steps, base());
        if (stepResult)
            return stepResult;
        // Step 3: Create and write manifest
        stepResult = runInitStep('create_manifest', () => {
            const manifest = (0, manifest_1.createManifest)({
                projectDir,
                projectName,
                clearVersion,
                commandVersion,
                hooksConfigured: true,
            });
            projectId = manifest.clear.project_id;
            (0, manifest_1.writeManifest)(manifest, projectDir);
        }, 'MANIFEST_WRITE_FAIL', steps, base());
        if (stepResult)
            return stepResult;
        // Step 4: Generate Session 0 ID and write state files
        stepResult = runInitStep('create_session_0', () => {
            sessionId = (0, types_1.generateInitSessionId)();
            writeStateFiles(projectDir, sessionId);
        }, 'STATE_WRITE_FAIL', steps, base());
        if (stepResult)
            return stepResult;
        // Step 5: Configure hooks
        stepResult = runInitStep('configure_hooks', () => (0, hooks_config_1.configureHooks)(projectDir), 'SETTINGS_WRITE_FAIL', steps, base());
        if (stepResult)
            return stepResult;
        // Step 5.5: Author the CLEAR-managed .clear/.gitignore (non-fatal, WP-CB-D AC2).
        // Keeps the rebuilt knowledge index + its SQLite journals out of the consumer's
        // commits; knowledge source / plans / state stay committed.
        try {
            ensureClearGitignore(projectDir);
            steps.push({ step: 'ensure_gitignore', success: true });
        }
        catch (error) {
            steps.push({
                step: 'ensure_gitignore',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
        // Step 6: Update project CLAUDE.md (non-fatal)
        try {
            updateProjectClaudeMd(projectDir);
            steps.push({ step: 'update_claude_md', success: true });
        }
        catch (error) {
            // Non-fatal - log but continue
            steps.push({
                step: 'update_claude_md',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
        // Step 7: Update project .claude/rules/rules.md with CLEAR-unique rules
        // (non-fatal). Bulwark-convention path; append-only co-existence with any
        // existing rules.md content.
        try {
            updateProjectRulesMd(projectDir);
            steps.push({ step: 'update_rules_md', success: true });
        }
        catch (error) {
            steps.push({
                step: 'update_rules_md',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
        // Step 8: Run post-init checks
        const checks = runPostInitChecks(projectDir);
        steps.push({ step: 'post_init_checks', success: true });
        return {
            success: true,
            projectName,
            projectPath: projectDir,
            projectId,
            sessionId,
            steps,
            checks,
            backupPath,
        };
    }
    catch (error) {
        // Unexpected error
        return {
            success: false,
            projectName,
            projectPath: projectDir,
            projectId,
            sessionId,
            steps,
            checks: [],
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
// ==============================================================================
// ERROR HANDLING
// ==============================================================================
/**
 * Create a structured initialization error
 *
 * @param code - Error code
 * @param context - Additional context
 * @returns Structured error object
 */
function createInitError(code, context) {
    const errors = {
        ALREADY_INITIALIZED: {
            message: 'CLEAR is already initialized in this project. Run `/cf-init --reinit-clean` to back it up to .clear.backup.<timestamp>/ and reinitialize.',
            recovery: [
                'To reinitialize, run: /cf-init --reinit-clean',
                'This will back up the existing .clear/ to .clear.backup.<timestamp>/ before reinitializing.',
            ],
        },
        UNKNOWN_CLEAR_STATE: {
            message: 'Unrecognized .clear/ directory found. Run `/cf-init --reinit-clean` to back it up to .clear.backup.<timestamp>/ and reinitialize.',
            recovery: [
                'This .clear/ directory was not created by CLEAR (manifest is missing or unparseable).',
                'To recover, run: /cf-init --reinit-clean',
                'This will back up the existing .clear/ to .clear.backup.<timestamp>/ before reinitializing.',
            ],
        },
        PERMISSION_DENIED: {
            message: 'Permission denied when writing to project directory.',
            recovery: [
                'Check directory permissions',
                'Ensure you have write access to the project directory',
            ],
        },
        SETTINGS_WRITE_FAIL: {
            message: 'Failed to write .claude/settings.json.',
            recovery: ['Check file permissions', 'Ensure .claude/ directory is writable'],
        },
        SETTINGS_MERGE_FAIL: {
            message: 'Failed to parse existing .claude/settings.json.',
            recovery: [
                'The existing settings.json contains invalid JSON',
                'Fix the JSON syntax and try again',
            ],
        },
        MANIFEST_WRITE_FAIL: {
            message: 'Failed to create clear-manifest.yaml.',
            recovery: ['Check disk space', 'Verify write permissions'],
        },
        BACKUP_FAIL: {
            message: 'Failed to create backup of existing .clear/ directory.',
            recovery: [
                'Check disk space',
                'Cannot proceed with --force without successful backup',
            ],
        },
        DIRECTORY_CREATE_FAIL: {
            message: 'Failed to create .clear/ directory structure.',
            recovery: ['Check directory permissions', 'Verify disk space'],
        },
        STATE_WRITE_FAIL: {
            message: 'Failed to write state files.',
            recovery: ['Check disk space', 'Verify write permissions'],
        },
    };
    const errorDef = errors[code];
    return {
        code,
        message: errorDef.message,
        recovery: errorDef.recovery,
        context: typeof context === 'object' && context !== null ? context : { detail: context },
    };
}
/**
 * Format initialization result for display
 *
 * @param result - Initialization result
 * @returns Formatted string for display
 */
function formatInitResult(result) {
    const lines = [];
    if (result.success) {
        lines.push('CLEAR initialized successfully!');
        lines.push('');
        lines.push(`Project: ${result.projectName}`);
        lines.push(`Location: ${result.projectPath}/.clear/`);
        lines.push(`Current: Session 0 (initialization session)`);
        lines.push('');
        lines.push('Status:');
        for (const step of result.steps) {
            const status = step.success ? 'OK' : 'FAIL';
            lines.push(`  [${status}] ${step.step}`);
        }
        lines.push('');
        // Show checks
        for (const check of result.checks) {
            const icon = check.passed ? 'OK' : 'WARN';
            lines.push(`[${icon}] ${check.message}`);
        }
        lines.push('');
        lines.push('Next steps:');
        lines.push('  1. Define your project plan');
        lines.push('  2. Run /cf-status to verify setup');
        lines.push('  3. Continue working - this session is now being tracked!');
        lines.push('');
        lines.push('Session 1 will begin on your next Claude Code startup.');
        if (result.backupPath) {
            lines.push('');
            lines.push(`Backup created at: ${result.backupPath}`);
        }
    }
    else {
        lines.push('CLEAR initialization failed');
        lines.push('');
        if (result.steps.length > 0) {
            lines.push('Completed:');
            for (const step of result.steps.filter((s) => s.success)) {
                lines.push(`  [OK] ${step.step}`);
            }
            lines.push('');
            lines.push('Failed:');
            for (const step of result.steps.filter((s) => !s.success)) {
                lines.push(`  [FAIL] ${step.step}: ${step.error}`);
            }
        }
        if (result.error) {
            lines.push('');
            lines.push(`Error: ${result.error}`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=project-init.js.map