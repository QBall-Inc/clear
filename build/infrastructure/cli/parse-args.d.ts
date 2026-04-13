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
/**
 * Descriptor for a single CLI argument parser.
 *
 * Exactly one of `prefix` or `flag` must be provided:
 *   - `prefix`: matches `--key=` style arguments and extracts the value after `=`
 *   - `flag`:   matches an exact argument string (e.g. `--verbose`)
 *
 * The `apply` callback receives the extracted value (or `'true'` for flags)
 * and the mutable options object.
 */
export interface ArgParser<T> {
    /** Match a prefix like '--key=' and extract the value after it */
    prefix?: string;
    /** Match an exact flag like '--verbose' */
    flag?: string;
    /** Apply the parsed value to the options object */
    apply: (value: string, opts: T) => void;
}
/**
 * Parse CLI arguments using a generic descriptor list.
 *
 * @param defaults - Default options object (must include `clearDir`)
 * @param parsers  - Array of argument parsers for CLI-specific options
 * @returns The populated options object with `clearDir` validated
 */
export declare function parseCliArgs<T extends {
    clearDir: string;
}>(defaults: T, parsers: ArgParser<T>[]): T;
//# sourceMappingURL=parse-args.d.ts.map