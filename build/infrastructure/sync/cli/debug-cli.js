"use strict";
/**
 * Debug CLI for Cross-Domain Sync (WF-7)
 *
 * Provides validation commands for diagnosing and repairing CLEAR state issues.
 * Implements the /cf-debug slash command functionality.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.9.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugCLI = void 0;
exports.main = main;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const validation_1 = require("../../validation");
const hooks_config_1 = require("../../init/hooks-config");
const types_1 = require("../types");
const context_hub_1 = require("../context-hub");
const parser_1 = require("../../plan/parser");
const writer_1 = require("../../plan/writer");
const registry_1 = require("../../plan/registry");
const phase_id_1 = require("../../plan/phase-id");
const parser_2 = require("../../workpackage/parser");
const registry_2 = require("../../workpackage/registry");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
// ==============================================================================
// CONSTANTS
// ==============================================================================
const CLEAR_DIR = '.clear';
const STATE_DIR = 'state';
const AUDIT_DIR = 'audit';
const WORKPACKAGES_DIR = 'workpackages';
const KNOWLEDGE_DIR = 'knowledge';
// Repair-dispatch coupling guard (clawbox S11 AC6): the stable, data-free leading text of
// the display-id drift messages. The validators build messages with these prefixes and
// repairIssue() routes on them via startsWith(), so both sites MUST reference the same
// constant — a wording change in one place would otherwise silently break repair routing.
const PHASE_REF_FORMAT_MISMATCH_PREFIX = 'Phase reference format mismatch:';
const ACTIVE_PHASE_FORMAT_INCONSISTENT_PREFIX = 'Active phase display id is format-inconsistent';
// Claude Code install-wiring (read by the `install` domain check). settings.json lives
// under the consumer project's .claude/ (sibling of .clear/), written by /cf-init.
const CLAUDE_DIR = '.claude';
const CLAUDE_SETTINGS_FILE = 'settings.json';
// The Claude Code variable Init writes verbatim into statusLine.command; resolved here to
// the project root (this.basePath) before fs checks, since fs cannot stat the literal.
const STATUSLINE_PROJECT_DIR_VAR = '${CLAUDE_PROJECT_DIR}';
// The CLEAR statusline script path SUFFIX, DERIVED from the single source of truth
// (CLEAR_STATUSLINE_COMMAND = `${CLAUDE_PROJECT_DIR}/.clear/statusline.sh` in hooks-config.ts)
// so a path-schema change there cannot silently desync this install check (CS2: No Magic).
// CLEAR_STATUSLINE_COMMAND is `<VAR>/<suffix>`, so the suffix is everything after `<VAR>/`.
const STATUSLINE_SCRIPT_SUFFIX = hooks_config_1.CLEAR_STATUSLINE_COMMAND.slice(STATUSLINE_PROJECT_DIR_VAR.length + 1);
// Env vars /cf-init writes into .claude/settings.json env (the CLEAR_ENV_VARS set in
// hooks-config). CLEAR_PLUGIN_ROOT is deliberately NOT in this set — it is persisted by the
// SessionStart hook on the first session AFTER init (post-restart), not by init. The install
// check therefore treats the two writers separately.
const INIT_ENV_KILL_SWITCHES = [
    'CLEAR_HOOKS_ENABLED',
    'CLEAR_STOP_ENABLED',
    'CLEAR_SESSIONEND_ENABLED',
    'CLEAR_POSTTOOL_ENABLED',
    'CLEAR_PRETOOL_ENABLED',
];
// Domains the debug CLI accepts as an explicit argument. `as const satisfies` makes the compiler
// reject any value here that is not a DebugDomain, keeping the runtime allowlist and the type in
// sync; isDebugDomain then narrows a raw CLI arg without an unchecked cast.
const VALID_DEBUG_DOMAINS = ['session', 'workpackage', 'plan', 'knowledge', 'sync', 'install'];
function isDebugDomain(value) {
    return VALID_DEBUG_DOMAINS.includes(value);
}
// ==============================================================================
// DEBUG CLI CLASS
// ==============================================================================
/**
 * DebugCLI provides validation and repair functionality for CLEAR state.
 */
