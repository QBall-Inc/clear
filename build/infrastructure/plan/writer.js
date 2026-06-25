"use strict";
/**
 * Plan Writer Module
 *
 * Writes master plan YAML and markdown files to the filesystem.
 * Part of P2.9a Creation Commands.
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
exports.writeMasterPlan = writeMasterPlan;
exports.masterPlanExists = masterPlanExists;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const validation_1 = require("../validation");
const parser_1 = require("./parser");
/**
 * Write a master plan to YAML file
 *
 * @param cwd - Project root directory
 * @param plan - Master plan to write
 * @param options - Write options
 * @returns Write result with file paths
 */
function writeMasterPlan(cwd, plan, options = {}) {
    const { backup = false, createDirs = true } = options;
    cwd = (0, validation_1.validateBasePath)(cwd);
    // Defense-in-depth: strip any '.clear' suffix the upstream caller may have
    // conflated into cwd. Without this guard, master plan writes leak to
    // `<cwd>/.clear/.clear/plans/master-plan.yaml`.
    cwd = (0, validation_1.stripClearSuffix)(cwd, 'writeMasterPlan');
    const plansDir = path.join(cwd, '.clear', 'plans');
    const yamlPath = path.join(plansDir, 'master-plan.yaml');
    try {
        // Create directory if needed
        if (createDirs && !fs.existsSync(plansDir)) {
            fs.mkdirSync(plansDir, { recursive: true });
        }
        // Backup existing file if requested
        let backupPath;
        if (backup && fs.existsSync(yamlPath)) {
            backupPath = `${yamlPath}.bak`;
            fs.copyFileSync(yamlPath, backupPath);
        }
        // Serialize and write
        const yamlContent = (0, parser_1.serializeMasterPlan)(plan);
        fs.writeFileSync(yamlPath, yamlContent, 'utf-8');
        return {
            status: 'success',
            yamlPath,
            backupPath
        };
    }
    catch (error) {
        return {
            status: 'error',
            yamlPath,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
/**
 * Check if a master plan file exists
 *
 * @param cwd - Project root directory
 * @returns true if master-plan.yaml exists
 */
function masterPlanExists(cwd) {
    const yamlPath = path.join(cwd, '.clear', 'plans', 'master-plan.yaml');
    return fs.existsSync(yamlPath);
}
//# sourceMappingURL=writer.js.map