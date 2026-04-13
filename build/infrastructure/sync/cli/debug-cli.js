"use strict";
/**
 * Debug CLI for Cross-Domain Sync (WF-7)
 *
 * Provides validation commands for diagnosing and repairing CLEAR state issues.
 * Implements the /cf-debug slash command functionality.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.9.
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
exports.DebugCLI = void 0;
exports.main = main;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const validation_1 = require("../../validation");
const types_1 = require("../types");
const context_hub_1 = require("../context-hub");
// ==============================================================================
// CONSTANTS
// ==============================================================================
const CLEAR_DIR = '.clear';
const STATE_DIR = 'state';
const AUDIT_DIR = 'audit';
const WORKPACKAGES_DIR = 'workpackages';
const KNOWLEDGE_DIR = 'knowledge';
// ==============================================================================
// DEBUG CLI CLASS
// ==============================================================================
/**
 * DebugCLI provides validation and repair functionality for CLEAR state.
 */
class DebugCLI {
    constructor(basePath) {
        this.basePath = (0, validation_1.validateBasePath)(basePath);
        this.clearDir = path.join(this.basePath, CLEAR_DIR);
    }
    // ============================================================================
    // MAIN VALIDATION
    // ============================================================================
    /**
     * Run full diagnostic validation
     * @param options - Debug options
     * @returns Debug report with all issues found
     */
    async validate(options = {}) {
        const issues = [];
        const timestamp = new Date().toISOString();
        // Check if CLEAR directory exists
        if (!this.clearDirExists()) {
            issues.push({
                severity: 'error',
                domain: 'sync',
                message: 'CLEAR directory not found. Run /cf-init to initialize.',
                suggestion: 'Initialize CLEAR with /cf-init',
                autoRepairable: false
            });
            return this.buildReport(timestamp, issues, {});
        }
        // Run validations based on options
        if (!options.domain || options.domain === 'sync') {
            issues.push(...this.validateSyncState());
        }
        if (!options.domain || options.domain === 'workpackage') {
            issues.push(...this.validateWorkpackages());
        }
        if (!options.domain || options.domain === 'plan') {
            issues.push(...this.validatePlan());
        }
        if (!options.domain || options.domain === 'knowledge') {
            issues.push(...this.validateKnowledge());
        }
        // Check dual-IDs if requested
        if (options.checkIds) {
            issues.push(...this.validateDualIds());
        }
        // Cross-domain reference validation
        issues.push(...this.validateCrossDomainReferences());
        // Get state hashes
        const stateHashes = this.calculateStateHashes();
        return this.buildReport(timestamp, issues, stateHashes);
    }
    /**
     * Attempt to repair auto-repairable issues
     * @param report - Debug report with issues to repair
     * @returns Repair result
     */
    async repair(report) {
        const repaired = [];
        const failed = [];
        for (const issue of report.issues) {
            if (!issue.autoRepairable) {
                continue;
            }
            try {
                const success = await this.repairIssue(issue);
                if (success) {
                    repaired.push(issue);
                }
                else {
                    failed.push(issue);
                }
            }
            catch {
                failed.push(issue);
            }
        }
        return { repaired, failed };
    }
    // ============================================================================
    // SYNC STATE VALIDATION
    // ============================================================================
    validateSyncState() {
        const issues = [];
        const syncStatePath = path.join(this.clearDir, STATE_DIR, 'sync-state.json');
        // Check if file exists
        if (!fs.existsSync(syncStatePath)) {
            issues.push({
                severity: 'warning',
                domain: 'sync',
                message: 'sync-state.json not found',
                suggestion: 'Run a sync operation to create state file',
                autoRepairable: true
            });
            return issues;
        }
        try {
            const content = fs.readFileSync(syncStatePath, 'utf-8');
            const state = JSON.parse(content);
            // Validate structure
            if (!(0, types_1.isSyncState)(state)) {
                issues.push({
                    severity: 'error',
                    domain: 'sync',
                    message: 'sync-state.json has invalid structure',
                    suggestion: 'Delete and recreate sync state',
                    autoRepairable: true
                });
                return issues;
            }
            // Check workpackage has systemId
            if (state.workpackage.systemId && !(0, types_1.isWorkpackageSystemId)(state.workpackage.systemId)) {
                issues.push({
                    severity: 'error',
                    domain: 'sync',
                    message: `Invalid workpackage systemId format: ${state.workpackage.systemId}`,
                    systemId: state.workpackage.systemId,
                    suggestion: 'SystemId should be in format wp-{uuid}',
                    autoRepairable: false
                });
            }
            // Check phase has systemId
            if (state.plan.activePhaseSystemId && !(0, types_1.isPhaseSystemId)(state.plan.activePhaseSystemId)) {
                issues.push({
                    severity: 'error',
                    domain: 'sync',
                    message: `Invalid phase systemId format: ${state.plan.activePhaseSystemId}`,
                    systemId: state.plan.activePhaseSystemId,
                    suggestion: 'SystemId should be in format ph-{uuid}',
                    autoRepairable: false
                });
            }
            // Check for stale sync
            const lastSync = new Date(state.lastFullSync);
            const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
            if (hoursSinceSync > 24) {
                issues.push({
                    severity: 'info',
                    domain: 'sync',
                    message: `Last full sync was ${Math.floor(hoursSinceSync)} hours ago`,
                    suggestion: 'Consider running a full sync',
                    autoRepairable: false
                });
            }
        }
        catch (error) {
            issues.push({
                severity: 'error',
                domain: 'sync',
                message: `Failed to parse sync-state.json: ${error}`,
                suggestion: 'Delete corrupted file and recreate',
                autoRepairable: true
            });
        }
        return issues;
    }
    // ============================================================================
    // WORKPACKAGE VALIDATION
    // ============================================================================
    validateWorkpackages() {
        const issues = [];
        const registryPath = path.join(this.clearDir, WORKPACKAGES_DIR, 'registry.yaml');
        // Check if registry exists
        if (!fs.existsSync(registryPath)) {
            issues.push({
                severity: 'warning',
                domain: 'workpackage',
                message: 'Workpackage registry not found',
                suggestion: 'Create workpackages/registry.yaml',
                autoRepairable: false
            });
            return issues;
        }
        try {
            const content = fs.readFileSync(registryPath, 'utf-8');
            // Check for systemId in entries
            const systemIdRegex = /systemId:\s*["']?(wp-[a-f0-9]+)["']?/gi;
            const matches = content.matchAll(systemIdRegex);
            const systemIds = new Set();
            for (const match of matches) {
                const systemId = match[1];
                if (systemIds.has(systemId)) {
                    issues.push({
                        severity: 'error',
                        domain: 'workpackage',
                        message: `Duplicate systemId found: ${systemId}`,
                        systemId,
                        suggestion: 'Each workpackage must have a unique systemId',
                        autoRepairable: false
                    });
                }
                systemIds.add(systemId);
            }
            // Check for legacy entries without systemId
            const idRegex = /^\s*-?\s*id:\s*["']?([^"'\n]+)["']?/gm;
            const idMatches = content.matchAll(idRegex);
            const displayIds = [];
            for (const match of idMatches) {
                displayIds.push(match[1]);
            }
            // If we have display IDs but no systemIds, warn
            if (displayIds.length > 0 && systemIds.size === 0) {
                issues.push({
                    severity: 'warning',
                    domain: 'workpackage',
                    message: 'Workpackages use legacy display IDs without systemIds',
                    suggestion: 'Run migration to add systemIds to all workpackages',
                    autoRepairable: true
                });
            }
        }
        catch (error) {
            issues.push({
                severity: 'error',
                domain: 'workpackage',
                message: `Failed to read workpackage registry: ${error}`,
                suggestion: 'Check file permissions and YAML syntax',
                autoRepairable: false
            });
        }
        return issues;
    }
    // ============================================================================
    // PLAN VALIDATION
    // ============================================================================
    validatePlan() {
        const issues = [];
        const planDir = path.join(this.clearDir, 'plans');
        // Check for plan directory
        if (!fs.existsSync(planDir)) {
            issues.push({
                severity: 'info',
                domain: 'plan',
                message: 'Plans directory not found',
                suggestion: 'Create .clear/plans/ directory',
                autoRepairable: true
            });
            return issues;
        }
        // Check for master-plan.yaml
        const masterPlanPath = path.join(planDir, 'master-plan.yaml');
        if (!fs.existsSync(masterPlanPath)) {
            issues.push({
                severity: 'warning',
                domain: 'plan',
                message: 'master-plan.yaml not found',
                suggestion: 'Create master-plan.yaml with phases and workpackage references',
                autoRepairable: false
            });
            return issues;
        }
        try {
            const content = fs.readFileSync(masterPlanPath, 'utf-8');
            // Check for phase systemIds
            const phaseSystemIds = new Set();
            const phaseRegex = /systemId:\s*["']?(ph-[a-z0-9]+)["']?/gi;
            for (const match of content.matchAll(phaseRegex)) {
                const systemId = match[1].toLowerCase();
                if (phaseSystemIds.has(systemId)) {
                    issues.push({
                        severity: 'error',
                        domain: 'plan',
                        message: `Duplicate phase systemId: ${systemId}`,
                        systemId,
                        suggestion: 'Each phase must have a unique systemId',
                        autoRepairable: false
                    });
                }
                phaseSystemIds.add(systemId);
            }
            // Check for position gaps
            const positions = [];
            const posRegex = /position:\s*(\d+)/g;
            for (const match of content.matchAll(posRegex)) {
                positions.push(parseInt(match[1], 10));
            }
            if (positions.length > 0) {
                positions.sort((a, b) => a - b);
                for (let i = 1; i < positions.length; i++) {
                    if (positions[i] - positions[i - 1] > 1) {
                        issues.push({
                            severity: 'warning',
                            domain: 'plan',
                            message: `Position gap detected between ${positions[i - 1]} and ${positions[i]}`,
                            suggestion: 'Positions should be sequential without gaps',
                            autoRepairable: true
                        });
                    }
                }
            }
        }
        catch (error) {
            issues.push({
                severity: 'error',
                domain: 'plan',
                message: `Failed to read master-plan.yaml: ${error}`,
                suggestion: 'Check YAML syntax',
                autoRepairable: false
            });
        }
        return issues;
    }
    // ============================================================================
    // KNOWLEDGE VALIDATION
    // ============================================================================
    validateKnowledge() {
        const issues = [];
        const knowledgeDir = path.join(this.clearDir, KNOWLEDGE_DIR);
        // Check for knowledge directory
        if (!fs.existsSync(knowledgeDir)) {
            issues.push({
                severity: 'info',
                domain: 'knowledge',
                message: 'Knowledge directory not found',
                suggestion: 'Create .clear/knowledge/ directory',
                autoRepairable: true
            });
            return issues;
        }
        // Check for index.db
        const dbPath = path.join(knowledgeDir, 'index.db');
        if (!fs.existsSync(dbPath)) {
            issues.push({
                severity: 'warning',
                domain: 'knowledge',
                message: 'Knowledge index database not found',
                suggestion: 'Run knowledge-index.sh to create database',
                autoRepairable: false
            });
        }
        // Check schema version (if db exists)
        // Note: We can't easily read SQLite without the library, so just check existence
        return issues;
    }
    // ============================================================================
    // DUAL-ID VALIDATION
    // ============================================================================
    validateDualIds() {
        const issues = [];
        // Read sync state to check references
        const syncStatePath = path.join(this.clearDir, STATE_DIR, 'sync-state.json');
        if (!fs.existsSync(syncStatePath)) {
            return issues;
        }
        try {
            const content = fs.readFileSync(syncStatePath, 'utf-8');
            const state = JSON.parse(content);
            // Check workpackage references in knowledge links
            for (const [wpId, links] of Object.entries(state.links.workpackageKnowledge)) {
                // Workpackage ID should be a systemId
                if (!(0, types_1.isWorkpackageSystemId)(wpId)) {
                    issues.push({
                        severity: 'error',
                        domain: 'sync',
                        message: `Knowledge links use display ID instead of systemId: ${wpId}`,
                        systemId: wpId,
                        suggestion: 'Update links to use workpackage systemId (wp-{uuid})',
                        autoRepairable: true
                    });
                }
                // Check each link
                for (const link of links) {
                    if (!(0, types_1.isWorkpackageSystemId)(link.workpackageId)) {
                        issues.push({
                            severity: 'error',
                            domain: 'knowledge',
                            message: `Link ${link.id} uses invalid workpackageId: ${link.workpackageId}`,
                            systemId: link.workpackageId,
                            suggestion: 'Update link to use systemId format',
                            autoRepairable: true
                        });
                    }
                    if (!(0, types_1.isPhaseSystemId)(link.phaseId)) {
                        issues.push({
                            severity: 'error',
                            domain: 'knowledge',
                            message: `Link ${link.id} uses invalid phaseId: ${link.phaseId}`,
                            systemId: link.phaseId,
                            suggestion: 'Update link to use systemId format',
                            autoRepairable: true
                        });
                    }
                }
            }
        }
        catch {
            // Parsing error already handled in validateSyncState
        }
        return issues;
    }
    // ============================================================================
    // CROSS-DOMAIN REFERENCE VALIDATION (GAP-08)
    // ============================================================================
    /**
     * Validate cross-domain references - check that referenced entities exist
     * GAP-08: Enhanced to verify entity existence, not just format
     */
    validateCrossDomainReferences() {
        const issues = [];
        const syncStatePath = path.join(this.clearDir, STATE_DIR, 'sync-state.json');
        if (!fs.existsSync(syncStatePath)) {
            return issues;
        }
        // Load registries for existence checking
        const existingWorkpackages = this.loadWorkpackageSystemIds();
        const existingPhases = this.loadPhaseSystemIds();
        try {
            const content = fs.readFileSync(syncStatePath, 'utf-8');
            const state = JSON.parse(content);
            // Check if active workpackage systemId matches displayId format
            if (state.workpackage.systemId && state.workpackage.displayId) {
                const wpSystemId = state.workpackage.systemId;
                const wpDisplayId = state.workpackage.displayId;
                // DisplayId should look like P1.4, P2.1, etc.
                if (!wpDisplayId.match(/^P\d+\.\d+$/)) {
                    issues.push({
                        severity: 'warning',
                        domain: 'workpackage',
                        message: `DisplayId format unexpected: ${wpDisplayId}`,
                        systemId: wpSystemId,
                        suggestion: 'DisplayId should be in format P{phase}.{position}',
                        autoRepairable: false
                    });
                }
                // GAP-08: Verify active workpackage exists in registry
                if (wpSystemId && existingWorkpackages.size > 0 && !existingWorkpackages.has(wpSystemId)) {
                    issues.push({
                        severity: 'error',
                        domain: 'sync',
                        message: `Active workpackage references non-existent systemId: ${wpSystemId}`,
                        systemId: wpSystemId,
                        suggestion: 'Update sync state to reference an existing workpackage or recreate the workpackage',
                        autoRepairable: false
                    });
                }
            }
            // GAP-08: Verify active phase exists in plan
            if (state.plan.activePhaseSystemId && existingPhases.size > 0) {
                if (!existingPhases.has(state.plan.activePhaseSystemId)) {
                    issues.push({
                        severity: 'error',
                        domain: 'sync',
                        message: `Active phase references non-existent systemId: ${state.plan.activePhaseSystemId}`,
                        systemId: state.plan.activePhaseSystemId,
                        suggestion: 'Update sync state to reference an existing phase',
                        autoRepairable: false
                    });
                }
            }
            // GAP-08: Validate all knowledge link references
            for (const [wpId, links] of Object.entries(state.links.workpackageKnowledge)) {
                // Check that the workpackage key exists
                if (existingWorkpackages.size > 0 && !existingWorkpackages.has(wpId)) {
                    issues.push({
                        severity: 'error',
                        domain: 'knowledge',
                        message: `Knowledge links reference non-existent workpackage: ${wpId}`,
                        systemId: wpId,
                        suggestion: 'Remove orphaned links or recreate the workpackage',
                        autoRepairable: true
                    });
                }
                // Check each link's references
                for (const link of links) {
                    // Check workpackageId reference
                    if (existingWorkpackages.size > 0 && !existingWorkpackages.has(link.workpackageId)) {
                        issues.push({
                            severity: 'error',
                            domain: 'knowledge',
                            message: `Link ${link.id} references non-existent workpackage: ${link.workpackageId}`,
                            systemId: link.workpackageId,
                            suggestion: 'Update link to reference an existing workpackage or remove orphaned link',
                            autoRepairable: true
                        });
                    }
                    // Check phaseId reference
                    if (existingPhases.size > 0 && !existingPhases.has(link.phaseId)) {
                        issues.push({
                            severity: 'error',
                            domain: 'knowledge',
                            message: `Link ${link.id} references non-existent phase: ${link.phaseId}`,
                            systemId: link.phaseId,
                            suggestion: 'Update link to reference an existing phase or remove orphaned link',
                            autoRepairable: true
                        });
                    }
                }
            }
        }
        catch {
            // Parsing error already handled elsewhere
        }
        return issues;
    }
    /**
     * Load all existing workpackage systemIds from registry
     */
    loadWorkpackageSystemIds() {
        const systemIds = new Set();
        const registryPath = path.join(this.clearDir, WORKPACKAGES_DIR, 'registry.yaml');
        if (!fs.existsSync(registryPath)) {
            return systemIds;
        }
        try {
            const content = fs.readFileSync(registryPath, 'utf-8');
            const systemIdRegex = /systemId:\s*["']?(wp-[a-f0-9-]+)["']?/gi;
            for (const match of content.matchAll(systemIdRegex)) {
                systemIds.add(match[1].toLowerCase());
            }
        }
        catch {
            // Ignore read errors
        }
        return systemIds;
    }
    /**
     * Load all existing phase systemIds from master-plan.yaml
     */
    loadPhaseSystemIds() {
        const systemIds = new Set();
        const planPath = path.join(this.clearDir, 'plans', 'master-plan.yaml');
        if (!fs.existsSync(planPath)) {
            return systemIds;
        }
        try {
            const content = fs.readFileSync(planPath, 'utf-8');
            const systemIdRegex = /systemId:\s*["']?(ph-[a-z0-9-]+)["']?/gi;
            for (const match of content.matchAll(systemIdRegex)) {
                systemIds.add(match[1].toLowerCase());
            }
        }
        catch {
            // Ignore read errors
        }
        return systemIds;
    }
    // ============================================================================
    // REPAIR OPERATIONS
    // ============================================================================
    async repairIssue(issue) {
        switch (issue.message) {
            case 'sync-state.json not found':
            case 'sync-state.json has invalid structure':
                return this.repairSyncState();
            case 'Plans directory not found':
                return this.createDirectory(path.join(this.clearDir, 'plans'));
            case 'Knowledge directory not found':
                return this.createDirectory(path.join(this.clearDir, KNOWLEDGE_DIR));
            case 'Workpackages use legacy display IDs without systemIds':
                // This would require the workpackage registry manager
                // For now, return false - manual migration needed
                return false;
            default:
                // Check for position gap repair
                if (issue.message.includes('Position gap detected')) {
                    return this.repairPositionGaps();
                }
                return false;
        }
    }
    /**
     * Repair position gaps in master-plan.yaml by renumbering sequentially
     * Preserves systemIds - only position values change
     */
    repairPositionGaps() {
        try {
            const planDir = path.join(this.clearDir, 'plans');
            const masterPlanPath = path.join(planDir, 'master-plan.yaml');
            if (!fs.existsSync(masterPlanPath)) {
                return false;
            }
            const content = fs.readFileSync(masterPlanPath, 'utf-8');
            const lines = content.split('\n');
            const positionEntries = [];
            const positionRegex = /^(\s*)position:\s*(\d+)/;
            // First pass: collect all position entries
            for (let i = 0; i < lines.length; i++) {
                const match = lines[i].match(positionRegex);
                if (match) {
                    positionEntries.push({
                        lineIndex: i,
                        currentPosition: parseInt(match[2], 10),
                        indentLevel: match[1].length
                    });
                }
            }
            if (positionEntries.length === 0) {
                return true; // No positions to repair
            }
            // Group by indent level (same indent = same scope)
            const byIndent = new Map();
            for (const entry of positionEntries) {
                if (!byIndent.has(entry.indentLevel)) {
                    byIndent.set(entry.indentLevel, []);
                }
                byIndent.get(entry.indentLevel).push(entry);
            }
            // For each indent level, sort by current position and renumber sequentially
            for (const [indent, entries] of byIndent) {
                entries.sort((a, b) => a.currentPosition - b.currentPosition);
                let newPosition = 1;
                for (const entry of entries) {
                    const indentStr = ' '.repeat(indent);
                    lines[entry.lineIndex] = `${indentStr}position: ${newPosition}`;
                    newPosition++;
                }
            }
            // Write back
            fs.writeFileSync(masterPlanPath, lines.join('\n'), 'utf-8');
            return true;
        }
        catch {
            return false;
        }
    }
    repairSyncState() {
        try {
            const stateDir = path.join(this.clearDir, STATE_DIR);
            if (!fs.existsSync(stateDir)) {
                fs.mkdirSync(stateDir, { recursive: true });
            }
            const manager = new context_hub_1.SyncStateManager(this.basePath);
            manager.save();
            return true;
        }
        catch {
            return false;
        }
    }
    createDirectory(dirPath) {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            return true;
        }
        catch {
            return false;
        }
    }
    // ============================================================================
    // UTILITY METHODS
    // ============================================================================
    clearDirExists() {
        return fs.existsSync(this.clearDir);
    }
    calculateStateHashes() {
        const hashes = {
            session: '',
            workpackage: '',
            plan: '',
            knowledge: ''
        };
        const stateDir = path.join(this.clearDir, STATE_DIR);
        const files = {
            session: 'session.json',
            workpackage: 'workpackage.json',
            plan: 'plan.json',
            knowledge: 'knowledge.json'
        };
        for (const [domain, filename] of Object.entries(files)) {
            const filePath = path.join(stateDir, filename);
            if (fs.existsSync(filePath)) {
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    hashes[domain] = crypto.createHash('md5').update(content).digest('hex');
                }
                catch {
                    hashes[domain] = 'error';
                }
            }
        }
        return hashes;
    }
    getAuditStatus() {
        const auditDir = path.join(this.clearDir, AUDIT_DIR);
        if (!fs.existsSync(auditDir)) {
            return { currentSession: 0, entriesInSession: 0, totalSessions: 0 };
        }
        try {
            const files = fs.readdirSync(auditDir).filter(f => f.startsWith('session_') && f.endsWith('.jsonl'));
            const totalSessions = files.length;
            if (totalSessions === 0) {
                return { currentSession: 0, entriesInSession: 0, totalSessions: 0 };
            }
            // Get latest session file
            const latestFile = files.sort().pop();
            const sessionMatch = latestFile.match(/session_(\d+)\.jsonl/);
            const currentSession = sessionMatch ? parseInt(sessionMatch[1], 10) : 0;
            // Count entries in current session
            const latestPath = path.join(auditDir, latestFile);
            const content = fs.readFileSync(latestPath, 'utf-8');
            const entriesInSession = content.trim().split('\n').filter(line => line.trim()).length;
            return { currentSession, entriesInSession, totalSessions };
        }
        catch {
            return { currentSession: 0, entriesInSession: 0, totalSessions: 0 };
        }
    }
    buildReport(timestamp, issues, stateHashes) {
        const summary = {
            errors: issues.filter(i => i.severity === 'error').length,
            warnings: issues.filter(i => i.severity === 'warning').length,
            info: issues.filter(i => i.severity === 'info').length,
            autoRepairable: issues.filter(i => i.autoRepairable).length
        };
        // Try to get session info from sync state
        let session = { id: '', number: 0 };
        const syncStatePath = path.join(this.clearDir, STATE_DIR, 'sync-state.json');
        if (fs.existsSync(syncStatePath)) {
            try {
                const state = JSON.parse(fs.readFileSync(syncStatePath, 'utf-8'));
                if (state.session) {
                    session = { id: state.session.id || '', number: state.session.number || 0 };
                }
            }
            catch {
                // Ignore parsing errors
            }
        }
        return {
            timestamp,
            session,
            issues,
            summary,
            stateHashes: stateHashes || { session: '', workpackage: '', plan: '', knowledge: '' },
            auditStatus: this.getAuditStatus()
        };
    }
    // ============================================================================
    // OUTPUT FORMATTING
    // ============================================================================
    /**
     * Format report for console output
     */
    formatReport(report) {
        const lines = [];
        lines.push('═══════════════════════════════════════════════════════════════');
        lines.push('                    CLEAR Debug Report');
        lines.push('═══════════════════════════════════════════════════════════════');
        lines.push(`Generated: ${report.timestamp}`);
        lines.push(`Session: ${report.session.number} (${report.session.id || 'unknown'})`);
        lines.push('');
        // Summary
        lines.push('Summary:');
        lines.push(`  Errors:       ${report.summary.errors}`);
        lines.push(`  Warnings:     ${report.summary.warnings}`);
        lines.push(`  Info:         ${report.summary.info}`);
        lines.push(`  Auto-repair:  ${report.summary.autoRepairable}`);
        lines.push('');
        // Issues by severity
        if (report.issues.length === 0) {
            lines.push('✓ No issues found');
        }
        else {
            // Errors first
            const errors = report.issues.filter(i => i.severity === 'error');
            if (errors.length > 0) {
                lines.push('ERRORS:');
                for (const issue of errors) {
                    lines.push(`  ✗ [${issue.domain}] ${issue.message}`);
                    if (issue.systemId) {
                        lines.push(`    SystemId: ${issue.systemId}`);
                    }
                    if (issue.suggestion) {
                        lines.push(`    Fix: ${issue.suggestion}`);
                    }
                }
                lines.push('');
            }
            // Warnings
            const warnings = report.issues.filter(i => i.severity === 'warning');
            if (warnings.length > 0) {
                lines.push('WARNINGS:');
                for (const issue of warnings) {
                    lines.push(`  ⚠ [${issue.domain}] ${issue.message}`);
                    if (issue.suggestion) {
                        lines.push(`    Fix: ${issue.suggestion}`);
                    }
                }
                lines.push('');
            }
            // Info
            const info = report.issues.filter(i => i.severity === 'info');
            if (info.length > 0) {
                lines.push('INFO:');
                for (const issue of info) {
                    lines.push(`  ℹ [${issue.domain}] ${issue.message}`);
                }
                lines.push('');
            }
        }
        // Audit status
        lines.push('Audit Log Status:');
        lines.push(`  Current Session: ${report.auditStatus.currentSession}`);
        lines.push(`  Entries in Session: ${report.auditStatus.entriesInSession}`);
        lines.push(`  Total Sessions: ${report.auditStatus.totalSessions}`);
        lines.push('');
        lines.push('═══════════════════════════════════════════════════════════════');
        return lines.join('\n');
    }
}
exports.DebugCLI = DebugCLI;
// ==============================================================================
// CLI ENTRY POINT
// ==============================================================================
/**
 * Main CLI entry point
 */
async function main(args) {
    if (args.includes('--help') || args.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: debug-cli.js [domain] [options]',
                '',
                'Runs diagnostic validation across CLEAR subsystems.',
                '',
                'Domains (optional, validates all if omitted):',
                '  session                      Session state integrity',
                '  workpackage                  Workpackage registry + state',
                '  plan                         Plan structure + sync',
                '  knowledge                    Knowledge database + index',
                '  sync                         Sync-state consistency',
                '',
                'Options:',
                '  --repair                     Attempt auto-repair of detected issues',
                '  --check-ids                  Check dual-ID (internal/display) integrity',
                '  --verbose                    Verbose output',
            ].join('\n')
        }));
        process.exit(0);
    }
    const basePath = process.cwd();
    const cli = new DebugCLI(basePath);
    // Parse arguments
    const options = {
        domain: undefined,
        repair: args.includes('--repair'),
        checkIds: args.includes('--check-ids'),
        verbose: args.includes('--verbose')
    };
    // Check for domain argument
    const domainArg = args.find(a => !a.startsWith('--'));
    if (domainArg && ['session', 'workpackage', 'plan', 'knowledge', 'sync'].includes(domainArg)) {
        options.domain = domainArg;
    }
    // Run validation
    const report = await cli.validate(options);
    // Output report
    console.log(cli.formatReport(report));
    // Run repair if requested
    if (options.repair && report.summary.autoRepairable > 0) {
        console.log('\nAttempting auto-repair...\n');
        const result = await cli.repair(report);
        if (result.repaired.length > 0) {
            console.log(`✓ Repaired ${result.repaired.length} issue(s)`);
        }
        if (result.failed.length > 0) {
            console.log(`✗ Failed to repair ${result.failed.length} issue(s)`);
        }
    }
    // Exit with appropriate code
    if (report.summary.errors > 0) {
        process.exit(1);
    }
}
// Run if called directly
if (require.main === module) {
    main(process.argv.slice(2)).catch(error => {
        console.error('Debug CLI error:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=debug-cli.js.map