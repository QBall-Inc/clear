"use strict";
/**
 * Registry persistence - save/load skill registry to/from YAML
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
exports.saveRegistry = saveRegistry;
exports.loadRegistry = loadRegistry;
const fs = __importStar(require("fs/promises"));
const yaml = __importStar(require("js-yaml"));
/**
 * Save registry to YAML file
 */
async function saveRegistry(registry, filePath, frameworkVersion = '1.0.0') {
    const data = {
        version: '1.0',
        metadata: {
            framework_version: frameworkVersion,
            last_modified: new Date().toISOString()
        },
        global_skills: {
            core: mapSkillsToPersistedFormat(registry.getByType('core')),
            development: mapSkillsToPersistedFormat(registry.getByType('development')),
            community: mapSkillsToPersistedFormat(registry.getByType('community'))
        },
        project_skills: mapSkillsToPersistedFormat(registry.getByType('project'))
    };
    const yamlContent = yaml.dump(data, {
        indent: 2,
        lineWidth: 100,
        noRefs: true
    });
    await fs.writeFile(filePath, yamlContent, 'utf-8');
}
/**
 * Load registry from YAML file
 */
async function loadRegistry(registry, filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = yaml.load(content);
    // Clear existing registry
    registry.clear();
    // Load global skills
    loadSkillsFromPersisted(registry, data.global_skills.core, 'core');
    loadSkillsFromPersisted(registry, data.global_skills.development, 'development');
    loadSkillsFromPersisted(registry, data.global_skills.community, 'community');
    // Load project skills
    loadSkillsFromPersisted(registry, data.project_skills, 'project');
}
/**
 * Convert SkillMetadata to persisted format
 */
function mapSkillsToPersistedFormat(skills) {
    return skills.map(skill => ({
        name: skill.name,
        location: skill.path,
        version: skill.version,
        load_priority: skill.priority,
        dependencies: skill.dependencies.length > 0 ? skill.dependencies : undefined,
        always_load: skill.priority === 1 ? true : undefined
    }));
}
/**
 * Load skills from persisted format into registry
 */
function loadSkillsFromPersisted(registry, skills, type) {
    for (const skill of skills) {
        const metadata = {
            name: skill.name,
            version: skill.version,
            path: skill.location,
            type,
            priority: skill.load_priority,
            dependencies: skill.dependencies || [],
            loaded: false
        };
        registry.register(metadata);
    }
}
//# sourceMappingURL=registry-persistence.js.map