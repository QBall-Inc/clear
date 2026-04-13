"use strict";
/**
 * Plan Write CLI
 *
 * Thin wrapper over writer.ts for writing master plan YAML.
 * Reads YAML from stdin, validates via parseMasterPlanContent(),
 * delegates to writeMasterPlan() for file I/O.
 *
 * Usage: echo '<yaml>' | node plan-write-cli.js --cwd=<path>
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
const fs = __importStar(require("fs"));
const parser_1 = require("../parser");
const writer_1 = require("../writer");
function parseArgs() {
    const argv = process.argv.slice(2);
    let cwd = '.';
    let backup = false;
    for (const arg of argv) {
        if (arg.startsWith('--cwd='))
            cwd = arg.substring('--cwd='.length);
        else if (arg === '--backup')
            backup = true;
    }
    return { cwd, backup };
}
function readStdin() {
    const fd = fs.openSync('/dev/stdin', 'r');
    const chunks = [];
    const buf = Buffer.alloc(4096);
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
        chunks.push(buf.subarray(0, bytesRead));
    }
    fs.closeSync(fd);
    return Buffer.concat(chunks).toString('utf-8');
}
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: echo "<yaml>" | plan-write-cli.js [options]',
                '',
                'Reads master-plan YAML from stdin and writes it to disk.',
                '',
                'Options:',
                '  --cwd=<path>                 Project root directory (default: .)',
                '  --backup                     Create a backup before overwriting',
            ].join('\n')
        }));
        process.exit(0);
    }
    const { cwd, backup } = parseArgs();
    try {
        const yamlContent = readStdin();
        if (!yamlContent.trim()) {
            console.error(JSON.stringify({ status: 'error', error: 'No YAML received on stdin' }));
            process.exit(1);
        }
        // Validate: parse the YAML to ensure it's a valid MasterPlan
        const plan = (0, parser_1.parseMasterPlanContent)(yamlContent, 'stdin');
        // Write via writer.ts (handles dir creation, backup, serialization)
        const result = (0, writer_1.writeMasterPlan)(cwd, plan, { backup, createDirs: true });
        console.log(JSON.stringify(result));
        if (result.status !== 'success') {
            process.exit(1);
        }
    }
    catch (error) {
        console.error(JSON.stringify({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
        }));
        process.exit(1);
    }
}
//# sourceMappingURL=plan-write-cli.js.map