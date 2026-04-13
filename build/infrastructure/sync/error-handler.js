"use strict";
/**
 * WF-5: Error Handling with Retry/Repair
 *
 * Provides graceful degradation with user control for cross-domain sync errors.
 * Implements retry mechanism with exponential backoff and user options flow.
 *
 * Based on P1.6 Feature Brief v1.1.0 Section 3.7.
 *
 * @module infrastructure/sync/error-handler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandlerService = exports.USER_OPTIONS = exports.SyncError = void 0;
exports.calculateBackoff = calculateBackoff;
exports.sleep = sleep;
exports.withRetry = withRetry;
exports.categorizeError = categorizeError;
exports.buildErrorContext = buildErrorContext;
exports.parseUserChoice = parseUserChoice;
exports.formatErrorForUser = formatErrorForUser;
exports.getManualRepairSteps = getManualRepairSteps;
exports.createErrorHandler = createErrorHandler;
const types_1 = require("./types");
// ==============================================================================
// ERROR TYPES
// ==============================================================================
/**
 * Sync error with category and context
 */
class SyncError extends Error {
    constructor(message, category, context, retryCount = 0) {
        super(message);
        this.name = 'SyncError';
        this.category = category;
        this.retryCount = retryCount;
        const handler = types_1.ERROR_HANDLERS[category];
        this.context = {
            category,
            retryable: handler.retryable,
            autoRepairPossible: handler.autoRepairPossible,
            userOptions: buildUserOptions(category, handler),
            ...context
        };
    }
}
exports.SyncError = SyncError;
// ==============================================================================
// USER OPTIONS
// ==============================================================================
/**
 * Standard user options for error recovery
 */
exports.USER_OPTIONS = {
    AUTO_REPAIR: {
        key: 'A',
        label: 'Auto-repair',
        description: 'Apply suggested fixes automatically'
    },
    MANUAL_STEPS: {
        key: 'B',
        label: 'Manual steps',
        description: 'Show exact commands/edits needed to fix manually'
    },
    CONTINUE_ANYWAY: {
        key: 'C',
        label: 'Continue anyway',
        description: 'Proceed with partial sync (may cause inconsistencies)'
    },
    INVESTIGATE: {
        key: 'D',
        label: 'Investigate',
        description: 'Launch debug mode with audit logs to investigate the issue'
    }
};
/**
 * Build user options based on error category and handler
 * @param _category - Error category (reserved for future category-specific options)
 * @param handler - Error handler definition
 */
function buildUserOptions(_category, handler) {
    const options = [];
    if (handler.autoRepairPossible) {
        options.push(exports.USER_OPTIONS.AUTO_REPAIR);
    }
    options.push(exports.USER_OPTIONS.MANUAL_STEPS);
    options.push(exports.USER_OPTIONS.CONTINUE_ANYWAY);
    options.push(exports.USER_OPTIONS.INVESTIGATE);
    return options;
}
/**
 * Calculate exponential backoff delay
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @returns Delay in milliseconds with exponential backoff
 */
function calculateBackoff(attempt, baseDelayMs) {
    // Exponential backoff: base * 2^attempt
    // e.g., 100ms -> 200ms -> 400ms
    return baseDelayMs * Math.pow(2, attempt);
}
/**
 * Sleep for specified duration
 * @param ms - Duration in milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Execute an operation with retry logic
 *
 * @param operation - Async function to execute
 * @param category - Error category for classification
 * @param config - Error handling configuration
 * @param auditLogger - Optional audit logger for tracking retries
 * @returns Retry result with success/failure and retry state
 */
async function withRetry(operation, category, config = types_1.DEFAULT_SYNC_CONFIG.errorHandling, auditLogger) {
    const handler = types_1.ERROR_HANDLERS[category];
    // Determine max retries:
    // - Handler.maxRetries sets the ceiling for specific error types (safety limit)
    // - Config.maxRetries is the global default
    // - Use the smaller of the two when handler specifies a limit
    const maxAttempts = handler.retryable
        ? (handler.maxRetries !== undefined
            ? Math.min(handler.maxRetries, config.maxRetries)
            : config.maxRetries)
        : 1;
    const retryState = {
        attempt: 0,
        maxAttempts,
        nextDelayMs: config.retryBackoffMs,
        totalDelayMs: 0,
        errors: []
    };
    while (retryState.attempt < maxAttempts) {
        try {
            const value = await operation();
            return {
                status: 'success',
                success: true,
                value,
                retryState
            };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            retryState.errors.push(err);
            // Log retry attempt if audit logger provided
            if (auditLogger && retryState.attempt > 0) {
                auditLogger.log({
                    domain: 'sync',
                    action: 'update',
                    target: `retry_attempt_${retryState.attempt}`,
                    trigger: 'error_repair',
                    metadata: {
                        category,
                        attempt: retryState.attempt,
                        error: err.message
                    }
                });
            }
            retryState.attempt++;
            // If more attempts remaining and retryable, wait and retry
            if (retryState.attempt < maxAttempts && handler.retryable) {
                const delay = calculateBackoff(retryState.attempt - 1, config.retryBackoffMs);
                retryState.nextDelayMs = calculateBackoff(retryState.attempt, config.retryBackoffMs);
                retryState.totalDelayMs += delay;
                await sleep(delay);
            }
        }
    }
    // All retries exhausted
    const lastError = retryState.errors[retryState.errors.length - 1];
    const syncError = lastError instanceof SyncError
        ? lastError
        : new SyncError(lastError.message, category, { originalError: lastError }, retryState.attempt);
    return {
        status: 'error',
        success: false,
        error: syncError,
        retryState
    };
}
// ==============================================================================
// ERROR ANALYSIS
// ==============================================================================
/**
 * Analyze an error and determine its category
 * @param error - Error to analyze
 * @returns Error category
 */
