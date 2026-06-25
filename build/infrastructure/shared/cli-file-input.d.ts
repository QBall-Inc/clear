/**
 * Shared CLI free-form-text file-input resolver.
 *
 * Several CLIs accept a free-form text field either inline (`--<field>=<text>`)
 * or from a file (`--<field>-file=<path>`). File input avoids the shell-quoting
 * workaround (write to a temp file, then `--<field>="$(cat tmp)"`) that breaks
 * on multi-line content, mixed quotes, backticks, bracket tokens, and
 * dollar-shaped strings.
 *
 * This module centralises the read + mutual-exclusion + validation so every
 * consumer behaves identically (one tuning point for the size cap and the error
 * wording).
 */
/**
 * Upper bound for a `--<field>-file` input, in bytes. 1 MiB is generous for
 * prose / knowledge-entry bodies while bounding accidental reads of huge or
 * binary files. Single source of truth for every text-field file consumer.
 */
export declare const MAX_FIELD_FILE_BYTES: number;
/**
 * Resolve a free-form text field that may be supplied inline OR from a file,
 * but never both.
 *
 * Returns the file content verbatim (byte-for-byte, no trimming) when the file
 * source is used, the `inline` value when that source is used, or `undefined`
 * when neither was provided.
 *
 * Throws `Error` with an actionable message — the caller routes the message
 * into its own error envelope — on any of:
 *   - both `inline` and `file` provided (mutual exclusion)
 *   - file does not exist (ENOENT)
 *   - path resolves to a directory
 *   - file exceeds {@link MAX_FIELD_FILE_BYTES}
 *   - file cannot be read (e.g. permission denied)
 *
 * @param inline    the inline flag value, or undefined if the flag was absent
 * @param file      the file-flag path, or undefined if the flag was absent
 * @param fieldName the field's flag base name (e.g. `description`) — used to
 *                  build `--<fieldName>` / `--<fieldName>-file` in messages
 */
export declare function resolveTextFieldSource(inline: string | undefined, file: string | undefined, fieldName: string): string | undefined;
/**
 * Read and validate a `--<field>-file` path. Separated from the mutex check so
 * the validation sequence (exists → not-a-directory → size cap → read) is
 * fail-fast and independently testable. Exported so other CLI file-input paths
 * (e.g. JSON-array field readers) can reuse the same validation without the
 * mutual-exclusion layer.
 *
 * @internal Exported for reuse + testing.
 */
export declare function readTextFieldFile(file: string, fieldName: string): string;
//# sourceMappingURL=cli-file-input.d.ts.map