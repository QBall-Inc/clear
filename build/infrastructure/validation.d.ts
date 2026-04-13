/**
 * Shared validation utilities for CLI path inputs.
 *
 * Provides path traversal protection for --clear-dir and similar
 * user-supplied paths across all CLI entry points.
 */
/**
 * Validate and resolve a base path, preventing path traversal attacks.
 * Rejects paths containing unresolved '..' traversal sequences.
 *
 * @param rawPath - The raw path string from CLI input
 * @returns The resolved absolute path
 * @throws Error if the path contains traversal sequences
 */
export declare function validateBasePath(rawPath: string): string;
//# sourceMappingURL=validation.d.ts.map