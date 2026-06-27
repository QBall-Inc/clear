/**
 * Init CLI (R5.4)
 *
 * Thin CLI wrapping initializeProject() + configureStatusline().
 * Called by cf-init SKILL.md instead of Write/Edit on .clear/ paths.
 * All .clear/ mutations happen via fs.writeFileSync — invisible to PreToolUse guard.
 */
import { type RestoreCliOutput } from './restore-cli';
import { type SqliteBootstrapResult } from '../sqlite-bootstrap';
import type { InitStepResult, PostInitCheck } from '../types';
interface InitCliOptions {
    clearDir: string;
    cwd: string;
    pluginRoot: string;
    force: boolean;
    refreshConfig: boolean;
    restoreFromBackup: boolean;
    backupPath: string;
    skipPrompt: boolean;
    skipStatusline: boolean;
    ensureGitignore: boolean;
    ensureStatusline: boolean;
}
interface InitSummary {
    success: boolean;
    projectName: string;
    projectPath: string;
    projectId: string;
    sessionId: string;
    steps: InitStepResult[];
    checks: PostInitCheck[];
    error?: string;
    backupPath?: string;
}
export interface InitCliOutput {
    status: 'success' | 'partial' | 'error' | 'cancelled';
    init?: InitSummary;
    restore?: RestoreCliOutput;
    statusline?: {
        needsRestart: boolean;
        originalStatusline: string | null;
    };
    knowledgeBootstrap?: SqliteBootstrapResult;
    gitignoreEnsured?: boolean;
    statuslineEnsured?: boolean;
    error?: string;
}
export declare function runInitCLI(options: InitCliOptions): Promise<InitCliOutput>;
export {};
//# sourceMappingURL=init-cli.d.ts.map