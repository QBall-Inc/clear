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
    id?: string;
    addRelatedFile?: string;
}
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
interface UpdateOutput {
    script: string;
    success: boolean;
    status: 'updated' | 'error';
    entryId?: string;
    fieldsUpdated?: string[];
    error?: string;
}
/** @internal Exported for testing */
export declare function detectCapture(options: CaptureOptions): DetectOutput;
/** @internal Exported for testing */
export declare function processConfirmation(options: CaptureOptions): ConfirmOutput;
/** @internal Exported for testing */
export declare function createEntry(options: CaptureOptions): CreateOutput;
/** @internal Exported for testing */
export declare function generateMarkdown(frontmatter: Record<string, unknown>): string;
/** @internal Exported for testing */
export declare function triggerIndexUpdate(clearDir: string, session: number, entryId?: string): void;
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
export declare function updateEntry(options: CaptureOptions): UpdateOutput;
export {};
//# sourceMappingURL=capture-cli.d.ts.map