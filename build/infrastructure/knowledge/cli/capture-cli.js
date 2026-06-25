#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge Capture CLI Tool
 *
 * Handles knowledge capture with multi-step user confirmation flow.
 * Called by knowledge-capture.sh bash wrapper.
 *
 * Modes:
 *   --detect: Check if text contains capture trigger, return suggestion
 *   --confirm: Process user confirmation response
 *   --create: Create the knowledge entry
 *
 * Usage:
 *   npx ts-node capture-cli.ts --clear-dir=<path> --detect --text=<text>
 *   npx ts-node capture-cli.ts --clear-dir=<path> --confirm --response=<yes|no|edit>
 *   npx ts-node capture-cli.ts --clear-dir=<path> --create --title=<title> --type=<type> --tags=<tags>
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
exports.isTypeChangeResult = isTypeChangeResult;
exports.detectCapture = detectCapture;
exports.processConfirmation = processConfirmation;
exports.createEntry = createEntry;
exports.createEntryWithAutoLink = createEntryWithAutoLink;
exports.triggerIndexUpdate = triggerIndexUpdate;
exports.isAutoLinkExcludedChurnFile = isAutoLinkExcludedChurnFile;
exports.validateAndMergeAddRelatedFiles = validateAndMergeAddRelatedFiles;
exports.readRelatedFiles = readRelatedFiles;
exports.checkState = checkState;
exports.updateEntry = updateEntry;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const yaml = __importStar(require("js-yaml"));
const validation_1 = require("../../validation");
const deprecation_1 = require("../../sync/deprecation");
const knowledge_linker_1 = require("../../sync/knowledge-linker");
const audit_log_1 = require("../../sync/audit-log");
const types_1 = require("../types");
const patterns_1 = require("../patterns");
const parser_1 = require("../parser");
const link_cli_1 = require("./link-cli");
const tfidf_1 = require("../tfidf");
const file_index_1 = require("../file-index");
const slug_index_1 = require("../slug-index");
const db_1 = require("../db");
const index_cli_1 = require("./index-cli");
const pending_reviews_1 = require("../pending-reviews");
const sanitize_path_1 = require("../../cli/sanitize-path");
const cli_file_input_1 = require("../../shared/cli-file-input");
/**
 * K2.8 AC2: Allowed values for --via. Drift-proof per memory
 * `feedback_drift_proof_sourcing.md` — error messages and audit metadata
 * derive from this single const.
 */
const VIA_MODES = ['direct_create', 'pattern_detected', 'extraction', 'bulk'];
/**
 * K3.5 audit-log + return-shape marker for type-change. Single-source-of-truth
 * for the operation literal — referenced from the audit-log metadata, the
 * router's response formatter, and the `isTypeChangeResult` narrowing guard
 * below. LINT-K3.5-02 fix.
 */
const TYPE_CHANGE_ACTION = 'type-change';
/**
 * Type guard narrowing an UpdateOutput to the type-change arm where `oldId`,
 * `newId`, and `cascadedRefs` are guaranteed present (not `undefined`). Used
 * at the router to safely embed oldId/newId in user-facing template strings.
 * TS-K3.5-02 narrowing primitive.
 */
function isTypeChangeResult(r) {
    return r.action === TYPE_CHANGE_ACTION;
}
/**
 * Emit the same JSON-error envelope the prior else-if chain emitted on
 * validation failure, then exit(1). Centralized so any future validating
 * handler reuses it instead of re-stringifying the envelope inline.
 */
function exitParseArgsError(error) {
    console.log(JSON.stringify({
        script: 'knowledge-capture',
        success: false,
        status: 'error',
        error
    }));
    process.exit(1);
}
const BARE_FLAG_HANDLERS = new Map([
    ['--detect', (o) => { o.mode = 'detect'; }],
    ['--confirm', (o) => { o.mode = 'confirm'; }],
    ['--create', (o) => { o.mode = 'create'; }],
    ['--check-state', (o) => { o.mode = 'check-state'; }],
    ['--update', (o) => { o.mode = 'update'; }],
]);
const VALUE_FLAG_HANDLERS = new Map([
    ['--clear-dir=', (v, o) => { o.clearDir = v; }],
    ['--id=', (v, o) => { o.id = v; }],
    // WP-DF2 AC3 (S165): accumulate — flag is repeatable.
    ['--add-related-file=', (v, o) => { o.addRelatedFile = (o.addRelatedFile ?? []).concat([v]); }],
    // WP-PS3 AC1 (S176): mirror --add-related-file= repeatable-accumulate shape.
    ['--remove-related-file=', (v, o) => { o.removeRelatedFile = (o.removeRelatedFile ?? []).concat([v]); }],
    ['--text=', (v, o) => { o.text = v; }],
    ['--response=', (v, o) => { o.response = v; }],
    ['--title=', (v, o) => { o.title = v; }],
    ['--type=', (v, o) => {
            const validTypes = Object.keys(types_1.KNOWLEDGE_TYPE_PREFIXES);
            if (!validTypes.includes(v)) {
                exitParseArgsError(`Invalid knowledge type: '${v}'. Valid types: ${validTypes.join(', ')}`);
            }
            o.type = v;
        }],
    ['--tags=', (v, o) => { o.tags = v.split(',').filter(Boolean); }],
    ['--description=', (v, o) => { o.description = v; }],
    ['--supersedes=', (v, o) => { o.supersedes = v; }],
    // Free-form-text file-input variants. Stored transiently; resolved post-loop
    // in parseArgs (mutual exclusion + size cap via resolveTextFieldSource).
    ['--description-file=', (v, o) => { o.descriptionFile = v; }],
    ['--title-file=', (v, o) => { o.titleFile = v; }],
    ['--supersedes-file=', (v, o) => { o.supersedesFile = v; }],
    ['--tags-file=', (v, o) => { o.tagsFile = v; }],
    // STD-K3.4-LIN02-01: NaN guard mirroring --session-number= so non-numeric input
    // surfaces a stderr warning rather than silently propagating NaN through
    // downstream `session || 0` coercion. Behavior at observable boundary unchanged
    // (NaN || 0 === 0; undefined || 0 === 0); internal state cleaner + warning visible.
    ['--session=', (v, o) => {
            const parsed = parseInt(v, 10);
            if (!Number.isNaN(parsed)) {
                o.session = parsed;
            }
            else {
                process.stderr.write(`[CLEAR] Warning: --session=${v} is not numeric; session-derived fields will fall back to 0 for this invocation\n`);
            }
        }],
    ['--workpackage=', (v, o) => { o.workpackage = v; }],
    // WP-DF2 AC4 (S166): explicit slug for [[slug-name]] cross-references.
    // Validated to lowercase kebab-case at createEntry boundary (CS3 fail-fast).
    ['--slug=', (v, o) => { o.slug = v; }],
    ['--source=', (v, o) => { o.source = v; }],
    ['--source-updated=', (v, o) => { o.source_updated = v; }],
    ['--scope=', (v, o) => { o.scope = v; }],
    // K3.3 PROC + K3.4 SH category-flag fields: permissive strings (free-form
    // human-readable, not closed-set tokens like K2.8 --via=<enum>). CS3
    // strict-enum gate does not apply at parseArgs — cross-context invariants
    // (e.g., type=stakeholder REQUIRES entity_type) are enforced at createEntry
    // where both fields are visible. owns is comma-split into string[] mirroring
    // the --tags= split pattern; trailing/empty entries filtered. SEC-K3.4-04
    // (S155) traversal guard mirrors --add-related-file= sanitization to prevent
    // hand-crafted ../.. values from being indexed and surfaced via PreToolUse.
    ['--trigger-event=', (v, o) => { o.trigger_event = v; }],
    ['--frequency=', (v, o) => { o.frequency = v; }],
    ['--tools=', (v, o) => { o.tools = v; }],
    ['--automation-hook=', (v, o) => { o.automation_hook = v; }],
    ['--entity-type=', (v, o) => { o.entity_type = v; }],
    ['--role=', (v, o) => { o.role = v; }],
    ['--owns=', (v, o) => {
            const paths = v.split(',').map(p => p.trim()).filter(Boolean);
            const invalid = paths.find(p => path.isAbsolute(p) || p.includes('..'));
            if (invalid) {
                exitParseArgsError(`Invalid --owns path '${invalid}': must be relative without traversal.`);
            }
            o.owns = paths;
        }],
    ['--contact=', (v, o) => { o.contact = v; }],
    ['--via=', (v, o) => {
            if (!VIA_MODES.includes(v)) {
                exitParseArgsError(`Invalid --via value: '${v}'. Valid modes: ${VIA_MODES.join(', ')}`);
            }
            o.via = v;
        }],
    ['--matched-pattern=', (v, o) => { o.matchedPattern = v; }],
    ['--session-id=', (v, o) => { o.sessionId = v; }],
    ['--session-number=', (v, o) => {
            const parsed = parseInt(v, 10);
            if (!Number.isNaN(parsed)) {
                o.sessionNumber = parsed;
            }
            else {
                process.stderr.write(`[CLEAR] Warning: --session-number=${v} is not numeric; audit log entry will be skipped for this invocation\n`);
            }
        }],
]);
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        clearDir: './.clear',
        mode: 'detect'
    };
    for (const arg of args) {
        const bareHandler = BARE_FLAG_HANDLERS.get(arg);
        if (bareHandler) {
            bareHandler(options);
            continue;
        }
        const eqIdx = arg.indexOf('=');
        if (eqIdx === -1) {
            continue; // unknown bare flag — silent ignore (preserves prior else-fallthrough)
        }
        const prefix = arg.substring(0, eqIdx + 1);
        const valueHandler = VALUE_FLAG_HANDLERS.get(prefix);
        if (valueHandler) {
            valueHandler(arg.substring(eqIdx + 1), options);
        }
        // unknown value flag — silent ignore (preserves prior else-fallthrough)
    }
    resolveFileInputFlags(options);
    // Normalize to the .clear subdir, tolerant of either --clear-dir convention.
    // Every capture-cli use treats options.clearDir as the .clear dir (the project
    // root is derived via path.dirname where needed), so conventional <root>/.clear
    // input is unchanged; a `.`/project-root form now resolves correctly too.
    options.clearDir = (0, validation_1.resolveClearDir)((0, validation_1.validateBasePath)(options.clearDir)).clearSubdir;
    return options;
}
/**
 * Resolve the free-form-text `--<field>-file=` flags against their inline
 * counterparts (mutual exclusion + 1 MiB size cap + ENOENT/dir/permission via
 * resolveTextFieldSource). File content lands in the matching option in place.
 * On any resolution failure, emit the standard JSON error envelope + exit(1)
 * (exitParseArgsError), matching the rest of capture-cli's parse error surface.
 *
 * --description / --title / --supersedes are plain strings. --tags-file content
 * is comma-split (mirroring the inline --tags= handler); its mutual exclusion is
 * checked locally because the inline value is already a string[] at this point.
 */
