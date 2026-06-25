/**
 * CLEAR Manifest Management
 *
 * Handles creation, reading, and validation of clear-manifest.yaml.
 * The manifest is the primary marker that identifies a project as
 * CLEAR-initialized.
 *
 * Based on P2.1 Feature Brief v1.1.0 Section 5.2.
 */
import { ClearManifest } from './types';
/** Current CLEAR framework version */
export declare const CLEAR_VERSION = "1.0.0";
/** Current /cf-init command version */
export declare const COMMAND_VERSION = "2.1.0";
/** Manifest file path relative to .clear/ */
export declare const MANIFEST_RELATIVE_PATH = "config/clear-manifest.yaml";
/**
 * Options for creating a manifest
 */
export interface CreateManifestOptions {
    /** Project directory path */
    projectDir: string;
    /** Optional project name (defaults to directory name) */
    projectName?: string;
    /** Optional CLEAR version override */
    clearVersion?: string;
    /** Optional command version override */
    commandVersion?: string;
    /** Whether hooks were configured */
    hooksConfigured?: boolean;
}
/**
 * Create a new CLEAR manifest
 *
 * @param options - Manifest creation options
 * @returns The created manifest object
 */
export declare function createManifest(options: CreateManifestOptions): ClearManifest;
/**
 * Write manifest to file
 *
 * @param manifest - Manifest to write
 * @param projectDir - Project directory
 * @throws Error if write fails
 */
export declare function writeManifest(manifest: ClearManifest, projectDir: string): void;
/**
 * Read and parse manifest from a project directory
 *
 * @param projectDir - Project directory path
 * @returns Parsed manifest or null if not found
 */
export declare function readManifest(projectDir: string): ClearManifest | null;
/**
 * Check if manifest exists in a project directory
 *
 * @param projectDir - Project directory path
 * @returns True if manifest exists
 */
export declare function manifestExists(projectDir: string): boolean;
/**
 * Get manifest file path for a project
 *
 * @param projectDir - Project directory path
 * @returns Full path to manifest file
 */
export declare function getManifestPath(projectDir: string): string;
/**
 * Validation result
 */
export interface ManifestValidationResult {
    /** Whether manifest is valid */
    valid: boolean;
    /** Validation errors */
    errors: string[];
    /** Validation warnings */
    warnings: string[];
}
/**
 * Validate a manifest object
 *
 * @param manifest - Manifest to validate
 * @returns Validation result
 */
export declare function validateManifest(manifest: unknown): ManifestValidationResult;
/**
 * Add reinitialization entry to manifest
 *
 * @param manifest - Existing manifest
 * @param reason - Reason for reinitialization
 * @returns Updated manifest
 */
export declare function addReinitEntry(manifest: ClearManifest, reason: string): ClearManifest;
/**
 * Create backup of existing .clear/ directory
 *
 * WP-PS1 AC4: filter callback excludes any nested backup-pattern subdirectories
 * so a `.clear/` containing legacy `backup_<ts>/` (or future `.backup.<ts>/`)
 * subdirs produces a new `.clear.backup.<ts>/` that does NOT contain them.
 *
 * CR fix-batch F-LINT-3: accepts an optional explicit backupDir so callers
 * that pre-emit the path to the user (e.g., destruction preview in
 * initializeProject) can pass the SAME path here, guaranteeing user-visible
 * "Backup will be created at: X" matches the actual created location. When
 * omitted, computes a fresh ISO-8601 timestamp internally (legacy behavior).
 *
 * @param projectDir - Project directory
 * @param backupDir  - Optional explicit backup directory path. Must still match
 *                     the `.clear.backup.<...>` naming convention so AC4 filter
 *                     + discovery downstream find it.
 * @returns Path to backup directory
 * @throws Error if backup fails
 */
export declare function createBackup(projectDir: string, backupDir?: string): string;
/**
 * Remove existing .clear/ directory after backup
 *
 * @param projectDir - Project directory
 * @throws Error if removal fails
 */
export declare function removeExistingClear(projectDir: string): void;
//# sourceMappingURL=manifest.d.ts.map