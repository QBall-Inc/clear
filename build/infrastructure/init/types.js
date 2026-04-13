"use strict";
/**
 * Project Initialization Type Definitions
 *
 * Types for the P2.1 /cf-init command including:
 * - Project detection states
 * - Clear manifest schema
 * - Hook configuration
 * - Session initialization
 *
 * Based on P2.1 Feature Brief v1.1.0.
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
exports.generateProjectId = generateProjectId;
exports.generateInitSessionId = generateInitSessionId;
/**
 * Generate a project ID
 * @returns Project ID in format "prj-xxxxxxxx"
 */
function generateProjectId() {
    const chars = 'abcdef0123456789';
    let id = 'prj-';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}
/**
 * Generate an init session ID
 * @returns Session ID in format "init-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 */
function generateInitSessionId() {
    const uuid = crypto.randomUUID();
    // Keep everything after first segment: 7f3a-9c2b-4e8d-a1b2c3d4e5f6
    const suffix = uuid.split('-').slice(1).join('-');
    return `init-${suffix}`;
}
// Import crypto for UUID generation
const crypto = __importStar(require("crypto"));
//# sourceMappingURL=types.js.map