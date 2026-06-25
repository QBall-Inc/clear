"use strict";
/**
 * Restore CLI (WP-PS1 Phase B — AC6, AC7)
 *
 * Restores a .clear/ directory from a `.clear.backup.<ts>/` snapshot created by
 * /cf-init --reinit-clean (or the deprecated --force alias).
 *
 * All filesystem mutations use fs.cpSync / fs.rmSync / fs.renameSync — these
 * primitives are invisible to the PreToolUse hook guard (same invariant as
 * init-cli.ts:6), so the restore CLI works regardless of POST-68/WP-PS2 hook
 * fix status. No bypass exception path needed.
 *
 * Surface: invoked indirectly via /cf-init --restore-from-backup; init-cli.ts
 * dispatches when that flag is present so the user-facing entry stays /cf-init.
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
exports.runRestoreCLI = runRestoreCLI;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("yaml"));
const manifest_1 = require("../manifest");
const parse_args_1 = require("../../cli/parse-args");
const validation_1 = require("../../validation");
// ==============================================================================
// CONSTANTS
// ==============================================================================
/** Prefix marking a cf-init backup directory at projectDir level. */
const BACKUP_PREFIX = '.clear.backup.';
/**
 * Prefix used to preserve the existing .clear/ before overwriting during
 * restore. Distinct from BACKUP_PREFIX so it does NOT get auto-picked by
 * future restore scans, and distinct from createBackup's internal exclusion
 * prefixes (backup_, .backup.) so it lives safely at projectDir level.
 */
const PRE_RESTORE_PREFIX = '.clear.pre-restore.';
// ==============================================================================
// BACKUP DISCOVERY
// ==============================================================================
/**
 * Find the most recent `.clear.backup.<ts>/` directory under projectDir.
 *
 * Sort relies on the ISO-8601 timestamp embedded in the dirname (with
 * `[:.]` replaced by `-` per manifest.ts createBackup). Lex sort ==
 * chronological sort for this format.
 *
 * @returns absolute path to most-recent backup dir, or null if none found
 */
function findLatestBackup(projectDir) {
    if (!fs.existsSync(projectDir))
        return null;
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    const backups = entries
        .filter((e) => e.isDirectory() && e.name.startsWith(BACKUP_PREFIX))
        .map((e) => e.name)
        .sort()
        .reverse();
    if (backups.length === 0)
        return null;
    return path.join(projectDir, backups[0]);
}
// ==============================================================================
// MANIFEST COMPATIBILITY
// ==============================================================================
/**
 * Compare two semver-ish version strings on the MAJOR component only.
 * Backup is considered compatible iff backup.major === current.major.
 *
 * Precondition (callers): both arguments are non-empty strings already validated
 * as the `clear.version` field of a parsed manifest. Empty / null inputs would
 * compare `'' === ''` → true (incorrect-compatible) — callers in checkBackupManifest
 * gate on `if (!backupVersion || typeof backupVersion !== 'string')` first.
 *
 * Rationale: minor/patch differences within a major are forward-compatible
 * by CLEAR convention; major bumps signal schema breaks that cannot be safely
 * restored without migration. (CR fix-batch F-TS-5: precondition documented.)
 */
function isMajorCompatible(backupVersion, currentVersion) {
    const backupMajor = backupVersion.split('.')[0];
    const currentMajor = currentVersion.split('.')[0];
    return backupMajor === currentMajor;
}
/** Maximum manifest file size before refusing to yaml-parse (CR fix-batch F-SEC-3: DoS guard). */
const MAX_MANIFEST_BYTES = 65536;
/**
 * Validate that the backup's manifest is present, parseable, and version-compatible.
 */
