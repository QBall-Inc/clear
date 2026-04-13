"use strict";
/**
 * Configuration System Types
 *
 * Defines all interfaces for the CLEAR Framework configuration system.
 * Resource limits are critical for stability - see Appendix B of feature brief.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfigLogger = void 0;
/**
 * Default logger implementation using console
 */
exports.defaultConfigLogger = {
    debug: (message, context) => console.debug(`[config:debug] ${message}`, context || ''),
    info: (message, context) => console.info(`[config:info] ${message}`, context || ''),
    warn: (message, context) => console.warn(`[config:warn] ${message}`, context || ''),
    error: (message, context) => console.error(`[config:error] ${message}`, context || ''),
};
//# sourceMappingURL=types.js.map