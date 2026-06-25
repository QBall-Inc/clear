"use strict";
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
exports.appendPendingReview = appendPendingReview;
exports.drainPendingReview = drainPendingReview;
exports.readPendingReviews = readPendingReviews;
/**
 * Pending-reviews queue (K2.7 P5)
 *
 * Persistent queue of knowledge entry IDs that were surfaced via PostToolUse
 * ("may need review" warnings) but were not actioned within the session.
 * Queue is surfaced at the next session-start via pending-reviews-cli.ts so
 * Claude sees carry-over items in additionalContext.
 *
 * Storage: .clear/state/pending-reviews.json
 * Concurrency: atomic temp-file + mv (parity with post-tool.sh:91-103 accumulator).
 * Dedup: by entry_id on append.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const parser_1 = require("./parser");
const SCHEMA_VERSION = '1.0';
function queueFilePath(clearDir) {
    return path.join(clearDir, 'state', 'pending-reviews.json');
}
/**
 * Runtime shape + content validator for a pending-review entry.
 * entry_id must match the strict ID format (TD|BR|PAT|LES-###) — this doubles
 * as path-traversal and injection prevention for all downstream consumers
 * that interpolate entry_id into file paths, additionalContext, or jq output.
 */
function isValidPendingEntry(e) {
    if (typeof e !== 'object' || e === null)
        return false;
    const r = e;
    return (typeof r.entry_id === 'string' &&
        (0, parser_1.isValidId)(r.entry_id) &&
        typeof r.trigger === 'string' &&
        typeof r.file_path === 'string' &&
        typeof r.added_at === 'string' &&
        typeof r.source_tool === 'string');
}
function readQueue(queuePath) {
    if (!fs.existsSync(queuePath)) {
        return { version: SCHEMA_VERSION, entries: [] };
    }
    try {
        const raw = fs.readFileSync(queuePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' &&
            parsed !== null &&
            Array.isArray(parsed.entries)) {
            const validEntries = parsed.entries.filter(isValidPendingEntry);
            return { version: SCHEMA_VERSION, entries: validEntries };
        }
        return { version: SCHEMA_VERSION, entries: [] };
    }
    catch {
        return { version: SCHEMA_VERSION, entries: [] };
    }
}
function writeQueueAtomic(queuePath, data) {
    const dir = path.dirname(queuePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${queuePath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, queuePath);
}
/**
 * Append a pending-review entry. Deduped by entry_id — if an entry with the
 * same entry_id already exists, the call is a no-op (preserves original added_at).
 * Returns true if the entry was newly added, false if it was already present.
 */
function appendPendingReview(clearDir, entry) {
    if (!isValidPendingEntry(entry)) {
        return false;
    }
    const queuePath = queueFilePath(clearDir);
    const data = readQueue(queuePath);
    if (data.entries.some(e => e.entry_id === entry.entry_id)) {
        return false;
    }
    data.entries.push(entry);
    writeQueueAtomic(queuePath, data);
    return true;
}
/**
 * Drain (remove) a pending-review entry by entry_id. No-op if not present.
 * Returns true if an entry was removed.
 */
function drainPendingReview(clearDir, entryId) {
    if (!(0, parser_1.isValidId)(entryId)) {
        return false;
    }
    const queuePath = queueFilePath(clearDir);
    if (!fs.existsSync(queuePath)) {
        return false;
    }
    const data = readQueue(queuePath);
    const initialLen = data.entries.length;
    data.entries = data.entries.filter(e => e.entry_id !== entryId);
    if (data.entries.length === initialLen) {
        return false;
    }
    writeQueueAtomic(queuePath, data);
    return true;
}
/**
 * Read pending-reviews entries with lazy file-existence filter applied.
 * Entries whose knowledge markdown file no longer exists are filtered out
 * of the returned list but NOT removed from the queue (preserves queue
 * integrity — the entry may be recreated later).
 */
function readPendingReviews(clearDir) {
    const queuePath = queueFilePath(clearDir);
    if (!fs.existsSync(queuePath)) {
        return [];
    }
    const data = readQueue(queuePath);
    const entriesDir = path.join(clearDir, 'knowledge', 'entries');
    return data.entries.filter(e => {
        const markdownPath = path.join(entriesDir, `${e.entry_id}.md`);
        return fs.existsSync(markdownPath);
    });
}
//# sourceMappingURL=pending-reviews.js.map