function checkBackupManifest(backupDir) {
    const manifestPath = path.join(backupDir, manifest_1.MANIFEST_RELATIVE_PATH);
    if (!fs.existsSync(manifestPath)) {
        return {
            compatible: false,
            error: `MANIFEST_MISSING: Backup at ${backupDir} has no clear-manifest.yaml — refusing to restore from an unverified snapshot.`,
        };
    }
    // CR fix-batch F-SEC-3: refuse oversized manifests before yaml.parse to avoid
    // DoS via memory exhaustion. CLEAR manifests are bounded by schema (<5KB in
    // practice); 64KB is a generous ceiling that catches accidental + adversarial
    // bloat without rejecting legitimate snapshots.
    const stat = fs.statSync(manifestPath);
    if (stat.size > MAX_MANIFEST_BYTES) {
        return {
            compatible: false,
            error: `MANIFEST_OVERSIZED: Backup manifest at ${manifestPath} is ${stat.size} bytes (limit ${MAX_MANIFEST_BYTES}). Refusing to parse — file may be corrupted or malicious.`,
        };
    }
    let manifest;
    try {
        const content = fs.readFileSync(manifestPath, 'utf-8');
        manifest = yaml.parse(content);
    }
    catch (error) {
        return {
            compatible: false,
            error: `MANIFEST_PARSE_FAIL: Cannot parse ${manifestPath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
    // CR fix-batch F-TS-1: type-narrow before field access. yaml.parse() can
    // return null / array / primitive for non-object inputs; the prior bare
    // `as ClearManifest` cast would have allowed those through and crashed
    // at the field-access step (clear?.version on an array yields undefined,
    // but downstream consumers couldn't trust manifest's shape).
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        return {
            compatible: false,
            error: `MANIFEST_MALFORMED: Backup manifest at ${manifestPath} did not parse to an object (got ${Array.isArray(manifest) ? 'array' : typeof manifest}). Refusing to restore.`,
        };
    }
    const m = manifest;
    const backupVersion = m.clear?.version;
    if (!backupVersion || typeof backupVersion !== 'string') {
        return {
            compatible: false,
            error: `MANIFEST_VERSION_MISSING: Backup manifest at ${manifestPath} has no clear.version field.`,
        };
    }
    if (!isMajorCompatible(backupVersion, manifest_1.CLEAR_VERSION)) {
        return {
            compatible: false,
            backupVersion,
            error: `VERSION_INCOMPATIBLE: Backup CLEAR_VERSION=${backupVersion} vs current CLEAR_VERSION=${manifest_1.CLEAR_VERSION}. Major version mismatch — refusing automated restore. Recover manually or upgrade the project first.`,
        };
    }
    return { compatible: true, backupVersion };
}
// ==============================================================================
// MAIN
// ==============================================================================
/**
 * Run the restore flow.
 *
 * Order of operations:
 *   1. Resolve backup source (explicit --backup-path= or scan-most-recent)
 *   2. Validate backup is a `.clear.backup.*` directory and exists
 *   3. Validate manifest compatibility (CLEAR_VERSION major check)
 *   4. If .clear/ exists at projectDir, rename to .clear.pre-restore.<ts>/
 *      (preserves current state without nesting inside .clear/)
 *   5. fs.cpSync from backup → .clear/ (recursive, no filter)
 */
async function runRestoreCLI(options) {
    const { cwd, backupPath } = options;
    // Step 1+2: Resolve and validate backup source
    let resolvedBackup;
    if (backupPath) {
        // CR fix-batch F-SEC-1: reject traversal sequences in --backup-path BEFORE
        // resolving. Mirrors the --cwd= guard added in Phase A. Without this, an
        // attacker could supply `--backup-path=../../etc/.clear.backup.x` and the
        // basename check would pass while resolution escapes the project dir.
        if (backupPath.includes('..')) {
            return {
                status: 'error',
                error: `BACKUP_PATH_TRAVERSAL: --backup-path=${backupPath} contains a traversal sequence. Refusing to resolve.`,
            };
        }
        resolvedBackup = path.isAbsolute(backupPath)
            ? backupPath
            : path.resolve(cwd, backupPath);
        if (!fs.existsSync(resolvedBackup)) {
            return {
                status: 'error',
                error: `BACKUP_PATH_NOT_FOUND: --backup-path=${backupPath} does not exist (resolved to ${resolvedBackup}).`,
            };
        }
        const basename = path.basename(resolvedBackup);
        if (!basename.startsWith(BACKUP_PREFIX)) {
            return {
                status: 'error',
                error: `BACKUP_PATH_PATTERN_MISMATCH: --backup-path=${backupPath} does not match the .clear.backup.<timestamp>/ naming pattern. Restore refuses non-conforming paths to avoid accidental restore from an unrelated directory.`,
            };
        }
        if (!fs.statSync(resolvedBackup).isDirectory()) {
            return {
                status: 'error',
                error: `BACKUP_PATH_NOT_DIRECTORY: --backup-path=${backupPath} is not a directory.`,
            };
        }
    }
    else {
        const found = findLatestBackup(cwd);
        if (!found) {
            return {
                status: 'error',
                error: `NO_BACKUP_FOUND: No .clear.backup.* directories under ${cwd}. Specify --backup-path=PATH to restore from a custom location.`,
            };
        }
        resolvedBackup = found;
    }
    // Step 3: Manifest compatibility
    const manifestCheck = checkBackupManifest(resolvedBackup);
    if (!manifestCheck.compatible) {
        return {
            status: 'error',
            backupPath: resolvedBackup,
            error: manifestCheck.error,
        };
    }
    // Step 4: Preserve current .clear/ (if any) under .clear.pre-restore.<ts>/
    const clearDir = path.join(cwd, '.clear');
    let preRestoreSnapshot;
    if (fs.existsSync(clearDir)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        preRestoreSnapshot = path.join(cwd, `${PRE_RESTORE_PREFIX}${timestamp}`);
        if (fs.existsSync(preRestoreSnapshot)) {
            return {
                status: 'error',
                backupPath: resolvedBackup,
                error: `PRE_RESTORE_COLLISION: ${preRestoreSnapshot} already exists. Refusing to overwrite.`,
            };
        }
        try {
            fs.renameSync(clearDir, preRestoreSnapshot);
        }
        catch (error) {
            return {
                status: 'error',
                backupPath: resolvedBackup,
                error: `PRE_RESTORE_RENAME_FAIL: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }
    // Step 5: cpSync backup → .clear/
    // CR fix-batch F-SEC-2: dereference: true prevents symlink-attack from a
    // crafted backup. Without dereference, a backup containing `entry.yaml ->
    // /etc/passwd` would copy the symlink intact into .clear/, exposing the
    // restore CLI as an arbitrary-file-disclosure primitive once a downstream
    // reader follows the symlink. dereference: true copies the LINK TARGET's
    // contents into the destination, neutralizing the attack at copy time.
    try {
        fs.cpSync(resolvedBackup, clearDir, { recursive: true, dereference: true });
    }
    catch (error) {
        return {
            status: 'error',
            backupPath: resolvedBackup,
            preRestoreSnapshot,
            error: `RESTORE_COPY_FAIL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
    return {
        status: 'success',
        backupPath: resolvedBackup,
        restoredFrom: resolvedBackup,
        preRestoreSnapshot,
    };
}
// ==============================================================================
// CLI MAIN BLOCK
// ==============================================================================
function parseArgs() {
    return (0, parse_args_1.parseCliArgs)({
        clearDir: '',
        cwd: '.',
        backupPath: '',
    }, [
        { prefix: '--cwd=', apply: (v, o) => { o.cwd = (0, validation_1.validateBasePath)(v); } },
        { prefix: '--backup-path=', apply: (v, o) => { o.backupPath = v; } },
    ]);
}
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: restore-cli.js [options]',
                '',
                'Restores .clear/ from a .clear.backup.<timestamp>/ snapshot.',
                '',
                'Options:',
                '  --cwd=<path>                 Project directory (default: .)',
                '  --backup-path=<path>         Explicit backup directory. When omitted,',
                '                               scans --cwd for .clear.backup.*/ and picks',
                '                               the most recent by ISO-8601 timestamp.',
                '',
                'Behavior:',
                '  - Validates the backup manifest before restoring (CLEAR_VERSION major',
                '    must match current CLEAR_VERSION).',
                '  - If .clear/ exists, preserves it as .clear.pre-restore.<timestamp>/',
                '    before overwriting. Does NOT auto-delete the pre-restore snapshot.',
                '',
                'Examples:',
                '  restore-cli.js --cwd=/path/to/project',
                '  restore-cli.js --cwd=/path/to/project --backup-path=.clear.backup.2026-01-15T10-30-00-000Z',
            ].join('\n')
        }));
        process.exit(0);
    }
    const input = parseArgs();
    runRestoreCLI(input)
        .then((result) => {
        console.log(JSON.stringify(result));
        if (result.status === 'error')
            process.exit(1);
    })
        .catch((error) => {
        console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
        process.exit(1);
    });
}
//# sourceMappingURL=restore-cli.js.map