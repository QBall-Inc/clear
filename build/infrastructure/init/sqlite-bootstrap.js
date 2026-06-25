"use strict";
/**
 * SQLite native-module bootstrap (knowledge system prerequisite).
 *
 * CLEAR's knowledge system (capture / search / load / index / deprecate / dismiss /
 * supersede) is backed by better-sqlite3, a native addon. The shipped plugin's
 * node_modules is populated without the compiled addon (the staging build installs
 * with --ignore-scripts, and Claude Code does not run `npm install` when it loads a
 * plugin), so on a consumer machine the addon is typically UNBUILT. An unbuilt addon
 * leaves the knowledge system non-functional: reads return empty, mutations hard-fail.
 *
 * This module ensures the addon is built — idempotently — at init time:
 *   1. Probe whether the addon loads (an in-memory open; no on-disk DB needed).
 *   2. If it does not, first try to DOWNLOAD a precompiled binary via `prebuild-install`
 *      (better-sqlite3's own dependency). The download path needs no compiler toolchain
 *      (make/gcc/python), is faster, and is the path proven to work on a real consumer
 *      machine. If the download is unavailable or does not yield a loadable addon, fall
 *      back to COMPILING from source with `npm rebuild better-sqlite3`. Both run in the
 *      PLUGIN's own node_modules and inherit the process environment, so an org-managed
 *      npm/binary mirror (NPM_CONFIG_REGISTRY and/or better-sqlite3_binary_host_mirror,
 *      injected via the managed settings.json `env` block) is honored automatically.
 *      No org-specific configuration is hard-coded here.
 *   3. Re-probe after each strategy. On success the knowledge system is ready; on failure
 *      we FAIL LOUD — the caller surfaces a Claude-actionable remediation (naming BOTH the
 *      download and compile recovery paths) and the knowledge system is reported
 *      non-functional rather than silently broken.
 *
 * The download/rebuild targets the plugin install (one binary serves every project the
 * user runs CLEAR in), so it is keyed off the plugin root, not the consumer's .clear/.
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
exports.ensureSqliteNativeModule = ensureSqliteNativeModule;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Bounded so a wedged network fetch or compile can never hang `cf-init`. On timeout
// execFileSync throws; we treat that the same as any other download/rebuild failure
// (fail loud). The download and compile paths share this single bound.
const BUILD_TIMEOUT_MS = 180000;
// The probe is a trivial in-memory open; a few seconds is ample. Bounded for the same
// no-hang reason as the rebuild.
const PROBE_TIMEOUT_MS = 15000;
const MODULE_NAME = 'better-sqlite3';
// better-sqlite3's own dependency: downloads a precompiled binary matching the running
// Node runtime/ABI/platform. No compiler toolchain needed.
const PREBUILD_INSTALL_MODULE = 'prebuild-install';
// Run in a FRESH child process (node -e). argv[1] is the resolved module path. A clean
// exit means the native addon loaded and an in-memory database opened; a non-zero exit
// (construction throws) is the canonical unbuilt-addon signature.
const PROBE_SCRIPT = "const Database = require(process.argv[1]); const db = new Database(':memory:'); db.close();";
/**
 * Resolve better-sqlite3 from the plugin root. Returns the resolved module path, or
 * null when the package is not installed under the plugin root at all (e.g. a test
 * fixture or a malformed install) — in which case the bootstrap is not applicable and
 * must not attempt a rebuild.
 */
function locateModule(pluginRoot) {
    try {
        return require.resolve(MODULE_NAME, { paths: [pluginRoot] });
    }
    catch {
        return null;
    }
}
/**
 * Resolve the better-sqlite3 PACKAGE directory (the dir holding its package.json), or
 * null. Used as the cwd for prebuild-install, which reads `./package.json` to pick the
 * prebuilt binary matching this package's name/version and the running runtime/ABI/
 * platform, and writes the result to `./build/Release`.
 */
