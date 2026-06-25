#!/usr/bin/env npx ts-node
/**
 * Deprecation Warnings CLI (K2.7)
 *
 * Prints the session-start deprecation banner as raw text (or nothing if no
 * actionable warnings remain after K2.7 lazy filtering).
 *
 * Replaces the inline jq dump in session-start.sh that showed every entry ever
 * added to deprecatedReferences, even after supersession / dismiss / file removal.
 *
 * Usage:
 *   npx ts-node warnings-cli.ts --clear-dir=/path/.clear
 *   node build/.../warnings-cli.js --clear-dir=/path/.clear
 *
 * Output:
 *   - Empty (exit 0) when no actionable warnings
 *   - Multi-line banner text on stdout otherwise
 */
export {};
//# sourceMappingURL=warnings-cli.d.ts.map