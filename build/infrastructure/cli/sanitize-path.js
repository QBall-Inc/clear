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
exports.redactProjectPath = redactProjectPath;
const path = __importStar(require("path"));
/**
 * Redact absolute project-path prefix from user-facing message strings.
 *
 * R1 dual-key envelopes mirror additionalContext into the message field;
 * any absolute path embedded in either surfaces to consuming contexts
 * (Claude sessions, logs, screenshots). Strip the cwd prefix so messages
 * stay project-relative and don't leak the developer's full filesystem path.
 *
 * Strips both the resolved-absolute form of cwd (matches Node.js I/O error
 * paths) and the raw cwd form when different (matches messages constructed
 * with a relative cwd).
 *
 * Idempotent: safe to call on messages that contain no cwd prefix.
 */
function redactProjectPath(message, cwd) {
    if (!message || !cwd || cwd === '.')
        return message;
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const absCwd = path.resolve(cwd);
    let result = message;
    if (absCwd && absCwd !== '.') {
        result = result.replace(new RegExp(`${escapeRegex(absCwd)}/?`, 'g'), '');
    }
    if (cwd !== absCwd) {
        result = result.replace(new RegExp(`${escapeRegex(cwd)}/?`, 'g'), '');
    }
    return result;
}
//# sourceMappingURL=sanitize-path.js.map