function locatePackageDir(pluginRoot) {
    try {
        return path.dirname(require.resolve(`${MODULE_NAME}/package.json`, { paths: [pluginRoot] }));
    }
    catch {
        return null;
    }
}
/**
 * Locate the prebuild-install CLI (better-sqlite3's own dependency) as an absolute path to
 * its bin script, resolved from the better-sqlite3 package dir first, then the plugin root.
 * Returns null when prebuild-install is not installed — in which case the download strategy
 * is skipped silently and the compile fallback still runs. We resolve the bin via the
 * package's `bin` field rather than a `node_modules/.bin` symlink because symlinks do not
 * survive every install/copy path (Windows, rsync without -l).
 */
function locatePrebuildInstallBin(packageDir, pluginRoot) {
    try {
        const pkgJsonPath = require.resolve(`${PREBUILD_INSTALL_MODULE}/package.json`, {
            paths: [packageDir, pluginRoot],
        });
        const pkgDir = path.dirname(pkgJsonPath);
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const binField = pkg.bin;
        const binRelPath = typeof binField === 'string'
            ? binField
            : typeof binField === 'object' && binField !== null
                ? binField[PREBUILD_INSTALL_MODULE]
                : undefined;
        if (typeof binRelPath !== 'string') {
            return null;
        }
        // Confine the resolved bin to the prebuild-install package dir — a traversal `bin`
        // value (e.g. "../../evil.js") must never escape the package and get executed.
        const binPath = path.resolve(pkgDir, binRelPath);
        if (binPath !== pkgDir && !binPath.startsWith(pkgDir + path.sep)) {
            return null;
        }
        return fs.existsSync(binPath) ? binPath : null;
    }
    catch {
        return null;
    }
}
/**
 * Try to DOWNLOAD a precompiled better-sqlite3 binary via prebuild-install. Runs the CLI
 * with cwd = the better-sqlite3 package dir (prebuild-install reads `./package.json` and
 * writes the prebuilt to `./build/Release`), inheriting process.env so an org npm/binary
 * mirror applies. Needs no compiler toolchain. Returns false (silently) when
 * prebuild-install is unavailable or exits non-zero; the authoritative success check is
 * the caller's re-probe, never file presence.
 */