function categorizeError(error) {
    const message = error.message.toLowerCase();
    // Check for specific error patterns
    if (message.includes('enoent') || message.includes('no such file')) {
        return 'file_missing';
    }
    if (message.includes('eacces') || message.includes('permission denied')) {
        return 'permission';
    }
    if (message.includes('json') || message.includes('parse') || message.includes('syntax')) {
        return 'parse_error';
    }
    if (message.includes('schema') || message.includes('migration')) {
        return 'schema_migration';
    }
    if (message.includes('systemid') || message.includes('system id')) {
        return 'systemid_missing';
    }
    if (message.includes('position') || message.includes('order')) {
        return 'position_invalid';
    }
    if (message.includes('circular') || message.includes('cycle')) {
        return 'circular_reference';
    }
    if (message.includes('reference') || message.includes('not found') || message.includes('invalid')) {
        return 'reference_invalid';
    }
    if (message.includes('corrupt')) {
        return 'corrupt';
    }
    // Default to corrupt for unknown errors
    return 'corrupt';
}
/**
 * Build error context from an error
 * @param error - Error to analyze
 * @param repairAction - Optional repair action function
 * @returns Error context
 */
function buildErrorContext(error, repairAction) {
    const category = error instanceof SyncError
        ? error.category
        : categorizeError(error);
    const handler = types_1.ERROR_HANDLERS[category];
    return {
        category,
        retryable: handler.retryable,
        autoRepairPossible: handler.autoRepairPossible,
        repairAction,
        userOptions: buildUserOptions(category, handler),
        originalError: error
    };
}
/**
 * Parse user choice from key
 * @param key - User input key (A/B/C/D)
 * @returns Parsed user choice
 */
function parseUserChoice(key) {
    const upperKey = key.toUpperCase().trim();
    switch (upperKey) {
        case 'A':
            return {
                key: 'A',
                proceed: true,
                attemptRepair: true,
                showManualSteps: false,
                investigate: false
            };
        case 'B':
            return {
                key: 'B',
                proceed: false,
                attemptRepair: false,
                showManualSteps: true,
                investigate: false
            };
        case 'C':
            return {
                key: 'C',
                proceed: true,
                attemptRepair: false,
                showManualSteps: false,
                investigate: false
            };
        case 'D':
            return {
                key: 'D',
                proceed: false,
                attemptRepair: false,
                showManualSteps: false,
                investigate: true
            };
        default:
            // Default to investigate for unknown input
            return {
                key: upperKey,
                proceed: false,
                attemptRepair: false,
                showManualSteps: false,
                investigate: true
            };
    }
}
/**
 * Format error message for user display
 * @param error - Error to format
 * @param context - Error context
 * @returns Formatted error message with options
 */
function formatErrorForUser(error, context) {
    const lines = [];
    // Header
    lines.push(`Error: ${error.message}`);
    lines.push(`Category: ${context.category}`);
    lines.push('');
    // Retry info if applicable
    if (error instanceof SyncError && error.retryCount > 0) {
        lines.push(`Retried ${error.retryCount} time(s) without success.`);
        lines.push('');
    }
    // Repair info
    const handler = types_1.ERROR_HANDLERS[context.category];
    if (handler.repairAction) {
        lines.push(`Suggested repair: ${handler.repairAction}`);
        lines.push('');
    }
    // Options
    lines.push('Options:');
    for (const option of context.userOptions) {
        lines.push(`  [${option.key}] ${option.label}: ${option.description}`);
    }
    return lines.join('\n');
}
/**
 * Get manual repair steps for an error category
 * @param category - Error category
 * @param context - Additional context
 * @returns Array of manual repair steps
 */
