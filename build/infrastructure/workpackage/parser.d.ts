/**
 * Workpackage YAML Parser
 *
 * Parses workpackage definition files and registry files.
 * Updated Session 33 with Dual-ID Architecture support (P1.6).
 */
import { WorkpackageEntry, WorkpackageRegistry, WorkpackageState } from './types';
/**
 * Curated allowlist of extensionless build-file basenames treated as file
 * paths. These carry no extension, so the alphabetic-extension heuristic in
 * isDeliverablePathToken cannot recognise them; they are matched by exact
 * basename instead. Kept deliberately small and explicit — a general "any
 * extensionless token is a path" rule would re-admit prose like "user/admin".
 */
export declare const EXTENSIONLESS_PATH_BASENAMES: readonly string[];
/**
 * True when `token` is a single file-path-like token (consumer-general).
 *
 * A token qualifies when ALL of:
 *   - it contains only safe path characters (SAFE_PATH_CHARS) and no ".."
 *     traversal segment; AND
 *   - its final path segment EITHER ends in an alphabetic file extension
 *     (.go .py .mod .ts .json .toml ...) — the leading-letter requirement
 *     rejects version/number tokens like "1.0", "v2.0", "3.0", so prose such
 *     as "version 1.0/2.0" is not mistaken for a path — OR is a curated
 *     extensionless build-file basename (Makefile, Dockerfile...).
 *
 * Prose with slashes but no extension ("user/admin", "3/4", "Voice/copy")
 * fails the extension test and returns false. Bare directory paths whose final
 * segment has no extension are intentionally NOT treated as concrete file paths
 * (they cannot be file-presence-tracked by detecting a created file).
 */
export declare function isDeliverablePathToken(token: string): boolean;
/**
 * Extract the ordered, de-duplicated set of file-path tokens named in a
 * deliverable description, consumer-general. Tokenises on whitespace, trims
 * surrounding punctuation from each token, and keeps those that satisfy
 * isDeliverablePathToken. First-appearance order is preserved; exact
 * duplicates are collapsed. Returns [] when no path tokens are found.
 */
export declare function extractDeliverablePaths(description: string): string[];
/**
 * Extract the LEADING file-path token from a description, honouring the
 * convention that a deliverable description starts with its file path. Used by
 * the read-time resolver's description fallback (registry.ts).
 *
 * @param description - Deliverable description text (optional)
 * @returns The leading path token, or null when it is absent or not path-like
 */
export declare function extractLeadingDeliverablePath(description?: string): string | null;
/**
 * Discriminant union for parse-error categories.
 *
 * Existing emit sites cover MISSING_REQUIRED, INVALID_YAML, SCHEMA_MISMATCH,
 * FILE_NOT_FOUND, FILE_READ_ERROR. EMPTY_PATTERN and DUPLICATE_ID are reserved
 * for forward use — not currently emitted by any throw site, but included so
 * downstream callers can write exhaustive switch statements without churn when
 * those categories light up.
 */
export type WorkpackageParseErrorCode = 'EMPTY_PATTERN' | 'MISSING_REQUIRED' | 'INVALID_YAML' | 'SCHEMA_MISMATCH' | 'DUPLICATE_ID' | 'FILE_NOT_FOUND' | 'FILE_READ_ERROR';
/**
 * Error thrown during parsing.
 *
 * The errorCode discriminant lets callers route on category rather than
 * substring-matching the human-readable message — e.g., the registry loader
 * swallows FILE_NOT_FOUND as "not yet created" and re-throws everything else.
 */
export declare class WorkpackageParseError extends Error {
    readonly file: string;
    readonly errorCode: WorkpackageParseErrorCode;
    readonly details?: Record<string, unknown> | undefined;
    constructor(message: string, file: string, errorCode: WorkpackageParseErrorCode, details?: Record<string, unknown> | undefined);
}
/**
 * Optional behaviour knobs for the parser. Default behaviour is strict on
 * every field. Knobs widen specific validations for narrowly-scoped
 * recovery flows — they are NOT a general escape hatch.
 */
export interface ParseOptions {
    /**
     * When true, type and priority enum validation errors are CAPTURED on
     * the returned entry's `validationWarnings` array instead of being
     * thrown. The original invalid value is preserved on the entry as-is
     * so a downstream round-trip via a strict parse (e.g., the pre-write
     * check in `writeWorkpackageAtomic`) STILL rejects the entry unless
     * the caller mutated the offending field to a valid value first.
     *
     * Every other validation (required-field presence, structural shape,
     * status enum, deliverables shape, dependency shape, YAML well-formedness)
     * remains strict and throws on violation.
     *
     * Intended sole consumer: `update-cli` when the requested mutation
     * includes `--type` or `--priority` (the user is repairing the very
     * field that fails strict validation, so a strict load deadlocks the
     * repair). Other callers MUST leave this default-false.
     */
    tolerantEnums?: boolean;
}
/**
 * Parse a workpackage definition file
 * @param filePath - Path to the workpackage YAML file
 * @param options - Optional parser knobs (see ParseOptions)
 * @returns Parsed workpackage entry
 * @throws WorkpackageParseError if parsing fails
 */
export declare function parseWorkpackageFile(filePath: string, options?: ParseOptions): WorkpackageEntry;
/**
 * Parse workpackage YAML content
 * @param content - YAML content string
 * @param sourcePath - Source path for error messages
 * @param options - Optional parser knobs (see ParseOptions)
 * @returns Parsed workpackage entry
 */
export declare function parseWorkpackageContent(content: string, sourcePath: string, options?: ParseOptions): WorkpackageEntry;
/**
 * Parse the registry YAML file
 * @param filePath - Path to registry.yaml
 * @returns Parsed registry
 */
export declare function parseRegistryFile(filePath: string): WorkpackageRegistry;
/**
 * Parse workpackage state from JSON file
 * @param filePath - Path to workpackage.json state file
 * @returns Parsed state or default
 */
export declare function parseStateFile(filePath: string): WorkpackageState;
/**
 * Write workpackage state to JSON file
 * @param filePath - Path to workpackage.json
 * @param state - State to write
 */
export declare function writeStateFile(filePath: string, state: WorkpackageState): void;
/**
 * Serialize a workpackage entry back to YAML
 * @param entry - Workpackage entry
 * @returns YAML string
 */
export declare function serializeWorkpackage(entry: WorkpackageEntry): string;
/**
 * Write a workpackage entry to disk atomically.
 *
 * Serializes the entry, runs a round-trip parse to validate the YAML before
 * any disk write lands, writes to a tmp file, then renames into place. If
 * serialization or the validation parse fails, no temp file is moved into
 * place and the original WP YAML stays intact.
 */
export declare function writeWorkpackageAtomic(filePath: string, entry: WorkpackageEntry): void;
//# sourceMappingURL=parser.d.ts.map