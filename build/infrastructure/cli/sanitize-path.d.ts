/**
 * Redact absolute project-path prefix from user-facing message strings.
 *
 * R1 dual-key envelopes mirror additionalContext into the message field;
 * any absolute path embedded in either surfaces to consuming contexts
 * (Claude sessions, logs, screenshots). Strip the cwd prefix so messages
 * stay project-relative and don't leak the developer's full filesystem path.
 *
 * Strips both the resolved-absolute form of cwd (matches Node.js I/O error
 * paths) and the raw cwd form when different (matches messages constructed
 * with a relative cwd).
 *
 * Idempotent: safe to call on messages that contain no cwd prefix.
 */
export declare function redactProjectPath(message: string, cwd: string): string;
//# sourceMappingURL=sanitize-path.d.ts.map