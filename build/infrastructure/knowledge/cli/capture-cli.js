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
exports.detectCapture = detectCapture;
exports.processConfirmation = processConfirmation;
exports.createEntry = createEntry;
exports.generateMarkdown = generateMarkdown;
exports.triggerIndexUpdate = triggerIndexUpdate;
exports.readRelatedFiles = readRelatedFiles;
exports.checkState = checkState;
exports.updateEntry = updateEntry;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const validation_1 = require("../../validation");
const deprecation_1 = require("../../sync/deprecation");
const types_1 = require("../types");
const patterns_1 = require("../patterns");
const parser_1 = require("../parser");
const tfidf_1 = require("../tfidf");
const file_index_1 = require("../file-index");
const db_1 = require("../db");
const index_cli_1 = require("./index-cli");
// ==============================================================================
// Argument Parsing
// ==============================================================================
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        clearDir: '.clear',
        mode: 'detect'
    };
    for (const arg of args) {
        if (arg.startsWith('--clear-dir=')) {
            options.clearDir = arg.substring('--clear-dir='.length);
        }
        else if (arg === '--detect') {
            options.mode = 'detect';
        }
        else if (arg === '--confirm') {
            options.mode = 'confirm';
        }
        else if (arg === '--create') {
            options.mode = 'create';
        }
        else if (arg === '--check-state') {
            options.mode = 'check-state';
        }
        else if (arg === '--update') {
            options.mode = 'update';
        }
        else if (arg.startsWith('--id=')) {
            options.id = arg.substring('--id='.length);
        }
        else if (arg.startsWith('--add-related-file=')) {
            options.addRelatedFile = arg.substring('--add-related-file='.length);
        }
        else if (arg.startsWith('--text=')) {
            options.text = arg.substring('--text='.length);
        }
        else if (arg.startsWith('--response=')) {
            options.response = arg.substring('--response='.length);
        }
        else if (arg.startsWith('--title=')) {
            options.title = arg.substring('--title='.length);
        }
        else if (arg.startsWith('--type=')) {
            const rawType = arg.substring('--type='.length);
            const validTypes = Object.keys(types_1.KNOWLEDGE_TYPE_PREFIXES);
            if (!validTypes.includes(rawType)) {
                console.log(JSON.stringify({
                    script: 'knowledge-capture',
                    success: false,
                    status: 'error',
                    error: `Invalid knowledge type: '${rawType}'. Valid types: ${validTypes.join(', ')}`
                }));
                process.exit(1);
            }
            options.type = rawType;
        }
        else if (arg.startsWith('--tags=')) {
            options.tags = arg.substring('--tags='.length).split(',').filter(Boolean);
        }
        else if (arg.startsWith('--description=')) {
            options.description = arg.substring('--description='.length);
        }
        else if (arg.startsWith('--supersedes=')) {
            options.supersedes = arg.substring('--supersedes='.length);
        }
        else if (arg.startsWith('--session=')) {
            options.session = parseInt(arg.substring('--session='.length), 10);
        }
    }
    options.clearDir = (0, validation_1.validateBasePath)(options.clearDir);
    return options;
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
            const index = JSON.parse(content);
            entries = (index.entries || []).filter((e) => e.status === 'active');
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
    const { clearDir, text } = options;
    if (!text) {
        return {
            script: 'knowledge-capture',
            detected: false,
            status: 'no_trigger'
        };
    }
    // Check for existing pending state
    const existingState = loadPendingState(clearDir);
    if (existingState && !isStateExpired(existingState, clearDir)) {
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
        prompts_since_detection: 0
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
    const { clearDir, response, text } = options;
    const state = loadPendingState(clearDir);
    if (!state) {
        return {
            script: 'knowledge-capture',
            status: 'no_pending'
        };
    }
    if (isStateExpired(state, clearDir)) {
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
// ==============================================================================
// Create Mode
// ==============================================================================
/** @internal Exported for testing */
function createEntry(options) {
    const { clearDir, title, type, tags, description, supersedes, session } = options;
    if (!title || !type) {
        return {
            script: 'knowledge-capture',
            success: false,
            status: 'error',
            error: 'Title and type are required'
        };
    }
    const knowledgeDir = path.join(clearDir, 'knowledge', 'entries');
    // Ensure directory exists
    if (!fs.existsSync(knowledgeDir)) {
        fs.mkdirSync(knowledgeDir, { recursive: true });
    }
    // Get next ID
    const newId = (0, parser_1.getNextId)(knowledgeDir, type);
    // Build entry content
    const entryDescription = description || `Decision captured from session ${session || 'unknown'}.`;
    // Auto-populate related_files from changed-files accumulator
    const relatedFiles = readRelatedFiles(clearDir);
    const frontmatter = {
        id: newId,
        title,
        type,
        status: 'active',
        tags: tags || [],
        related_files: relatedFiles,
        created: new Date().toISOString(),
        created_session: session || 0,
        supersedes: supersedes || null,
        superseded_by: null,
        description: entryDescription
    };
    // Write entry file
    const filePath = path.join(knowledgeDir, `${newId}.md`);
    const content = generateMarkdown(frontmatter);
    try {
        fs.writeFileSync(filePath, content, 'utf-8');
        // Update superseded entry via unified supersession (surfaces errors via stderr)
        if (supersedes) {
            const basePath = path.dirname(clearDir);
            (0, deprecation_1.performSupersession)(basePath, supersedes, newId, {
                sessionId: `session-${session || 0}`,
                sessionNumber: session || 0,
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
        // Clear pending state
        clearPendingState(clearDir);
        // Trigger incremental index update
        triggerIndexUpdate(clearDir, session || 0, newId);
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
        return {
            script: 'knowledge-capture',
            success: false,
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
/** @internal Exported for testing */
function generateMarkdown(frontmatter) {
    const yaml = Object.entries(frontmatter)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => {
        if (Array.isArray(v)) {
            return `${k}: [${v.join(', ')}]`;
        }
        if (typeof v === 'string' && (v.includes('\n') || v.includes(':'))) {
            return `${k}: |\n  ${v.replace(/\n/g, '\n  ')}`;
        }
        return `${k}: ${JSON.stringify(v)}`;
    })
        .join('\n');
    return `---\n${yaml}\n---\n\n# ${frontmatter.title}\n\n${frontmatter.description}\n`;
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
            .filter(p => !RELATED_FILES_EXCLUSIONS.some(excl => p.startsWith(excl)))
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
/** @internal Exported for testing */
function updateEntry(options) {
    const { clearDir, id, tags, description, addRelatedFile, session } = options;
    if (!id) {
        return {
            script: 'knowledge-capture',
            success: false,
            status: 'error',
            error: 'Entry ID is required for update. Usage: --update --id=<id>'
        };
    }
    // F-002: Validate ID format to prevent path traversal
    if (!(0, parser_1.isValidId)(id)) {
        return {
            script: 'knowledge-capture',
            success: false,
            status: 'error',
            error: `Invalid entry ID format: '${id}'. Expected format: TD-001, BR-002, PAT-003, LES-004`
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
    // Build the updates object
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
    // Handle --add-related-file (append to existing related_files)
    if (addRelatedFile) {
        // F-001: Sanitize path — reject absolute paths and apply exclusion filters
        const normalizedPath = addRelatedFile.startsWith('./') ? addRelatedFile.slice(2) : addRelatedFile;
        if (path.isAbsolute(normalizedPath) || normalizedPath.includes('..')) {
            return {
                script: 'knowledge-capture',
                success: false,
                status: 'error',
                error: `Invalid related file path: '${addRelatedFile}'. Must be a relative path without traversal.`
            };
        }
        if (RELATED_FILES_EXCLUSIONS.some(excl => normalizedPath.startsWith(excl))) {
            return {
                script: 'knowledge-capture',
                success: false,
                status: 'error',
                error: `Excluded path: '${addRelatedFile}'. Paths matching ${RELATED_FILES_EXCLUSIONS.join(', ')} are filtered.`
            };
        }
        const content = fs.readFileSync(entryPath, 'utf-8');
        const parsed = (0, parser_1.parseFrontmatter)(content);
        // F-004: Guard against non-array related_files from hand-edited files
        const rawRelated = parsed?.frontmatter?.related_files;
        const currentRelatedFiles = Array.isArray(rawRelated) ? rawRelated : [];
        if (!currentRelatedFiles.includes(normalizedPath)) {
            updates.related_files = [...currentRelatedFiles, normalizedPath];
            fieldsUpdated.push('related_files');
        }
    }
    if (fieldsUpdated.length === 0) {
        return {
            script: 'knowledge-capture',
            success: false,
            status: 'error',
            error: 'No update fields specified. Use --tags, --description, or --add-related-file.'
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
    // Trigger SQLite incremental rebuild
    triggerIndexUpdate(clearDir, session || 0, id);
    return {
        script: 'knowledge-capture',
        success: true,
        status: 'updated',
        entryId: id,
        fieldsUpdated
    };
}
// ==============================================================================
// Main Execution
// ==============================================================================
// Guard: only execute CLI when run directly (not when imported for testing)
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
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
                '  --update                     Update an existing knowledge entry',
                '',
                'Options:',
                '  --clear-dir=<path>           Path to .clear directory (default: .clear)',
                '  --text=<text>                Text to analyze (detect mode)',
                '  --response=<yes|no|edit>     User response (confirm mode)',
                '  --title=<string>             Entry title (create mode)',
                '  --type=<type>                Entry type: technical-decision, business-rule,',
                '                               architectural-pattern, lesson-learned',
                '  --tags=<comma-separated>     Tags for the entry',
                '  --description=<string>       Entry description',
                '  --supersedes=<id>            ID of entry this supersedes',
                '  --session=<number>           Current session number',
                '  --id=<id>                    Entry ID (update mode)',
                '  --add-related-file=<path>    Add file to related_files (update mode)',
            ].join('\n')
        }));
        process.exit(0);
    }
    const options = parseArgs();
    let result;
    switch (options.mode) {
        case 'detect':
            result = detectCapture(options);
            break;
        case 'confirm':
            result = processConfirmation(options);
            break;
        case 'create':
            result = createEntry(options);
            break;
        case 'check-state':
            result = checkState(options);
            break;
        case 'update':
            result = updateEntry(options);
            break;
        default:
            result = {
                script: 'knowledge-capture',
                detected: false,
                status: 'no_trigger'
            };
    }
    console.log(JSON.stringify(result));
}
//# sourceMappingURL=capture-cli.js.map