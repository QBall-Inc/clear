"use strict";
/**
 * Knowledge Database Utilities
 *
 * SQLite database initialization, schema management, and CRUD operations
 * for the knowledge index.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeDatabase = exports.SCHEMA_VERSION = void 0;
exports.exportJsonIndex = exportJsonIndex;
exports.importJsonIndex = importJsonIndex;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const types_1 = require("./types");
const DEPRECATION_TYPES = ['obsolete', 'superseded'];
const DEFAULT_STATUS = 'active';
function safeParseTags(raw) {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function safeParseTfIdf(raw) {
    try {
        const parsed = JSON.parse(raw || '{}');
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    }
    catch {
        return {};
    }
}
function toDeprecationType(v) {
    if (v && DEPRECATION_TYPES.includes(v))
        return v;
    return null;
}
/**
 * SQLite schema version for migrations.
 * Exported so generators (parser.ts generateKnowledgeMarkdown, capture-cli.ts
 * createEntry) can default to the current version without hardcoding a literal
 * that drifts on every schema bump.
 */
exports.SCHEMA_VERSION = 8;
/**
 * SQL statements for schema creation (v8 - includes category-specific columns for IW/SH/PROC)
 */
const SCHEMA_SQL = `
-- Knowledge entries table (v8 - adds category-specific nullable columns)
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  tags TEXT,
  created TEXT,
  created_session INTEGER,
  modified TEXT,
  supersedes TEXT,
  superseded_by TEXT,
  description TEXT,
  file_path TEXT,
  tfidf_vector TEXT,
  workpackage_id TEXT,
  phase_id TEXT,
  deprecated_at TEXT,
  deprecated_reason TEXT,
  archived_at TEXT,
  deprecation_type TEXT,
  superseded_at TEXT,
  schema_version INTEGER DEFAULT 1,
  surfaced_count INTEGER DEFAULT 0,
  supersession_reviewed INTEGER DEFAULT 0,
  source TEXT,
  source_updated TEXT,
  scope TEXT,
  entity_type TEXT,
  role TEXT,
  owns TEXT,
  contact TEXT,
  trigger_event TEXT,
  frequency TEXT,
  tools TEXT,
  automation_hook TEXT,
  promotion_status TEXT
);

-- Index metadata table
CREATE TABLE IF NOT EXISTS index_metadata (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_entries_type ON knowledge_entries(type);
CREATE INDEX IF NOT EXISTS idx_entries_status ON knowledge_entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_created_session ON knowledge_entries(created_session);
CREATE INDEX IF NOT EXISTS idx_entries_workpackage ON knowledge_entries(workpackage_id);
CREATE INDEX IF NOT EXISTS idx_entries_phase ON knowledge_entries(phase_id);

-- Schema version tracking
INSERT OR REPLACE INTO index_metadata (key, value) VALUES ('schema_version', '${exports.SCHEMA_VERSION}');
`;
// Migrations are handled programmatically in migrateToV2()..migrateToV8() to
// support idempotent column additions (SQLite ALTER TABLE limitations).
/**
 * Knowledge database manager
 */