function resolveFileInputFlags(options) {
    const stringFields = [
        { inline: options.description, file: options.descriptionFile, field: 'description', apply: (t) => { options.description = t; } },
        { inline: options.title, file: options.titleFile, field: 'title', apply: (t) => { options.title = t; } },
        { inline: options.supersedes, file: options.supersedesFile, field: 'supersedes', apply: (t) => { options.supersedes = t; } }
    ];
    for (const f of stringFields) {
        if (f.file === undefined)
            continue;
        try {
            const resolved = (0, cli_file_input_1.resolveTextFieldSource)(f.inline, f.file, f.field);
            if (resolved !== undefined)
                f.apply(resolved);
        }
        catch (e) {
            exitParseArgsError(e instanceof Error ? e.message : String(e));
        }
    }
    if (options.tagsFile !== undefined) {
        // --tags is already comma-split to string[] by its inline handler, so it
        // cannot be passed to resolveTextFieldSource (which expects string|undefined).
        // The mutual-exclusion check is therefore done here manually, immediately
        // before delegating only the file read + size cap + dir/permission checks.
        if (options.tags !== undefined) {
            exitParseArgsError('Cannot use both --tags and --tags-file; specify exactly one.');
        }
        try {
            const content = (0, cli_file_input_1.resolveTextFieldSource)(undefined, options.tagsFile, 'tags');
            if (content !== undefined)
                options.tags = content.split(',').map((t) => t.trim()).filter(Boolean);
        }
        catch (e) {
            exitParseArgsError(e instanceof Error ? e.message : String(e));
        }
    }
}
// ==============================================================================
// Capture-pattern observability log (K2.8 AC4 + AC5)
// ==============================================================================
/**
 * Hash trimmed text to 16-hex-char SHA-256 for capture-pattern-log entries.
 * K2.8 AC5: collision-tolerant since use case is pattern-coverage analytics,
 * not auditability. Avoids storing user text verbatim.
 * Precedent: src/infrastructure/sync/context-hub.ts:199.
 */
function hashOriginalText(text) {
    return crypto.createHash('sha256').update(text.trim()).digest('hex').substring(0, 16);
}
/**
 * Construct a CapturePatternLogRow from common inputs (LIN-K2.8-01 DRY fix).
 * 3 of 4 emit sites (decline, expired-in-detect, expired-in-confirm) operate
 * on a `PendingCaptureState`; the 4th (createEntry catch) provides explicit
 * fields. The `state` overload extracts `pattern_description`, `suggested_type`,
 * and `original_text_hash` consistently — single source of truth for the field
 * mapping.
 */
function makePatternLogRow(opts) {
    return {
        ts: new Date().toISOString(),
        sessionId: opts.sessionId ?? '',
        sessionNumber: opts.sessionNumber ?? 0,
        event: opts.event,
        pattern_description: opts.state?.matched_pattern_description ?? opts.pattern_description ?? '',
        suggested_type: opts.state?.suggested_type ?? opts.suggested_type ?? '',
        original_text_hash: opts.state ? hashOriginalText(opts.state.original_text) : (opts.original_text_hash ?? ''),
        reason: opts.reason
    };
}
/**
 * Append a capture-pattern observability event to .clear/state/capture-pattern-log.jsonl.
 * K2.8 AC4: writes are append-only via fs.appendFileSync (no shell echo).
 * Daemon (WP-K5.1) consumes + curates + rotates this file.
 * Non-fatal on write error: surfaced via stderr; production path continues.
 */
