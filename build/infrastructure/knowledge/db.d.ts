/**
 * Knowledge Database Utilities
 *
 * SQLite database initialization, schema management, and CRUD operations
 * for the knowledge index.
 */
import { KnowledgeEntry } from './types';
/**
 * SQLite schema version for migrations.
 * Exported so generators (parser.ts generateKnowledgeMarkdown, capture-cli.ts
 * createEntry) can default to the current version without hardcoding a literal
 * that drifts on every schema bump.
 */
export declare const SCHEMA_VERSION = 8;
/**
 * Knowledge database manager
 */
export declare class KnowledgeDatabase {
    private db;
    private dbPath;
    /**
     * Create a new KnowledgeDatabase instance
     * @param clearDir - Path to .clear directory
     */
    constructor(clearDir: string);
    /**
     * Initialize the database connection and schema
     * @returns True if successful
     */
    initialize(): boolean;
    /**
     * Get current schema version from database
     * @returns Schema version (0 if new database, 1+ if existing)
     */
    private getCurrentSchemaVersion;
    /**
     * Migrate database from v1 to v2
     * Adds workpackage_id and phase_id columns for cross-domain sync
     */
    private migrateToV2;
    /**
     * Migrate database from v2 to v3
     * Adds deprecated_at and deprecated_reason columns for deprecation tracking
     */
    private migrateToV3;
    /**
     * Migrate database from v3 to v4
     * Adds archived_at, deprecation_type, and superseded_at columns for unified supersession
     */
    private migrateToV4;
    /**
     * Migrate database from v4 to v5
     * Adds schema_version column for entry-level schema tracking
     */
    private migrateToV5;
    /**
     * Migrate database from v5 to v6
     * Adds surfaced_count column for surfacing observability
     */
    private migrateToV6;
    /**
     * Migrate database from v6 to v7
     * Adds supersession_reviewed column for deprecation surfacing lifecycle
     */
    private migrateToV7;
    /**
     * Migrate database from v7 to v8
     * Adds 12 category-specific nullable TEXT columns for IW/SH/PROC types.
     */
    private migrateToV8;
    /**
     * Get current schema version
     * @returns Schema version number
     */
    getSchemaVersion(): number;
    /**
     * Close the database connection
     */
    close(): void;
    /**
     * Check if database is open
     */
    isOpen(): boolean;
    /**
     * Get database path
     */
    getPath(): string;
    /**
     * Insert or update a knowledge entry
     * @param entry - Knowledge entry to upsert
     * @returns True if successful
     */
    upsertEntry(entry: KnowledgeEntry): boolean;
    /**
     * Insert or update multiple entries in a transaction
     * @param entries - Knowledge entries to upsert
     * @returns Number of entries successfully upserted
     */
    upsertEntries(entries: KnowledgeEntry[]): number;
    /**
     * Get an entry by ID
     * @param id - Entry ID
     * @returns Entry or null if not found
     */
    getEntry(id: string): KnowledgeEntry | null;
    /**
     * Get all entries
     * @param statusFilter - Optional status filter
     * @returns Array of entries
     */
    getAllEntries(statusFilter?: string): KnowledgeEntry[];
    /**
     * Search entries by tag
     * @param tag - Tag to search for
     * @param activeOnly - Only return active entries
     * @returns Matching entries
     */
    searchByTag(tag: string, activeOnly?: boolean): KnowledgeEntry[];
    /**
     * Search entries by title keyword
     * @param keyword - Keyword to search for
     * @param activeOnly - Only return active entries
     * @returns Matching entries
     */
    searchByTitle(keyword: string, activeOnly?: boolean): KnowledgeEntry[];
    /**
     * Get entries by type
     * @param type - Knowledge type
     * @returns Matching entries
     */
    getEntriesByType(type: string): KnowledgeEntry[];
    /**
     * Delete an entry by ID
     * @param id - Entry ID
     * @returns True if deleted
     */
    deleteEntry(id: string): boolean;
    /**
     * Delete all entries (for full rebuild)
     * @returns Number of entries deleted
     */
    deleteAllEntries(): number;
    /**
     * Get entry count
     * @returns Number of entries
     */
    getEntryCount(): number;
    /**
     * Get all entry IDs
     * @returns Array of entry IDs
     */
    getAllEntryIds(): string[];
    /**
     * Set metadata value
     * @param key - Metadata key
     * @param value - Metadata value
     */
    setMetadata(key: string, value: string): void;
    /**
     * Get metadata value
     * @param key - Metadata key
     * @returns Value or null if not found
     */
    getMetadata(key: string): string | null;
    /**
     * Get all metadata
     * @returns Record of key-value pairs
     */
    getAllMetadata(): Record<string, string>;
    /**
     * Update entry status (for supersession)
     * @param id - Entry ID
     * @param status - New status
     * @param superseded_by - ID of superseding entry (optional)
     * @returns True if updated
     */
    updateEntryStatus(id: string, status: string, superseded_by?: string): boolean;
    /**
     * Update v4 supersession fields on an entry
     * @param id - Entry ID
     * @param supersededAt - ISO timestamp of supersession
     * @param deprecationType - 'obsolete' | 'superseded'
     * @returns True if updated
     */
    updateSupersessionFields(id: string, supersededAt: string, deprecationType: 'obsolete' | 'superseded'): boolean;
    /**
     * Set supersession_reviewed flag on an entry (Schema v7)
     * @param id - Entry ID
     * @param reviewed - True to mark as reviewed, false to unmark
     * @returns True if updated
     */
    setSupersessionReviewed(id: string, reviewed: boolean): boolean;
    /**
     * Deprecate a knowledge entry
     * @param id - Entry ID
     * @param reason - Optional reason for deprecation
     * @returns True if deprecated successfully
     */
    deprecateEntry(id: string, reason?: string): boolean;
    /**
     * Get counts by status for statistics
     * @returns Record of status to count
     */
    getCountsByStatus(): Record<string, number>;
    /**
     * Get counts by type for statistics
     * @returns Record of type to count
     */
    getCountsByType(): Record<string, number>;
    /**
     * Get recent entries (for activity display)
     * @param limit - Maximum number of entries
     * @returns Recent entries
     */
    getRecentEntries(limit?: number): KnowledgeEntry[];
    /**
     * Convert database row to KnowledgeEntry
     */
    private rowToEntry;
    /**
     * Batch-update surfaced_count from aggregated JSONL data.
     * @param counts - Map of entry_id to increment value
     * @returns Number of entries updated
     */
    updateSurfacedCounts(counts: Map<string, number>): number;
    /**
     * Get entries linked to a specific workpackage
     * @param workpackageId - Workpackage systemId (e.g., "wp-a1b2c3d4")
     * @param activeOnly - Only return active entries
     * @returns Matching entries
     */
    getEntriesByWorkpackage(workpackageId: string, activeOnly?: boolean): KnowledgeEntry[];
    /**
     * Get entries linked to a specific phase
     * @param phaseId - Phase systemId (e.g., "ph-abc123")
     * @param activeOnly - Only return active entries
     * @returns Matching entries
     */
    getEntriesByPhase(phaseId: string, activeOnly?: boolean): KnowledgeEntry[];
    /**
     * Link a knowledge entry to a workpackage and phase
     * @param entryId - Knowledge entry ID
     * @param workpackageId - Workpackage systemId
     * @param phaseId - Phase systemId
     * @returns True if updated
     */
    linkToWorkpackage(entryId: string, workpackageId: string, phaseId: string): boolean;
    /**
     * Unlink a knowledge entry from workpackage/phase
     * @param entryId - Knowledge entry ID
     * @returns True if updated
     */
    unlinkFromWorkpackage(entryId: string): boolean;
    /**
     * Get all entries with deprecated links (linked to deferred/removed workpackages)
     * @param deferredWorkpackageIds - Array of deferred workpackage systemIds
     * @returns Entries with deprecated links
     */
    getEntriesWithDeprecatedLinks(deferredWorkpackageIds: string[]): KnowledgeEntry[];
    /**
     * Bulk update workpackage links (for deprecation propagation)
     * @param updates - Array of { entryId, workpackageId, phaseId }
     * @returns Number of entries updated
     */
    bulkUpdateLinks(updates: Array<{
        entryId: string;
        workpackageId: string | null;
        phaseId: string | null;
    }>): number;
    /**
     * Get count of entries by workpackage
     * @returns Map of workpackageId to entry count
     */
    getEntryCountsByWorkpackage(): Map<string, number>;
    /**
     * Get unlinked entries (not linked to any workpackage)
     * @param activeOnly - Only return active entries
     * @returns Unlinked entries
     */
    getUnlinkedEntries(activeOnly?: boolean): KnowledgeEntry[];
}
/**
 * Export JSON index as fallback
 * @param db - Knowledge database
 * @param outputPath - Path to write JSON file
 * @returns True if successful
 */
export declare function exportJsonIndex(db: KnowledgeDatabase, outputPath: string): boolean;
/**
 * Import entries from JSON index (fallback restore)
 * @param db - Knowledge database
 * @param jsonPath - Path to JSON index file
 * @returns Number of entries imported
 */
export declare function importJsonIndex(db: KnowledgeDatabase, jsonPath: string): number;
//# sourceMappingURL=db.d.ts.map