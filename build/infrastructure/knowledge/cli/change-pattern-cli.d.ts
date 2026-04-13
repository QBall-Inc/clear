#!/usr/bin/env npx ts-node
/**
 * Change Pattern CLI
 *
 * Evaluates changed files against knowledge change patterns (Level A/B/C).
 * Used by session-stop.sh for Level B assessment (Node.js CLI invoked
 * conditionally when Level A does not match in bash).
 *
 * Usage:
 *   npx ts-node .../change-pattern-cli.ts --patterns-file=<path> --changed-files='["a.ts","b.ts"]'
 *   npx ts-node .../change-pattern-cli.ts --patterns-file=<path> --changed-files='[...]' --user-patterns=<path>
 *   npx ts-node .../change-pattern-cli.ts --patterns-file=<path> --changed-files='[...]' --tool-filter=Write
 *
 * Output (JSON):
 *   { "matched": true, "level": "B", "pattern_id": "schema-change", "message": "..." }
 */
export {};
//# sourceMappingURL=change-pattern-cli.d.ts.map