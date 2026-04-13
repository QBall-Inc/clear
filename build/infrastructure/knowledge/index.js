"use strict";
/**
 * Knowledge Infrastructure Module
 *
 * Exports all knowledge management utilities for use by
 * knowledge automation scripts.
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
exports.getTagInferenceMap = exports.getCapturePatterns = exports.getSearchPatterns = exports.clearPatternsCache = exports.generateSuggestedTitle = exports.getPendingCaptureConfig = exports.inferTags = exports.detectConfirmation = exports.detectCaptureTrigger = exports.detectSearchIntent = exports.loadPatternsConfig = exports.getTypeFromId = exports.isValidId = exports.getNextId = exports.updateKnowledgeFile = exports.writeKnowledgeFile = exports.generateKnowledgeMarkdown = exports.parseAllKnowledgeFiles = exports.scanKnowledgeFiles = exports.parseKnowledgeFile = exports.parseFrontmatter = exports.TfIdfIndex = exports.cosineSimilarity = exports.computeTfIdfVector = exports.computeIdf = exports.computeTermFrequency = exports.tokenize = exports.importJsonIndex = exports.exportJsonIndex = exports.KnowledgeDatabase = void 0;
// Types
__exportStar(require("./types"), exports);
// Database utilities
var db_1 = require("./db");
Object.defineProperty(exports, "KnowledgeDatabase", { enumerable: true, get: function () { return db_1.KnowledgeDatabase; } });
Object.defineProperty(exports, "exportJsonIndex", { enumerable: true, get: function () { return db_1.exportJsonIndex; } });
Object.defineProperty(exports, "importJsonIndex", { enumerable: true, get: function () { return db_1.importJsonIndex; } });
// TF-IDF utilities
var tfidf_1 = require("./tfidf");
Object.defineProperty(exports, "tokenize", { enumerable: true, get: function () { return tfidf_1.tokenize; } });
Object.defineProperty(exports, "computeTermFrequency", { enumerable: true, get: function () { return tfidf_1.computeTermFrequency; } });
Object.defineProperty(exports, "computeIdf", { enumerable: true, get: function () { return tfidf_1.computeIdf; } });
Object.defineProperty(exports, "computeTfIdfVector", { enumerable: true, get: function () { return tfidf_1.computeTfIdfVector; } });
Object.defineProperty(exports, "cosineSimilarity", { enumerable: true, get: function () { return tfidf_1.cosineSimilarity; } });
Object.defineProperty(exports, "TfIdfIndex", { enumerable: true, get: function () { return tfidf_1.TfIdfIndex; } });
// Markdown parser utilities
var parser_1 = require("./parser");
Object.defineProperty(exports, "parseFrontmatter", { enumerable: true, get: function () { return parser_1.parseFrontmatter; } });
Object.defineProperty(exports, "parseKnowledgeFile", { enumerable: true, get: function () { return parser_1.parseKnowledgeFile; } });
Object.defineProperty(exports, "scanKnowledgeFiles", { enumerable: true, get: function () { return parser_1.scanKnowledgeFiles; } });
Object.defineProperty(exports, "parseAllKnowledgeFiles", { enumerable: true, get: function () { return parser_1.parseAllKnowledgeFiles; } });
Object.defineProperty(exports, "generateKnowledgeMarkdown", { enumerable: true, get: function () { return parser_1.generateKnowledgeMarkdown; } });
Object.defineProperty(exports, "writeKnowledgeFile", { enumerable: true, get: function () { return parser_1.writeKnowledgeFile; } });
Object.defineProperty(exports, "updateKnowledgeFile", { enumerable: true, get: function () { return parser_1.updateKnowledgeFile; } });
Object.defineProperty(exports, "getNextId", { enumerable: true, get: function () { return parser_1.getNextId; } });
Object.defineProperty(exports, "isValidId", { enumerable: true, get: function () { return parser_1.isValidId; } });
Object.defineProperty(exports, "getTypeFromId", { enumerable: true, get: function () { return parser_1.getTypeFromId; } });
// Pattern detection utilities
var patterns_1 = require("./patterns");
Object.defineProperty(exports, "loadPatternsConfig", { enumerable: true, get: function () { return patterns_1.loadPatternsConfig; } });
Object.defineProperty(exports, "detectSearchIntent", { enumerable: true, get: function () { return patterns_1.detectSearchIntent; } });
Object.defineProperty(exports, "detectCaptureTrigger", { enumerable: true, get: function () { return patterns_1.detectCaptureTrigger; } });
Object.defineProperty(exports, "detectConfirmation", { enumerable: true, get: function () { return patterns_1.detectConfirmation; } });
Object.defineProperty(exports, "inferTags", { enumerable: true, get: function () { return patterns_1.inferTags; } });
Object.defineProperty(exports, "getPendingCaptureConfig", { enumerable: true, get: function () { return patterns_1.getPendingCaptureConfig; } });
Object.defineProperty(exports, "generateSuggestedTitle", { enumerable: true, get: function () { return patterns_1.generateSuggestedTitle; } });
Object.defineProperty(exports, "clearPatternsCache", { enumerable: true, get: function () { return patterns_1.clearPatternsCache; } });
Object.defineProperty(exports, "getSearchPatterns", { enumerable: true, get: function () { return patterns_1.getSearchPatterns; } });
Object.defineProperty(exports, "getCapturePatterns", { enumerable: true, get: function () { return patterns_1.getCapturePatterns; } });
Object.defineProperty(exports, "getTagInferenceMap", { enumerable: true, get: function () { return patterns_1.getTagInferenceMap; } });
//# sourceMappingURL=index.js.map