function getManualRepairSteps(category, context) {
    const steps = [];
    const filePath = context?.filePath;
    switch (category) {
        case 'parse_error':
            steps.push('1. Open the affected file and check for JSON/YAML syntax errors');
            steps.push('2. Look for missing commas, brackets, or quotes');
            steps.push('3. Use a JSON/YAML validator to identify the exact location');
            if (filePath) {
                steps.push(`4. File location: ${filePath}`);
            }
            break;
        case 'file_missing':
            steps.push('1. Check if the file was accidentally deleted');
            steps.push('2. Check if the path is correct');
            steps.push('3. Run initialization to recreate with defaults');
            if (filePath) {
                steps.push(`4. Expected location: ${filePath}`);
            }
            break;
        case 'corrupt':
            steps.push('1. Check for backup files in .clear/backup/');
            steps.push('2. Restore from backup if available');
            steps.push('3. If no backup, delete the file and re-initialize');
            if (filePath) {
                steps.push(`4. Affected file: ${filePath}`);
            }
            break;
        case 'reference_invalid':
            steps.push('1. Run debug CLI to identify orphaned references');
            steps.push('2. Check if referenced entity was deleted');
            steps.push('3. Either recreate the entity or remove the reference');
            steps.push('4. Run: npx ts-node src/infrastructure/sync/cli/debug-cli.ts --check-ids');
            break;
        case 'permission':
            steps.push('1. Check file permissions on .clear/ directory');
            steps.push('2. Ensure your user has read/write access');
            steps.push('3. On Unix: chmod -R u+rw .clear/');
            steps.push('4. On Windows: Check folder properties > Security');
            break;
        case 'schema_migration':
            steps.push('1. Backup your current database');
            steps.push('2. Run migration manually: npx ts-node scripts/migrate-schema.ts');
            steps.push('3. If migration fails, check error logs');
            steps.push('4. Contact support if migration continues to fail');
            break;
        case 'systemid_missing':
            steps.push('1. Run debug CLI with --repair flag');
            steps.push('2. This will generate systemIds for legacy entities');
            steps.push('3. Run: npx ts-node src/infrastructure/sync/cli/debug-cli.ts --repair');
            break;
        case 'position_invalid':
            steps.push('1. Run debug CLI to identify position gaps');
            steps.push('2. Use --repair flag to auto-fix positions');
            steps.push('3. Run: npx ts-node src/infrastructure/sync/cli/debug-cli.ts --repair');
            break;
        case 'circular_reference':
            steps.push('1. Identify the circular dependency chain');
            steps.push('2. Review your workpackage/phase structure');
            steps.push('3. Break the cycle by removing one reference');
            steps.push('4. This requires manual intervention - auto-repair not possible');
            break;
    }
    return steps;
}
/**
 * Error handler for cross-domain sync operations
 */
