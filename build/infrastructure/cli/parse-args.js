"use strict";
/**
 * Shared CLI argument parsing utility.
 *
 * Extracts the duplicated parseArgs() boilerplate found across 16+ CLI files
 * into a single generic function. Each CLI defines its own typed options
 * interface and a list of ArgParser descriptors; this utility handles:
 *
 *   1. process.argv.slice(2)
 *   2. --clear-dir= parsing (always included automatically)
 *   3. Custom --key=value and --flag parsers
 *   4. validateBasePath(options.clearDir) at the end
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCliArgs = parseCliArgs;
const validation_1 = require("../validation");
/**
 * Parse CLI arguments using a generic descriptor list.
 *
 * @param defaults - Default options object (must include `clearDir`)
 * @param parsers  - Array of argument parsers for CLI-specific options
 * @returns The populated options object with `clearDir` validated
 */
function parseCliArgs(defaults, parsers) {
    const args = process.argv.slice(2);
    const options = { ...defaults };
    for (const arg of args) {
        // Built-in: --clear-dir= is always handled
        if (arg.startsWith('--clear-dir=')) {
            options.clearDir = arg.substring('--clear-dir='.length);
            continue;
        }
        // Try each custom parser
        let matched = false;
        for (const parser of parsers) {
            if (parser.prefix && arg.startsWith(parser.prefix)) {
                parser.apply(arg.substring(parser.prefix.length), options);
                matched = true;
                break;
            }
            if (parser.flag && arg === parser.flag) {
                parser.apply('true', options);
                matched = true;
                break;
            }
        }
        // Unrecognised arguments are silently ignored (existing behaviour)
        if (!matched) {
            // no-op: preserve backward-compatible silent ignore
        }
    }
    // Only validate non-empty clearDir (some CLIs use empty string
    // as a sentinel to detect "not provided" before calling runXxxCLI)
    if (options.clearDir) {
        options.clearDir = (0, validation_1.validateBasePath)(options.clearDir);
    }
    return options;
}
//# sourceMappingURL=parse-args.js.map