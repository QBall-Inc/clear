"use strict";
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
exports.MAX_FIELD_FILE_BYTES = void 0;
exports.resolveTextFieldSource = resolveTextFieldSource;
exports.readTextFieldFile = readTextFieldFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Upper bound for a `--<field>-file` input, in bytes. 1 MiB is generous for
 * prose / knowledge-entry bodies while bounding accidental reads of huge or
 * binary files. Single source of truth for every text-field file consumer.
 */
exports.MAX_FIELD_FILE_BYTES = 1024 * 1024;
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
function resolveTextFieldSource(inline, file, fieldName) {
    if (inline !== undefined && file !== undefined) {
        throw new Error(`Cannot use both --${fieldName} and --${fieldName}-file; specify exactly one.`);
    }
    if (file !== undefined) {
        return readTextFieldFile(file, fieldName);
    }
    return inline;
}
/**
 * Read and validate a `--<field>-file` path. Separated from the mutex check so
 * the validation sequence (exists → not-a-directory → size cap → read) is
 * fail-fast and independently testable. Exported so other CLI file-input paths
 * (e.g. JSON-array field readers) can reuse the same validation without the
 * mutual-exclusion layer.
 *
 * @internal Exported for reuse + testing.
 */
function readTextFieldFile(file, fieldName) {
    const filePath = path.resolve(file);
    let stat;
    try {
        stat = fs.statSync(filePath);
    }
    catch (e) {
        // Realm-safe errno extraction: `instanceof Error` is unreliable across
        // module realms (e.g. ts-node/jest), where fs errors fail the instanceof
        // check and would silently drop ENOENT discrimination. A structural
        // property check works in every realm and is still safe for non-object
        // throws.
        const code = typeof e === 'object' && e !== null && 'code' in e
            ? e.code
            : undefined;
        if (code === 'ENOENT') {
            throw new Error(`--${fieldName}-file not found: ${filePath}`);
        }
        throw new Error(`--${fieldName}-file could not be accessed: ${filePath} (${e instanceof Error ? e.message : String(e)})`);
    }
    if (stat.isDirectory()) {
        throw new Error(`--${fieldName}-file is a directory, not a file: ${filePath}`);
    }
    if (stat.size > exports.MAX_FIELD_FILE_BYTES) {
        throw new Error(`--${fieldName}-file exceeds the ${exports.MAX_FIELD_FILE_BYTES}-byte limit (${stat.size} bytes): ${filePath}`);
    }
    let content;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    }
    catch (e) {
        throw new Error(`--${fieldName}-file could not be read: ${filePath} (${e instanceof Error ? e.message : String(e)})`);
    }
    // Post-read size re-check: the statSync size guard above can be defeated by a
    // symlink whose target is swapped between stat and read (TOCTOU). The stat
    // check stays as a fast fail before any I/O; this second check runs on the
    // bytes actually read and cannot be raced.
    if (Buffer.byteLength(content, 'utf-8') > exports.MAX_FIELD_FILE_BYTES) {
        throw new Error(`--${fieldName}-file exceeds the ${exports.MAX_FIELD_FILE_BYTES}-byte limit: ${filePath}`);
    }
    return content;
}
//# sourceMappingURL=cli-file-input.js.map