class ErrorHandlerService {
    constructor(config, auditLogger) {
        this.config = config ?? types_1.DEFAULT_SYNC_CONFIG.errorHandling;
        this.auditLogger = auditLogger;
    }
    /**
     * Handle an error with retry, auto-repair, and user options
     * @param error - Error to handle
     * @param repairAction - Optional repair action function
     * @param userChoiceKey - Pre-selected user choice (for non-interactive mode)
     * @returns Error handling result
     */
    async handleError(error, repairAction, userChoiceKey) {
        const context = buildErrorContext(error, repairAction);
        // Log the error (timestamp, sessionId, sessionNumber auto-filled by AuditLogger)
        if (this.auditLogger) {
            this.auditLogger.log({
                domain: 'sync',
                action: 'update',
                target: 'error_detected',
                trigger: 'auto_sync',
                metadata: {
                    category: context.category,
                    message: error.message,
                    retryable: context.retryable,
                    autoRepairPossible: context.autoRepairPossible
                }
            });
        }
        // If auto-repair is enabled and possible, try it first
        if (this.config.autoRepair && context.autoRepairPossible && repairAction) {
            try {
                await repairAction();
                // Log successful repair
                if (this.auditLogger) {
                    this.auditLogger.log({
                        domain: 'sync',
                        action: 'repair',
                        target: 'auto_repair',
                        trigger: 'error_repair',
                        metadata: {
                            category: context.category,
                            success: true
                        }
                    });
                }
                return {
                    handled: true,
                    proceed: true,
                    repairAttempted: true,
                    repairSucceeded: true,
                    message: `Auto-repair successful for ${context.category}`
                };
            }
            catch (repairError) {
                // Auto-repair failed, continue to user options
                if (this.auditLogger) {
                    this.auditLogger.log({
                        domain: 'sync',
                        action: 'repair',
                        target: 'auto_repair',
                        trigger: 'error_repair',
                        metadata: {
                            category: context.category,
                            success: false,
                            error: repairError instanceof Error ? repairError.message : String(repairError)
                        }
                    });
                }
            }
        }
        // If user choice provided, process it
        if (userChoiceKey) {
            const choice = parseUserChoice(userChoiceKey);
            return this.processUserChoice(choice, context, repairAction);
        }
        // Return context for user interaction
        return {
            handled: false,
            proceed: false,
            repairAttempted: this.config.autoRepair && context.autoRepairPossible,
            repairSucceeded: false,
            message: formatErrorForUser(error, context)
        };
    }
    /**
     * Process user choice for error handling
     */
    async processUserChoice(choice, context, repairAction) {
        if (choice.attemptRepair && repairAction) {
            return this.handleAutoRepair(choice, context, repairAction);
        }
        if (choice.showManualSteps) {
            return this.handleManualSteps(choice, context);
        }
        if (choice.proceed && !choice.attemptRepair) {
            return this.handleContinueAnyway(choice, context);
        }
        if (choice.investigate) {
            return this.handleInvestigate(choice);
        }
        // Unknown choice
        return {
            handled: false,
            proceed: false,
            repairAttempted: false,
            repairSucceeded: false,
            userChoice: choice,
            message: 'Unknown option selected'
        };
    }
    /**
     * Option A: Attempt auto-repair via the provided repair action
     */
    async handleAutoRepair(choice, context, repairAction) {
        try {
            await repairAction();
            if (this.auditLogger) {
                this.auditLogger.log({
                    domain: 'sync',
                    action: 'repair',
                    target: 'user_repair',
                    trigger: 'manual',
                    metadata: {
                        category: context.category,
                        choice: choice.key,
                        success: true
                    }
                });
            }
            return {
                handled: true,
                proceed: true,
                repairAttempted: true,
                repairSucceeded: true,
                userChoice: choice,
                message: 'Repair successful'
            };
        }
        catch (err) {
            return {
                handled: true,
                proceed: false,
                repairAttempted: true,
                repairSucceeded: false,
                userChoice: choice,
                message: `Repair failed: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }
    /**
     * Option B: Return manual repair steps for the error category
     */
    handleManualSteps(choice, context) {
        const steps = getManualRepairSteps(context.category, context.metadata);
        return {
            handled: true,
            proceed: false,
            repairAttempted: false,
            repairSucceeded: false,
            userChoice: choice,
            message: 'Manual repair steps:\n' + steps.join('\n')
        };
    }
    /**
     * Option C: Skip the error and continue with partial sync
     */
    handleContinueAnyway(choice, context) {
        if (this.auditLogger) {
            this.auditLogger.log({
                domain: 'sync',
                action: 'update',
                target: 'error_skipped',
                trigger: 'manual',
                metadata: {
                    category: context.category,
                    choice: choice.key
                }
            });
        }
        return {
            handled: true,
            proceed: true,
            repairAttempted: false,
            repairSucceeded: false,
            userChoice: choice,
            message: 'Proceeding with partial sync. Some inconsistencies may occur.'
        };
    }
    /**
     * Option D: Direct user to debug mode for investigation
     */
    handleInvestigate(choice) {
        return {
            handled: true,
            proceed: false,
            repairAttempted: false,
            repairSucceeded: false,
            userChoice: choice,
            message: 'Launch debug mode:\n  npx ts-node src/infrastructure/sync/cli/debug-cli.ts'
        };
    }
    /**
     * Execute an operation with full error handling (retry + repair + user options)
     * @param operation - Async function to execute
     * @param category - Error category for classification
     * @param repairAction - Optional repair action function
     * @param userChoiceKey - Pre-selected user choice (for non-interactive mode)
     * @returns Operation result or error handling result
     */
    async executeWithErrorHandling(operation, category, repairAction, userChoiceKey) {
        // First, try with retry
        const retryResult = await withRetry(operation, category, this.config, this.auditLogger);
        if (retryResult.status === 'success') {
            return { success: true, value: retryResult.value };
        }
        // Retry failed, handle the error
        const handleResult = await this.handleError(retryResult.error, repairAction, userChoiceKey);
        // If repair succeeded and we should proceed, try the operation again
        if (handleResult.repairSucceeded && handleResult.proceed) {
            try {
                const value = await operation();
                return { success: true, value };
            }
            catch (err) {
                // Operation still failed after repair
                return {
                    success: false,
                    result: {
                        ...handleResult,
                        message: `Operation failed after repair: ${err instanceof Error ? err.message : String(err)}`
                    }
                };
            }
        }
        return { success: false, result: handleResult };
    }
}
exports.ErrorHandlerService = ErrorHandlerService;
// ==============================================================================
// FACTORY FUNCTIONS
// ==============================================================================
/**
 * Create an error handler service
 * @param config - Error handling configuration
 * @param auditLogger - Optional audit logger
 * @returns Error handler service instance
 */
function createErrorHandler(config, auditLogger) {
    return new ErrorHandlerService(config, auditLogger);
}
//# sourceMappingURL=error-handler.js.map