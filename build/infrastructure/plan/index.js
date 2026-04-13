"use strict";
/**
 * Plan Management Module
 *
 * Provides plan loading, multi-signal progress tracking, milestone detection,
 * and blocker identification for the CLEAR Framework.
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanRegistryManager = exports.PlanRegistryError = exports.serializeMasterPlan = exports.writeStateFile = exports.parseStateFile = exports.extractPlanSummary = exports.readPhaseDetail = exports.readMasterPlanMd = exports.parseMasterPlanContent = exports.parseMasterPlanYaml = exports.PlanParseError = void 0;
// Types
__exportStar(require("./types"), exports);
// Parser
var parser_1 = require("./parser");
Object.defineProperty(exports, "PlanParseError", { enumerable: true, get: function () { return parser_1.PlanParseError; } });
Object.defineProperty(exports, "parseMasterPlanYaml", { enumerable: true, get: function () { return parser_1.parseMasterPlanYaml; } });
Object.defineProperty(exports, "parseMasterPlanContent", { enumerable: true, get: function () { return parser_1.parseMasterPlanContent; } });
Object.defineProperty(exports, "readMasterPlanMd", { enumerable: true, get: function () { return parser_1.readMasterPlanMd; } });
Object.defineProperty(exports, "readPhaseDetail", { enumerable: true, get: function () { return parser_1.readPhaseDetail; } });
Object.defineProperty(exports, "extractPlanSummary", { enumerable: true, get: function () { return parser_1.extractPlanSummary; } });
Object.defineProperty(exports, "parseStateFile", { enumerable: true, get: function () { return parser_1.parseStateFile; } });
Object.defineProperty(exports, "writeStateFile", { enumerable: true, get: function () { return parser_1.writeStateFile; } });
Object.defineProperty(exports, "serializeMasterPlan", { enumerable: true, get: function () { return parser_1.serializeMasterPlan; } });
// Registry
var registry_1 = require("./registry");
Object.defineProperty(exports, "PlanRegistryError", { enumerable: true, get: function () { return registry_1.PlanRegistryError; } });
Object.defineProperty(exports, "PlanRegistryManager", { enumerable: true, get: function () { return registry_1.PlanRegistryManager; } });
//# sourceMappingURL=index.js.map