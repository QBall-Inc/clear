#!/usr/bin/env npx ts-node
"use strict";
/**
 * Knowledge Index CLI
 *
 * CLI tool for building/rebuilding the knowledge index.
 * Called by knowledge-index.sh bash script.
 *
 * Usage:
 *   npx ts-node src/infrastructure/knowledge/cli/index-cli.ts --clear-dir=/path/.clear --mode=full
 *   npx ts-node src/infrastructure/knowledge/cli/index-cli.ts --clear-dir=/path/.clear --mode=incremental
 *   npx ts-node src/infrastructure/knowledge/cli/index-cli.ts --clear-dir=/path/.clear --check-thresholds --session=15
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
exports.incrementalUpdate = incrementalUpdate;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const yaml = __importStar(require("js-yaml"));
const validation_1 = require("../../validation");
const db_1 = require("../db");
const tfidf_1 = require("../tfidf");
const parser_1 = require("../parser");
const types_1 = require("../types");
/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    let clearDir = '';
    let mode = 'full';
    let checkThresholds = false;
    let currentSession = 1;
    let force = false;
    for (const arg of args) {
        if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.split('=')[1];
        }
        else if (arg.startsWith('--mode=')) {
            mode = arg.split('=')[1];
        }
        else if (arg === '--check-thresholds') {
            checkThresholds = true;
        }
        else if (arg.startsWith('--session=')) {
            currentSession = parseInt(arg.split('=')[1], 10);
        }
        else if (arg === '--force') {
            force = true;
        }
    }
    if (clearDir) {
        clearDir = (0, validation_1.validateBasePath)(clearDir);
    }
    return { clearDir, mode, checkThresholds, currentSession, force };
}
/**
 * Load knowledge configuration
 */
function loadConfig(clearDir) {
    const configPath = path.join(clearDir, 'config', 'knowledge.yaml');
    if (fs.existsSync(configPath)) {
        try {
            const content = fs.readFileSync(configPath, 'utf-8');
            const config = yaml.load(content, { schema: yaml.JSON_SCHEMA });
            const knowledgeConfig = (config?.knowledge ?? {});
            // Sanitize keys from parsed YAML to prevent prototype pollution
            const safeConfig = Object.create(null);
            for (const [key, value] of Object.entries(knowledgeConfig)) {
                if (key === '__proto__' || key === 'constructor' || key === 'prototype')
                    continue;
                safeConfig[key] = value;
            }
            return { ...types_1.DEFAULT_KNOWLEDGE_CONFIG, ...safeConfig };
        }
        catch {
            // Fall back to defaults
        }
    }
    return types_1.DEFAULT_KNOWLEDGE_CONFIG;
}
/**
 * Check if rebuild thresholds are exceeded
 */
