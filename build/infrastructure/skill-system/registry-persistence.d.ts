/**
 * Registry persistence - save/load skill registry to/from YAML
 */
import { SkillRegistry } from './registry';
/**
 * Save registry to YAML file
 */
export declare function saveRegistry(registry: SkillRegistry, filePath: string, frameworkVersion?: string): Promise<void>;
/**
 * Load registry from YAML file
 */
export declare function loadRegistry(registry: SkillRegistry, filePath: string): Promise<void>;
//# sourceMappingURL=registry-persistence.d.ts.map