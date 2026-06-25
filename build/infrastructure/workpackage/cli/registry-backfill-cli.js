#!/usr/bin/env npx ts-node
"use strict";
/**
 * Workpackage Registry Backfill CLI (RC1D — AC11)
 *
 * One-shot session-init backfill for fossil drift in registry.yaml: any entry with
 * status='complete' and progress<100 gets entry.progress=100 written directly.
 *
 * Status-derived progress, NOT calculateProgress recomputation: the canonical truth for a
 * status:complete WP is its terminal status; recomputing against now-empty state.deliverables
 * would return 0 for fossils (state only carries the active WP's deliverable map).
 *
 * Fast-skip via mtime+size composite cache so non-changing registries don't get re-scanned.
 * Atomic temp+mv write. Missing WP YAML files don't fail the run — they're logged to audit
 * and skipped (degraded mode).
 *
 * Usage:
 *   registry-backfill-cli --clear-dir=/path/.clear --session-id=<id> --session-number=<n>
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
exports.runBackfill = runBackfill;
exports.parseArgs = parseArgs;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const audit_log_1 = require("../../sync/audit-log");
const validation_1 = require("../../validation");
function readRegistry(registryPath) {
    const content = fs.readFileSync(registryPath, 'utf-8');
    const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
    if (!parsed || !Array.isArray(parsed.workpackages)) {
        throw new Error(`registry.yaml has no workpackages array: ${registryPath}`);
    }
    return parsed;
}
function writeRegistryAtomic(registryPath, registry) {
    const serialized = yaml.dump(registry);
    const tmp = `${registryPath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, serialized, 'utf-8');
    try {
        fs.renameSync(tmp, registryPath);
    }
    catch (e) {
        try {
            fs.unlinkSync(tmp);
        }
        catch { /* best effort */ }
        throw e;
    }
}
function readCache(cachePath) {
    if (!fs.existsSync(cachePath)) {
        return null;
    }
    try {
        const raw = fs.readFileSync(cachePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed.registryMtimeMs !== 'number' || typeof parsed.registrySize !== 'number') {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function writeCache(cachePath, cache) {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${cachePath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf-8');
    try {
        fs.renameSync(tmp, cachePath);
    }
    catch (e) {
        try {
            fs.unlinkSync(tmp);
        }
        catch { /* best effort */ }
        throw e;
    }
}
function runBackfill(options) {
    // Resolve --clear-dir tolerant of either convention: clearSubdir holds
    // workpackages/ + state/; projectRoot is the audit basePath.
    const { projectRoot, clearSubdir } = (0, validation_1.resolveClearDir)(options.clearDir);
    const registryPath = path.join(clearSubdir, 'workpackages', 'registry.yaml');
    const cachePath = path.join(clearSubdir, 'state', 'registry-backfill.json');
    if (!fs.existsSync(registryPath)) {
        return {
            status: 'no_changes',
            scanned: 0,
            updated: 0,
            skipped_missing_yaml: 0,
            message: 'No registry.yaml — nothing to backfill (project pre-init or empty)'
        };
    }
    // Composite mtime+size cache key. mtime alone is defeated by cp -p / rsync -a / git stash
    // pop, all of which preserve mtime; size differentiates a structural change from a
    // mtime-only touch.
    const stat = fs.statSync(registryPath);
    const cache = readCache(cachePath);
    if (cache && cache.registryMtimeMs === stat.mtimeMs && cache.registrySize === stat.size) {
        return {
            status: 'skipped_cache',
            scanned: 0,
            updated: 0,
            skipped_missing_yaml: 0,
            message: `Registry unchanged since ${cache.lastRunIso} — backfill skipped`
        };
    }
    const registry = readRegistry(registryPath);
    const wpDir = path.join(clearSubdir, 'workpackages');
    // Scan first; only open audit logger / write if there's work.
    const qualifying = registry.workpackages.filter(e => e.status === 'complete' && (e.progress === undefined || e.progress < 100));
    if (qualifying.length === 0) {
        writeCache(cachePath, {
            registryMtimeMs: stat.mtimeMs,
            registrySize: stat.size,
            lastRunIso: new Date().toISOString()
        });
        return {
            status: 'no_changes',
            scanned: registry.workpackages.length,
            updated: 0,
            skipped_missing_yaml: 0
        };
    }
    let updated = 0;
    let skippedMissingYaml = 0;
    const basePath = projectRoot;
    const auditEnabled = Boolean(options.sessionId) && options.sessionNumber > 0;
    const auditLogger = auditEnabled
        ? new audit_log_1.AuditLogger(basePath, options.sessionId, options.sessionNumber)
        : null;
    for (const entry of qualifying) {
        const fileName = entry.file || `${entry.systemId || entry.id}.yaml`;
        const wpFilePath = path.join(wpDir, fileName);
        if (!fs.existsSync(wpFilePath)) {
            // Degraded mode: WP YAML missing but registry says complete. Backfill the registry
            // entry anyway (the truth-of-record is the terminal status), and audit-log the skipped
            // YAML write so observers can investigate the missing file.
            if (auditLogger) {
                auditLogger.log({
                    domain: 'workpackage',
                    action: 'repair',
                    target: entry.systemId || entry.id,
                    targetDisplayId: entry.id,
                    oldValue: { progress: entry.progress ?? 0 },
                    newValue: { progress: 100 },
                    trigger: 'session_start',
                    metadata: { wpYamlMissing: true, expectedPath: wpFilePath }
                });
            }
            entry.progress = 100;
            skippedMissingYaml += 1;
            updated += 1;
            continue;
        }
        // Update WP YAML in place. Atomic temp+mv so a crash mid-write can't leave a half-written
        // YAML; consistent with the registry-write site at writeRegistryAtomic above.
        try {
            const wpContent = fs.readFileSync(wpFilePath, 'utf-8');
            const wpData = yaml.load(wpContent, { schema: yaml.JSON_SCHEMA });
            wpData.progress = 100;
            const wpTmp = `${wpFilePath}.tmp.${process.pid}.${Date.now()}`;
            fs.writeFileSync(wpTmp, yaml.dump(wpData), 'utf-8');
            try {
                fs.renameSync(wpTmp, wpFilePath);
            }
            catch (renameErr) {
                try {
                    fs.unlinkSync(wpTmp);
                }
                catch { /* best effort */ }
                throw renameErr;
            }
        }
        catch (e) {
            // YAML write failed but the registry-level backfill is still valuable. Audit and
            // continue rather than aborting the whole batch.
            process.stderr.write(`[backfill] WP YAML write failed for ${entry.id}: ${e instanceof Error ? e.message : String(e)}\n`);
            if (auditLogger) {
                auditLogger.log({
                    domain: 'workpackage',
                    action: 'repair',
                    target: entry.systemId || entry.id,
                    targetDisplayId: entry.id,
                    oldValue: { progress: entry.progress ?? 0 },
                    newValue: { progress: 100 },
                    trigger: 'session_start',
                    metadata: { wpYamlWriteFailed: true, error: e instanceof Error ? e.message : String(e) }
                });
            }
            entry.progress = 100;
            updated += 1;
            continue;
        }
        if (auditLogger) {
            auditLogger.log({
                domain: 'workpackage',
                action: 'repair',
                target: entry.systemId || entry.id,
                targetDisplayId: entry.id,
                oldValue: { progress: entry.progress ?? 0 },
                newValue: { progress: 100 },
                trigger: 'session_start'
            });
        }
        entry.progress = 100;
        updated += 1;
    }
    writeRegistryAtomic(registryPath, registry);
    // Refresh cache against the new registry stat (post-write).
    const postStat = fs.statSync(registryPath);
    writeCache(cachePath, {
        registryMtimeMs: postStat.mtimeMs,
        registrySize: postStat.size,
        lastRunIso: new Date().toISOString()
    });
    return {
        status: 'success',
        scanned: registry.workpackages.length,
        updated,
        skipped_missing_yaml: skippedMissingYaml
    };
}
// ==============================================================================
// CLI MAIN
// ==============================================================================
function parseArgs(argv) {
    const options = {
        clearDir: '',
        sessionId: '',
        sessionNumber: 0
    };
    for (const arg of argv) {
        if (arg.startsWith('--clear-dir=')) {
            options.clearDir = arg.substring('--clear-dir='.length);
        }
        else if (arg.startsWith('--session-id=')) {
            options.sessionId = arg.substring('--session-id='.length);
        }
        else if (arg.startsWith('--session-number=')) {
            options.sessionNumber = parseInt(arg.substring('--session-number='.length), 10) || 0;
        }
    }
    if (options.clearDir) {
        options.clearDir = (0, validation_1.validateBasePath)(options.clearDir);
    }
    return options;
}
if (require.main === module) {
    const argv = process.argv.slice(2);
    if (argv.includes('--help') || argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: registry-backfill-cli [options]',
                '',
                'Options:',
                '  --clear-dir=<path>           .clear directory (required)',
                '  --session-id=<id>            Audit log session id (audit log emit gated on this AND --session-number)',
                '  --session-number=<n>         Audit log session number',
                '',
                'Behavior:',
                '  Scans registry.yaml for entries with status=complete and progress<100, sets',
                '  entry.progress=100 directly. Status-derived backfill — does NOT recompute via',
                '  calculateProgress. Idempotent (no-op when registry unchanged or when no qualifying',
                '  entries). Atomic temp+mv write. mtime+size composite cache at',
                '  .clear/state/registry-backfill.json. Missing WP YAML degraded mode: registry entry',
                '  is still backfilled; audit log entry records the missing file.'
            ].join('\n')
        }));
        process.exit(0);
    }
    const options = parseArgs(argv);
    if (!options.clearDir) {
        console.error(JSON.stringify({ status: 'error', error: '--clear-dir is required' }));
        process.exit(1);
    }
    try {
        const result = runBackfill(options);
        console.log(JSON.stringify(result));
        process.exit(result.status === 'error' ? 1 : 0);
    }
    catch (e) {
        console.error(JSON.stringify({
            status: 'error',
            error: e instanceof Error ? e.message : String(e)
        }));
        process.exit(1);
    }
}
//# sourceMappingURL=registry-backfill-cli.js.map