function shouldRebuild(db, currentSession, config) {
    const lastRebuild = db.getMetadata('last_full_rebuild');
    const lastRebuildSession = db.getMetadata('last_full_rebuild_session');
    if (!lastRebuild || !lastRebuildSession) {
        return { shouldRebuild: true, reason: 'no_previous_rebuild' };
    }
    // Check days threshold
    const lastRebuildDate = new Date(lastRebuild);
    const daysSinceRebuild = Math.floor((Date.now() - lastRebuildDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceRebuild >= config.index.rebuild_threshold_days) {
        return {
            shouldRebuild: true,
            reason: `days_threshold_exceeded (${daysSinceRebuild} >= ${config.index.rebuild_threshold_days})`
        };
    }
    // Check sessions threshold
    const sessionsSinceRebuild = currentSession - parseInt(lastRebuildSession, 10);
    if (sessionsSinceRebuild >= config.index.rebuild_threshold_sessions) {
        return {
            shouldRebuild: true,
            reason: `sessions_threshold_exceeded (${sessionsSinceRebuild} >= ${config.index.rebuild_threshold_sessions})`
        };
    }
    return { shouldRebuild: false, reason: 'thresholds_not_exceeded' };
}
/**
 * Perform full index rebuild
 */
function fullRebuild(db, entriesDir, currentSession) {
    const startTime = Date.now();
    try {
        // Parse all markdown files
        const entries = (0, parser_1.parseAllKnowledgeFiles)(entriesDir);
        if (entries.length === 0) {
            return {
                success: true,
                mode: 'full',
                entriesProcessed: 0,
                entriesAdded: 0,
                entriesUpdated: 0,
                entriesRemoved: 0,
                duration: Date.now() - startTime
            };
        }
        // Build TF-IDF index
        const tfidfIndex = new tfidf_1.TfIdfIndex();
        for (const entry of entries) {
            const text = `${entry.title} ${entry.description} ${entry.tags.join(' ')}`;
            tfidfIndex.addDocument(entry.id, text);
        }
        tfidfIndex.rebuildIdf();
        // Add TF-IDF vectors to entries
        const entriesWithVectors = entries.map(entry => ({
            ...entry,
            tfidf_vector: tfidfIndex.getVector(entry.id)
        }));
        // Clear existing entries and insert new ones
        const deleted = db.deleteAllEntries();
        const inserted = db.upsertEntries(entriesWithVectors);
        // Update metadata
        const now = new Date().toISOString();
        db.setMetadata('last_full_rebuild', now);
        db.setMetadata('last_full_rebuild_session', String(currentSession));
        db.setMetadata('entry_count', String(inserted));
        db.setMetadata('idf_values', JSON.stringify(tfidfIndex.getIdfValues()));
        // Export JSON fallback
        const jsonPath = path.join(path.dirname(db.getPath()), 'index.json');
        (0, db_1.exportJsonIndex)(db, jsonPath);
        return {
            success: true,
            mode: 'full',
            entriesProcessed: entries.length,
            entriesAdded: inserted,
            entriesUpdated: 0,
            entriesRemoved: deleted,
            duration: Date.now() - startTime
        };
    }
    catch (error) {
        return {
            success: false,
            mode: 'full',
            entriesProcessed: 0,
            entriesAdded: 0,
            entriesUpdated: 0,
            entriesRemoved: 0,
            duration: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
/**
 * Perform incremental index update
 * @internal Exported for inline use by capture-cli triggerIndexUpdate
 */
function incrementalUpdate(db, entriesDir) {
    const startTime = Date.now();
    try {
        // Get current file list
        const files = (0, parser_1.scanKnowledgeFiles)(entriesDir);
        const fileIds = new Set(files.map(f => path.basename(f, '.md')));
        // Get existing IDs from database
        const existingIds = new Set(db.getAllEntryIds());
        // Find new, modified, and removed entries
        const toAdd = [];
        const toUpdate = [];
        const toRemove = [];
        // Check for new or modified files
        for (const file of files) {
            const id = path.basename(file, '.md');
            const entry = db.getEntry(id);
            if (!entry) {
                toAdd.push(file);
            }
            else {
                // Check if file was modified (compare timestamps)
                const stat = fs.statSync(file);
                const fileModified = stat.mtime.toISOString();
                if (!entry.modified || fileModified > entry.modified) {
                    toUpdate.push(file);
                }
            }
        }
        // Check for removed files
        for (const id of existingIds) {
            if (!fileIds.has(id)) {
                toRemove.push(id);
            }
        }
        // Load existing IDF values
        const tfidfIndex = new tfidf_1.TfIdfIndex();
        const existingIdf = db.getMetadata('idf_values');
        if (existingIdf) {
            try {
                tfidfIndex.loadIdfValues(JSON.parse(existingIdf));
            }
            catch {
                // Will rebuild IDF if needed
            }
        }
        // Process additions and updates
        let added = 0;
        let updated = 0;
        for (const file of [...toAdd, ...toUpdate]) {
            const entry = (0, parser_1.parseKnowledgeFile)(file);
            if (entry) {
                // Add to TF-IDF index
                const text = `${entry.title} ${entry.description} ${entry.tags.join(' ')}`;
                tfidfIndex.addDocument(entry.id, text);
            }
        }
        // Rebuild IDF if we have new documents
        if (toAdd.length > 0 || toUpdate.length > 0) {
            // Also need existing documents for accurate IDF
            const existingEntries = db.getAllEntries();
            for (const entry of existingEntries) {
                if (!toUpdate.some(f => path.basename(f, '.md') === entry.id)) {
                    const text = `${entry.title} ${entry.description} ${entry.tags.join(' ')}`;
                    tfidfIndex.addDocument(entry.id, text);
                }
            }
            tfidfIndex.rebuildIdf();
        }
        // Insert/update entries
        for (const file of toAdd) {
            const entry = (0, parser_1.parseKnowledgeFile)(file);
            if (entry) {
                entry.tfidf_vector = tfidfIndex.getVector(entry.id);
                if (db.upsertEntry(entry)) {
                    added++;
                }
            }
        }
        for (const file of toUpdate) {
            const entry = (0, parser_1.parseKnowledgeFile)(file);
            if (entry) {
                entry.tfidf_vector = tfidfIndex.getVector(entry.id);
                if (db.upsertEntry(entry)) {
                    updated++;
                }
            }
        }
        // Remove deleted entries
        let removed = 0;
        for (const id of toRemove) {
            if (db.deleteEntry(id)) {
                removed++;
            }
        }
        // Update metadata
        db.setMetadata('entry_count', String(db.getEntryCount()));
        if (toAdd.length > 0 || toUpdate.length > 0) {
            db.setMetadata('idf_values', JSON.stringify(tfidfIndex.getIdfValues()));
        }
        // Export JSON fallback
        const jsonPath = path.join(path.dirname(db.getPath()), 'index.json');
        (0, db_1.exportJsonIndex)(db, jsonPath);
        return {
            success: true,
            mode: 'incremental',
            entriesProcessed: toAdd.length + toUpdate.length + toRemove.length,
            entriesAdded: added,
            entriesUpdated: updated,
            entriesRemoved: removed,
            duration: Date.now() - startTime
        };
    }
    catch (error) {
        return {
            success: false,
            mode: 'incremental',
            entriesProcessed: 0,
            entriesAdded: 0,
            entriesUpdated: 0,
            entriesRemoved: 0,
            duration: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
/**
 * Main entry point
 */
async function main() {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: index-cli.js [options]',
                '',
                'Options:',
                '  --clear-dir=<path>           Path to .clear directory (required)',
                '  --mode=<mode>                Index mode: full, incremental (default: full)',
                '  --check-thresholds           Check if reindex thresholds are exceeded',
                '  --session=<number>           Current session number (default: 1)',
                '  --force                      Force full reindex even if not needed',
            ].join('\n')
        }));
        process.exit(0);
    }
    const { clearDir, mode, checkThresholds, currentSession, force } = parseArgs();
    if (!clearDir) {
        console.error(JSON.stringify({
            success: false,
            error: 'Missing --clear-dir argument'
        }));
        process.exit(1);
    }
    const entriesDir = path.join(clearDir, 'knowledge', 'entries');
    const config = loadConfig(clearDir);
    // Initialize database
    const db = new db_1.KnowledgeDatabase(clearDir);
    if (!db.initialize()) {
        console.error(JSON.stringify({
            success: false,
            error: 'Failed to initialize database'
        }));
        process.exit(1);
    }
    try {
        // Check thresholds mode - just report if rebuild needed
        if (checkThresholds && !force) {
            const { shouldRebuild: needsRebuild, reason } = shouldRebuild(db, currentSession, config);
            console.log(JSON.stringify({
                shouldRebuild: needsRebuild,
                reason,
                currentSession,
                thresholds: {
                    days: config.index.rebuild_threshold_days,
                    sessions: config.index.rebuild_threshold_sessions
                }
            }));
            return;
        }
        // Determine if we should do full or incremental
        let actualMode = mode;
        if (mode === 'incremental') {
            // Check if database has entries
            if (db.getEntryCount() === 0) {
                actualMode = 'full';
            }
        }
        // Perform the index operation
        let result;
        if (actualMode === 'full') {
            result = fullRebuild(db, entriesDir, currentSession);
        }
        else {
            result = incrementalUpdate(db, entriesDir);
        }
        console.log(JSON.stringify(result));
    }
    finally {
        db.close();
    }
}
// Guard: only execute CLI when run directly (not when imported for testing or by capture-cli)
if (require.main === module) {
    main().catch(error => {
        console.error(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error)
        }));
        process.exit(1);
    });
}
//# sourceMappingURL=index-cli.js.map