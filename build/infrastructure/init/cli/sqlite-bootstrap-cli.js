"use strict";
/**
 * SQLite native-module bootstrap CLI (standalone heal entrypoint).
 *
 * Thin wrapper over ensureSqliteNativeModule(pluginRoot) (see ../sqlite-bootstrap).
 * Lets the better-sqlite3 native binding be healed OUTSIDE cf-init — specifically
 * from the session-start dispatcher — so an already-initialized project recovers
 * the knowledge database after a binding-loss event (plugin restage that ships
 * without the compiled addon, a WSL2<->Windows ABI switch, or a Node version bump)
 * without a manual /cf-init or /cf-debug.
 *
 * Single responsibility: parse --plugin-root, validate it, run the bootstrap, and
 * emit the SqliteBootstrapResult as JSON. The download/rebuild logic lives entirely
 * in sqlite-bootstrap.ts and is reused unchanged.
 *
 * Exit semantics (kept clean so the dispatcher's `|| true` is the only safety net it
 * needs): exit 0 for every benign outcome — already-built, downloaded, rebuilt,
 * not-applicable — and exit 1 ONLY on 'failed' (the binding could not be made
 * loadable) or on a missing/invalid --plugin-root argument. A non-zero exit never
 * carries state-outcome meaning here, only a genuine failure.
 *
 *   node build/infrastructure/init/cli/sqlite-bootstrap-cli.js --plugin-root=<abs path>
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
exports.runSqliteBootstrapCLI = runSqliteBootstrapCLI;
const path = __importStar(require("path"));
const sqlite_bootstrap_1 = require("../sqlite-bootstrap");
/**
 * Validate --plugin-root and run the native-module bootstrap. Fail fast (CS3): a
 * missing, empty, or non-absolute plugin root returns an 'error' result WITHOUT
 * throwing, so the caller decides the exit code. An absolute path is resolved (and
 * traversal-rejected) before it reaches ensureSqliteNativeModule, which uses it as a
 * child-process cwd and module-resolution root.
 */
function runSqliteBootstrapCLI(pluginRoot) {
    if (!pluginRoot) {
        return {
            status: 'error',
            message: 'MISSING_PLUGIN_ROOT: --plugin-root=<absolute path> is required.',
        };
    }
    if (pluginRoot.includes('..')) {
        return {
            status: 'error',
            message: `INVALID_PLUGIN_ROOT: --plugin-root contains a traversal sequence (${pluginRoot}).`,
        };
    }
    if (!path.isAbsolute(pluginRoot)) {
        return {
            status: 'error',
            message: `INVALID_PLUGIN_ROOT: --plugin-root must be an absolute path (${pluginRoot}).`,
        };
    }
    const result = (0, sqlite_bootstrap_1.ensureSqliteNativeModule)(pluginRoot);
    return { status: result.status, message: result.message };
}
// ==============================================================================
// CLI MAIN BLOCK
// ==============================================================================
function parsePluginRoot() {
    const prefix = '--plugin-root=';
    for (const arg of process.argv.slice(2)) {
        if (arg.startsWith(prefix)) {
            return arg.substring(prefix.length);
        }
    }
    return '';
}
// Map an outcome to a process exit code: 0 for every benign status, 1 only for a
// genuine failure ('failed') or a bad/missing argument ('error').
function exitCodeFor(status) {
    return status === 'failed' || status === 'error' ? 1 : 0;
}
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('help')) {
        console.log(JSON.stringify({
            success: true,
            message: [
                'Usage: sqlite-bootstrap-cli.js --plugin-root=<absolute path>',
                '',
                'Ensures the knowledge database native module (better-sqlite3) is built',
                'for the plugin at the given root. Idempotent — a fast no-op when the',
                'module already loads. Downloads a precompiled binary (or compiles from',
                'source) when the binding is missing or wrong-ABI.',
                '',
                'Options:',
                '  --plugin-root=<path>   Absolute path to the plugin root (required).',
            ].join('\n'),
        }));
        process.exit(0);
    }
    const output = runSqliteBootstrapCLI(parsePluginRoot());
    console.log(JSON.stringify(output));
    if (output.status === 'failed') {
        // Fail loud at the CLI layer too, not only in the structured field — the
        // bootstrap message names the Claude-actionable recovery commands.
        process.stderr.write(output.message + '\n');
    }
    process.exit(exitCodeFor(output.status));
}
//# sourceMappingURL=sqlite-bootstrap-cli.js.map