class KnowledgeDatabase {
    /**
     * Create a new KnowledgeDatabase instance
     * @param clearDir - Path to .clear directory
     */
    constructor(clearDir) {
        this.db = null;
        this.dbPath = path.join(clearDir, 'knowledge', 'index.db');
    }
    /**
     * Initialize the database connection and schema
     * @returns True if successful
     */
    initialize() {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Open database
            this.db = new better_sqlite3_1.default(this.dbPath);
            // Enable WAL mode for better concurrency
            this.db.pragma('journal_mode = WAL');
            // Check if this is an existing database that needs migration
            const currentVersion = this.getCurrentSchemaVersion();
            if (currentVersion === 0) {
                // Create fresh schema (for new databases)
                this.db.exec(SCHEMA_SQL);
            }
            else {
                // Run migrations in sequence
                if (currentVersion < 2) {
                    this.migrateToV2();
                }
                if (currentVersion < 3) {
                    this.migrateToV3();
                }
                if (currentVersion < 4) {
                    this.migrateToV4();
                }
                if (currentVersion < 5) {
                    this.migrateToV5();
                }
                if (currentVersion < 6) {
                    this.migrateToV6();
                }
                if (currentVersion < 7) {
                    this.migrateToV7();
                }
                if (currentVersion < 8) {
                    this.migrateToV8();
                }
            }
            return true;
        }
        catch (error) {
            // Honest, scoped warning at the infrastructure layer: the database is genuinely
            // unavailable (returning false is NOT a graceful fallback — the JSON index is a DB
            // export that may not exist). Lead with the cause + a Claude-actionable remediation;
            // do not dump the raw bindings-file error as the primary signal. Surface-specific
            // impact (search/load/capture) is described by those callers, not here.
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[knowledge-db] Knowledge database unavailable: ${message}. This usually means the better-sqlite3 native module is unbuilt; entries already on disk are not lost. Run /cf-debug for the rebuild + reindex remediation.`);
            return false;
        }
    }
    /**
     * Get current schema version from database
     * @returns Schema version (0 if new database, 1+ if existing)
     */
    getCurrentSchemaVersion() {
        if (!this.db)
            return 0;
        try {
            // Check if knowledge_entries table exists
            const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get();
            if (!tableExists) {
                return 0; // New database
            }
            // Check current schema version
            const versionRow = this.db.prepare("SELECT value FROM index_metadata WHERE key = 'schema_version'").get();
            return versionRow ? parseInt(versionRow.value, 10) : 1;
        }
        catch {
            return 0; // Assume new database on error
        }
    }
    /**
     * Migrate database from v1 to v2
     * Adds workpackage_id and phase_id columns for cross-domain sync
     */
    migrateToV2() {
        if (!this.db)
            return;
        try {
            // Check if columns already exist (idempotent migration)
            const tableInfo = this.db.prepare('PRAGMA table_info(knowledge_entries)').all();
            const columnNames = tableInfo.map(col => col.name);
            // Run migration statements individually (SQLite doesn't support multiple ALTER TABLE in one exec)
            if (!columnNames.includes('workpackage_id')) {
                this.db.exec('ALTER TABLE knowledge_entries ADD COLUMN workpackage_id TEXT');
            }
            if (!columnNames.includes('phase_id')) {
                this.db.exec('ALTER TABLE knowledge_entries ADD COLUMN phase_id TEXT');
            }
            // Create indexes (idempotent)
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_entries_workpackage ON knowledge_entries(workpackage_id)');
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_entries_phase ON knowledge_entries(phase_id)');
            // Update schema version
            this.db.exec("INSERT OR REPLACE INTO index_metadata (key, value) VALUES ('schema_version', '2')");
        }
        catch (error) {
            // Log warning - migration failures shouldn't prevent database use but user should know
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[knowledge-db] Schema migration to v2 failed: ${message}. Database may have outdated schema.`);
        }
    }
    /**
     * Migrate database from v2 to v3
     * Adds deprecated_at and deprecated_reason columns for deprecation tracking
     */
    migrateToV3() {
        if (!this.db)
            return;
        try {
            // Check if columns already exist (idempotent migration)
            const tableInfo = this.db.prepare('PRAGMA table_info(knowledge_entries)').all();
            const columnNames = tableInfo.map(col => col.name);
            // Run migration statements individually
            if (!columnNames.includes('deprecated_at')) {
                this.db.exec('ALTER TABLE knowledge_entries ADD COLUMN deprecated_at TEXT');
            }
            if (!columnNames.includes('deprecated_reason')) {
                this.db.exec('ALTER TABLE knowledge_entries ADD COLUMN deprecated_reason TEXT');
            }
            // Update schema version
            this.db.exec("INSERT OR REPLACE INTO index_metadata (key, value) VALUES ('schema_version', '3')");
        }
        catch (error) {
            // Log warning - migration failures shouldn't prevent database use but user should know
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[knowledge-db] Schema migration to v3 failed: ${message}. Database may have outdated schema.`);
        }
    }
    /**
     * Migrate database from v3 to v4
     * Adds archived_at, deprecation_type, and superseded_at columns for unified supersession
     */
    migrateToV4() {
        if (!this.db)
            return;
        try {
            // Check if columns already exist (idempotent migration)
            const tableInfo = this.db.prepare('PRAGMA table_info(knowledge_entries)').all();
            const columnNames = tableInfo.map(col => col.name);
            if (!columnNames.includes('archived_at')) {
                this.db.exec('ALTER TABLE knowledge_entries ADD COLUMN archived_at TEXT');
            }
            if (!columnNames.includes('deprecation_type')) {
                this.db.exec('ALTER TABLE knowledge_entries ADD COLUMN deprecation_type TEXT');
            }
            if (!columnNames.includes('superseded_at')) {
                this.db.exec('ALTER TABLE knowledge_entries ADD COLUMN superseded_at TEXT');
            }
            // Update schema version
            this.db.exec("INSERT OR REPLACE INTO index_metadata (key, value) VALUES ('schema_version', '4')");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[knowledge-db] Schema migration to v4 failed: ${message}. Database may have outdated schema.`);
        }
    }
    /**
     * Migrate database from v4 to v5
     * Adds schema_version column for entry-level schema tracking
     */
    migrateToV5() {
        if (!this.db)
            return;
        try {
            const db = this.db;
            const migrate = db.transaction(() => {
                // Check if column already exists (idempotent migration)
                const tableInfo = db.prepare('PRAGMA table_info(knowledge_entries)').all();
                const columnNames = tableInfo.map(col => col.name);
                if (!columnNames.includes('schema_version')) {
                    db.exec('ALTER TABLE knowledge_entries ADD COLUMN schema_version INTEGER DEFAULT 1');
                }
                // Update schema version
                db.exec("INSERT OR REPLACE INTO index_metadata (key, value) VALUES ('schema_version', '5')");
            });
            migrate();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[knowledge-db] Schema migration to v5 failed: ${message}. Database may have outdated schema.`);
        }
    }
    /**
     * Migrate database from v5 to v6
     * Adds surfaced_count column for surfacing observability
     */
    migrateToV6() {
        if (!this.db)
            return;
        try {
            const db = this.db;
            const migrate = db.transaction(() => {
                const tableInfo = db.prepare('PRAGMA table_info(knowledge_entries)').all();
                const columnNames = tableInfo.map(col => col.name);
                if (!columnNames.includes('surfaced_count')) {
                    db.exec('ALTER TABLE knowledge_entries ADD COLUMN surfaced_count INTEGER DEFAULT 0');
                }
                db.exec("INSERT OR REPLACE INTO index_metadata (key, value) VALUES ('schema_version', '6')");
            });
            migrate();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[knowledge-db] Schema migration to v6 failed: ${message}. Database may have outdated schema.`);
        }
    }
    /**
     * Migrate database from v6 to v7
     * Adds supersession_reviewed column for deprecation surfacing lifecycle
     */
    migrateToV7() {
        if (!this.db)
            return;
        try {
            const db = this.db;
            const migrate = db.transaction(() => {
                const tableInfo = db.prepare('PRAGMA table_info(knowledge_entries)').all();
                const columnNames = tableInfo.map(col => col.name);
                if (!columnNames.includes('supersession_reviewed')) {
                    db.exec('ALTER TABLE knowledge_entries ADD COLUMN supersession_reviewed INTEGER DEFAULT 0');
                }
                db.exec("INSERT OR REPLACE INTO index_metadata (key, value) VALUES ('schema_version', '7')");
            });
            migrate();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[knowledge-db] Schema migration to v7 failed: ${message}. Database may have outdated schema.`);
        }
    }
    /**
     * Migrate database from v7 to v8
     * Adds 12 category-specific nullable TEXT columns for IW/SH/PROC types.
     */
    migrateToV8() {
        if (!this.db)
            return;
        try {
            const db = this.db;
            const migrate = db.transaction(() => {
                const tableInfo = db.prepare('PRAGMA table_info(knowledge_entries)').all();
                const columnNames = tableInfo.map(col => col.name);
                const newColumns = [
                    'source',
                    'source_updated',
                    'scope',
                    'entity_type',
                    'role',
                    'owns',
                    'contact',
                    'trigger_event',
                    'frequency',
                    'tools',
                    'automation_hook',
                    'promotion_status'
                ];
                for (const col of newColumns) {
                    if (!columnNames.includes(col)) {
                        db.exec(`ALTER TABLE knowledge_entries ADD COLUMN ${col} TEXT`);
                    }
                }
                db.exec("INSERT OR REPLACE INTO index_metadata (key, value) VALUES ('schema_version', '8')");
            });
            migrate();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[knowledge-db] Schema migration to v8 failed: ${message}. Database may have outdated schema.`);
        }
    }
    /**
     * Get current schema version
     * @returns Schema version number
     */
    getSchemaVersion() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        try {
            const row = this.db.prepare("SELECT value FROM index_metadata WHERE key = 'schema_version'").get();
            return row ? parseInt(row.value, 10) : 1;
        }
        catch {
            return 1;
        }
    }
    /**
     * Close the database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
    /**
     * Check if database is open
     */
    isOpen() {
        return this.db !== null;
    }
    /**
     * Get database path
     */
    getPath() {
        return this.dbPath;
    }
    /**
     * Insert or update a knowledge entry
     * @param entry - Knowledge entry to upsert
     * @returns True if successful
     */
    upsertEntry(entry) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        try {
            const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO knowledge_entries (
          id, type, title, status, tags, created, created_session,
          modified, supersedes, superseded_by, description, file_path, tfidf_vector,
          workpackage_id, phase_id, deprecated_at, deprecated_reason,
          archived_at, deprecation_type, superseded_at, schema_version, surfaced_count,
          supersession_reviewed,
          source, source_updated, scope, entity_type, role, owns, contact,
          trigger_event, frequency, tools, automation_hook, promotion_status
        ) VALUES (
          @id, @type, @title, @status, @tags, @created, @created_session,
          @modified, @supersedes, @superseded_by, @description, @file_path, @tfidf_vector,
          @workpackage_id, @phase_id, @deprecated_at, @deprecated_reason,
          @archived_at, @deprecation_type, @superseded_at, @schema_version, @surfaced_count,
          @supersession_reviewed,
          @source, @source_updated, @scope, @entity_type, @role, @owns, @contact,
          @trigger_event, @frequency, @tools, @automation_hook, @promotion_status
        )
      `);
            stmt.run({
                id: entry.id,
                type: entry.type,
                title: entry.title,
                status: entry.status,
                tags: JSON.stringify(entry.tags),
                created: entry.created,
                created_session: entry.created_session,
                modified: entry.modified,
                supersedes: entry.supersedes,
                superseded_by: entry.superseded_by,
                description: entry.description,
                file_path: entry.file_path,
                tfidf_vector: JSON.stringify(entry.tfidf_vector),
                workpackage_id: entry.workpackage_id,
                phase_id: entry.phase_id,
                deprecated_at: entry.deprecated_at,
                deprecated_reason: entry.deprecated_reason,
                archived_at: entry.archived_at,
                deprecation_type: entry.deprecation_type,
                superseded_at: entry.superseded_at,
                schema_version: entry.schema_version,
                surfaced_count: entry.surfaced_count,
                supersession_reviewed: entry.supersession_reviewed ? 1 : 0,
                source: entry.source,
                source_updated: entry.source_updated,
                scope: entry.scope,
                entity_type: entry.entity_type,
                role: entry.role,
                owns: entry.owns,
                contact: entry.contact,
                trigger_event: entry.trigger_event,
                frequency: entry.frequency,
                tools: entry.tools,
                automation_hook: entry.automation_hook,
                promotion_status: entry.promotion_status
            });
            return true;
        }
        catch (error) {
            console.error(`Failed to upsert entry ${entry.id}: ${error}`);
            return false;
        }
    }
    /**
     * Insert or update multiple entries in a transaction
     * @param entries - Knowledge entries to upsert
     * @returns Number of entries successfully upserted
     */
    upsertEntries(entries) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO knowledge_entries (
        id, type, title, status, tags, created, created_session,
        modified, supersedes, superseded_by, description, file_path, tfidf_vector,
        workpackage_id, phase_id, deprecated_at, deprecated_reason,
        archived_at, deprecation_type, superseded_at, schema_version, surfaced_count,
        supersession_reviewed,
        source, source_updated, scope, entity_type, role, owns, contact,
        trigger_event, frequency, tools, automation_hook, promotion_status
      ) VALUES (
        @id, @type, @title, @status, @tags, @created, @created_session,
        @modified, @supersedes, @superseded_by, @description, @file_path, @tfidf_vector,
        @workpackage_id, @phase_id, @deprecated_at, @deprecated_reason,
        @archived_at, @deprecation_type, @superseded_at, @schema_version, @surfaced_count,
        @supersession_reviewed,
        @source, @source_updated, @scope, @entity_type, @role, @owns, @contact,
        @trigger_event, @frequency, @tools, @automation_hook, @promotion_status
      )
    `);
        const insertMany = this.db.transaction((entries) => {
            let count = 0;
            for (const entry of entries) {
                stmt.run({
                    id: entry.id,
                    type: entry.type,
                    title: entry.title,
                    status: entry.status,
                    tags: JSON.stringify(entry.tags),
                    created: entry.created,
                    created_session: entry.created_session,
                    modified: entry.modified,
                    supersedes: entry.supersedes,
                    superseded_by: entry.superseded_by,
                    description: entry.description,
                    file_path: entry.file_path,
                    tfidf_vector: JSON.stringify(entry.tfidf_vector),
                    workpackage_id: entry.workpackage_id,
                    phase_id: entry.phase_id,
                    deprecated_at: entry.deprecated_at,
                    deprecated_reason: entry.deprecated_reason,
                    archived_at: entry.archived_at,
                    deprecation_type: entry.deprecation_type,
                    superseded_at: entry.superseded_at,
                    schema_version: entry.schema_version,
                    surfaced_count: entry.surfaced_count,
                    supersession_reviewed: entry.supersession_reviewed ? 1 : 0,
                    source: entry.source,
                    source_updated: entry.source_updated,
                    scope: entry.scope,
                    entity_type: entry.entity_type,
                    role: entry.role,
                    owns: entry.owns,
                    contact: entry.contact,
                    trigger_event: entry.trigger_event,
                    frequency: entry.frequency,
                    tools: entry.tools,
                    automation_hook: entry.automation_hook,
                    promotion_status: entry.promotion_status
                });
                count++;
            }
            return count;
        });
        return insertMany(entries);
    }
    /**
     * Get an entry by ID
     * @param id - Entry ID
     * @returns Entry or null if not found
     */
    getEntry(id) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare('SELECT * FROM knowledge_entries WHERE id = ?');
        const row = stmt.get(id);
        if (!row) {
            return null;
        }
        return this.rowToEntry(row);
    }
    /**
     * Get all entries
     * @param statusFilter - Optional status filter
     * @returns Array of entries
     */
    getAllEntries(statusFilter) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        let sql = 'SELECT * FROM knowledge_entries';
        const params = [];
        if (statusFilter) {
            sql += ' WHERE status = ?';
            params.push(statusFilter);
        }
        sql += ' ORDER BY created DESC';
        const stmt = this.db.prepare(sql);
        const rows = (params.length > 0 ? stmt.all(...params) : stmt.all());
        return rows.map(row => this.rowToEntry(row));
    }
    /**
     * Search entries by tag
     * @param tag - Tag to search for
     * @param activeOnly - Only return active entries
     * @returns Matching entries
     */
    searchByTag(tag, activeOnly = true) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        let sql = `SELECT * FROM knowledge_entries WHERE tags LIKE ?`;
        if (activeOnly) {
            sql += ` AND status = '${DEFAULT_STATUS}'`;
        }
        sql += ' ORDER BY created DESC';
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(`%"${tag}"%`);
        return rows.map(row => this.rowToEntry(row));
    }
    /**
     * Search entries by title keyword
     * @param keyword - Keyword to search for
     * @param activeOnly - Only return active entries
     * @returns Matching entries
     */
    searchByTitle(keyword, activeOnly = true) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        let sql = `SELECT * FROM knowledge_entries WHERE title LIKE ?`;
        if (activeOnly) {
            sql += ` AND status = '${DEFAULT_STATUS}'`;
        }
        sql += ' ORDER BY created DESC';
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(`%${keyword}%`);
        return rows.map(row => this.rowToEntry(row));
    }
    /**
     * Get entries by type
     * @param type - Knowledge type
     * @returns Matching entries
     */
    getEntriesByType(type) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare(`SELECT * FROM knowledge_entries WHERE type = ? ORDER BY created DESC`);
        const rows = stmt.all(type);
        return rows.map(row => this.rowToEntry(row));
    }
    /**
     * Delete an entry by ID
     * @param id - Entry ID
     * @returns True if deleted
     */
    deleteEntry(id) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare('DELETE FROM knowledge_entries WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }
    /**
     * Delete all entries (for full rebuild)
     * @returns Number of entries deleted
     */
    deleteAllEntries() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare('DELETE FROM knowledge_entries');
        const result = stmt.run();
        return result.changes;
    }
    /**
     * Get entry count
     * @returns Number of entries
     */
    getEntryCount() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM knowledge_entries');
        const result = stmt.get();
        return result.count;
    }
    /**
     * Get all entry IDs
     * @returns Array of entry IDs
     */
    getAllEntryIds() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare('SELECT id FROM knowledge_entries');
        const rows = stmt.all();
        return rows.map(row => row.id);
    }
    /**
     * Set metadata value
     * @param key - Metadata key
     * @param value - Metadata value
     */
    setMetadata(key, value) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare('INSERT OR REPLACE INTO index_metadata (key, value) VALUES (?, ?)');
        stmt.run(key, value);
    }
    /**
     * Get metadata value
     * @param key - Metadata key
     * @returns Value or null if not found
     */
    getMetadata(key) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare('SELECT value FROM index_metadata WHERE key = ?');
        const result = stmt.get(key);
        return result?.value ?? null;
    }
    /**
     * Get all metadata
     * @returns Record of key-value pairs
     */
    getAllMetadata() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare('SELECT key, value FROM index_metadata');
        const rows = stmt.all();
        const metadata = {};
        for (const row of rows) {
            metadata[row.key] = row.value;
        }
        return metadata;
    }
    /**
     * Update entry status (for supersession)
     * @param id - Entry ID
     * @param status - New status
     * @param superseded_by - ID of superseding entry (optional)
     * @returns True if updated
     */
    updateEntryStatus(id, status, superseded_by) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        let sql = 'UPDATE knowledge_entries SET status = ?, modified = ?';
        const params = [status, new Date().toISOString()];
        if (superseded_by !== undefined) {
            sql += ', superseded_by = ?';
            params.push(superseded_by);
        }
        sql += ' WHERE id = ?';
        params.push(id);
        const stmt = this.db.prepare(sql);
        const result = stmt.run(...params);
        return result.changes > 0;
    }
    /**
     * Update v4 supersession fields on an entry
     * @param id - Entry ID
     * @param supersededAt - ISO timestamp of supersession
     * @param deprecationType - 'obsolete' | 'superseded'
     * @returns True if updated
     */
    updateSupersessionFields(id, supersededAt, deprecationType) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare('UPDATE knowledge_entries SET superseded_at = ?, deprecation_type = ? WHERE id = ?');
        const result = stmt.run(supersededAt, deprecationType, id);
        return result.changes > 0;
    }
    /**
     * Set supersession_reviewed flag on an entry (Schema v7)
     * @param id - Entry ID
     * @param reviewed - True to mark as reviewed, false to unmark
     * @returns True if updated
     */
    setSupersessionReviewed(id, reviewed) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare('UPDATE knowledge_entries SET supersession_reviewed = ?, modified = ? WHERE id = ?');
        const result = stmt.run(reviewed ? 1 : 0, new Date().toISOString(), id);
        return result.changes > 0;
    }
    /**
     * Deprecate a knowledge entry
     * @param id - Entry ID
     * @param reason - Optional reason for deprecation
     * @returns True if deprecated successfully
     */
    deprecateEntry(id, reason) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const now = new Date().toISOString();
        const stmt = this.db.prepare(`
      UPDATE knowledge_entries
      SET status = 'deprecated', modified = ?, deprecated_at = ?, deprecated_reason = ?
      WHERE id = ?
    `);
        const result = stmt.run(now, now, reason ?? null, id);
        return result.changes > 0;
    }
    /**
     * Get counts by status for statistics
     * @returns Record of status to count
     */
    getCountsByStatus() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM knowledge_entries
      GROUP BY status
    `);
        const rows = stmt.all();
        const result = {};
        for (const row of rows) {
            result[row.status] = row.count;
        }
        return result;
    }
    /**
     * Get counts by type for statistics
     * @returns Record of type to count
     */
    getCountsByType() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM knowledge_entries
      GROUP BY type
    `);
        const rows = stmt.all();
        const result = {};
        for (const row of rows) {
            result[row.type] = row.count;
        }
        return result;
    }
    /**
     * Get recent entries (for activity display)
     * @param limit - Maximum number of entries
     * @returns Recent entries
     */
    getRecentEntries(limit = 5) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare(`
      SELECT * FROM knowledge_entries
      ORDER BY created DESC
      LIMIT ?
    `);
        const rows = stmt.all(limit);
        return rows.map(row => this.rowToEntry(row));
    }
    /**
     * Convert database row to KnowledgeEntry
     */
    rowToEntry(row) {
        return {
            id: row.id,
            type: (0, types_1.isKnowledgeType)(row.type) ? row.type : 'lesson-learned',
            title: row.title,
            status: (0, types_1.isKnowledgeStatus)(row.status) ? row.status : DEFAULT_STATUS,
            tags: safeParseTags(row.tags),
            created: row.created,
            created_session: row.created_session,
            modified: row.modified,
            supersedes: row.supersedes,
            superseded_by: row.superseded_by,
            description: row.description,
            file_path: row.file_path,
            tfidf_vector: safeParseTfIdf(row.tfidf_vector),
            workpackage_id: row.workpackage_id,
            phase_id: row.phase_id,
            deprecated_at: row.deprecated_at,
            deprecated_reason: row.deprecated_reason,
            archived_at: row.archived_at ?? null,
            deprecation_type: toDeprecationType(row.deprecation_type),
            superseded_at: row.superseded_at ?? null,
            schema_version: row.schema_version ?? 1,
            surfaced_count: row.surfaced_count ?? 0,
            supersession_reviewed: row.supersession_reviewed === 1,
            source: row.source ?? null,
            source_updated: row.source_updated ?? null,
            scope: row.scope ?? null,
            entity_type: row.entity_type ?? null,
            role: row.role ?? null,
            owns: row.owns ?? null,
            contact: row.contact ?? null,
            trigger_event: row.trigger_event ?? null,
            frequency: row.frequency ?? null,
            tools: row.tools ?? null,
            automation_hook: row.automation_hook ?? null,
            promotion_status: row.promotion_status ?? null
        };
    }
    // ===========================================================================
    // SURFACING OBSERVABILITY METHODS (Schema v6)
    // ===========================================================================
    /**
     * Batch-update surfaced_count from aggregated JSONL data.
     * @param counts - Map of entry_id to increment value
     * @returns Number of entries updated
     */
    updateSurfacedCounts(counts) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare('UPDATE knowledge_entries SET surfaced_count = COALESCE(surfaced_count, 0) + @increment WHERE id = @id');
        let updated = 0;
        const runUpdates = this.db.transaction(() => {
            for (const [id, increment] of counts) {
                const result = stmt.run({ id, increment });
                if (result.changes > 0)
                    updated++;
            }
        });
        runUpdates();
        return updated;
    }
    // ===========================================================================
    // CROSS-DOMAIN SYNC METHODS (Schema v2)
    // ===========================================================================
    /**
     * Get entries linked to a specific workpackage
     * @param workpackageId - Workpackage systemId (e.g., "wp-a1b2c3d4")
     * @param activeOnly - Only return active entries
     * @returns Matching entries
     */
    getEntriesByWorkpackage(workpackageId, activeOnly = true) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        let sql = 'SELECT * FROM knowledge_entries WHERE workpackage_id = ?';
        if (activeOnly) {
            sql += ` AND status = '${DEFAULT_STATUS}'`;
        }
        sql += ' ORDER BY created DESC';
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(workpackageId);
        return rows.map(row => this.rowToEntry(row));
    }
    /**
     * Get entries linked to a specific phase
     * @param phaseId - Phase systemId (e.g., "ph-abc123")
     * @param activeOnly - Only return active entries
     * @returns Matching entries
     */
    getEntriesByPhase(phaseId, activeOnly = true) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        let sql = 'SELECT * FROM knowledge_entries WHERE phase_id = ?';
        if (activeOnly) {
            sql += ` AND status = '${DEFAULT_STATUS}'`;
        }
        sql += ' ORDER BY created DESC';
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(phaseId);
        return rows.map(row => this.rowToEntry(row));
    }
    /**
     * Link a knowledge entry to a workpackage and phase
     * @param entryId - Knowledge entry ID
     * @param workpackageId - Workpackage systemId
     * @param phaseId - Phase systemId
     * @returns True if updated
     */
    linkToWorkpackage(entryId, workpackageId, phaseId) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare(`
      UPDATE knowledge_entries
      SET workpackage_id = ?, phase_id = ?, modified = ?
      WHERE id = ?
    `);
        const result = stmt.run(workpackageId, phaseId, new Date().toISOString(), entryId);
        return result.changes > 0;
    }
    /**
     * Unlink a knowledge entry from workpackage/phase
     * @param entryId - Knowledge entry ID
     * @returns True if updated
     */
    unlinkFromWorkpackage(entryId) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare(`
      UPDATE knowledge_entries
      SET workpackage_id = NULL, phase_id = NULL, modified = ?
      WHERE id = ?
    `);
        const result = stmt.run(new Date().toISOString(), entryId);
        return result.changes > 0;
    }
    /**
     * Get all entries with deprecated links (linked to deferred/removed workpackages)
     * @param deferredWorkpackageIds - Array of deferred workpackage systemIds
     * @returns Entries with deprecated links
     */
    getEntriesWithDeprecatedLinks(deferredWorkpackageIds) {
        if (!this.db || deferredWorkpackageIds.length === 0) {
            return [];
        }
        const placeholders = deferredWorkpackageIds.map(() => '?').join(',');
        const sql = `
      SELECT * FROM knowledge_entries
      WHERE workpackage_id IN (${placeholders})
      ORDER BY created DESC
    `;
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...deferredWorkpackageIds);
        return rows.map(row => this.rowToEntry(row));
    }
    /**
     * Bulk update workpackage links (for deprecation propagation)
     * @param updates - Array of { entryId, workpackageId, phaseId }
     * @returns Number of entries updated
     */
    bulkUpdateLinks(updates) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare(`
      UPDATE knowledge_entries
      SET workpackage_id = ?, phase_id = ?, modified = ?
      WHERE id = ?
    `);
        const now = new Date().toISOString();
        const updateMany = this.db.transaction((updates) => {
            let count = 0;
            for (const update of updates) {
                const result = stmt.run(update.workpackageId, update.phaseId, now, update.entryId);
                if (result.changes > 0)
                    count++;
            }
            return count;
        });
        return updateMany(updates);
    }
    /**
     * Get count of entries by workpackage
     * @returns Map of workpackageId to entry count
     */
    getEntryCountsByWorkpackage() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        const stmt = this.db.prepare(`
      SELECT workpackage_id, COUNT(*) as count
      FROM knowledge_entries
      WHERE workpackage_id IS NOT NULL
      GROUP BY workpackage_id
    `);
        const rows = stmt.all();
        const result = new Map();
        for (const row of rows) {
            result.set(row.workpackage_id, row.count);
        }
        return result;
    }
    /**
     * Get unlinked entries (not linked to any workpackage)
     * @param activeOnly - Only return active entries
     * @returns Unlinked entries
     */
    getUnlinkedEntries(activeOnly = true) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        let sql = 'SELECT * FROM knowledge_entries WHERE workpackage_id IS NULL';
        if (activeOnly) {
            sql += ` AND status = '${DEFAULT_STATUS}'`;
        }
        sql += ' ORDER BY created DESC';
        const stmt = this.db.prepare(sql);
        const rows = stmt.all();
        return rows.map(row => this.rowToEntry(row));
    }
}
exports.KnowledgeDatabase = KnowledgeDatabase;
/**
 * Export JSON index as fallback
 * @param db - Knowledge database
 * @param outputPath - Path to write JSON file
 * @returns True if successful
 */
function exportJsonIndex(db, outputPath) {
    try {
        const entries = db.getAllEntries();
        const metadata = db.getAllMetadata();
        const index = {
            version: exports.SCHEMA_VERSION,
            exported: new Date().toISOString(),
            metadata,
            entries
        };
        fs.writeFileSync(outputPath, JSON.stringify(index, null, 2));
        return true;
    }
    catch (error) {
        console.error(`Failed to export JSON index: ${error}`);
        return false;
    }
}
/**
 * Import entries from JSON index (fallback restore)
 * @param db - Knowledge database
 * @param jsonPath - Path to JSON index file
 * @returns Number of entries imported
 */
function importJsonIndex(db, jsonPath) {
    try {
        const content = fs.readFileSync(jsonPath, 'utf-8');
        const index = JSON.parse(content);
        if (!index.entries || !Array.isArray(index.entries)) {
            throw new Error('Invalid JSON index format');
        }
        return db.upsertEntries(index.entries);
    }
    catch (error) {
        console.error(`Failed to import JSON index: ${error}`);
        return 0;
    }
}
//# sourceMappingURL=db.js.map