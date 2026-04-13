"use strict";
/**
 * Path resolution utility for development vs runtime environments
 * See feature brief Appendix A for complete strategy
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
exports.PathResolver = void 0;
exports.getPathResolver = getPathResolver;
const path = __importStar(require("path"));
const os = __importStar(require("os"));
/**
 * Path resolver singleton for consistent path resolution
 */
class PathResolver {
    constructor() {
        // Check if we're in development or production
        if (process.env.NODE_ENV === 'development' || process.env.PROJECT_ROOT) {
            // Development: use project root
            this.pluginRoot = process.env.PROJECT_ROOT || process.cwd();
        }
        else {
            // Production: use Claude's plugin directory
            this.pluginRoot = process.env.PLUGIN_ROOT ||
                path.join(os.homedir(), '.claude/plugins/clear-framework');
        }
    }
    /**
     * Get the singleton instance
     */
    static getInstance() {
        if (!this._instance) {
            this._instance = new PathResolver();
        }
        return this._instance;
    }
    /**
     * Resolve path relative to plugin root
     * @param parts - Path components to join
     * @returns Absolute path
     */
    resolve(...parts) {
        return path.join(this.pluginRoot, ...parts);
    }
    /**
     * Get the plugin root directory
     * @returns Absolute path to plugin root
     */
    getPluginRoot() {
        return this.pluginRoot;
    }
    /**
     * Get path to shared context file
     * @returns Absolute path to context file
     */
    contextFile() {
        return this.resolve('context', 'shared-context.json');
    }
    /**
     * Get path to configuration file
     * @returns Absolute path to config file
     */
    configFile() {
        return this.resolve('config', 'clear-config.yaml');
    }
    /**
     * Get path to a hook script
     * @param namespace - Hook namespace (e.g., 'clear.session.init')
     * @returns Absolute path to hook script
     */
    hookScript(namespace) {
        return this.resolve('src', 'infrastructure', 'hooks', 'generated', `${namespace}.sh`);
    }
    /**
     * Get path to a skill directory
     * @param type - Skill type (core, development, community, project)
     * @param name - Skill name
     * @returns Absolute path to skill directory
     */
    skillPath(type, name) {
        return this.resolve('src', 'skills', type, name);
    }
    /**
     * Get path to plugin manifest
     * @returns Absolute path to manifest.json
     */
    manifestFile() {
        return this.resolve('src', 'infrastructure', 'plugin', 'manifest.json');
    }
    /**
     * Get path to hook settings
     * @returns Absolute path to settings.json
     */
    settingsFile() {
        return this.resolve('src', 'infrastructure', 'plugin', 'settings.json');
    }
    /**
     * Reset the singleton (useful for testing)
     */
    static reset() {
        PathResolver._instance = undefined;
    }
}
exports.PathResolver = PathResolver;
/**
 * Get the default path resolver instance
 */
function getPathResolver() {
    return PathResolver.getInstance();
}
//# sourceMappingURL=paths.js.map