function appendCapturePatternLog(clearDir, row) {
    try {
        const stateDir = path.join(clearDir, 'state');
        if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
        }
        const logPath = path.join(stateDir, 'capture-pattern-log.jsonl');
        fs.appendFileSync(logPath, JSON.stringify(row) + '\n', 'utf-8');
    }
    catch (err) {
        process.stderr.write(`[CLEAR] Warning: failed to append capture-pattern-log row: ${err instanceof Error ? err.message : String(err)}\n`);
    }
}
// ==============================================================================
// State Management
// ==============================================================================
function getStatePath(clearDir) {
    return path.join(clearDir, 'state', 'pending-capture.json');
}
function loadPendingState(clearDir) {
    const statePath = getStatePath(clearDir);
    if (!fs.existsSync(statePath)) {
        return null;
    }
    try {
        const content = fs.readFileSync(statePath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
function savePendingState(clearDir, state) {
    const statePath = getStatePath(clearDir);
    const stateDir = path.dirname(statePath);
    if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
    }
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}
function clearPendingState(clearDir) {
    const statePath = getStatePath(clearDir);
    if (fs.existsSync(statePath)) {
        fs.unlinkSync(statePath);
    }
}
function isStateExpired(state, clearDir) {
    const config = (0, patterns_1.getPendingCaptureConfig)(path.dirname(clearDir));
    // Check prompts threshold
    if (state.prompts_since_detection >= config.max_prompts_without_response) {
        return true;
    }
    // Check time threshold
    const detectedAt = new Date(state.detected_at).getTime();
    const now = Date.now();
    const minutesElapsed = (now - detectedAt) / (1000 * 60);
    return minutesElapsed >= config.expire_after_minutes;
}
// ==============================================================================
// Similar Entry Detection
// ==============================================================================
function findSimilarEntries(text, clearDir, maxResults = 3) {
    const jsonPath = path.join(clearDir, 'knowledge', 'index.json');
    // Try to load entries from DB or JSON
    let entries = [];
    if (fs.existsSync(jsonPath)) {
        try {
            const content = fs.readFileSync(jsonPath, 'utf-8');
            // TS-K3.4-06 (S155): structural guard on JSON.parse output before any
            // .entries access. The any-typed parse otherwise propagates into the
            // filter callback and erases compile-time guarantees on entry shape.
            const raw = JSON.parse(content);
            if (!Array.isArray(raw.entries)) {
                return [];
            }
            entries = raw.entries.filter((e) => {
                return typeof e === 'object' && e !== null && e.status === 'active';
            });
        }
        catch {
            return [];
        }
    }
    if (entries.length === 0) {
        return [];
    }
    // Compute simple similarity based on keyword overlap
    const textTokens = new Set((0, tfidf_1.tokenize)(text));
    const similarities = [];
    for (const entry of entries) {
        const entryTokens = new Set((0, tfidf_1.tokenize)(`${entry.title} ${entry.description}`));
        let overlap = 0;
        for (const token of textTokens) {
            if (entryTokens.has(token)) {
                overlap++;
            }
        }
        if (overlap > 0) {
            const score = overlap / Math.max(textTokens.size, 1);
            similarities.push({ id: entry.id, score });
        }
    }
    similarities.sort((a, b) => b.score - a.score);
    return similarities.slice(0, maxResults).map(s => s.id);
}
// ==============================================================================
// Detection Mode
// ==============================================================================
/** @internal Exported for testing */
function detectCapture(options) {
    const { clearDir, text, sessionId, sessionNumber } = options;
    if (!text) {
        return {
            script: 'knowledge-capture',
            detected: false,
            status: 'no_trigger'
        };
    }
    // Check for existing pending state. Compute expiry once (STD-K2.8-02 fix —
    // previously called isStateExpired twice, creating hidden coupling if the
    // helper ever gained side effects).
    const existingState = loadPendingState(clearDir);
    if (existingState) {
        const expired = isStateExpired(existingState, clearDir);
        if (!expired) {
            // Increment prompts counter
            existingState.prompts_since_detection++;
            savePendingState(clearDir, existingState);
            return {
                script: 'knowledge-capture',
                detected: false,
                status: 'pending_exists',
                additionalContext: `[CLEAR] Pending capture in progress (step: ${existingState.step}). Respond to complete or say "cancel" to abort.`
            };
        }
        // K2.8 AC4 (D-02 fix): explicit state-expired branch. Previously this case
        // fell through silently — expired states were abandoned with no event surface.
        // Now clear the state and emit an 'expired' row before falling through to
        // fresh detection. session-id/number are optional for the log row; if absent,
        // record with empty values so daemon (K5.1) can still count the event.
        appendCapturePatternLog(clearDir, makePatternLogRow({
            sessionId,
            sessionNumber,
            event: 'expired',
            state: existingState,
            reason: 'state expired before user confirmation'
        }));
        clearPendingState(clearDir);
        // Fall through to fresh detection below.
    }
    // Clear stale patterns cache for fresh detection
    (0, patterns_1.clearPatternsCache)();
    // Detect capture trigger
    const cwd = path.dirname(clearDir);
    const result = (0, patterns_1.detectCaptureTrigger)(text, cwd);
    if (!result.matched) {
        return {
            script: 'knowledge-capture',
            detected: false,
            status: 'no_trigger'
        };
    }
    // Generate suggestions
    const suggestedTitle = (0, patterns_1.generateSuggestedTitle)(result.extractedText);
    const suggestedTags = (0, patterns_1.inferTags)(text, cwd);
    // Create pending state
    const newState = {
        step: 'awaiting_confirmation',
        detected_at: new Date().toISOString(),
        suggested_title: suggestedTitle,
        suggested_type: result.suggestedType,
        suggested_tags: suggestedTags,
        original_text: text,
        prompts_since_detection: 0,
        // K2.8 AC3: persist pattern description for later --matched-pattern threading.
        matched_pattern_description: result.pattern.description
    };
    savePendingState(clearDir, newState);
    // Format confirmation prompt
    const typeLabel = result.suggestedType.replace(/-/g, ' ');
    const tagsDisplay = suggestedTags.length > 0
        ? suggestedTags.join(', ')
        : '(none detected)';
    return {
        script: 'knowledge-capture',
        detected: true,
        status: 'detected',
        suggestedTitle,
        suggestedType: result.suggestedType,
        suggestedTags,
        originalText: result.extractedText,
        additionalContext: `[CLEAR] Detected potential ${typeLabel}:\n"${suggestedTitle}"\n\nSuggested tags: ${tagsDisplay}\n\nCapture this? [Yes/No/Edit]`
    };
}
// ==============================================================================
// Confirmation Helpers
// ==============================================================================
/**
 * Handle the 'awaiting_confirmation' step: move to tag review.
 */
function handleAwaitingConfirmation(state, clearDir) {
    // Move to tag review
    state.step = 'awaiting_tag_review';
    state.confirmed_tags = state.suggested_tags;
    savePendingState(clearDir, state);
    const tagsDisplay = state.suggested_tags.length > 0
        ? state.suggested_tags.join(', ')
        : '(none)';
    return {
        script: 'knowledge-capture',
        status: 'confirmed',
        nextStep: 'tag_review',
        suggestedTags: state.suggested_tags,
        additionalContext: `[CLEAR] Tags: ${tagsDisplay}\n\nConfirm tags, or provide changes (e.g., "add auth, remove testing"):`
    };
}
/**
 * Handle the 'awaiting_tag_review' step: check for similar entries,
 * then move to supersession check or ready-to-create.
 */
function handleAwaitingTagReview(state, clearDir) {
    // Move to supersession check
    const similarIds = findSimilarEntries(state.original_text, clearDir);
    if (similarIds.length > 0) {
        state.step = 'awaiting_supersession';
        state.similar_entries = similarIds;
        savePendingState(clearDir, state);
        return {
            script: 'knowledge-capture',
            status: 'confirmed',
            nextStep: 'supersession_check',
            similarEntries: similarIds,
            additionalContext: `[CLEAR] Found similar entries:\n${similarIds.map(id => `• ${id}`).join('\n')}\n\nDoes this replace any of them? [${similarIds.join('/')}/None]`
        };
    }
    // No similar entries - ready to create
    state.step = 'awaiting_supersession'; // Mark as complete
    savePendingState(clearDir, state);
    return {
        script: 'knowledge-capture',
        status: 'confirmed',
        nextStep: 'ready_to_create',
        additionalContext: '[CLEAR] Ready to create entry. Confirming...'
    };
}
// ==============================================================================
// Confirmation Mode
// ==============================================================================
/** @internal Exported for testing */
function processConfirmation(options) {
    const { clearDir, response, text, sessionId, sessionNumber } = options;
    const state = loadPendingState(clearDir);
    if (!state) {
        return {
            script: 'knowledge-capture',
            status: 'no_pending'
        };
    }
    if (isStateExpired(state, clearDir)) {
        // K2.8 AC4: emit 'expired' row before clearing state.
        appendCapturePatternLog(clearDir, makePatternLogRow({
            sessionId,
            sessionNumber,
            event: 'expired',
            state,
            reason: 'state expired during confirmation flow'
        }));
        clearPendingState(clearDir);
        return {
            script: 'knowledge-capture',
            status: 'expired',
            additionalContext: '[CLEAR] Capture request expired. Start again if needed.'
        };
    }
    // Detect confirmation in response or text
    const responseText = response || text || '';
    const cwd = path.dirname(clearDir);
    const confirmation = (0, patterns_1.detectConfirmation)(responseText, cwd);
    if (!confirmation.detected) {
        // Increment counter and continue waiting
        state.prompts_since_detection++;
        savePendingState(clearDir, state);
        return {
            script: 'knowledge-capture',
            status: 'no_pending',
            additionalContext: `[CLEAR] Still waiting for response: Capture "${state.suggested_title}"? [Yes/No/Edit]`
        };
    }
    if (confirmation.response === 'cancel') {
        // K2.8 AC4: emit 'decline' row before clearing state.
        appendCapturePatternLog(clearDir, makePatternLogRow({
            sessionId,
            sessionNumber,
            event: 'decline',
            state,
            reason: 'user declined capture confirmation'
        }));
        clearPendingState(clearDir);
        return {
            script: 'knowledge-capture',
            status: 'cancelled',
            additionalContext: '[CLEAR] Capture cancelled.'
        };
    }
    if (confirmation.response === 'edit') {
        return {
            script: 'knowledge-capture',
            status: 'edit_requested',
            additionalContext: `[CLEAR] Please provide the corrected title and tags:\nCurrent: "${state.suggested_title}"\nTags: ${state.suggested_tags.join(', ')}`
        };
    }
    // User confirmed - check what step we're at
    if (state.step === 'awaiting_confirmation') {
        return handleAwaitingConfirmation(state, clearDir);
    }
    if (state.step === 'awaiting_tag_review') {
        return handleAwaitingTagReview(state, clearDir);
    }
    // Supersession step completed
    return {
        script: 'knowledge-capture',
        status: 'confirmed',
        nextStep: 'ready_to_create'
    };
}
/**
 * Run cross-context required-field guards for create. CS3 fail-fast.
 *
 * Pure — no I/O. Guards:
 *   - title + type required
 *   - SH (type='stakeholder') requires entity_type — cross-context gate (depends
 *     on BOTH type AND entity_type being present); parseArgs handlers are
 *     independent (no cross-flag awareness), so the gate sits at createEntry
 *     alongside the parallel title+type invariant.
 *
 * On success, returns title + type narrowed to defined — downstream code uses
 * the narrowed values rather than re-destructuring from options (avoids
 * `type as KnowledgeType` casts).
 */
function validateCreateInputs(options) {
    const { title, type, entity_type } = options;
    if (!title || !type) {
        return {
            ok: false,
            error: {
                script: 'knowledge-capture',
                success: false,
                status: 'error',
                error: 'Title and type are required'
            }
        };
    }
    if (type === 'stakeholder' && !entity_type) {
        return {
            ok: false,
            error: {
                script: 'knowledge-capture',
                success: false,
                status: 'error',
                error: "entity_type is required for stakeholder entries. Pass --entity-type=<person|team|role|vendor|system|...>."
            }
        };
    }
    return { ok: true, title, type };
}
/**
 * Resolve the session number for downstream consumers (created_session
 * frontmatter, supersession + auto-link + index-trigger session params).
 *
 * Precedence is canonical-first: `sessionNumber` is the K2.8 canonical field
 * (populated by knowledge-capture.sh from sync-state.json), `session` is the
 * legacy `--session=<n>` flag kept for backward-compat with older callers.
 * When both are present, canonical wins. The nullish `??` (NOT `||`) preserves
 * an explicit 0 — first-session captures legitimately set session number to 0
 * via `clearSessionNumber`, so `0 || fallback` would wrongly fall through.
 */
function resolveSessionNumber(options) {
    return options.sessionNumber ?? options.session ?? 0;
}
/**
 * Build the new entry object for create — type-gated frontmatter passthrough.
 *
 * Pure — deterministic given inputs; no I/O.
 *
 * TYPE-GATE NOTE for future categories: the BODY template gate is compile-enforced
 * (parser.ts BODY_TEMPLATE_BUILDERS is Record<KnowledgeType, ...>, not Partial);
 * this CLI-side frontmatter gate is runtime-only. Adding a new KnowledgeType
 * without a dispatch branch HERE is silently permissive — its category-specific
 * flags simply won't be collected. Add a branch when introducing a new category.
 */
function buildNewEntry(newId, options, relatedFiles) {
    const { clearDir, slug, title, type, tags, description, supersedes, source, source_updated, scope, trigger_event, frequency, tools, automation_hook, entity_type, role, owns, contact } = options;
    // title + type are guaranteed by validateCreateInputs; assert for the type
    // checker so the resulting entry object satisfies the generator signature.
    if (!title || !type) {
        throw new Error('buildNewEntry invoked without title/type — call validateCreateInputs first.');
    }
    // Use resolveSessionNumber so the description honors the canonical
    // sessionNumber field (K2.8 plumbing) when only --session-number was passed.
    // Without this the description prints "session unknown" even when sessionNumber=42
    // because the legacy `session` field stays undefined.
    const entryDescription = description || `Decision captured from session ${resolveSessionNumber(options)}.`;
    // WP-DF2 AC4 (S166): resolve slug. Explicit --slug wins; otherwise auto-derive
    // from title using existing slugs as the collision-avoidance set. Derivation
    // is a pure function — no I/O — so failure of slug-index read (e.g., first
    // entry in a project) just yields an empty collision set, and the derived
    // slug uses the title's base form unchanged.
    //
    // Fix-batch S166 AC4-validation: explicit --slug values run through
    // validateSlug() per WP-DF2 AC4 kebab-case contract. Failure throws — the
    // createEntry try/catch surfaces the error to the caller. Auto-derived slugs
    // bypass validation because deriveSlug() produces strictly conformant output.
    const knowledgeDir = path.join(clearDir, 'knowledge', 'entries');
    const existingSlugs = (0, slug_index_1.getExistingSlugs)(clearDir, knowledgeDir);
    let resolvedSlug;
    if (typeof slug === 'string' && slug.trim().length > 0) {
        const trimmedSlug = slug.trim();
        const slugErr = (0, slug_index_1.validateSlug)(trimmedSlug);
        if (slugErr) {
            throw new Error(`--slug rejected: ${slugErr}`);
        }
        resolvedSlug = trimmedSlug;
    }
    else {
        resolvedSlug = (0, slug_index_1.deriveSlug)(title, existingSlugs);
    }
    const entry = {
        id: newId,
        title,
        type,
        status: 'active',
        tags: tags || [],
        related_files: relatedFiles,
        created: new Date().toISOString(),
        created_session: resolveSessionNumber(options),
        description: entryDescription,
        slug: resolvedSlug,
        schema_version: db_1.SCHEMA_VERSION
    };
    if (supersedes) {
        entry.supersedes = supersedes;
    }
    // K3.2 institutional-wiki frontmatter passthrough.
    if (type === 'institutional-wiki') {
        if (source !== undefined)
            entry.source = source;
        if (source_updated !== undefined)
            entry.source_updated = source_updated;
        if (scope !== undefined)
            entry.scope = scope;
    }
    // K3.3 process frontmatter passthrough — promotion_status intentionally
    // omitted; it is K4.5-managed (process-to-skill promotion) and stays null
    // on create.
    if (type === 'process') {
        if (trigger_event !== undefined)
            entry.trigger_event = trigger_event;
        if (frequency !== undefined)
            entry.frequency = frequency;
        if (tools !== undefined)
            entry.tools = tools;
        if (automation_hook !== undefined)
            entry.automation_hook = automation_hook;
    }
    // K3.4 stakeholder frontmatter passthrough. entity_type is guaranteed
    // present by the required-gate in validateCreateInputs. owns is array-form
    // per D-K3.4-01; generateKnowledgeMarkdown emits it inline-array via yaml.dump
    // for the FRONTMATTER layer, while the SQL row sees the JSON-string form via
    // parser.ts:serializeOwnsForRow when the file is later re-parsed.
    if (type === 'stakeholder') {
        entry.entity_type = entity_type;
        if (role !== undefined)
            entry.role = role;
        if (owns !== undefined && owns.length > 0)
            entry.owns = owns;
        if (contact !== undefined)
            entry.contact = contact;
    }
    return entry;
}
/**
 * Post-write side effects for create: supersession (fire-and-forget), pending
 * state clear, SH lazy owner-index build, incremental index update, workpackage
 * auto-link (fire-and-forget), and K2.8 audit emit.
 *
 * All side effects run regardless of each other's success; failures are surfaced
 * to stderr (non-fatal — entry write already succeeded). Async side effects
 * (supersession, auto-link) are intentionally fire-and-forget per the S156
 * monolith's semantics.
 *
 * `type` and `title` arrive narrowed from `validateCreateInputs` via the
 * orchestrator — receiving them as explicit params lets this helper avoid the
 * silent-no-op return that the parallel `buildNewEntry` helper rejects via
 * throw. Consistent fail strategy across helpers (STD-S161-03 fix).
 */
function runCreateSideEffects(options, newId, type, title) {
    const { clearDir, tags, supersedes, sessionId, sessionNumber, via, matchedPattern } = options;
    // Supersession (fire-and-forget; surfaces errors via stderr).
    if (supersedes) {
        const basePath = path.dirname(clearDir);
        const resolvedSessionNumber = resolveSessionNumber(options);
        (0, deprecation_1.performSupersession)(basePath, supersedes, newId, {
            sessionId: sessionId ?? `session-${resolvedSessionNumber}`,
            sessionNumber: resolvedSessionNumber,
            migrateLinks: true
        }).then(ssResult => {
            if (ssResult.status === 'error') {
                process.stderr.write(`[CLEAR] Supersession failed: ${ssResult.error}\n`);
            }
            else if (ssResult.status === 'partial') {
                process.stderr.write(`[CLEAR] Supersession partial: ${ssResult.warnings.join('; ')}\n`);
            }
        }).catch(err => {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(`[CLEAR] Supersession error: ${msg}\n`);
        });
    }
    clearPendingState(clearDir);
    // Intrinsic sync-state propagation (knowledge→sync-state Layer 1). Record the
    // new entry in sync-state.knowledge.recentEntries from the CLI itself — next
    // to the performSupersession precedent above — so a bare capture invocation
    // (raw Bash, or the skill-instructed command) leaves sync-state coherent
    // WITHOUT waiting for the UserPromptSubmit hook to catch up on the next
    // prompt. Idempotent (dedup-by-id): co-running with the hook path yields a
    // single coherent projection. save() owns its own error surface (never
    // throws), so this is a safe fire-and-forget side effect.
    (0, knowledge_linker_1.propagateKnowledgeCapture)(path.dirname(clearDir), newId);
    // K3.4 FR22 lazy owner-index build: AFTER the first SH entry is written,
    // (re)build .clear/state/owner-index.json. The build is idempotent and
    // cheap (one scan of entries dir filtered to SH only). Per WP-K3.4 AC2,
    // this is the LAZY trigger point — owner-index.json should NOT pre-exist
    // before the first SH create. Subsequent SH creates rebuild from full
    // entry set so the reverse-map stays consistent. Failure is non-fatal:
    // PreToolUse falls back to single-index logic when owner-index is absent.
    if (type === 'stakeholder') {
        try {
            (0, file_index_1.buildOwnerIndex)(clearDir);
        }
        catch (ownerErr) {
            process.stderr.write(`[CLEAR] Warning: owner-index build failed for ${newId}: ${ownerErr instanceof Error ? ownerErr.message : String(ownerErr)}\n`);
        }
    }
    triggerIndexUpdate(clearDir, resolveSessionNumber(options), newId);
    // WP-DF2 AC4 (S166): rebuild slug-index.json after the new entry lands so
    // the next display-surface read sees the slug ↔ ID mapping. Failure is
    // non-fatal — display surfaces fall through to null index when slug-index
    // is absent/corrupt, which leaves [[slug]] refs as-written.
    try {
        const knowledgeDir = path.join(clearDir, 'knowledge', 'entries');
        (0, slug_index_1.rebuildSlugIndex)(clearDir, knowledgeDir);
    }
    catch (slugErr) {
        process.stderr.write(`[CLEAR] Warning: slug-index rebuild failed after ${newId}: ${slugErr instanceof Error ? slugErr.message : String(slugErr)}\n`);
    }
    // WP-PS7 phase_b AC13/AC14 (S189): auto-link to workpackage moved OUT of
    // runCreateSideEffects. Previously this block fire-and-forgot runLinkCLI;
    // the success message at the createEntry return site emitted "(linked to Y)"
    // BEFORE the link promise resolved, so the message could lie. The dispatcher
    // (CLI entry point + router) now awaits runLinkCLI and gates the suffix on
    // all-three-surface success. See createEntryWithAutoLink below.
    // K2.8 AC1 + AC2: emit audit-log row when canonical session-id + session-number
    // pair is present. Mirrors capture-cli.ts updateEntry gating and delete-cli.ts.
    // Legacy --session=<n>-only path remains silent (gate fails per AC1).
    //
    // Field shape per AC2 + D-03 resolution: top-level trigger='user_prompt'
    // (mirroring updateEntry); metadata.trigger=<via> (one of VIA_MODES; defaults
    // 'direct_create' when --via flag absent); metadata.pattern + suggestedType
    // populated when via=pattern_detected.
    //
    // TS-K2.8-01 fix: gate uses `!== undefined` rather than truthiness so that
    // sessionNumber === 0 (first session — clearSessionNumber starts at 0) does
    // NOT silently skip audit emit. AC1's "when both are set" intent includes 0.
    if (sessionId && sessionNumber !== undefined) {
        try {
            const auditLogger = new audit_log_1.AuditLogger(path.dirname(clearDir), sessionId, sessionNumber);
            const viaMode = via ?? 'direct_create';
            const auditMetadata = {
                trigger: viaMode,
                operation: 'create',
                type
            };
            if (viaMode === 'pattern_detected') {
                if (matchedPattern)
                    auditMetadata.pattern = matchedPattern;
                auditMetadata.suggestedType = type;
            }
            auditLogger.logUpdate('knowledge', 'create', newId, {
                targetDisplayId: newId,
                oldValue: null,
                newValue: { title, type, tags: tags ?? [] },
                trigger: 'user_prompt',
                metadata: auditMetadata
            });
        }
        catch (auditErr) {
            // Audit write failure is non-fatal — entry write already succeeded.
            process.stderr.write(`[CLEAR] Warning: failed to write create audit row for ${newId}: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}\n`);
        }
    }
}
/** @internal Exported for testing */
function createEntry(options) {
    const { clearDir, description, addRelatedFile, sessionId, sessionNumber, matchedPattern } = options;
    const validation = validateCreateInputs(options);
    if (!validation.ok)
        return validation.error;
    const { title, type } = validation; // narrowed: title:string, type:KnowledgeType
    const knowledgeDir = path.join(clearDir, 'knowledge', 'entries');
    if (!fs.existsSync(knowledgeDir)) {
        fs.mkdirSync(knowledgeDir, { recursive: true });
    }
    const newId = (0, parser_1.getNextId)(knowledgeDir, type);
    const accumulatorFiles = readRelatedFiles(clearDir);
    // WP-PS3 phase_b AC26-AC30 (POST-77, S177): merge explicit --add-related-file=
    // values into the changed-files accumulator before buildNewEntry. Pre-S177,
    // createEntry destructured everything EXCEPT addRelatedFile and discarded the
    // values silently. Validation helper enforces empty/traversal/exclusion guards
    // (AC27) and dedupes (AC30) per [[feedback_drift_proof_sourcing]].
    const mergeResult = validateAndMergeAddRelatedFiles(addRelatedFile, accumulatorFiles);
    if (!mergeResult.ok) {
        return {
            script: 'knowledge-capture',
            success: false,
            status: 'error',
            error: mergeResult.error
        };
    }
    const relatedFiles = mergeResult.merged;
    const entry = buildNewEntry(newId, options, relatedFiles);
    const filePath = path.join(knowledgeDir, `${newId}.md`);
    const content = (0, parser_1.generateKnowledgeMarkdown)(entry);
    try {
        fs.writeFileSync(filePath, content, 'utf-8');
        runCreateSideEffects(options, newId, type, title);
        // WP-PS7 phase_b AC14: sync additionalContext NO LONGER includes "(linked to Y)".
        // The suffix is added by createEntryWithAutoLink (the async wrapper) only when
        // all three link surfaces (DB + .md frontmatter + WP YAML knowledge) succeed.
        // Callers that need the auto-link path must use createEntryWithAutoLink.
        return {
            script: 'knowledge-capture',
            success: true,
            status: 'created',
            entryId: newId,
            filePath,
            additionalContext: `[CLEAR] Created ${newId}: ${title}`
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // K2.8 AC4: emit 'failure' row. original_text_hash sourced from `description`
        // (which knowledge-capture.sh populates from pending-capture.json's
        // original_text); empty hash if no description.
        appendCapturePatternLog(clearDir, makePatternLogRow({
            sessionId,
            sessionNumber,
            event: 'failure',
            pattern_description: matchedPattern ?? '',
            suggested_type: type,
            original_text_hash: description ? hashOriginalText(description) : '',
            reason: `createEntry failed: ${errorMessage}`
        }));
        return {
            script: 'knowledge-capture',
            success: false,
            status: 'error',
            error: errorMessage
        };
    }
}
/**
 * Async wrapper around createEntry that awaits the auto-link path when
 * --workpackage is provided. Gates the "(linked to Y)" success-message
 * suffix on all-three-surface success (DB + .md frontmatter + WP YAML)
 * per WP-PS7 phase_b AC14. This is the dispatcher-facing entry point;
 * createEntry remains the sync disk-write primitive for fixture/test use.
 *
 * Returns the same CreateOutput shape; additionalContext gains the
 * "(linked to ${workpackage})" suffix ONLY when linkResult.success &&
 * linkResult.mdWritten && linkResult.wpYamlWritten. On link failure,
 * the entry is still created (sync writes happened) but stderr surfaces
 * the failure and the suffix is omitted (honest reporting per
 * feedback_no_internal_jargon_user_facing).
 */
async function createEntryWithAutoLink(options) {
    const result = createEntry(options);
    if (result.script !== 'knowledge-capture' || result.status !== 'created' || !result.entryId) {
        return result;
    }
    const wp = options.workpackage;
    if (!wp || wp.trim().length === 0) {
        return result;
    }
    const resolvedSessionNumber = resolveSessionNumber(options);
    try {
        const linkResult = await (0, link_cli_1.runLinkCLI)(options.clearDir, result.entryId, wp, {
            sessionId: options.sessionId ?? `session-${resolvedSessionNumber}`,
            sessionNumber: resolvedSessionNumber,
        });
        if (linkResult.success && linkResult.mdWritten && linkResult.wpYamlWritten) {
            // All three surfaces succeeded — append honest suffix to additionalContext
            const prefix = result.additionalContext ?? `[CLEAR] Created ${result.entryId}`;
            return { ...result, additionalContext: `${prefix} (linked to ${wp})` };
        }
        if (!linkResult.success) {
            process.stderr.write(`[CLEAR] Auto-link to ${wp} failed: ${linkResult.output}\n`);
        }
        else {
            // Link succeeded in DB but one or more disk surfaces did not write
            // (e.g., .md absent for DB-only entries — AC16 migration territory)
            process.stderr.write(`[CLEAR] Auto-link to ${wp} partial (DB only; mdWritten=${linkResult.mdWritten ?? false}, wpYamlWritten=${linkResult.wpYamlWritten ?? false})\n`);
        }
        return result;
    }
    catch (err) {
        // SEC-S189-003 / TS-CAP-03 (S189 stop-hook CR): redact project-path prefix
        // before envelope-bound stderr emission. Same path-leak class as the POST-92
        // STD-01 fix applied to link-cli's rollback path. Construct rawMsg
        // defensively for non-Error throws (Promise reject with a string, etc.).
        const rawMsg = err instanceof Error ? err.message : String(err);
        const msg = (0, sanitize_path_1.redactProjectPath)(rawMsg, options.clearDir);
        process.stderr.write(`[CLEAR] Auto-link error: ${msg}\n`);
        return result;
    }
}
/** @internal Exported for testing */
function triggerIndexUpdate(clearDir, session, entryId) {
    const entriesDir = path.join(clearDir, 'knowledge', 'entries');
    // Attempt synchronous inline SQLite index rebuild
    let inlineSuccess = false;
    try {
        const db = new db_1.KnowledgeDatabase(clearDir);
        if (!db.initialize())
            throw new Error('Knowledge DB init failed');
        try {
            const result = (0, index_cli_1.incrementalUpdate)(db, entriesDir);
            inlineSuccess = result.success;
        }
        finally {
            db.close();
        }
    }
    catch {
        // Fall through to marker write
    }
    // Write marker only on failure — session-start recovery (K1.4) will drain it
    if (!inlineSuccess) {
        const statePath = path.join(clearDir, 'state', 'index-pending.json');
        const stateDir = path.dirname(statePath);
        if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
        }
        fs.writeFileSync(statePath, JSON.stringify({
            pending: true,
            triggered_at: new Date().toISOString(),
            session
        }));
    }
    // Update file-knowledge reverse index (non-blocking — index is secondary)
    if (entryId) {
        try {
            (0, file_index_1.updateIndex)(clearDir, entryId);
        }
        catch {
            // Index update failure does not block entry creation
        }
    }
}
// ==============================================================================
// Related Files (from changed-files accumulator)
// ==============================================================================
/**
 * Exclusion patterns for related_files.
 * Sync point: scripts/dispatchers/post-tool.sh line 57 (case statement).
 * Files matching these prefixes are filtered out to avoid indexing noise.
 */
const RELATED_FILES_EXCLUSIONS = [
    '.clear/state/',
    '.clear/audit/',
    'logs/',
    'tmp/',
    'sessions/',
    'node_modules/',
    '.claude/',
    '.git/',
    'build/',
    'docs/',
    'research/',
    'briefs/',
];
// ------------------------------------------------------------------------------
// Auto-link churn-file exclusions
// ------------------------------------------------------------------------------
// These apply ONLY to the auto-population path (readRelatedFiles, reading the
// session changed-files accumulator). The accumulator records EVERY file edited
// in a session with no per-entry attribution, so high-churn infrastructure files
// (manifests, lockfiles, CI/build config, top-level docs) would otherwise auto-
// link to every entry captured that session — eroding the signal value of the
// "linked entries may need review" prompt. The denylist spans major ecosystems
// (Node, Python, Go, Rust, JVM, Swift, Ruby, PHP, .NET, Elixir, Dart) so the
// auto-link surface stays meaningful regardless of the consumer's stack.
//
// The explicit `--add-related-file` path is intentionally NOT subject to these:
// if a user deliberately links a manifest (e.g. an entry ABOUT a dependency
// decision), that IS "a file the entry references" and is honored.
//
// Matched by BASENAME (any directory), so monorepo nested manifests are caught.
//
// FUTURE: this denylist + the post-tool.sh accumulator filter should be unified
// into a single shipped JSON read by both the TS CLI and the bash hook, removing
// the TS/bash duplication. Until then, this is the canonical auto-link denylist.
/** Exact-basename churn files excluded from auto-linking. */
const AUTO_LINK_EXCLUDED_FILENAMES = new Set([
    // VCS / editor / generic
    '.gitignore', '.gitattributes', '.gitmodules', '.editorconfig', '.dockerignore', '.env.example',
    // Node / JS / TS
    'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'npm-shrinkwrap.json',
    '.npmrc', '.nvmrc',
    // Python
    'Pipfile', 'Pipfile.lock', 'poetry.lock', 'pyproject.toml', 'setup.py', 'setup.cfg',
    'tox.ini', '.python-version', 'environment.yml',
    // Go
    'go.mod', 'go.sum',
    // Rust
    'Cargo.toml', 'Cargo.lock',
    // JVM (Kotlin / Java / Gradle / Maven)
    'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts',
    'gradle.properties', 'gradlew', 'gradlew.bat', 'pom.xml',
    // Swift / iOS
    'Package.swift', 'Package.resolved', 'Podfile', 'Podfile.lock',
    // Ruby
    'Gemfile', 'Gemfile.lock', '.ruby-version',
    // PHP
    'composer.json', 'composer.lock',
    // .NET
    'packages.config', 'nuget.config',
    // Elixir
    'mix.exs', 'mix.lock',
    // Dart / Flutter
    'pubspec.yaml', 'pubspec.lock',
    // Build / CI
    'Makefile', 'makefile', 'GNUmakefile', 'Justfile', 'justfile', 'CMakeLists.txt',
    'Dockerfile', '.gitlab-ci.yml', '.travis.yml', 'Jenkinsfile', 'azure-pipelines.yml',
    // Docs (non-wildcarded)
    'AUTHORS', 'NOTICE',
]);
/**
 * Basename regex patterns for churn-file families (tsconfig*.json, *.csproj, …).
 * Must be non-global: each is reused across calls via `.some(re => re.test(...))`,
 * and a `/g` flag would carry `lastIndex` between calls and mis-match.
 */
const AUTO_LINK_EXCLUDED_PATTERNS = [
    /^tsconfig.*\.json$/, // tsconfig.json, tsconfig.build.json
    /^\.eslintrc.*$/, /^eslint\.config\..*$/, // eslint variants
    /^\.prettierrc.*$/, /^prettier\.config\..*$/, // prettier variants
    /^\.babelrc.*$/, // babel variants
    /^requirements.*\.txt$/, // requirements.txt, requirements-dev.txt
    /\.podspec$/, /\.csproj$/, /\.fsproj$/, /\.sln$/, // Swift/.NET project files
    /^docker-compose\.ya?ml$/, // docker-compose.yml / .yaml
    /^README.*$/, /^CHANGELOG.*$/, /^LICEN[CS]E.*$/, // top-level docs (any extension)
    /^CONTRIBUTING.*$/, /^CODE_OF_CONDUCT.*$/,
];
/** Directory-prefix exclusions for generated / dependency / IDE dirs. */
const AUTO_LINK_EXCLUDED_DIR_PREFIXES = [
    'vendor/', 'target/', 'dist/', 'out/',
    '.venv/', 'venv/', '__pycache__/', '.tox/',
    '.gradle/', '.dart_tool/', 'Pods/',
    '.idea/', '.vscode/', '.github/',
];
/**
 * True if a repo-relative path is an auto-link-excluded churn file.
 * Checks directory prefix, then exact basename, then basename regex patterns.
 * Auto-path only — the explicit `--add-related-file` path does NOT use this.
 *
 * Expects a NORMALIZED repo-relative path (no leading `./`, not absolute): the
 * sole caller strips `./` and drops absolute/traversal paths first, so the
 * dir-prefix `startsWith` check is reliable.
 *
 * @internal Exported for testing
 */
function isAutoLinkExcludedChurnFile(relPath) {
    if (AUTO_LINK_EXCLUDED_DIR_PREFIXES.some(prefix => relPath.startsWith(prefix))) {
        return true;
    }
    const base = path.basename(relPath);
    if (AUTO_LINK_EXCLUDED_FILENAMES.has(base)) {
        return true;
    }
    return AUTO_LINK_EXCLUDED_PATTERNS.some(re => re.test(base));
}
/**
 * Validate + dedupe-merge an `--add-related-file=` array against an existing
 * related_files list. Mirrors the inline validation in updateEntry (capture-cli.ts:1454)
 * but extracted so createEntry and updateEntry share one canonical source per
 * [[feedback_drift_proof_sourcing]] — see WP-PS3 phase_b AC27 (POST-77).
 *
 * Per-path checks (in order): empty-string reject, ./ prefix normalize,
 * absolute-or-traversal reject, RELATED_FILES_EXCLUSIONS prefix reject,
 * dedupe-append against existing.
 *
 * NOTE (S177): updateEntry's inline copy at capture-cli.ts:1454 is NOT yet
 * migrated to this helper to keep WP-PS3 phase_b scope tight; tracked as
 * follow-up. The two implementations MUST stay byte-equivalent until the
 * migration; any change here MUST be mirrored there until then.
 *
 * @internal Exported for testing
 */
function validateAndMergeAddRelatedFiles(addRelatedFile, existing) {
    const merged = [...existing];
    if (addRelatedFile === undefined || addRelatedFile.length === 0) {
        return { ok: true, merged };
    }
    for (const rawPath of addRelatedFile) {
        if (rawPath.length === 0) {
            return {
                ok: false,
                error: 'Invalid related file path: empty string. Path must be a non-empty relative path.'
            };
        }
        const normalizedPath = rawPath.startsWith('./') ? rawPath.slice(2) : rawPath;
        if (path.isAbsolute(normalizedPath) || normalizedPath.includes('..')) {
            return {
                ok: false,
                error: `Invalid related file path: '${rawPath}'. Must be a relative path without traversal.`
            };
        }
        const matchedExclusion = RELATED_FILES_EXCLUSIONS.find(excl => normalizedPath.startsWith(excl));
        if (matchedExclusion) {
            return {
                ok: false,
                error: `Excluded path: '${rawPath}'. Path matches the excluded prefix '${matchedExclusion}' and is not eligible for related_files. Link the source code or config files the knowledge entry is about instead.`
            };
        }
        if (!merged.includes(normalizedPath)) {
            merged.push(normalizedPath);
        }
    }
    return { ok: true, merged };
}
/**
 * Read the changed-files accumulator and return filtered file paths.
 * Returns empty array if accumulator is missing or malformed (CS3: no error).
 *
 * @internal Exported for testing
 */
function readRelatedFiles(clearDir) {
    const accumulatorPath = path.join(clearDir, 'state', 'changed-files.json');
    if (!fs.existsSync(accumulatorPath)) {
        return [];
    }
    try {
        const content = fs.readFileSync(accumulatorPath, 'utf-8');
        const accumulator = JSON.parse(content);
        if (!Array.isArray(accumulator.files)) {
            return [];
        }
        const MAX_RELATED_FILES = 50;
        return accumulator.files
            .map(f => (typeof f.path === 'string' ? f.path : ''))
            .filter(p => p.length > 0)
            .map(p => p.startsWith('./') ? p.slice(2) : p) // normalize ./ prefix
            // WP-DF2 AC5 (S165): defense-in-depth — drop absolute paths. Auto-link
            // related_files must be repo-relative. post-tool.sh now rejects out-of-CWD
            // writes at hook time, but legacy changed-files.json data + any path that
            // slipped past the upstream filter is dropped here. The RELATED_FILES_EXCLUSIONS
            // check below uses .startsWith() which only matches relative prefixes, so
            // absolute paths would otherwise bypass it entirely.
            .filter(p => !path.isAbsolute(p))
            // Defense-in-depth: reject path traversal. The explicit --add-related-file
            // path rejects '..' in validateAndMergeAddRelatedFiles; the auto path must
            // match so a traversal string from the accumulator never lands in related_files.
            .filter(p => !p.includes('..'))
            .filter(p => !RELATED_FILES_EXCLUSIONS.some(excl => p.startsWith(excl)))
            // Drop language-agnostic churn files (manifests, lockfiles, CI/build config,
            // top-level docs) that have no per-entry semantic value. Auto-path only —
            // explicit --add-related-file links are honored (see helper doc).
            .filter(p => !isAutoLinkExcludedChurnFile(p))
            .filter((p, i, arr) => arr.indexOf(p) === i) // dedup
            .slice(0, MAX_RELATED_FILES);
    }
    catch {
        return [];
    }
}
// ==============================================================================
// Check State Mode
// ==============================================================================
/** @internal Exported for testing */
function checkState(options) {
    const state = loadPendingState(options.clearDir);
    if (!state) {
        return {
            script: 'knowledge-capture',
            hasPending: false
        };
    }
    if (isStateExpired(state, options.clearDir)) {
        clearPendingState(options.clearDir);
        return {
            script: 'knowledge-capture',
            hasPending: false
        };
    }
    return {
        script: 'knowledge-capture',
        hasPending: true,
        state
    };
}
// ==============================================================================
// Update Mode
// ==============================================================================
/**
 * K3.5: fields belonging exclusively to a category-specific frontmatter set.
 * Used by type-change to strip stale fields from the OLD type when transitioning
 * to a different type. Listed once so adding a new K3+ type only requires
 * extending this map (drift-proof per `feedback_drift_proof_sourcing.md`).
 *
 * Types not present in the map (TD/BR/PAT/LES) have no exclusive fields.
 */
const TYPE_EXCLUSIVE_FRONTMATTER_FIELDS = {
    'institutional-wiki': ['source', 'source_updated', 'scope'],
    'process': ['trigger_event', 'frequency', 'tools', 'automation_hook', 'promotion_status'],
    'stakeholder': ['entity_type', 'role', 'owns', 'contact'],
};
/** @internal Exported for testing */
async function updateEntry(options) {
    const { clearDir, id, type: newType, tags, description, addRelatedFile, removeRelatedFile, session, sessionId, sessionNumber } = options;
    if (!id) {
        return {
            script: 'knowledge-capture',
            success: false,
            status: 'error',
            error: 'Entry ID is required for update. Usage: --update --id=<id>'
        };
    }
    // F-002: Validate ID format to prevent path traversal. LINT-K3.5-03:
    // example list sourced from `formatValidIdExamples()` (drift-proof shared
    // helper).
    if (!(0, parser_1.isValidId)(id)) {
        return {
            script: 'knowledge-capture',
            success: false,
            status: 'error',
            error: `Invalid entry ID format: '${id}'. Expected format: ${(0, types_1.formatValidIdExamples)()}`
        };
    }
    // Locate the entry file
    const knowledgeDir = path.join(clearDir, 'knowledge', 'entries');
    const entryPath = path.join(knowledgeDir, `${id}.md`);
    if (!fs.existsSync(entryPath)) {
        return {
            script: 'knowledge-capture',
            success: false,
            status: 'error',
            error: `Entry not found: ${id}`
        };
    }
    // K3.5: type-change branch dispatches when --type is supplied in update mode.
    // Type-change is "supersede + create" semantics (Option B per S156 disposition):
    // old entry kept on disk, marked superseded; new entry created at NEW-NNN.md
    // with copied body + transformed frontmatter; supersedes/superseded_by refs
    // cascaded across third-party entries. Async because performSupersession is
    // the canonical primitive for cross-domain supersession side effects.
    if (newType !== undefined) {
        return performTypeChange(options, knowledgeDir, entryPath);
    }
    // TS-K3.4-05 (S155): type updates directly as Partial<KnowledgeEntryFrontmatter>
    // so unknown keys would error at compile time rather than passing through the
    // intermediate Record<string, unknown> erasure that the cast at write-time
    // hid. The cast at updateKnowledgeFile call is now redundant.
    const updates = {};
    const fieldsUpdated = [];
    if (tags !== undefined) {
        updates.tags = tags;
        fieldsUpdated.push('tags');
    }
    if (description !== undefined) {
        updates.description = description;
        fieldsUpdated.push('description');
    }
    // Handle --add-related-file and --remove-related-file (WP-PS3 AC1-AC8, S176).
    // ADD then REMOVE order per AC2 — so `--add-related-file=X --remove-related-file=X`
    // in one invocation yields X NOT in the final list (AC7).
    //
    // Validation is mirrored across both flags: empty-string rejected (AC5 mirrors
    // S165 add-side CR-2), absolute/traversal rejected (AC8 mirrors F-001), and
    // for ADD the exclusion-prefix guard fires (excluded paths are not ELIGIBLE
    // to be in related_files in the first place — so we don't need a symmetric
    // guard for REMOVE; REMOVE on an excluded path that's somehow present is
    // still a valid cleanup operation per AC4 idempotent-no-op semantics).
    //
    // Fail-fast on first invalid path so partial state is not written (matches
    // pre-PS3 single-value contract).
    const hasAdd = addRelatedFile !== undefined && addRelatedFile.length > 0;
    const hasRemove = removeRelatedFile !== undefined && removeRelatedFile.length > 0;
    if (hasAdd || hasRemove) {
        const content = fs.readFileSync(entryPath, 'utf-8');
        const parsed = (0, parser_1.parseFrontmatter)(content);
        // F-004: Guard against non-array related_files from hand-edited files
        const rawRelated = parsed?.frontmatter?.related_files;
        const accumulatedFiles = Array.isArray(rawRelated) ? [...rawRelated] : [];
        // Snapshot for net-change detection (AC6: empty array preserved on full
        // removal; AC7: add+remove of same path is a net no-op and skips emit).
        const initialSnapshot = [...accumulatedFiles];
        // Inline narrowing (S176 CR fix-batch F-TYPE-1 + F-LINT-4 cross-role
        // duplicate per [[feedback_cross_role_duplicate_high_confidence]]): the
        // derived `hasAdd` boolean does NOT propagate type narrowing to TS,
        // forcing an `as string[]` cast. Repeating the `!== undefined && length`
        // check inline lets TS narrow `addRelatedFile` to `string[]` for the
        // for-of, eliminating the unsafe cast. `hasAdd` is retained for the
        // outer compound guard + the `anyFlagSpecified` intent check below.
        if (addRelatedFile !== undefined && addRelatedFile.length > 0) {
            for (const rawPath of addRelatedFile) {
                // S165 fix-batch CR-2 (Sec CR-S165-005 + TS LOW-04/05 cross-role dup): reject
                // empty-string path up front. Empty string passes the traversal + exclusion
                // guards below (no '..', not absolute, no matching exclusion prefix) and would
                // be stored as an empty entry in related_files.
                if (rawPath.length === 0) {
                    return {
                        script: 'knowledge-capture',
                        success: false,
                        status: 'error',
                        error: 'Invalid related file path: empty string. Path must be a non-empty relative path.'
                    };
                }
                // F-001: Sanitize path — reject absolute paths and apply exclusion filters
                const normalizedPath = rawPath.startsWith('./') ? rawPath.slice(2) : rawPath;
                if (path.isAbsolute(normalizedPath) || normalizedPath.includes('..')) {
                    return {
                        script: 'knowledge-capture',
                        success: false,
                        status: 'error',
                        error: `Invalid related file path: '${rawPath}'. Must be a relative path without traversal.`
                    };
                }
                if (RELATED_FILES_EXCLUSIONS.some(excl => normalizedPath.startsWith(excl))) {
                    // S165 fix-batch FX-10: error message format consistency with the traversal
                    // error above (single-quoted path, terse rationale, no verbose prefix dump).
                    return {
                        script: 'knowledge-capture',
                        success: false,
                        status: 'error',
                        error: `Excluded path: '${rawPath}'. Path matches a known exclusion prefix (state/audit/logs/sessions/build/etc.); not eligible for related_files.`
                    };
                }
                if (!accumulatedFiles.includes(normalizedPath)) {
                    accumulatedFiles.push(normalizedPath);
                }
            }
        }
        // Inline narrowing — same rationale as the add block above.
        if (removeRelatedFile !== undefined && removeRelatedFile.length > 0) {
            for (const rawPath of removeRelatedFile) {
                // AC5: mirror add-side empty-string rejection.
                if (rawPath.length === 0) {
                    return {
                        script: 'knowledge-capture',
                        success: false,
                        status: 'error',
                        error: 'Invalid related file path: empty string. Path must be a non-empty relative path.'
                    };
                }
                // AC8: mirror add-side traversal/absolute rejection.
                const normalizedPath = rawPath.startsWith('./') ? rawPath.slice(2) : rawPath;
                if (path.isAbsolute(normalizedPath) || normalizedPath.includes('..')) {
                    return {
                        script: 'knowledge-capture',
                        success: false,
                        status: 'error',
                        error: `Invalid related file path: '${rawPath}'. Must be a relative path without traversal.`
                    };
                }
                // AC4: removing a path not in the list is a silent no-op — indexOf
                // returns -1, the splice is skipped, no other state changes. Other
                // paths and the reverse index remain untouched.
                const idx = accumulatedFiles.indexOf(normalizedPath);
                if (idx !== -1) {
                    accumulatedFiles.splice(idx, 1);
                }
            }
        }
        // AC6: emit if the array changed in content OR length — preserves the
        // empty-array shape when the last file is removed, and skips emit when
        // ADD+REMOVE of the same path cancel out (AC7 net no-op).
        const changed = accumulatedFiles.length !== initialSnapshot.length ||
            accumulatedFiles.some((f, i) => f !== initialSnapshot[i]);
        if (changed) {
            updates.related_files = accumulatedFiles;
            fieldsUpdated.push('related_files');
        }
    }
    // "No update fields specified" gates on INTENT (any update flag specified),
    // not on whether the operation produced a net change. WP-PS3 AC4 + AC7 both
    // require silent success on net no-op (--remove-related-file=<non-present>;
    // --add=X --remove=X). The downstream write + index + audit block below
    // skips entirely on net no-op so file state and audit trail are unchanged.
    const anyFlagSpecified = tags !== undefined ||
        description !== undefined ||
        hasAdd ||
        hasRemove;
    if (!anyFlagSpecified) {
        return {
            script: 'knowledge-capture',
            success: false,
            status: 'error',
            error: 'No update fields specified. Use --tags, --description, --add-related-file, or --remove-related-file.'
        };
    }
    // AC4 + AC7: net no-op silent success. User intent was clear (anyFlagSpecified
    // gate above passed) but the requested change resolves to zero — skip the
    // write/index/audit chain and return success with empty fieldsUpdated. The
    // entry file is byte-identical to its pre-call state; the reverse index is
    // untouched (no spurious empty key creation); no audit-log churn from probe
    // operations.
    if (fieldsUpdated.length === 0) {
        return {
            script: 'knowledge-capture',
            success: true,
            status: 'updated',
            entryId: id,
            fieldsUpdated: []
        };
    }
    // Apply the update via parser
    const success = (0, parser_1.updateKnowledgeFile)(entryPath, updates);
    if (!success) {
        return {
            script: 'knowledge-capture',
            success: false,
            status: 'error',
            error: `Failed to update entry: ${id}`
        };
    }
    // Refresh file-knowledge-index if related_files changed
    if (fieldsUpdated.includes('related_files')) {
        try {
            (0, file_index_1.updateIndex)(clearDir, id);
        }
        catch {
            // Index update failure does not block entry update
        }
    }
    // Trigger SQLite incremental rebuild — prefer canonical sessionNumber from
    // router-mediated invocations; fall back to legacy `session` for direct CLI
    // callers (--session=<n> on capture/create paths still uses this field).
    triggerIndexUpdate(clearDir, sessionNumber ?? session ?? 0, id);
    // K2.7 P5 (AC17): drain from pending-reviews.json — updating a flagged entry
    // constitutes the review action, so any carry-over surface is stale. No-op if
    // the entry is not in the queue.
    try {
        (0, pending_reviews_1.drainPendingReview)(clearDir, id);
    }
    catch (drainError) {
        process.stderr.write(`[CLEAR] Warning: failed to drain ${id} from pending-reviews: ${drainError instanceof Error ? drainError.message : String(drainError)}\n`);
    }
    // Audit log gates on BOTH sessionId and sessionNumber being set, mirroring
    // delete-cli.ts:174 — keeps the legacy --session=<n> single-arg path silent
    // (no audit log) while the canonical --session-id + --session-number pair
    // from the router emits an entry. This makes the five knowledge router
    // handlers (delete/deprecate/supersede/dismiss/update) write audit log
    // entries consistently.
    // TS-K2.8-01 fix: `sessionNumber !== undefined` rather than truthiness so
    // session 0 (first session — clearSessionNumber starts at 0) does NOT
    // silently skip emit. Same fix applied at the K2.8 createEntry site above.
    if (sessionId && sessionNumber !== undefined) {
        const auditLogger = new audit_log_1.AuditLogger(path.dirname(clearDir), sessionId, sessionNumber);
        auditLogger.logUpdate('knowledge', 'update', id, {
            targetDisplayId: id,
            oldValue: null,
            newValue: { fieldsUpdated },
            trigger: 'user_prompt',
            metadata: {
                operation: 'update',
                fieldsUpdated
            }
        });
    }
    // Intrinsic sync-state propagation (same rationale as the create path): a
    // field update touches the entry, so reflect it in recentEntries from the CLI
    // itself. Reached only when an actual field changed — the net no-op paths
    // return above — so a probe update never churns recentEntries. Idempotent
    // dedup-by-id.
    (0, knowledge_linker_1.propagateKnowledgeCapture)(path.dirname(clearDir), id);
    return {
        script: 'knowledge-capture',
        success: true,
        status: 'updated',
        entryId: id,
        fieldsUpdated
    };
}
/**
 * Run all validation guards for a type-change request and parse the old entry.
 * Returns either the parsed inputs needed by the orchestrator or a ready-to-return
 * error envelope (CS3 fail-fast).
 *
 * Guards: required newType + oldId, parseable old frontmatter, same-type rejection,
 * lifecycle (superseded/deprecated) rejection, SH cross-context entity_type gate.
 */
function validateTypeChangeInputs(options, oldEntryPath) {
    const { id: oldId, type: newType, entity_type, session, sessionNumber } = options;
    if (!newType) {
        // Unreachable — caller (updateEntry) gates on `newType !== undefined`.
        return {
            ok: false,
            error: {
                script: 'knowledge-capture',
                success: false,
                status: 'error',
                error: 'performTypeChange invoked without --type — internal error.'
            }
        };
    }
    if (!oldId) {
        return {
            ok: false,
            error: {
                script: 'knowledge-capture',
                success: false,
                status: 'error',
                error: 'performTypeChange invoked without --id — internal error.'
            }
        };
    }
    const oldContent = fs.readFileSync(oldEntryPath, 'utf-8');
    const oldParsed = (0, parser_1.parseFrontmatter)(oldContent);
    if (!oldParsed) {
        return {
            ok: false,
            error: {
                script: 'knowledge-capture',
                success: false,
                status: 'error',
                error: `Failed to parse entry ${oldId} — frontmatter missing or invalid.`
            }
        };
    }
    const oldFrontmatter = oldParsed.frontmatter;
    const oldType = oldFrontmatter.type;
    // Same-type guard — type-change to current type is a no-op error rather
    // than a silent success (CS3 fail-fast).
    if (oldType === newType) {
        return {
            ok: false,
            error: {
                script: 'knowledge-capture',
                success: false,
                status: 'error',
                error: `Entry ${oldId} is already type '${newType}'. No type change needed.`
            }
        };
    }
    // Lifecycle guard — type-changing a superseded/deprecated entry would
    // muddle the supersession chain. Block at boundary; user should type-change
    // the active replacement entry instead.
    if (oldFrontmatter.status === 'superseded') {
        return {
            ok: false,
            error: {
                script: 'knowledge-capture',
                success: false,
                status: 'error',
                error: `Entry ${oldId} is already superseded (by ${oldFrontmatter.superseded_by ?? 'unknown'}). Type-change is not permitted on superseded entries.`
            }
        };
    }
    if (oldFrontmatter.status === 'deprecated') {
        return {
            ok: false,
            error: {
                script: 'knowledge-capture',
                success: false,
                status: 'error',
                error: `Entry ${oldId} is deprecated. Type-change is not permitted on deprecated entries.`
            }
        };
    }
    // SH cross-context required-field gate (mirrors createEntry — entity_type
    // is required at the createEntry boundary for SH; type-changing TO SH is a
    // logical create of an SH entry, so the same gate applies).
    if (newType === 'stakeholder' && !entity_type) {
        return {
            ok: false,
            error: {
                script: 'knowledge-capture',
                success: false,
                status: 'error',
                error: "entity_type is required when changing type to stakeholder. Pass --entity-type=<person|team|role|vendor|system|...>."
            }
        };
    }
    // LINT-K3.5-06: resolve the session-number fallback once rather than
    // re-computing `sessionNumber ?? session ?? 0` at five sites downstream.
    const resolvedSession = sessionNumber ?? session ?? 0;
    return {
        ok: true,
        oldFrontmatter,
        oldType,
        oldBody: oldParsed.body,
        newType,
        oldId,
        resolvedSession
    };
}
/**
 * Build the new frontmatter for a type-change: start from old, set core fields,
 * strip OLD type's exclusive fields, apply NEW type-specific fields if user
 * passed flags.
 *
 * Pure — deterministic given inputs; no I/O.
 *
 * TS-K3.5-01 / STD-K3.5-CS2-01 (cross-role HIGH-CONFIDENCE): the
 * Partial<KnowledgeEntryFrontmatter> type rather than Record<string, unknown>
 * gives each assignment compile-time field-type checking.
 */
function buildNewFrontmatter(oldFrontmatter, oldType, newType, newId, oldId, resolvedSession, options) {
    const { source, source_updated, scope, trigger_event, frequency, tools, automation_hook, entity_type, role, owns, contact } = options;
    const newFrontmatter = { ...oldFrontmatter };
    newFrontmatter.id = newId;
    newFrontmatter.type = newType;
    newFrontmatter.status = 'active';
    newFrontmatter.supersedes = oldId;
    newFrontmatter.superseded_by = null;
    const nowIso = new Date().toISOString();
    newFrontmatter.created = nowIso;
    newFrontmatter.created_session = resolvedSession;
    newFrontmatter.modified = nowIso;
    newFrontmatter.schema_version = db_1.SCHEMA_VERSION;
    // supersession_reviewed only meaningful on entries that have been reviewed
    // post-supersession (set by dismiss-cli). New entry starts fresh.
    delete newFrontmatter.supersession_reviewed;
    // surfaced_count is a per-entry observability counter; reset on type-change
    // since the new ID is a different surfacing target.
    delete newFrontmatter.surfaced_count;
    // Strip type-exclusive fields belonging to OLD type — they're not meaningful
    // on the new entry's type.
    const stripFields = TYPE_EXCLUSIVE_FRONTMATTER_FIELDS[oldType] ?? [];
    for (const field of stripFields) {
        delete newFrontmatter[field];
    }
    // Apply NEW type-specific fields if user passed flags. Mirrors createEntry's
    // type-gated frontmatter passthrough.
    if (newType === 'institutional-wiki') {
        if (source !== undefined)
            newFrontmatter.source = source;
        if (source_updated !== undefined)
            newFrontmatter.source_updated = source_updated;
        if (scope !== undefined)
            newFrontmatter.scope = scope;
    }
    if (newType === 'process') {
        if (trigger_event !== undefined)
            newFrontmatter.trigger_event = trigger_event;
        if (frequency !== undefined)
            newFrontmatter.frequency = frequency;
        if (tools !== undefined)
            newFrontmatter.tools = tools;
        if (automation_hook !== undefined)
            newFrontmatter.automation_hook = automation_hook;
        // promotion_status is K4.5-managed; not user-settable. Left unset (null).
    }
    if (newType === 'stakeholder') {
        newFrontmatter.entity_type = entity_type; // guaranteed present per gate
        if (role !== undefined)
            newFrontmatter.role = role;
        if (owns !== undefined && owns.length > 0)
            newFrontmatter.owns = owns;
        if (contact !== undefined)
            newFrontmatter.contact = contact;
    }
    return newFrontmatter;
}
/**
 * Serialize new frontmatter + copied body to disk. Returns ok or a ready-to-
 * return error envelope.
 *
 * yaml.dump options mirror updateKnowledgeFile (parser.ts:520) for round-trip
 * fidelity.
 */
function writeNewEntry(newFilePath, newFrontmatter, oldBody, newId) {
    const frontmatterStr = yaml.dump(newFrontmatter, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false
    }).trim();
    const newContent = `---\n${frontmatterStr}\n---\n\n${oldBody}`;
    try {
        fs.writeFileSync(newFilePath, newContent, 'utf-8');
        return { ok: true };
    }
    catch (writeError) {
        const msg = writeError instanceof Error ? writeError.message : String(writeError);
        return {
            ok: false,
            error: {
                script: 'knowledge-capture',
                success: false,
                status: 'error',
                error: `Failed to write new entry ${newId}: ${msg}`
            }
        };
    }
}
/**
 * Walk the cascade — rewrite supersedes/superseded_by refs in third-party
 * entries, sync each cascaded entry's SQLite row, then refresh the
 * file-knowledge-index for the new entry.
 *
 * Returns the list of cascaded third-party entry IDs.
 *
 * Ordering note: file-index refresh runs AFTER per-id triggerIndexUpdate to
 * preserve the S156 monolith's behavior (see STD-K3.5-CS2-02). cascadeIdRewrite
 * itself scans frontmatter only; the per-id triggerIndexUpdate calls sync DB
 * rows. updateFileIndex failure is non-fatal.
 */
function cascadeAndSync(clearDir, knowledgeDir, oldId, newId, resolvedSession) {
    const cascadedRefs = (0, parser_1.cascadeIdRewrite)(knowledgeDir, oldId, newId);
    for (const cid of cascadedRefs) {
        triggerIndexUpdate(clearDir, resolvedSession, cid);
    }
    try {
        (0, file_index_1.updateIndex)(clearDir, newId);
    }
    catch {
        // Non-blocking — index failure does not unwind the type-change.
    }
    return cascadedRefs;
}
/**
 * Emit the type-change audit row when canonical session context is present.
 *
 * STD-K3.5-CS2-03: action='update' (NOT 'supersede') disambiguates from
 * performSupersession's internal `'supersede'` row at deprecation.ts:870-886.
 * Two complementary audit rows result per type-change: (1) `'supersede'` from
 * performSupersession with metadata.event='unified_supersession'; (2) `'update'`
 * from this helper with metadata.operation=TYPE_CHANGE_ACTION. Queries filtering
 * on either action surface type-changes; metadata.operation pins down the exact
 * semantic.
 *
 * Audit write failure is non-fatal — type-change side effects already landed.
 */
function emitTypeChangeAuditLog(clearDir, sessionId, sessionNumber, oldId, newId, oldType, newType, cascadedRefs) {
    if (!sessionId || sessionNumber === undefined)
        return;
    try {
        const auditLogger = new audit_log_1.AuditLogger(path.dirname(clearDir), sessionId, sessionNumber);
        auditLogger.logUpdate('knowledge', 'update', oldId, {
            targetDisplayId: oldId,
            oldValue: { type: oldType, id: oldId },
            newValue: { type: newType, id: newId },
            trigger: 'user_prompt',
            metadata: {
                operation: TYPE_CHANGE_ACTION,
                oldId,
                newId,
                cascadedRefs
            }
        });
    }
    catch (auditErr) {
        const msg = auditErr instanceof Error ? auditErr.message : String(auditErr);
        process.stderr.write(`[CLEAR] Warning: failed to write type-change audit row for ${oldId}->${newId}: ${msg}\n`);
    }
}
/**
 * K3.5 type-change orchestrator — atomic supersede + create with cascaded
 * reference rewriting. Routed from updateEntry when --type is supplied in
 * update mode (per AC1: same call shape as field-update; --type presence is
 * the discriminator).
 *
 * STD-K3.5-CS2-02 ordering invariant (6-step flow per WP-K4-prep decomposition):
 *   1. validate+parse:  validateTypeChangeInputs (guards + parse old entry)
 *   2. build+write:     buildNewFrontmatter + writeNewEntry
 *   3. index-new:       triggerIndexUpdate (sync new file → SQLite)
 *   4. supersede-old:   performSupersession (atomic DB + frontmatter + sync-state)
 *   5. cascade+sync:    cascadeAndSync (rewrite third-party refs + index cascaded + refresh file-index)
 *   6. audit:           emitTypeChangeAuditLog (action='update' + metadata.operation='type-change')
 *
 * Why this order is load-bearing:
 *   - The supersession primitive updates DB rows for OLD only; if the new entry's
 *     row didn't exist yet (step 3), any sync-state link migration in step 4
 *     would fail.
 *   - The cascade walk (step 5) reads entries from disk and rewrites
 *     supersedes/superseded_by — independent of DB rows but must run AFTER the
 *     new file is on disk so its (rewritten) refs are visible.
 *   - Index calls sync SQLite to disk; an out-of-order rebuild would race with
 *     supersession's DB writes.
 *
 * Error handling: fail-fast at validation. Mid-operation failures (e.g.,
 * performSupersession partial result) are surfaced to the caller; partial
 * state may persist (new file written, old not yet superseded). Documented
 * as a known limitation; rollback is post-v1 hardening scope.
 */
async function performTypeChange(options, knowledgeDir, oldEntryPath) {
    const validation = validateTypeChangeInputs(options, oldEntryPath);
    if (!validation.ok)
        return validation.error;
    const { oldFrontmatter, oldType, oldBody, newType, oldId, resolvedSession } = validation;
    const newId = (0, parser_1.getNextId)(knowledgeDir, newType);
    const newFilePath = path.join(knowledgeDir, `${newId}.md`);
    const newFrontmatter = buildNewFrontmatter(oldFrontmatter, oldType, newType, newId, oldId, resolvedSession, options);
    const writeResult = writeNewEntry(newFilePath, newFrontmatter, oldBody, newId);
    if (!writeResult.ok)
        return writeResult.error;
    // Step 2: sync new entry to SQLite.
    triggerIndexUpdate(options.clearDir, resolvedSession, newId);
    // Step 3: mark old entry superseded — atomic DB + frontmatter + sync-state.
    // Awaiting (vs. createEntry's fire-and-forget) is essential: tests + the
    // cascade walk that follows depend on the supersession landing.
    const basePath = path.dirname(options.clearDir);
    const supersessionResult = await (0, deprecation_1.performSupersession)(basePath, oldId, newId, {
        sessionId: options.sessionId ?? `session-${resolvedSession}`,
        sessionNumber: resolvedSession,
        migrateLinks: true
    });
    if (supersessionResult.status === 'error') {
        return {
            script: 'knowledge-capture',
            success: false,
            status: 'error',
            error: `Type-change supersession failed: ${supersessionResult.error ?? 'unknown error'}. Partial state: new entry ${newId} written but old entry ${oldId} not marked superseded.`
        };
    }
    // Steps 4 + 5 + file-index refresh.
    const cascadedRefs = cascadeAndSync(options.clearDir, knowledgeDir, oldId, newId, resolvedSession);
    // Step 6: audit emit.
    emitTypeChangeAuditLog(options.clearDir, options.sessionId, options.sessionNumber, oldId, newId, oldType, newType, cascadedRefs);
    return {
        script: 'knowledge-capture',
        success: true,
        status: 'updated',
        oldId,
        newId,
        action: TYPE_CHANGE_ACTION,
        cascadedRefs
    };
}
// ==============================================================================
// Main Execution
// ==============================================================================
// Guard: only execute CLI when run directly (not when imported for testing)
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        const validTypes = Object.keys(types_1.KNOWLEDGE_TYPE_PREFIXES);
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: capture-cli.js <mode> [options]',
                '',
                'Modes:',
                '  --detect                     Detect capture-worthy content in text',
                '  --confirm                    Process user confirmation of pending capture',
                '  --create                     Create a new knowledge entry directly',
                '  --check-state                Check for pending capture state',
                '  --update                     Update an existing knowledge entry (or, with --type, change its type)',
                '',
                'Update mode:',
                '  Field updates: --update --id=<id> --tags=... | --description=... | --add-related-file=... | --remove-related-file=...',
                '  Type change:   --update --id=<id> --type=<new-type>  (K3.5: deprecates old, creates new ID, cascades refs)',
                '',
                'Options:',
                '  --clear-dir=<path>           Path to .clear directory (default: .clear)',
                '  --text=<text>                Text to analyze (detect mode)',
                '  --response=<yes|no|edit>     User response (confirm mode)',
                '  --title=<string>             Entry title (create mode) OR --title-file=<path>',
                `  --type=<type>                Entry type: ${validTypes.join(' | ')}`,
                '  --tags=<comma-separated>     Tags for the entry OR --tags-file=<path> (comma-separated content)',
                '  --description=<string>       Entry description OR --description-file=<path>',
                '  --slug=<kebab-case-slug>     Explicit slug for [[slug]] cross-references in entry descriptions (lowercase kebab-case). When omitted, an auto-derived slug from the title is used (collision suffix added if needed).',
                '  --supersedes=<id>            ID of entry this supersedes OR --supersedes-file=<path>',
                '  --session=<number>           Current session number',
                '  --id=<id>                    Entry ID (update mode)',
                '  --add-related-file=<path>    Add file to related_files (update mode; REPEATABLE: pass multiple --add-related-file= flags in one invocation to add several files at once)',
                '  --remove-related-file=<path> Remove file from related_files (update mode; REPEATABLE; idempotent no-op if path is not present; when combined with --add-related-file=<same-path> the REMOVE wins per add-then-remove order)',
                '  --workpackage=<id>           Auto-link to workpackage after create',
                '  --source=<string>            External source (institutional-wiki only)',
                '  --source-updated=<date>      Source last-updated date (institutional-wiki only)',
                '  --scope=<string>             Scope statement (institutional-wiki only)',
                '  --trigger-event=<string>     Triggering event, e.g., "session-start" (process only)',
                '  --frequency=<string>         Execution cadence, e.g., "weekly" or "on-demand" (process only)',
                '  --tools=<string>             Tools/commands used, e.g., "just, jq" (process only)',
                '  --automation-hook=<string>   Automation reference, e.g., script path (process only)',
                '  --entity-type=<string>       Required for stakeholder, e.g., "person" | "team" | "role" | "vendor" | "system"',
                '  --role=<string>              Stakeholder role/title (stakeholder only)',
                '  --owns=<comma-separated>     Stakeholder ownership paths, e.g., "src/payments/,src/billing/" (stakeholder only)',
                '  --contact=<string>           Stakeholder contact channel, e.g., "#payments-oncall on Slack" (stakeholder only)',
                `  --via=<mode>                 Capture origin (create mode): ${VIA_MODES.join(' | ')}`,
                '  --matched-pattern=<string>   CapturePatternDef.description (when --via=pattern_detected)',
                '  --session-id=<id>            Claude Code session GUID (enables create-audit emit)',
                '  --session-number=<n>         CLEAR session number (enables create-audit emit)',
            ].join('\n')
        }));
        process.exit(0);
    }
    const options = parseArgs();
    // K3.5 (S156): updateEntry is now async (Promise<UpdateOutput>) because the
    // type-change branch awaits performSupersession for atomic supersession side
    // effects. Wrap the dispatch in an async IIFE so the await reaches the
    // top-level CLI entrypoint without disturbing the existing sync paths.
    void (async () => {
        let result;
        switch (options.mode) {
            case 'detect':
                result = detectCapture(options);
                break;
            case 'confirm':
                result = processConfirmation(options);
                break;
            case 'create':
                // WP-PS7 phase_b: dispatcher uses the async wrapper so the auto-link
                // resolves before output and the "(linked to Y)" suffix reflects truth.
                result = await createEntryWithAutoLink(options);
                break;
            case 'check-state':
                result = checkState(options);
                break;
            case 'update':
                result = await updateEntry(options);
                break;
            default:
                result = {
                    script: 'knowledge-capture',
                    detected: false,
                    status: 'no_trigger'
                };
        }
        console.log(JSON.stringify(result));
    })();
}
//# sourceMappingURL=capture-cli.js.map