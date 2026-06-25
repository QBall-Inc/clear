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
const yaml = __importStar(require("js-yaml"));
const parser_1 = require("../parser");
const writer_1 = require("../writer");
/**
 * Top-level keys that must be PRESENT in the raw YAML for --validate-only to pass.
 *
 * The lenient parser (parseMasterPlanContent) defaults missing fields to empty
 * strings/arrays. That permissiveness is right for read paths, but --validate-only
 * is the audit path for human-authored rewrites — silently accepting a missing
 * `activePhase` would let typos slip through and corrupt the live plan.
 *
 * `activeWorkpackage` is intentionally excluded: a plan can legitimately have no
 * active WP between phases.
 */
const VALIDATE_ONLY_REQUIRED_KEYS = [
    'version',
    'projectName',
    'status',
    'activePhase',
    'phases',
    'milestones',
];
/**
 * Strict required-field check for --validate-only mode (AC26).
 * Returns list of missing-or-empty top-level keys with field paths.
 */
function checkRequiredFieldsStrict(rawYaml) {
    const parsed = yaml.load(rawYaml, { schema: yaml.JSON_SCHEMA });
    if (!parsed || typeof parsed !== 'object') {
        // parser will have thrown already; defensive empty.
        return [];
    }
    const obj = parsed;
    const missing = [];
    for (const key of VALIDATE_ONLY_REQUIRED_KEYS) {
        const value = obj[key];
        if (value === undefined || value === null) {
            missing.push(key);
            continue;
        }
        if (typeof value === 'string' && value.trim() === '') {
            missing.push(`${key} (empty string)`);
            continue;
        }
        if (Array.isArray(value) && value.length === 0 && (key === 'phases')) {
            // milestones can legitimately be empty array (project may have no milestones)
            // phases empty would mean no work-structure at all — flag as missing.
            missing.push(`${key} (empty array)`);
        }
    }
    return missing;
}
function parseArgs() {
    const argv = process.argv.slice(2);
    let cwd = '.';
    let backup = false;
    let validateOnly = false;
    for (const arg of argv) {
        if (arg.startsWith('--cwd='))
            cwd = arg.substring('--cwd='.length);
        else if (arg === '--backup')
            backup = true;
        else if (arg === '--validate-only')
            validateOnly = true;
    }
    return { cwd, backup, validateOnly };
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
                '  --validate-only              Parse + schema-validate input via the master-plan parser,',
                '                               report errors (line/col where available), and EXIT WITHOUT',
                '                               WRITING (no backup either). Recommended audit path for ad-hoc',
                '                               rewrites — confirm intent before mutating disk.',
            ].join('\n')
        }));
        process.exit(0);
    }
    const { cwd, backup, validateOnly } = parseArgs();
    try {
        const yamlContent = readStdin();
        if (!yamlContent.trim()) {
            console.error(JSON.stringify({ status: 'error', error: 'No YAML received on stdin' }));
            process.exit(1);
        }
        // Always parse the YAML. parseMasterPlanContent throws on YAML parse errors
        // AND structural failures (e.g., phase missing `id`). It is INTENTIONALLY
        // lenient for top-level missing fields — those are caught by the strict
        // check in --validate-only mode below.
        const plan = (0, parser_1.parseMasterPlanContent)(yamlContent, 'stdin');
        // --validate-only: also run the strict required-field check (AC26). Reports
        // schema-level gaps the lenient parser tolerates. Skips writeMasterPlan
        // entirely on either parse OR strict-validate failure.
        if (validateOnly) {
            const missingFields = checkRequiredFieldsStrict(yamlContent);
            if (missingFields.length > 0) {
                console.error(JSON.stringify({
                    status: 'error',
                    action: 'validate-only',
                    error: `Missing required top-level field(s): ${missingFields.join(', ')}`,
                    additionalContext: `[CLEAR] plan-write-cli --validate-only: schema validation failed.\n\n` +
                        `Missing or empty required field(s):\n${missingFields.map(f => `  - ${f}`).join('\n')}\n\n` +
                        `Required top-level keys: ${VALIDATE_ONLY_REQUIRED_KEYS.join(', ')}. No file mutation.`,
                }));
                process.exit(1);
            }
            console.log(JSON.stringify({
                status: 'success',
                action: 'validate-only',
                details: {
                    version: plan.version,
                    projectName: plan.projectName,
                    phaseCount: plan.phases.length,
                    milestoneCount: plan.milestones.length,
                    activePhase: plan.activePhase,
                },
                additionalContext: '[CLEAR] plan-write-cli --validate-only: parse + schema validation passed. No file mutation.',
            }));
            process.exit(0);
        }
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