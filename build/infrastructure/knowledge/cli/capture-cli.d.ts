#!/usr/bin/env npx ts-node
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
import { KnowledgeType, PendingCaptureState } from '../types';
/** @internal Exported for testing */
export interface CaptureOptions {
    clearDir: string;
    mode: 'detect' | 'confirm' | 'create' | 'check-state' | 'update';
    text?: string;
    response?: string;
    title?: string;
    type?: KnowledgeType;
    tags?: string[];
    description?: string;
    supersedes?: string;
    session?: number;
    sessionId?: string;
    sessionNumber?: number;
    id?: string;
    addRelatedFile?: string[];
    removeRelatedFile?: string[];
    workpackage?: string;
    source?: string;
    source_updated?: string;
    scope?: string;
    trigger_event?: string;
    frequency?: string;
    tools?: string;
    automation_hook?: string;
    entity_type?: string;
    role?: string;
    owns?: string[];
    contact?: string;
    slug?: string;
    via?: ViaMode;
    matchedPattern?: string;
    descriptionFile?: string;
    titleFile?: string;
    supersedesFile?: string;
    tagsFile?: string;
}
/**
 * K2.8 AC2: Allowed values for --via. Drift-proof per memory
 * `feedback_drift_proof_sourcing.md` — error messages and audit metadata
 * derive from this single const.
 */
declare const VIA_MODES: readonly ["direct_create", "pattern_detected", "extraction", "bulk"];
type ViaMode = typeof VIA_MODES[number];
interface DetectOutput {
    script: string;
    detected: boolean;
    status: 'detected' | 'no_trigger' | 'pending_exists';
    suggestedTitle?: string;
    suggestedType?: KnowledgeType;
    suggestedTags?: string[];
    originalText?: string;
    additionalContext?: string;
}
interface ConfirmOutput {
    script: string;
    status: 'confirmed' | 'cancelled' | 'edit_requested' | 'no_pending' | 'expired';
    nextStep?: 'tag_review' | 'supersession_check' | 'ready_to_create';
    additionalContext?: string;
    suggestedTags?: string[];
    similarEntries?: string[];
}
interface CreateOutput {
    script: string;
    success: boolean;
    status: 'created' | 'error';
    entryId?: string;
    filePath?: string;
    additionalContext?: string;
    error?: string;
}
interface CheckStateOutput {
    script: string;
    hasPending: boolean;
    state?: PendingCaptureState;
}
/**
 * K3.5 audit-log + return-shape marker for type-change. Single-source-of-truth
 * for the operation literal — referenced from the audit-log metadata, the
 * router's response formatter, and the `isTypeChangeResult` narrowing guard
 * below. LINT-K3.5-02 fix.
 */
declare const TYPE_CHANGE_ACTION: "type-change";
/**
 * Result envelope for `updateEntry()`. TS-K3.5-02 disposition: kept as a
 * flat optional-field interface (rather than a strict tagged union) to avoid
 * forcing narrowing churn at 30+ test sites while still exposing the concrete
 * unsoundness the reviewer flagged — see `isTypeChangeResult` for the
 * narrowing guard used at the router (the only consumer that constructs a
 * template literal from oldId/newId).
 */
interface UpdateOutput {
    script: string;
    success: boolean;
    status: 'updated' | 'error';
    entryId?: string;
    fieldsUpdated?: string[];
    oldId?: string;
    newId?: string;
    action?: typeof TYPE_CHANGE_ACTION;
    cascadedRefs?: string[];
    error?: string;
}
/**
 * Type guard narrowing an UpdateOutput to the type-change arm where `oldId`,
 * `newId`, and `cascadedRefs` are guaranteed present (not `undefined`). Used
 * at the router to safely embed oldId/newId in user-facing template strings.
 * TS-K3.5-02 narrowing primitive.
 */
export declare function isTypeChangeResult(r: UpdateOutput): r is UpdateOutput & {
    oldId: string;
    newId: string;
    action: typeof TYPE_CHANGE_ACTION;
    cascadedRefs: string[];
};
/** @internal Exported for testing */
export declare function detectCapture(options: CaptureOptions): DetectOutput;
/** @internal Exported for testing */
export declare function processConfirmation(options: CaptureOptions): ConfirmOutput;
/** @internal Exported for testing */
export declare function createEntry(options: CaptureOptions): CreateOutput;
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
export declare function createEntryWithAutoLink(options: CaptureOptions): Promise<CreateOutput>;
/** @internal Exported for testing */
export declare function triggerIndexUpdate(clearDir: string, session: number, entryId?: string): void;
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
export declare function isAutoLinkExcludedChurnFile(relPath: string): boolean;
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
export declare function validateAndMergeAddRelatedFiles(addRelatedFile: string[] | undefined, existing: string[]): {
    ok: true;
    merged: string[];
} | {
    ok: false;
    error: string;
};
/**
 * Read the changed-files accumulator and return filtered file paths.
 * Returns empty array if accumulator is missing or malformed (CS3: no error).
 *
 * @internal Exported for testing
 */
export declare function readRelatedFiles(clearDir: string): string[];
/** @internal Exported for testing */
export declare function checkState(options: CaptureOptions): CheckStateOutput;
/** @internal Exported for testing */
export declare function updateEntry(options: CaptureOptions): Promise<UpdateOutput>;
export {};
//# sourceMappingURL=capture-cli.d.ts.map