function tryDownloadPrebuild(packageDir, pluginRoot) {
    const binPath = locatePrebuildInstallBin(packageDir, pluginRoot);
    if (binPath === null) {
        return false;
    }
    try {
        (0, child_process_1.execFileSync)(process.execPath, [binPath], {
            cwd: packageDir,
            timeout: BUILD_TIMEOUT_MS,
            stdio: 'pipe',
            env: process.env,
        });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Probe whether the better-sqlite3 native addon actually loads, in a fresh child
 * process. Constructing an in-memory database is the load trigger (better-sqlite3 loads
 * its addon lazily on first construction); a non-zero exit is the canonical "bindings
 * file not found" / unbuilt-native-module signature. Uses :memory: so the probe needs no
 * on-disk DB — none exists yet at first-init. The child process is deliberate: it loads
 * the addon clean every time, so a re-probe after `npm rebuild` is not defeated by the
 * parent's module cache memoizing the pre-rebuild load failure, and the native addon is
 * never loaded into the init process itself.
 */
function addonLoads(modulePath) {
    try {
        (0, child_process_1.execFileSync)(process.execPath, ['-e', PROBE_SCRIPT, modulePath], {
            stdio: 'ignore',
            timeout: PROBE_TIMEOUT_MS,
        });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Run `npm rebuild better-sqlite3` in the plugin root, inheriting the process
 * environment so an org-configured npm mirror applies. Returns whether npm exited
 * cleanly; the authoritative success check is the post-rebuild re-probe by the caller.
 */
function runRebuild(pluginRoot) {
    // npm is `npm.cmd` on Windows; the binary name is the only platform-specific bit.
    const npmBinary = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    try {
        (0, child_process_1.execFileSync)(npmBinary, ['rebuild', MODULE_NAME], {
            cwd: pluginRoot,
            timeout: BUILD_TIMEOUT_MS,
            stdio: 'pipe',
            env: process.env,
        });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Claude-actionable fail-loud remediation. Names BOTH recovery paths — prebuild-install
 * (download, lower-risk, no compiler) FIRST and `npm rebuild better-sqlite3` (compile) as
 * the fallback — plus the plugin directory, the managed-settings path for org mirrors, and
 * /cf-debug. CLEAR runs inside a Claude Code session, so this instructs Claude with
 * concrete commands rather than advising a human to edit files. The download-first ordering
 * mirrors the bootstrap's own strategy order; the /cf-debug unbuilt-module hint should carry
 * the same download-first wording (aligned separately in the diagnostic surface).
 */
function failLoudMessage(pluginRoot) {
    return (`[CLEAR] Knowledge system NON-FUNCTIONAL: the better-sqlite3 native module could not be downloaded ` +
        `or built in the CLEAR plugin directory (${pluginRoot}). Knowledge capture, search, and load will not ` +
        `work until this is resolved. Remediation: (1) ensure network access, then download a precompiled ` +
        `binary by running \`npx prebuild-install\` in ${pluginRoot}/node_modules/better-sqlite3 ` +
        `(lower-risk, no compiler required), then re-run /cf-init; (2) or compile from source by running ` +
        `\`npm rebuild better-sqlite3\` in ${pluginRoot}, then re-run /cf-init; (3) if behind a firewall, configure ` +
        `the organization npm mirror in the managed settings.json \`env\` block ` +
        `(NPM_CONFIG_REGISTRY and/or better-sqlite3_binary_host_mirror), then re-run /cf-init; ` +
        `(4) run /cf-debug to confirm the module status.`);
}
/**
 * Ensure the better-sqlite3 native addon is built for the plugin at `pluginRoot`.
 * Idempotent: returns 'already-built' (no side effects) when the addon already loads,
 * 'not-applicable' when the package is not installed under the plugin root, 'downloaded'
 * when a precompiled binary was fetched via prebuild-install, 'rebuilt' when a compile
 * produced a loadable addon, and 'failed' (with a Claude-actionable remediation message)
 * when the addon could not be made loadable.
 *
 * Strategy order when the addon is unbuilt: DOWNLOAD first (prebuild-install — no compiler,
 * the path proven to work on a real consumer), then COMPILE (npm rebuild) as the fallback.
 * A fresh-child re-probe after each strategy is the authoritative success check — never
 * file presence — so a stale or wrong-ABI binary is treated as unbuilt and superseded.
 */
function ensureSqliteNativeModule(pluginRoot) {
    const modulePath = locateModule(pluginRoot);
    if (modulePath === null) {
        return {
            status: 'not-applicable',
            message: `better-sqlite3 is not installed under the plugin root (${pluginRoot}); skipping native-module bootstrap.`,
        };
    }
    if (addonLoads(modulePath)) {
        return { status: 'already-built', message: 'Knowledge database native module is already built.' };
    }
    // Unbuilt addon. Try the DOWNLOAD path first (no compiler toolchain needed); the re-probe
    // is the source of truth, so a download that does not yield a loadable addon falls through.
    const packageDir = locatePackageDir(pluginRoot);
    if (packageDir !== null && tryDownloadPrebuild(packageDir, pluginRoot) && addonLoads(modulePath)) {
        return {
            status: 'downloaded',
            message: 'Knowledge database native module was unbuilt; a precompiled binary was downloaded successfully.',
        };
    }
    // Fall back to COMPILING from source.
    const rebuilt = runRebuild(pluginRoot);
    if (rebuilt && addonLoads(modulePath)) {
        return {
            status: 'rebuilt',
            message: 'Knowledge database native module was unbuilt and has been rebuilt successfully.',
        };
    }
    return { status: 'failed', message: failLoudMessage(pluginRoot) };
}
//# sourceMappingURL=sqlite-bootstrap.js.map