class DebugCLI {
    constructor(basePath) {
        this.basePath = (0, validation_1.validateBasePath)(basePath);
        this.clearDir = path.join(this.basePath, CLEAR_DIR);
    }
    // ============================================================================
    // MAIN VALIDATION
    // ============================================================================
    /**
     * Run full diagnostic validation
     * @param options - Debug options
     * @returns Debug report with all issues found
     */
    async validate(options = {}) {
        const issues = [];
        const timestamp = new Date().toISOString();
        // Install-wiring domain is independent of .clear/ state — it inspects the Claude Code
        // install (.claude/settings.json statusLine + env vars + the plugin's statusline.sh).
        // When requested explicitly it runs standalone, WITHOUT requiring an initialized .clear/:
        // the install check is itself how a broken/incomplete setup is diagnosed. It is opt-in
        // (not part of the default-all run) so existing `/cf-debug` behavior is unchanged.
        if (options.domain === 'install') {
            issues.push(...this.validateInstallation());
            return this.buildReport(timestamp, issues);
        }
        // Check if CLEAR directory exists
        if (!this.clearDirExists()) {
            issues.push({
                severity: 'error',
                domain: 'sync',
                message: 'CLEAR directory not found. Run /cf-init to initialize.',
                suggestion: 'Initialize CLEAR with /cf-init',
                autoRepairable: false
            });
            return this.buildReport(timestamp, issues);
        }
        // Run validations based on options
        if (!options.domain || options.domain === 'sync') {
            issues.push(...this.validateSyncState());
        }
        if (!options.domain || options.domain === 'workpackage') {
            issues.push(...this.validateWorkpackages());
        }
        if (!options.domain || options.domain === 'plan') {
            issues.push(...this.validatePlan());
        }
        if (!options.domain || options.domain === 'knowledge') {
            issues.push(...this.validateKnowledge());
        }
        // Check dual-IDs if requested
        if (options.checkIds) {
            issues.push(...this.validateDualIds());
            // Display-id referential + drift checks (net-new vs the systemId-level
            // validateDualIds/validateCrossDomainReferences above): every check here
            // operates on display IDs (phase_N / Phase-N), which neither covers.
            issues.push(...this.validatePhaseReferentialIntegrity());
            issues.push(...this.validateRegistryWpStatusDrift());
            issues.push(...this.validatePhaseIdFormatConsistency());
        }
        // Cross-domain reference validation
        issues.push(...this.validateCrossDomainReferences());
        return this.buildReport(timestamp, issues);
    }
    /**
     * Attempt to repair auto-repairable issues
     * @param report - Debug report with issues to repair
     * @returns Repair result
     */
    async repair(report) {
        const repaired = [];
        const failed = [];
        for (const issue of report.issues) {
            if (!issue.autoRepairable) {
                continue;
            }
            try {
                const success = await this.repairIssue(issue);
                if (success) {
                    repaired.push(issue);
                }
                else {
                    failed.push(issue);
                }
            }
            catch {
                failed.push(issue);
            }
        }
        return { repaired, failed };
    }
    // ============================================================================
    // SYNC STATE VALIDATION
    // ============================================================================
    validateSyncState() {
        const issues = [];
        const syncStatePath = path.join(this.clearDir, STATE_DIR, 'sync-state.json');
        // Check if file exists
        if (!fs.existsSync(syncStatePath)) {
            issues.push({
                severity: 'warning',
                domain: 'sync',
                message: 'sync-state.json not found',
                suggestion: 'Run a sync operation to create state file',
                autoRepairable: true
            });
            return issues;
        }
        // Stage 1: Read file
        let content;
        try {
            content = fs.readFileSync(syncStatePath, 'utf-8');
        }
        catch (error) {
            issues.push({
                severity: 'error',
                domain: 'sync',
                message: `Failed to read sync-state.json: ${error}`,
                suggestion: 'Check file permissions or run /cf-debug --repair to regenerate from defaults.',
                autoRepairable: true
            });
            return issues;
        }
        // Stage 2: Parse JSON (distinguish genuine parse failure from structural / invariant failure)
        let parsed;
        try {
            parsed = JSON.parse(content);
        }
        catch (error) {
            issues.push({
                severity: 'error',
                domain: 'sync',
                message: `Failed to parse sync-state.json: ${error}`,
                suggestion: 'File contains invalid JSON. Run /cf-debug --repair to regenerate from defaults.',
                autoRepairable: true
            });
            return issues;
        }
        // Stage 3: Structural validation (isSyncState type guard)
        if (!(0, types_1.isSyncState)(parsed)) {
            issues.push({
                severity: 'error',
                domain: 'sync',
                message: 'sync-state.json has invalid structure',
                suggestion: 'Missing required fields. Run /cf-debug --repair to regenerate from defaults.',
                autoRepairable: true
            });
            return issues;
        }
        const state = parsed;
        // Stage 4: Field-level invariant validation
        // Null-meaning contract (per createSyncState in project-init.ts):
        //   - state.workpackage: null   → "no active WP yet" (fresh-init state)
        //   - state.plan: null          → "no plan created yet"
        //   - state.lastFullSync: null  → "no full sync ever performed"
        // Each access is guarded; null is valid post-init and produces no error.
        try {
            // Check workpackage has systemId (null = no active WP yet, skip validation)
            if (state.workpackage && state.workpackage.systemId && !(0, types_1.isWorkpackageSystemId)(state.workpackage.systemId)) {
                issues.push({
                    severity: 'error',
                    domain: 'sync',
                    message: `Invalid workpackage systemId format: ${state.workpackage.systemId}`,
                    systemId: state.workpackage.systemId,
                    suggestion: 'SystemId should be in format wp-{uuid}',
                    autoRepairable: false
                });
            }
            // Check phase has systemId (null = no plan created yet, skip validation)
            if (state.plan && state.plan.activePhaseSystemId && !(0, types_1.isPhaseSystemId)(state.plan.activePhaseSystemId)) {
                issues.push({
                    severity: 'error',
                    domain: 'sync',
                    message: `Invalid phase systemId format: ${state.plan.activePhaseSystemId}`,
                    systemId: state.plan.activePhaseSystemId,
                    suggestion: 'SystemId should be in format ph-{uuid}',
                    autoRepairable: false
                });
            }
            // Check for stale sync (null = no full sync ever performed, skip staleness check)
            if (state.lastFullSync) {
                const lastSync = new Date(state.lastFullSync);
                const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
                if (hoursSinceSync > 24) {
                    issues.push({
                        severity: 'info',
                        domain: 'sync',
                        message: `Last full sync was ${Math.floor(hoursSinceSync)} hours ago`,
                        suggestion: 'Consider running a full sync',
                        autoRepairable: false
                    });
                }
            }
        }
        catch (error) {
            // Defensive catch-all for any unexpected invariant violation
            issues.push({
                severity: 'error',
                domain: 'sync',
                message: `sync-state invariant violation: ${error}`,
                suggestion: 'Run /cf-debug --repair to reset sync-state.json to defaults.',
                autoRepairable: true
            });
        }
        return issues;
    }
    // ============================================================================
    // WORKPACKAGE VALIDATION
    // ============================================================================
    validateWorkpackages() {
        const issues = [];
        const registryPath = path.join(this.clearDir, WORKPACKAGES_DIR, 'registry.yaml');
        // Check if registry exists
        if (!fs.existsSync(registryPath)) {
            issues.push({
                severity: 'warning',
                domain: 'workpackage',
                message: 'Workpackage registry not found',
                suggestion: 'Create workpackages/registry.yaml',
                autoRepairable: false
            });
            return issues;
        }
        try {
            const content = fs.readFileSync(registryPath, 'utf-8');
            // Check for systemId in entries
            const systemIdRegex = /systemId:\s*["']?(wp-[a-f0-9]+)["']?/gi;
            const matches = content.matchAll(systemIdRegex);
            const systemIds = new Set();
            for (const match of matches) {
                const systemId = match[1];
                if (systemIds.has(systemId)) {
                    issues.push({
                        severity: 'error',
                        domain: 'workpackage',
                        message: `Duplicate systemId found: ${systemId}`,
                        systemId,
                        suggestion: 'Each workpackage must have a unique systemId',
                        autoRepairable: false
                    });
                }
                systemIds.add(systemId);
            }
            // Check for legacy entries without systemId
            const idRegex = /^\s*-?\s*id:\s*["']?([^"'\n]+)["']?/gm;
            const idMatches = content.matchAll(idRegex);
            const displayIds = [];
            for (const match of idMatches) {
                displayIds.push(match[1]);
            }
            // If we have display IDs but no systemIds, warn
            if (displayIds.length > 0 && systemIds.size === 0) {
                issues.push({
                    severity: 'warning',
                    domain: 'workpackage',
                    message: 'Workpackages use legacy display IDs without systemIds',
                    suggestion: 'Run migration to add systemIds to all workpackages',
                    autoRepairable: true
                });
            }
        }
        catch (error) {
            issues.push({
                severity: 'error',
                domain: 'workpackage',
                message: `Failed to read workpackage registry: ${error}`,
                suggestion: 'Check file permissions and YAML syntax',
                autoRepairable: false
            });
        }
        return issues;
    }
    // ============================================================================
    // PLAN VALIDATION
    // ============================================================================
    validatePlan() {
        const issues = [];
        const planDir = path.join(this.clearDir, 'plans');
        // Check for plan directory
        if (!fs.existsSync(planDir)) {
            issues.push({
                severity: 'info',
                domain: 'plan',
                message: 'Plans directory not found',
                suggestion: 'Create .clear/plans/ directory',
                autoRepairable: true
            });
            return issues;
        }
        // Check for master-plan.yaml
        const masterPlanPath = path.join(planDir, 'master-plan.yaml');
        if (!fs.existsSync(masterPlanPath)) {
            issues.push({
                severity: 'warning',
                domain: 'plan',
                message: 'master-plan.yaml not found',
                suggestion: 'Create master-plan.yaml with phases and workpackage references',
                autoRepairable: false
            });
            return issues;
        }
        try {
            const content = fs.readFileSync(masterPlanPath, 'utf-8');
            // Check for phase systemIds
            const phaseSystemIds = new Set();
            const phaseRegex = /systemId:\s*["']?(ph-[a-z0-9]+)["']?/gi;
            for (const match of content.matchAll(phaseRegex)) {
                const systemId = match[1].toLowerCase();
                if (phaseSystemIds.has(systemId)) {
                    issues.push({
                        severity: 'error',
                        domain: 'plan',
                        message: `Duplicate phase systemId: ${systemId}`,
                        systemId,
                        suggestion: 'Each phase must have a unique systemId',
                        autoRepairable: false
                    });
                }
                phaseSystemIds.add(systemId);
            }
            // Check for position gaps
            const positions = [];
            const posRegex = /position:\s*(\d+)/g;
            for (const match of content.matchAll(posRegex)) {
                positions.push(parseInt(match[1], 10));
            }
            if (positions.length > 0) {
                positions.sort((a, b) => a - b);
                for (let i = 1; i < positions.length; i++) {
                    if (positions[i] - positions[i - 1] > 1) {
                        issues.push({
                            severity: 'warning',
                            domain: 'plan',
                            message: `Position gap detected between ${positions[i - 1]} and ${positions[i]}`,
                            suggestion: 'Positions should be sequential without gaps',
                            autoRepairable: true
                        });
                    }
                }
            }
        }
        catch (error) {
            issues.push({
                severity: 'error',
                domain: 'plan',
                message: `Failed to read master-plan.yaml: ${error}`,
                suggestion: 'Check YAML syntax',
                autoRepairable: false
            });
        }
        return issues;
    }
    // ============================================================================
    // KNOWLEDGE VALIDATION
    // ============================================================================
    validateKnowledge() {
        const issues = [];
        const knowledgeDir = path.join(this.clearDir, KNOWLEDGE_DIR);
        // Check for knowledge directory
        if (!fs.existsSync(knowledgeDir)) {
            issues.push({
                severity: 'info',
                domain: 'knowledge',
                message: 'Knowledge directory not found',
                suggestion: 'Create .clear/knowledge/ directory',
                autoRepairable: true
            });
            return issues;
        }
        // Count file-layer entries (entries/*.md) — what capture writes to disk. Used to
        // detect the "entries on disk but search is blind" condition: an unbuilt better-sqlite3
        // native module → DB unreadable → captured entries invisible to search/load.
        const entriesDir = path.join(knowledgeDir, 'entries');
        let fileEntryCount = 0;
        if (fs.existsSync(entriesDir)) {
            try {
                fileEntryCount = fs.readdirSync(entriesDir).filter(f => f.endsWith('.md')).length;
            }
            catch {
                // leave fileEntryCount at 0 on read error
            }
        }
        // Check for index.db
        const dbPath = path.join(knowledgeDir, 'index.db');
        if (!fs.existsSync(dbPath)) {
            issues.push({
                severity: 'warning',
                domain: 'knowledge',
                message: 'Knowledge index database not found',
                suggestion: 'Build the index: index-cli --mode=full --force',
                autoRepairable: false
            });
            if (fileEntryCount > 0) {
                issues.push({
                    severity: 'error',
                    domain: 'knowledge',
                    message: `Found ${fileEntryCount} knowledge ${fileEntryCount === 1 ? 'entry' : 'entries'} on disk, but the search index has not been built — they are not searchable.`,
                    suggestion: 'Build the index: index-cli --mode=full --force',
                    autoRepairable: false
                });
            }
            return issues;
        }
        // DB file exists — open it READ-ONLY to test readability + count. Deliberately NOT via
        // KnowledgeDatabase.initialize(): that path runs schema migrations and enables WAL mode,
        // which a read-only diagnostic must never trigger on a consumer's database. A failure to
        // open while entries exist on disk is the canonical unbuilt-native-module signature
        // (better-sqlite3 cannot load its addon even though the .db file is present).
        // better-sqlite3 opens lazily, so the DB only counts as readable when the COUNT query
        // SUCCEEDS. Construction throwing = native addon could not load (unbuilt module); the
        // query throwing = file opened but is not a valid/complete knowledge index (corrupt or
        // schema-less). Both are "search is blind" conditions.
        let dbReadable = false;
        let dbEntryCount = -1;
        // Count of entries carrying a workpackage association — the disk-truth basis
        // for the links.workpackageKnowledge cache-coherence sub-check below.
        let dbLinkedCount = 0;
        try {
            const db = new better_sqlite3_1.default(dbPath, { readonly: true, fileMustExist: true });
            try {
                const row = db.prepare('SELECT COUNT(*) as count FROM knowledge_entries').get();
                dbEntryCount = row ? row.count : 0;
                const linkedRow = db.prepare("SELECT COUNT(*) as count FROM knowledge_entries WHERE workpackage_id IS NOT NULL AND workpackage_id != ''").get();
                dbLinkedCount = linkedRow ? linkedRow.count : 0;
                dbReadable = true;
            }
            catch {
                dbReadable = false;
            }
            db.close();
        }
        catch {
            dbReadable = false;
        }
        if (!dbReadable) {
            issues.push({
                severity: 'error',
                domain: 'knowledge',
                message: fileEntryCount > 0
                    ? `Knowledge database could not be read; found ${fileEntryCount} ${fileEntryCount === 1 ? 'entry' : 'entries'} on disk that search and load cannot see. The better-sqlite3 native module may be unbuilt, or the index may be corrupt.`
                    : 'Knowledge database could not be read — the better-sqlite3 native module may be unbuilt, or the index may be corrupt.',
                suggestion: 'Restore the native module then reindex: (1) download a prebuilt binary with `npx prebuild-install` in $CLEAR_PLUGIN_ROOT/node_modules/better-sqlite3 (lower-risk, no compiler needed); (2) if that fails, compile it with `npm rebuild better-sqlite3` in the CLEAR plugin directory ($CLEAR_PLUGIN_ROOT); (3) index-cli --mode=full --force',
                autoRepairable: false
            });
            return issues;
        }
        // DB readable — check for a file/DB entry-count mismatch. The most meaningful
        // direction is more files than DB rows (entries captured while the DB was
        // unavailable are on disk but not indexed). Surface as a possible-staleness warning.
        if (dbEntryCount >= 0 && fileEntryCount !== dbEntryCount) {
            issues.push({
                severity: 'warning',
                domain: 'knowledge',
                message: `Knowledge entry-count mismatch: ${fileEntryCount} on disk vs ${dbEntryCount} in the index. The index may be stale (entries captured while the database was unavailable are not indexed).`,
                suggestion: 'Reindex to reconcile: index-cli --mode=full --force',
                autoRepairable: false
            });
        }
        // Sync-state knowledge-cache coherence (closes the empty-cache blind spot). The
        // checks above only compare disk-to-disk (entries/*.md vs index.db); they emit
        // ZERO warnings when those agree, even while the denormalized sync-state cache
        // has gone empty/stale — the exact condition that let an empty "Recent
        // Knowledge" dashboard panel read as "0 warnings / healthy". Compare the
        // sync-state cache against the index (disk truth) and surface the rebuild
        // invocation when it has drifted.
        //
        // Conservative signal by design (the over-trigger is the failure mode for
        // any new check): flag only the unambiguous EMPTY-cache-but-nonempty-DB drift,
        // not partial-count differences. recentEntries is capped and can legitimately
        // lag a large index; an empty cache over a populated index cannot. A genuinely
        // empty knowledge store (dbEntryCount 0) produces no warning.
        if (dbEntryCount > 0) {
            const cacheDrift = this.detectKnowledgeCacheDrift(dbEntryCount, dbLinkedCount);
            if (cacheDrift) {
                issues.push(cacheDrift);
            }
        }
        return issues;
    }
    /**
     * Compare the sync-state knowledge cache against the index (disk truth) and
     * return a drift warning when the cache is EMPTY but the index is not. Returns
     * null when there is no sync-state, when it cannot be read, or when the cache is
     * coherent — so a healthy or fresh project surfaces nothing.
     *
     * Two empty-cache conditions, either of which is real drift:
     *   - recentEntries empty while the index has entries (the dashboard "Recent
     *     Knowledge" panel blanks out).
     *   - links.workpackageKnowledge empty while the index has WP-associated entries
     *     (knowledge-to-workpackage links silently absent).
     *
     * Scope: totalCount is not compared here — it is a deferred field, not a
     * runtime-consumed cache value.
     *
     * @param dbEntryCount - total entries in the index (already known to be > 0)
     * @param dbLinkedCount - index entries carrying a workpackage_id
     */
    detectKnowledgeCacheDrift(dbEntryCount, dbLinkedCount) {
        const syncStatePath = path.join(this.clearDir, STATE_DIR, 'sync-state.json');
        if (!fs.existsSync(syncStatePath)) {
            return null;
        }
        let parsed;
        try {
            parsed = JSON.parse(fs.readFileSync(syncStatePath, 'utf-8'));
        }
        catch {
            // A malformed sync-state is a separate concern (sync validation) — not a
            // knowledge-cache drift signal. Stay silent here rather than mis-attribute.
            return null;
        }
        // Structural guard (same isSyncState used by validateSyncState). A state that
        // is missing the knowledge block entirely is a schema-upgrade case for the next
        // session-start to normalize, not a cache-drift to rebuild — returning null here
        // avoids a false drift warning on a pre-migration state.
        if (!(0, types_1.isSyncState)(parsed)) {
            return null;
        }
        const state = parsed;
        const recentEntries = Array.isArray(state.knowledge.recentEntries) ? state.knowledge.recentEntries : [];
        const workpackageLinks = state.links?.workpackageKnowledge ?? {};
        const recentEmptyButDbHas = recentEntries.length === 0;
        const linksEmptyButDbHas = Object.keys(workpackageLinks).length === 0 && dbLinkedCount > 0;
        if (!recentEmptyButDbHas && !linksEmptyButDbHas) {
            return null;
        }
        const parts = [];
        if (recentEmptyButDbHas) {
            parts.push(`recentEntries is empty while the index holds ${dbEntryCount} ${dbEntryCount === 1 ? 'entry' : 'entries'}`);
        }
        if (linksEmptyButDbHas) {
            parts.push(`workpackageKnowledge links are empty while ${dbLinkedCount} indexed ${dbLinkedCount === 1 ? 'entry is' : 'entries are'} workpackage-associated`);
        }
        return {
            severity: 'warning',
            domain: 'knowledge',
            message: `Knowledge sync-state cache has drifted from the index: ${parts.join('; ')}. Surfaces (e.g. the session-start dashboard) will under-report knowledge despite captured entries.`,
            suggestion: 'Rebuild the cache from the index: sync-bridge-cli --clear-dir=<project root> --op=reconcile-knowledge',
            autoRepairable: false
        };
    }
    // ============================================================================
    // DUAL-ID VALIDATION
    // ============================================================================
    validateDualIds() {
        const issues = [];
        // Read sync state to check references
        const syncStatePath = path.join(this.clearDir, STATE_DIR, 'sync-state.json');
        if (!fs.existsSync(syncStatePath)) {
            return issues;
        }
        try {
            const content = fs.readFileSync(syncStatePath, 'utf-8');
            const state = JSON.parse(content);
            // Check workpackage references in knowledge links
            // (state.links may be undefined on fresh-init sync-state; treat as empty)
            for (const [wpId, links] of Object.entries(state.links?.workpackageKnowledge ?? {})) {
                // Workpackage ID should be a systemId
                if (!(0, types_1.isWorkpackageSystemId)(wpId)) {
                    issues.push({
                        severity: 'error',
                        domain: 'sync',
                        message: `Knowledge links use display ID instead of systemId: ${wpId}`,
                        systemId: wpId,
                        suggestion: 'Update links to use workpackage systemId (wp-{uuid})',
                        autoRepairable: true
                    });
                }
                // Check each link
                for (const link of links) {
                    if (!(0, types_1.isWorkpackageSystemId)(link.workpackageId)) {
                        issues.push({
                            severity: 'error',
                            domain: 'knowledge',
                            message: `Link ${link.id} uses invalid workpackageId: ${link.workpackageId}`,
                            systemId: link.workpackageId,
                            suggestion: 'Update link to use systemId format',
                            autoRepairable: true
                        });
                    }
                    if (!(0, types_1.isPhaseSystemId)(link.phaseId)) {
                        issues.push({
                            severity: 'error',
                            domain: 'knowledge',
                            message: `Link ${link.id} uses invalid phaseId: ${link.phaseId}`,
                            systemId: link.phaseId,
                            suggestion: 'Update link to use systemId format',
                            autoRepairable: true
                        });
                    }
                }
            }
        }
        catch {
            // Parsing error already handled in validateSyncState
        }
        return issues;
    }
    // ============================================================================
    // CROSS-DOMAIN REFERENCE VALIDATION (GAP-08)
    // ============================================================================
    /**
     * Validate cross-domain references - check that referenced entities exist
     * GAP-08: Enhanced to verify entity existence, not just format
     */
    validateCrossDomainReferences() {
        const issues = [];
        const syncStatePath = path.join(this.clearDir, STATE_DIR, 'sync-state.json');
        if (!fs.existsSync(syncStatePath)) {
            return issues;
        }
        // Load registries for existence checking
        const existingWorkpackages = this.loadWorkpackageSystemIds();
        const existingPhases = this.loadPhaseSystemIds();
        try {
            const content = fs.readFileSync(syncStatePath, 'utf-8');
            const state = JSON.parse(content);
            // Check if active workpackage systemId matches displayId format
            // (state.workpackage may be null = no active WP yet, skip cross-domain checks)
            if (state.workpackage && state.workpackage.systemId && state.workpackage.displayId) {
                const wpSystemId = state.workpackage.systemId;
                const wpDisplayId = state.workpackage.displayId;
                // DisplayId should look like P1.4, P2.1, etc.
                if (!wpDisplayId.match(/^P\d+\.\d+$/)) {
                    issues.push({
                        severity: 'warning',
                        domain: 'workpackage',
                        message: `DisplayId format unexpected: ${wpDisplayId}`,
                        systemId: wpSystemId,
                        suggestion: 'DisplayId should be in format P{phase}.{position}',
                        autoRepairable: false
                    });
                }
                // GAP-08: Verify active workpackage exists in registry
                if (wpSystemId && existingWorkpackages.size > 0 && !existingWorkpackages.has(wpSystemId)) {
                    // Diagnostic surface: show display ID first per AC22, with system ID in
                    // parens so an operator repairing sync state has both forms available.
                    issues.push({
                        severity: 'error',
                        domain: 'sync',
                        message: `Active workpackage references non-existent systemId: ${wpDisplayId} (${wpSystemId})`,
                        systemId: wpSystemId,
                        suggestion: 'Update sync state to reference an existing workpackage or recreate the workpackage',
                        autoRepairable: false
                    });
                }
            }
            // GAP-08: Verify active phase exists in plan
            // (state.plan may be null = no plan created yet, skip cross-domain checks)
            if (state.plan && state.plan.activePhaseSystemId && existingPhases.size > 0) {
                if (!existingPhases.has(state.plan.activePhaseSystemId)) {
                    issues.push({
                        severity: 'error',
                        domain: 'sync',
                        message: `Active phase references non-existent systemId: ${state.plan.activePhaseDisplayId} (${state.plan.activePhaseSystemId})`,
                        systemId: state.plan.activePhaseSystemId,
                        suggestion: 'Update sync state to reference an existing phase',
                        autoRepairable: false
                    });
                }
            }
            // GAP-08: Validate all knowledge link references
            // (state.links may be undefined on fresh-init sync-state; treat as empty)
            for (const [wpId, links] of Object.entries(state.links?.workpackageKnowledge ?? {})) {
                // Check that the workpackage key exists
                if (existingWorkpackages.size > 0 && !existingWorkpackages.has(wpId)) {
                    issues.push({
                        severity: 'error',
                        domain: 'knowledge',
                        message: `Knowledge links reference non-existent workpackage: ${wpId}`,
                        systemId: wpId,
                        suggestion: 'Remove orphaned links or recreate the workpackage',
                        autoRepairable: true
                    });
                }
                // Check each link's references
                for (const link of links) {
                    // Check workpackageId reference
                    if (existingWorkpackages.size > 0 && !existingWorkpackages.has(link.workpackageId)) {
                        issues.push({
                            severity: 'error',
                            domain: 'knowledge',
                            message: `Link ${link.id} references non-existent workpackage: ${link.workpackageId}`,
                            systemId: link.workpackageId,
                            suggestion: 'Update link to reference an existing workpackage or remove orphaned link',
                            autoRepairable: true
                        });
                    }
                    // Check phaseId reference
                    if (existingPhases.size > 0 && !existingPhases.has(link.phaseId)) {
                        issues.push({
                            severity: 'error',
                            domain: 'knowledge',
                            message: `Link ${link.id} references non-existent phase: ${link.phaseId}`,
                            systemId: link.phaseId,
                            suggestion: 'Update link to reference an existing phase or remove orphaned link',
                            autoRepairable: true
                        });
                    }
                }
            }
        }
        catch {
            // Parsing error already handled elsewhere
        }
        return issues;
    }
    /**
     * Load all existing workpackage systemIds from registry
     */
    loadWorkpackageSystemIds() {
        const systemIds = new Set();
        const registryPath = path.join(this.clearDir, WORKPACKAGES_DIR, 'registry.yaml');
        if (!fs.existsSync(registryPath)) {
            return systemIds;
        }
        try {
            const content = fs.readFileSync(registryPath, 'utf-8');
            const systemIdRegex = /systemId:\s*["']?(wp-[a-f0-9-]+)["']?/gi;
            for (const match of content.matchAll(systemIdRegex)) {
                systemIds.add(match[1].toLowerCase());
            }
        }
        catch {
            // Ignore read errors
        }
        return systemIds;
    }
    /**
     * Load all existing phase systemIds from master-plan.yaml
     */
    loadPhaseSystemIds() {
        const systemIds = new Set();
        const planPath = path.join(this.clearDir, 'plans', 'master-plan.yaml');
        if (!fs.existsSync(planPath)) {
            return systemIds;
        }
        try {
            const content = fs.readFileSync(planPath, 'utf-8');
            const systemIdRegex = /systemId:\s*["']?(ph-[a-z0-9-]+)["']?/gi;
            for (const match of content.matchAll(systemIdRegex)) {
                systemIds.add(match[1].toLowerCase());
            }
        }
        catch {
            // Ignore read errors
        }
        return systemIds;
    }
    // ============================================================================
    // DISPLAY-ID REFERENTIAL + DRIFT CHECKS (clawbox S11 CB-A AC6)
    // ============================================================================
    // These operate on DISPLAY IDs (phase_N / Phase-N) and registry-vs-YAML status,
    // which the systemId-level validateDualIds()/validateCrossDomainReferences() above
    // do not cover. They run only under --check-ids.
    /**
     * Read plan.json's activePhaseId, or null if absent/unparseable. The cast is narrowed to
     * the only field these checks read: on-disk plan.json written by an older plugin version
     * may omit activePhaseId, so it is modeled optional rather than asserted via `as PlanState`
     * (which types it required and would mask the runtime gap).
     */
    readPlanState() {
        const planStatePath = path.join(this.clearDir, STATE_DIR, 'plan.json');
        if (!fs.existsSync(planStatePath)) {
            return null;
        }
        try {
            return JSON.parse(fs.readFileSync(planStatePath, 'utf-8'));
        }
        catch {
            return null;
        }
    }
    /** Read sync-state.json plan.activePhaseDisplayId, or undefined if absent/unparseable. */
    readSyncActivePhaseDisplayId() {
        const syncStatePath = path.join(this.clearDir, STATE_DIR, 'sync-state.json');
        if (!fs.existsSync(syncStatePath)) {
            return undefined;
        }
        try {
            // Narrowed to the single field read here: an older/partial sync-state.json may omit
            // plan, so it is modeled optional rather than asserted via `as SyncState` (which types
            // plan required and contradicts the defensive optional-chain below).
            const state = JSON.parse(fs.readFileSync(syncStatePath, 'utf-8'));
            return state.plan?.activePhaseDisplayId;
        }
        catch {
            return undefined;
        }
    }
    /** Parse master-plan.yaml, or null if absent/unparseable (malformed is reported by validatePlan). */
    readMasterPlan() {
        const masterPlanPath = path.join(this.clearDir, 'plans', 'master-plan.yaml');
        if (!fs.existsSync(masterPlanPath)) {
            return null;
        }
        try {
            return (0, parser_1.parseMasterPlanYaml)(masterPlanPath);
        }
        catch {
            return null;
        }
    }
    /**
     * AC6-a: display-id referential integrity. Every phase REFERENCE — milestones[].phase,
     * master-plan activePhase, plan.json activePhaseId, sync-state activePhaseDisplayId —
     * must resolve to an existing phases[].id by exact match (every runtime consumer
     * compares by exact equality). A format variant ("phase_1" vs "Phase-1") is reported as
     * auto-repairable; a true orphan as a non-repairable error. Net-new vs
     * validateCrossDomainReferences() (which validates systemId existence, not display IDs).
     */
    validatePhaseReferentialIntegrity() {
        const issues = [];
        const plan = this.readMasterPlan();
        if (!plan) {
            return issues;
        }
        const phaseIds = plan.phases.map(p => p.id);
        if (phaseIds.length === 0) {
            return issues;
        }
        for (const m of plan.milestones) {
            this.checkPhaseRef(m.phase, `milestones[${m.id}].phase`, 'plan', phaseIds, issues);
        }
        this.checkPhaseRef(plan.activePhase, 'master-plan activePhase', 'plan', phaseIds, issues);
        const planState = this.readPlanState();
        if (planState) {
            this.checkPhaseRef(planState.activePhaseId, 'plan.json activePhaseId', 'plan', phaseIds, issues);
        }
        this.checkPhaseRef(this.readSyncActivePhaseDisplayId(), 'sync-state activePhaseDisplayId', 'sync', phaseIds, issues);
        return issues;
    }
    /**
     * Resolve a single phase REFERENCE against the plan's phases[].id set and push an issue for
     * a format-variant (auto-repairable) or a true orphan (non-repairable). Extracted from
     * validatePhaseReferentialIntegrity() so the dependencies (phaseIds, issues) are explicit
     * rather than captured by a nested closure.
     */
    checkPhaseRef(ref, surface, domain, phaseIds, issues) {
        if (!ref) {
            return; // unset/empty reference is not an orphan (e.g. a fresh, unstarted plan)
        }
        if ((0, types_1.isPhaseSystemId)(ref)) {
            return; // systemId references are validateCrossDomainReferences()'s responsibility
        }
        const res = (0, phase_id_1.resolvePhaseRef)(ref, phaseIds);
        if (res.status === 'ok') {
            return;
        }
        if (res.status === 'format-variant') {
            issues.push({
                severity: 'warning',
                domain,
                message: `${PHASE_REF_FORMAT_MISMATCH_PREFIX} ${surface} "${ref}" should be "${res.canonical}"`,
                suggestion: 'Run reconcile-plan (or /cf-debug --repair) to normalize the phase reference',
                autoRepairable: true
            });
        }
        else {
            issues.push({
                severity: 'error',
                domain,
                message: `Phase reference does not resolve to a phase: ${surface} "${ref}"`,
                suggestion: 'Point the reference at an existing phases[].id, or add the missing phase',
                autoRepairable: false
            });
        }
    }
    /**
     * AC6-b: registry-vs-WP status + progress drift. READ-ONLY — reports only, never
     * mutates the registry (the registry-vs-WP status CORRECTION lives in reconcile-plan's
     * reconcileCheck1). The WP YAML is the source of truth for status; computed progress is
     * WorkpackageRegistryManager.calculateProgress(id).
     */
    validateRegistryWpStatusDrift() {
        const issues = [];
        const registryPath = path.join(this.clearDir, WORKPACKAGES_DIR, 'registry.yaml');
        if (!fs.existsSync(registryPath)) {
            return issues;
        }
        let registry;
        try {
            registry = (0, parser_2.parseRegistryFile)(registryPath);
        }
        catch {
            return issues; // malformed registry is reported by validateWorkpackages()
        }
        const manager = new registry_2.WorkpackageRegistryManager(this.clearDir);
        const wpBaseDir = path.resolve(path.join(this.clearDir, WORKPACKAGES_DIR));
        for (const regEntry of registry.workpackages) {
            const wpFilename = regEntry.file || `${regEntry.id}.yaml`;
            const wpPath = path.join(this.clearDir, WORKPACKAGES_DIR, wpFilename);
            // Path-traversal guard: regEntry.file comes verbatim from registry.yaml (untrusted —
            // hand-edited/crafted). path.join normalizes but does not block "../" escapes, so skip
            // any entry whose resolved path leaves the workpackages dir (mirrors reconcileCheck1).
            if (!path.resolve(wpPath).startsWith(wpBaseDir + path.sep)) {
                continue;
            }
            if (!fs.existsSync(wpPath)) {
                continue; // a missing WP file is a different concern (covered elsewhere)
            }
            try {
                const wpEntry = (0, parser_2.parseWorkpackageFile)(wpPath);
                if (wpEntry.status !== regEntry.status) {
                    issues.push({
                        severity: 'error',
                        domain: 'workpackage',
                        message: `Registry status drift: ${regEntry.id} registry="${regEntry.status}" but workpackage YAML="${wpEntry.status}"`,
                        systemId: regEntry.systemId,
                        suggestion: 'Run reconcile-plan to align the registry with the workpackage YAML (source of truth)',
                        autoRepairable: false
                    });
                }
            }
            catch {
                continue; // unparseable WP file — skip this entry, do not block others
            }
            // Progress comparison is scoped to in_progress WPs only. calculateProgress() is
            // status-blind (it sums deliverable weights and ignores WP status), so a terminal
            // WP — complete (status-implied 100) or not_started (0) — whose deliverables were
            // never individually tracked computes to 0 and would over-trigger on every such WP.
            // For in_progress WPs the deliverable-weighted progress IS the authoritative value
            // (kept in lockstep by the progress writers), so a mismatch there is real drift.
            if (regEntry.status === 'in_progress' && typeof regEntry.progress === 'number') {
                const computed = manager.calculateProgress(regEntry.id).progress;
                if (regEntry.progress !== computed) {
                    issues.push({
                        severity: 'warning',
                        domain: 'workpackage',
                        message: `Registry progress drift: ${regEntry.id} registry=${regEntry.progress}% but computed=${computed}%`,
                        systemId: regEntry.systemId,
                        suggestion: 'Run the progress rollup to refresh the stored progress scalar',
                        autoRepairable: false
                    });
                }
            }
        }
        return issues;
    }
    /**
     * AC6-c: active-phase display-id format consistency across master-plan.yaml, plan.json,
     * and sync-state.json. Reports when the surfaces name the SAME logical phase (same
     * normalized key) in inconsistent literal formats. Surfaces naming genuinely DIFFERENT
     * phases are value divergence (reconcile-plan's reconcileCheck3 territory), not a format
     * issue, and are deliberately not reported here (avoids over-trigger / double-report).
     */
    validatePhaseIdFormatConsistency() {
        const issues = [];
        const plan = this.readMasterPlan();
        const planState = this.readPlanState();
        const syncDisplayId = this.readSyncActivePhaseDisplayId();
        const present = [
            { surface: 'master-plan activePhase', value: plan?.activePhase },
            { surface: 'plan.json activePhaseId', value: planState?.activePhaseId },
            { surface: 'sync-state activePhaseDisplayId', value: syncDisplayId }
        ].filter((s) => !!s.value);
        if (present.length < 2) {
            return issues; // need at least two present surfaces to compare
        }
        const keys = new Set(present.map(s => (0, phase_id_1.normalizePhaseIdKey)(s.value)));
        if (keys.size !== 1) {
            return issues; // different logical phases across surfaces: not a format issue
        }
        const literals = new Set(present.map(s => s.value));
        if (literals.size > 1) {
            issues.push({
                severity: 'warning',
                domain: 'plan',
                message: `${ACTIVE_PHASE_FORMAT_INCONSISTENT_PREFIX} across surfaces: ${present.map(s => `${s.surface}="${s.value}"`).join(', ')}`,
                suggestion: 'Run reconcile-plan (or /cf-debug --repair) to normalize the active phase display id across all surfaces',
                autoRepairable: true
            });
        }
        return issues;
    }
    // ============================================================================
    // REPAIR OPERATIONS
    // ============================================================================
    async repairIssue(issue) {
        switch (issue.message) {
            case 'sync-state.json not found':
            case 'sync-state.json has invalid structure':
                return this.repairSyncState();
            case 'Plans directory not found':
                return this.createDirectory(path.join(this.clearDir, 'plans'));
            case 'Knowledge directory not found':
                return this.createDirectory(path.join(this.clearDir, KNOWLEDGE_DIR));
            case 'Workpackages use legacy display IDs without systemIds':
                // This would require the workpackage registry manager
                // For now, return false - manual migration needed
                return false;
            default:
                // Check for position gap repair
                if (issue.message.includes('Position gap detected')) {
                    return this.repairPositionGaps();
                }
                // Display-id referential/format repair (clawbox S11 AC6): both the per-reference
                // format mismatch and the cross-surface format inconsistency are fixed by
                // normalizing master-plan phase references to the canonical phases[].id.
                if (issue.message.startsWith(PHASE_REF_FORMAT_MISMATCH_PREFIX) ||
                    issue.message.startsWith(ACTIVE_PHASE_FORMAT_INCONSISTENT_PREFIX)) {
                    return this.repairPhaseReferentialIntegrity();
                }
                // Sync-state recovery for dynamic error messages from validateSyncState
                // (parse/read failures + invariant violations carry the underlying error
                //  text, so the switch above cannot match them exactly)
                if (issue.domain === 'sync' && (issue.message.startsWith('Failed to read sync-state.json') ||
                    issue.message.startsWith('Failed to parse sync-state.json') ||
                    issue.message.startsWith('sync-state invariant violation'))) {
                    return this.repairSyncState();
                }
                return false;
        }
    }
    /**
     * Repair position gaps in master-plan.yaml by renumbering sequentially
     * Preserves systemIds - only position values change
     */
    repairPositionGaps() {
        try {
            const planDir = path.join(this.clearDir, 'plans');
            const masterPlanPath = path.join(planDir, 'master-plan.yaml');
            if (!fs.existsSync(masterPlanPath)) {
                return false;
            }
            const content = fs.readFileSync(masterPlanPath, 'utf-8');
            const lines = content.split('\n');
            const positionEntries = [];
            const positionRegex = /^(\s*)position:\s*(\d+)/;
            // First pass: collect all position entries
            for (let i = 0; i < lines.length; i++) {
                const match = lines[i].match(positionRegex);
                if (match) {
                    positionEntries.push({
                        lineIndex: i,
                        currentPosition: parseInt(match[2], 10),
                        indentLevel: match[1].length
                    });
                }
            }
            if (positionEntries.length === 0) {
                return true; // No positions to repair
            }
            // Group by indent level (same indent = same scope)
            const byIndent = new Map();
            for (const entry of positionEntries) {
                if (!byIndent.has(entry.indentLevel)) {
                    byIndent.set(entry.indentLevel, []);
                }
                byIndent.get(entry.indentLevel).push(entry);
            }
            // For each indent level, sort by current position and renumber sequentially
            for (const [indent, entries] of byIndent) {
                entries.sort((a, b) => a.currentPosition - b.currentPosition);
                let newPosition = 1;
                for (const entry of entries) {
                    const indentStr = ' '.repeat(indent);
                    lines[entry.lineIndex] = `${indentStr}position: ${newPosition}`;
                    newPosition++;
                }
            }
            // Write back
            fs.writeFileSync(masterPlanPath, lines.join('\n'), 'utf-8');
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Repair display-id referential/format drift (clawbox S11 AC6): normalize every
     * format-variant phase reference in master-plan.yaml to its canonical phases[].id (the
     * source of truth), then re-derive plan.json from the corrected master-plan. The shared
     * reconcileMasterPlanPhaseRefs() is the SAME normalization the read-only detector uses,
     * so detection and repair never disagree. sync-state.activePhaseDisplayId is a projection
     * re-derived from plan.json at the next reconcile-plan / session-start; debug --repair
     * fixes the master-plan SOT + plan.json, and reconcile-plan completes the cascade.
     */
    repairPhaseReferentialIntegrity() {
        try {
            const masterPlanPath = path.join(this.clearDir, 'plans', 'master-plan.yaml');
            if (!fs.existsSync(masterPlanPath)) {
                return false;
            }
            const plan = (0, parser_1.parseMasterPlanYaml)(masterPlanPath);
            if (!plan) {
                return false;
            }
            const corrections = (0, phase_id_1.reconcileMasterPlanPhaseRefs)(plan);
            if (corrections.length === 0) {
                return true; // nothing format-repairable (e.g. a true orphan) — no-op success
            }
            // backup:true writes a .bak sibling before overwriting; this repair mutates the
            // consumer's primary master-plan.yaml, so a recovery point guards against a mid-write
            // interruption corrupting it irreversibly.
            const writeResult = (0, writer_1.writeMasterPlan)(this.basePath, plan, { backup: true });
            if (writeResult.status === 'error') {
                return false;
            }
            // Re-derive plan.json so its activePhaseId follows the corrected master-plan SOT.
            new registry_1.PlanRegistryManager(this.clearDir).initializeState('repair-phase-refs');
            return true;
        }
        catch {
            return false;
        }
    }
    repairSyncState() {
        try {
            const stateDir = path.join(this.clearDir, STATE_DIR);
            if (!fs.existsSync(stateDir)) {
                fs.mkdirSync(stateDir, { recursive: true });
            }
            // Regenerate from canonical defaults (createDefaultSyncState via reset()).
            // reset() is explicit so the intent — "discard any existing broken state
            // and write a fresh fully-shaped default" — is clear at the call site.
            // Using createDefaultSyncState (NOT createSyncState) avoids re-introducing
            // the workpackage:null / plan:null pattern that produced the null-deref
            // bug class in the first place.
            const manager = new context_hub_1.SyncStateManager(this.basePath);
            manager.reset();
            // Derive sessionId + sessionNumber from session.json + session-history.json
            // if available. Avoids the "Session: 0 (unknown)" post-repair divergence
            // vs session-init.sh's banner — repair carries forward whatever session
            // context was already on disk rather than producing an empty placeholder.
            const sessionStatePath = path.join(stateDir, 'session.json');
            const sessionHistoryPath = path.join(stateDir, 'session-history.json');
            if (fs.existsSync(sessionStatePath)) {
                try {
                    const sessionData = JSON.parse(fs.readFileSync(sessionStatePath, 'utf-8'));
                    const sessionId = typeof sessionData.sessionId === 'string' ? sessionData.sessionId : '';
                    let sessionNumber = typeof sessionData.clearSessionNumber === 'number' ? sessionData.clearSessionNumber : 0;
                    // session-history.json's lastSessionNumber is authoritative when present
                    if (fs.existsSync(sessionHistoryPath)) {
                        try {
                            const historyData = JSON.parse(fs.readFileSync(sessionHistoryPath, 'utf-8'));
                            if (typeof historyData.lastSessionNumber === 'number') {
                                sessionNumber = historyData.lastSessionNumber;
                            }
                        }
                        catch {
                            // history parse failure is non-fatal; keep session.json's number
                        }
                    }
                    manager.updateSessionSummary({
                        id: sessionId,
                        number: sessionNumber,
                    });
                }
                catch {
                    // session.json parse failure is non-fatal; keep default empty session
                }
            }
            manager.save();
            return true;
        }
        catch {
            return false;
        }
    }
    createDirectory(dirPath) {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            return true;
        }
        catch {
            return false;
        }
    }
    // ============================================================================
    // INSTALLATION VALIDATION (/cf-debug install)
    // ============================================================================
    /**
     * Validate the Claude Code install wiring for CLEAR in this consumer project.
     *
     * Unlike the .clear/-state domains, this inspects the Claude Code install surface:
     *   (a) .claude/settings.json exists + is valid JSON
     *   (b) settings.json statusLine is a type:"command" entry pointing at the CLEAR
     *       statusline script, and that script exists + is executable
     *   (c) the CLEAR env vars are present — distinguished by WRITER:
     *         - the 5 hook kill-switches are written by /cf-init → missing is an ERROR,
     *           remediated by re-running /cf-init;
     *         - CLEAR_PLUGIN_ROOT is written by the SessionStart hook on the first session
     *           after init (post-restart), NOT by init → its absence is a WARNING (expected
     *           until restart), remediated by restarting Claude Code, NOT by re-running init.
     *
     * The two-writer distinction is deliberate: it prevents the install check from
     * false-flagging a freshly-initialized-but-not-yet-restarted project as broken.
     */
    validateInstallation() {
        const issues = [];
        // (a) settings.json must exist + parse to an object. Returns null (after pushing an
        // error) when it is missing or unreadable, short-circuiting the wiring/env checks.
        const settings = this.readInstallSettings(issues);
        if (settings === null) {
            return issues;
        }
        // (b) statusLine wiring + script presence/executability
        this.checkStatuslineWiring(settings, issues);
        // (c) CLEAR env vars — two distinct writers (see helper)
        this.checkClearEnvVars(settings, issues);
        return issues;
    }
    /**
     * Read + validate .claude/settings.json to the InstallSettings shape. Pushes an error and
     * returns null if the file is missing, unreadable, or not a JSON object. JSON.parse output
     * is typed `unknown` and narrowed, never trusted directly (settings.json is user-editable).
     */
    readInstallSettings(issues) {
        const settingsPath = path.join(this.basePath, CLAUDE_DIR, CLAUDE_SETTINGS_FILE);
        if (!fs.existsSync(settingsPath)) {
            issues.push({
                severity: 'error',
                domain: 'install',
                message: 'Claude Code settings file (.claude/settings.json) not found — CLEAR is not wired into this project.',
                suggestion: 'Run /cf-init to initialize CLEAR and write .claude/settings.json.',
                autoRepairable: false
            });
            return null;
        }
        let parsed;
        try {
            parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            issues.push({
                severity: 'error',
                domain: 'install',
                message: `Claude Code settings file (.claude/settings.json) is not valid JSON: ${detail}`,
                suggestion: 'Fix the JSON syntax, or re-run /cf-init to rewrite settings.',
                autoRepairable: false
            });
            return null;
        }
        if (typeof parsed !== 'object' || parsed === null) {
            issues.push({
                severity: 'error',
                domain: 'install',
                message: 'Claude Code settings file (.claude/settings.json) is not a JSON object.',
                suggestion: 'Re-run /cf-init to rewrite settings.',
                autoRepairable: false
            });
            return null;
        }
        return parsed;
    }
    /**
     * Check the settings.json statusLine wiring: a type:"command" entry whose command targets
     * the CLEAR statusline script, and that the script exists + is executable. The endsWith
     * suffix guard is also the confinement check — fs.existsSync/statSync only run on a command
     * that has already been confirmed to be a string ending in the CLEAR script suffix.
     */
    checkStatuslineWiring(settings, issues) {
        const statusLine = settings.statusLine;
        const command = statusLine?.command;
        // Missing statusLine, wrong type, or a non-string/empty command → not configured.
        if (!statusLine || statusLine.type !== 'command' || typeof command !== 'string' || command.length === 0) {
            issues.push({
                severity: 'error',
                domain: 'install',
                message: 'CLEAR statusline is not configured in .claude/settings.json (expected a statusLine of type "command").',
                suggestion: 'Re-run /cf-init to configure the statusline, or /cf-init --skip-statusline if you intentionally disabled it.',
                autoRepairable: false
            });
            return;
        }
        if (!command.endsWith(STATUSLINE_SCRIPT_SUFFIX)) {
            issues.push({
                severity: 'warning',
                domain: 'install',
                message: `statusLine.command does not point at CLEAR's statusline script (expected a path ending in ${STATUSLINE_SCRIPT_SUFFIX}; found: ${command}).`,
                suggestion: 'Re-run /cf-init to set the CLEAR statusline. If you intentionally use a custom statusline, this can be ignored.',
                autoRepairable: false
            });
            return;
        }
        // WP-P8.1: the configured command is the version-agnostic placeholder
        // `${CLAUDE_PROJECT_DIR}/.clear/statusline.sh`. fs cannot stat the literal variable —
        // resolve it to the project root (this.basePath, which the validator already knows)
        // before the existence/executable checks, so a correct placeholder install does NOT
        // false-flag as "missing on disk". Older absolute-path commands have no variable to
        // substitute, so the resolved value == command for them (unchanged behaviour).
        const resolvedScript = path.resolve(command.replace(STATUSLINE_PROJECT_DIR_VAR, this.basePath));
        // CR SEC-001 confinement: the endsWith() suffix guard above runs on the UNRESOLVED
        // command, so a crafted command like `${CLAUDE_PROJECT_DIR}/../../etc/.clear/statusline.sh`
        // could pass it and then resolve OUTSIDE the project tree, letting the existence/permission
        // probe below stat an arbitrary path. There is exactly one valid CLEAR statusline location —
        // <projectRoot>/.clear/statusline.sh — so require the resolved path to equal it before any
        // fs.* call. A traversal or otherwise-divergent path is reported as a non-CLEAR statusline,
        // not stat'd.
        const expectedScript = path.join(path.resolve(this.basePath), CLEAR_DIR, 'statusline.sh');
        if (resolvedScript !== expectedScript) {
            issues.push({
                severity: 'warning',
                domain: 'install',
                message: `statusLine.command does not resolve to the CLEAR statusline script under .clear/ (resolved: ${resolvedScript}).`,
                suggestion: 'Re-run /cf-init to set the CLEAR statusline. If you intentionally use a custom statusline, this can be ignored.',
                autoRepairable: false
            });
            return;
        }
        if (!fs.existsSync(resolvedScript)) {
            issues.push({
                severity: 'error',
                domain: 'install',
                message: `CLEAR statusline script is configured but missing on disk: ${resolvedScript}.`,
                suggestion: 'Re-run /cf-init to reprovision .clear/statusline.sh. The next session also auto-heals it (session start copies the script + migrates the command).',
                autoRepairable: false
            });
            return;
        }
        // Script exists — check the executable bit (best-effort: some mounted filesystems report
        // 0777 regardless, so a non-executable result is surfaced as a warning, not a hard error,
        // to avoid false-flagging a correct install).
        let executable = true;
        try {
            executable = (fs.statSync(resolvedScript).mode & 0o111) !== 0;
        }
        catch {
            executable = true;
        }
        if (!executable) {
            const safeCommand = resolvedScript.replace(/"/g, '\\"');
            issues.push({
                severity: 'warning',
                domain: 'install',
                message: `CLEAR statusline script is present but not marked executable: ${resolvedScript}.`,
                suggestion: `Make it executable: chmod +x "${safeCommand}"`,
                autoRepairable: false
            });
        }
    }
    /**
     * Check the CLEAR env vars in settings.json. Two distinct writers, two severities:
     *   - the 5 hook kill-switches are written by /cf-init → missing is an ERROR (re-run /cf-init);
     *   - CLEAR_PLUGIN_ROOT is persisted by the SessionStart hook on the first session after init
     *     (post-restart), NOT by init → absence is a WARNING (expected until restart), remediated
     *     by restarting Claude Code, NOT by re-running init.
     * The two-writer split prevents false-flagging a freshly-initialized-but-not-yet-restarted project.
     */
    checkClearEnvVars(settings, issues) {
        const env = (settings.env && typeof settings.env === 'object') ? settings.env : {};
        const missingSwitches = INIT_ENV_KILL_SWITCHES.filter(key => !(key in env));
        if (missingSwitches.length > 0) {
            issues.push({
                severity: 'error',
                domain: 'install',
                message: `CLEAR hook environment variable(s) missing from .claude/settings.json: ${missingSwitches.join(', ')}.`,
                suggestion: 'Re-run /cf-init to provision the CLEAR environment variables.',
                autoRepairable: false
            });
        }
        if (!('CLEAR_PLUGIN_ROOT' in env)) {
            issues.push({
                severity: 'warning',
                domain: 'install',
                message: 'CLEAR_PLUGIN_ROOT is not set in .claude/settings.json. It is written by the SessionStart hook on the first session after initialization, so it is expected to be absent until you restart Claude Code.',
                suggestion: 'Restart Claude Code; the SessionStart hook persists CLEAR_PLUGIN_ROOT automatically. Do NOT re-run /cf-init for this — init does not write CLEAR_PLUGIN_ROOT.',
                autoRepairable: false
            });
        }
    }
    // ============================================================================
    // UTILITY METHODS
    // ============================================================================
    clearDirExists() {
        return fs.existsSync(this.clearDir);
    }
    /**
     * Probe whether the better-sqlite3 native binding loads in THIS process. Opens an
     * in-memory database (no file, no plugin-root, no consumer data touched) — construction
     * throws when the native addon cannot load (the unbuilt-module signature). This is the
     * read-only DIAGNOSTIC probe; it is deliberately distinct from sqlite-bootstrap's
     * addonLoads(), which probes a resolved plugin-root module path via a subprocess while
     * DECIDING a download/rebuild during init. cf-debug owns the diagnostic surface; the
     * bootstrap owns the production install path.
     */
    probeSqliteBinding() {
        try {
            const db = new better_sqlite3_1.default(':memory:');
            db.close();
            return 'ok';
        }
        catch {
            return 'missing';
        }
    }
    getAuditStatus() {
        const auditDir = path.join(this.clearDir, AUDIT_DIR);
        if (!fs.existsSync(auditDir)) {
            return { currentSession: 0, entriesInSession: 0, totalSessions: 0 };
        }
        try {
            const files = fs.readdirSync(auditDir).filter(f => f.startsWith('session_') && f.endsWith('.jsonl'));
            const totalSessions = files.length;
            if (totalSessions === 0) {
                return { currentSession: 0, entriesInSession: 0, totalSessions: 0 };
            }
            // Get latest session file
            const latestFile = files.sort().pop();
            const sessionMatch = latestFile.match(/session_(\d+)\.jsonl/);
            const currentSession = sessionMatch ? parseInt(sessionMatch[1], 10) : 0;
            // Count entries in current session
            const latestPath = path.join(auditDir, latestFile);
            const content = fs.readFileSync(latestPath, 'utf-8');
            const entriesInSession = content.trim().split('\n').filter(line => line.trim()).length;
            return { currentSession, entriesInSession, totalSessions };
        }
        catch {
            return { currentSession: 0, entriesInSession: 0, totalSessions: 0 };
        }
    }
    buildReport(timestamp, issues) {
        const summary = {
            errors: issues.filter(i => i.severity === 'error').length,
            warnings: issues.filter(i => i.severity === 'warning').length,
            info: issues.filter(i => i.severity === 'info').length,
            autoRepairable: issues.filter(i => i.autoRepairable).length
        };
        // Try to get session info from sync state
        let session = { id: '', number: 0 };
        const syncStatePath = path.join(this.clearDir, STATE_DIR, 'sync-state.json');
        if (fs.existsSync(syncStatePath)) {
            try {
                const state = JSON.parse(fs.readFileSync(syncStatePath, 'utf-8'));
                if (state.session) {
                    session = { id: state.session.id || '', number: state.session.number || 0 };
                }
            }
            catch {
                // Ignore parsing errors
            }
        }
        // The audit-status currentSession is derived from the latest .clear/audit/session_N.jsonl
        // filename, which reads 0 until that file is written. The authoritative current session is
        // sync-state.session.number (loaded above), so prefer it — otherwise "Current Session"
        // shows 0 while a live session is in progress. Fall back to the audit-derived value only
        // when sync-state carries no session (number === 0).
        const rawAuditStatus = this.getAuditStatus();
        const auditStatus = session.number > 0
            ? { ...rawAuditStatus, currentSession: session.number }
            : rawAuditStatus;
        return {
            timestamp,
            session,
            issues,
            summary,
            auditStatus,
            dependencies: { sqliteBinding: this.probeSqliteBinding() }
        };
    }
    // ============================================================================
    // OUTPUT FORMATTING
    // ============================================================================
    /**
     * Format report for console output
     */
    formatReport(report) {
        const lines = [];
        lines.push('═══════════════════════════════════════════════════════════════');
        lines.push('                    CLEAR Debug Report');
        lines.push('═══════════════════════════════════════════════════════════════');
        lines.push(`Generated: ${report.timestamp}`);
        lines.push(`Session: ${report.session.number} (${report.session.id || 'unknown'})`);
        lines.push('');
        // Summary
        lines.push('Summary:');
        lines.push(`  Errors:       ${report.summary.errors}`);
        lines.push(`  Warnings:     ${report.summary.warnings}`);
        lines.push(`  Info:         ${report.summary.info}`);
        lines.push(`  Auto-repair:  ${report.summary.autoRepairable}`);
        lines.push('');
        // Dependency health — printed before issues so an un-adopted fix (missing native
        // binding) is visible at a glance, even on a fresh project before any index exists.
        lines.push('Dependencies:');
        if (report.dependencies.sqliteBinding === 'ok') {
            lines.push('  better-sqlite3 binding: OK');
        }
        else {
            lines.push('  better-sqlite3 binding: MISSING — the native module did not load in this process.');
            lines.push('    Fix: download a prebuilt binary with `npx prebuild-install` in $CLEAR_PLUGIN_ROOT/node_modules/better-sqlite3 (lower-risk, no compiler needed); if that fails, compile it with `npm rebuild better-sqlite3`. Until restored, knowledge capture and search cannot read the index.');
        }
        lines.push('');
        // Issues by severity
        if (report.issues.length === 0) {
            lines.push('✓ No issues found');
        }
        else {
            // Errors first
            const errors = report.issues.filter(i => i.severity === 'error');
            if (errors.length > 0) {
                lines.push('ERRORS:');
                for (const issue of errors) {
                    lines.push(`  ✗ [${issue.domain}] ${issue.message}`);
                    if (issue.systemId) {
                        lines.push(`    SystemId: ${issue.systemId}`);
                    }
                    if (issue.suggestion) {
                        lines.push(`    Fix: ${issue.suggestion}`);
                    }
                }
                lines.push('');
            }
            // Warnings
            const warnings = report.issues.filter(i => i.severity === 'warning');
            if (warnings.length > 0) {
                lines.push('WARNINGS:');
                for (const issue of warnings) {
                    lines.push(`  ⚠ [${issue.domain}] ${issue.message}`);
                    if (issue.suggestion) {
                        lines.push(`    Fix: ${issue.suggestion}`);
                    }
                }
                lines.push('');
            }
            // Info
            const info = report.issues.filter(i => i.severity === 'info');
            if (info.length > 0) {
                lines.push('INFO:');
                for (const issue of info) {
                    lines.push(`  ℹ [${issue.domain}] ${issue.message}`);
                }
                lines.push('');
            }
        }
        // Audit status
        lines.push('Audit Log Status:');
        lines.push(`  Current Session: ${report.auditStatus.currentSession}`);
        lines.push(`  Entries in Session: ${report.auditStatus.entriesInSession}`);
        lines.push(`  Total Sessions: ${report.auditStatus.totalSessions}`);
        lines.push('');
        lines.push('═══════════════════════════════════════════════════════════════');
        return lines.join('\n');
    }
}
exports.DebugCLI = DebugCLI;
// ==============================================================================
// CLI ENTRY POINT
// ==============================================================================
/**
 * Main CLI entry point
 */
async function main(args) {
    if (args.includes('--help') || args.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: debug-cli.js [domain] [options]',
                '',
                'Runs diagnostic validation across CLEAR subsystems.',
                '',
                'Domains (optional, validates all if omitted):',
                '  session                      Session state integrity',
                '  workpackage                  Workpackage registry + state',
                '  plan                         Plan structure + sync',
                '  knowledge                    Knowledge database + index',
                '  sync                         Sync-state consistency',
                '  install                      Claude Code install wiring (statusline +',
                '                               settings.json env vars). Run after restarting',
                '                               Claude Code to confirm the statusline is wired.',
                '',
                'Options:',
                '  --repair                     Attempt auto-repair of detected issues',
                '  --check-ids                  Check dual-ID (internal/display) integrity',
                '  --verbose                    Verbose output',
            ].join('\n')
        }));
        process.exit(0);
    }
    const basePath = process.cwd();
    const cli = new DebugCLI(basePath);
    // Parse arguments
    const options = {
        domain: undefined,
        repair: args.includes('--repair'),
        checkIds: args.includes('--check-ids'),
        verbose: args.includes('--verbose')
    };
    // Check for domain argument
    const domainArg = args.find(a => !a.startsWith('--'));
    if (domainArg && isDebugDomain(domainArg)) {
        options.domain = domainArg;
    }
    // Run validation
    const report = await cli.validate(options);
    // Output report
    console.log(cli.formatReport(report));
    // Run repair if requested
    if (options.repair && report.summary.autoRepairable > 0) {
        console.log('\nAttempting auto-repair...\n');
        const result = await cli.repair(report);
        if (result.repaired.length > 0) {
            console.log(`✓ Repaired ${result.repaired.length} issue(s)`);
        }
        if (result.failed.length > 0) {
            console.log(`✗ Failed to repair ${result.failed.length} issue(s)`);
        }
    }
    // Exit with appropriate code
    if (report.summary.errors > 0) {
        process.exit(1);
    }
}
// Run if called directly
if (require.main === module) {
    main(process.argv.slice(2)).catch(error => {
        console.error('Debug CLI error:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=debug-cli.js.map