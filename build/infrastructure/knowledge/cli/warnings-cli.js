#!/usr/bin/env npx ts-node
"use strict";
/**
 * Deprecation Warnings CLI (K2.7)
 *
 * Prints the session-start deprecation banner as raw text (or nothing if no
 * actionable warnings remain after K2.7 lazy filtering).
 *
 * Replaces the inline jq dump in session-start.sh that showed every entry ever
 * added to deprecatedReferences, even after supersession / dismiss / file removal.
 *
 * Usage:
 *   npx ts-node warnings-cli.ts --clear-dir=/path/.clear
 *   node build/.../warnings-cli.js --clear-dir=/path/.clear
 *
 * Output:
 *   - Empty (exit 0) when no actionable warnings
 *   - Multi-line banner text on stdout otherwise
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
const path = __importStar(require("path"));
const validation_1 = require("../../validation");
const deprecation_1 = require("../../sync/deprecation");
function parseArgs() {
    const args = process.argv.slice(2);
    let clearDir = '';
    for (const arg of args) {
        if (arg.startsWith('--clear-dir=')) {
            clearDir = arg.split('=')[1];
        }
    }
    if (clearDir) {
        clearDir = (0, validation_1.validateBasePath)(clearDir);
    }
    return { clearDir };
}
function main() {
    const { clearDir } = parseArgs();
    if (!clearDir) {
        process.stderr.write('Error: --clear-dir is required\n');
        process.exit(1);
    }
    // clearDir is the .clear directory; basePath is its parent.
    const basePath = path.dirname(clearDir);
    // getDeprecationWarnings already applies AC1 (b)+(c) filters (superseded,
    // reviewed). Banner additionally applies AC1 (d) — drop entries whose files
    // are all gone from disk. This is a banner-specific concern, not a library
    // concern.
    const warnings = (0, deprecation_1.getDeprecationWarnings)(basePath)
        .filter(w => !(0, deprecation_1.isOrphanDeprecation)(basePath, w.knowledgeId));
    if (warnings.length === 0) {
        return;
    }
    const lines = [];
    lines.push('**Deprecation Warning (suggested review):** The following knowledge entries may still need attention. For each, please confirm with the user whether supersession is needed — or whether to dismiss if no replacement is required:');
    for (const w of warnings) {
        const detail = w.supersededBy ? ` (superseded by ${w.supersededBy})` : '';
        lines.push(`  - ${w.knowledgeId}${detail}`);
    }
    lines.push('Run `/cf-knowledge show <id>` to inspect, `/cf-knowledge supersede <old> <new>` to replace, or `/cf-knowledge dismiss <id>` to acknowledge without superseding.');
    console.log(lines.join('\n'));
}
if (require.main === module) {
    main();
}
//# sourceMappingURL=warnings-cli.js.map