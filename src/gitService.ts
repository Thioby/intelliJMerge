import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { MergeState, ConflictFile, OperationType, ConflictStatus } from './types';

const STATUS_MAP: Record<string, [ConflictStatus, ConflictStatus]> = {
  UU: ['Modified', 'Modified'],
  AA: ['Added', 'Added'],
  DD: ['Deleted', 'Deleted'],
  AU: ['Added', 'Unmerged'],
  UA: ['Unmerged', 'Added'],
  DU: ['Deleted', 'Modified'],
  UD: ['Modified', 'Deleted'],
};

export function parseConflicts(porcelainOutput: string): ConflictFile[] {
  const lines = porcelainOutput.split('\n').filter(l => l.length > 0);
  const conflicts: ConflictFile[] = [];

  for (const line of lines) {
    const code = line.substring(0, 2);
    const mapping = STATUS_MAP[code];
    if (!mapping) continue;

    const filePath = line.substring(3).replace(/^"(.*)"$/, '$1');
    conflicts.push({
      path: filePath,
      oursStatus: mapping[0],
      theirsStatus: mapping[1],
      statusCode: code,
    });
  }

  conflicts.sort((a, b) => a.path.localeCompare(b.path));
  return conflicts;
}

export function parseMergeMsgBranch(msg: string): string | null {
  const match = msg.match(/^Merge (?:remote-tracking )?branch '([^']+)'/);
  return match ? match[1] : null;
}

function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

export class GitService {
  private cachedGitDir: string | undefined;

  constructor(private workspaceRoot: string) {}

  async getGitDir(): Promise<string> {
    if (this.cachedGitDir) return this.cachedGitDir;
    const rel = await execGit(['rev-parse', '--git-dir'], this.workspaceRoot);
    this.cachedGitDir = resolve(this.workspaceRoot, rel);
    return this.cachedGitDir;
  }

  async getMergeState(): Promise<MergeState | null> {
    const gitDir = await this.getGitDir();
    const operation = this.detectOperation(gitDir);
    if (!operation) return null;
    const [targetBranch, sourceBranch] = await Promise.all([
      this.getTargetBranch(operation, gitDir),
      this.getSourceBranch(operation, gitDir),
    ]);
    return { operation, targetBranch, sourceBranch };
  }

  private detectOperation(gitDir: string): OperationType | null {
    if (existsSync(join(gitDir, 'MERGE_HEAD'))) return 'merge';
    if (
      existsSync(join(gitDir, 'REBASE_HEAD')) ||
      existsSync(join(gitDir, 'rebase-merge')) ||
      existsSync(join(gitDir, 'rebase-apply'))
    ) return 'rebase';
    if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) return 'cherry-pick';
    return null;
  }

  private async getTargetBranch(operation: OperationType, gitDir: string): Promise<string> {
    if (operation === 'rebase') {
      const headNamePath = join(gitDir, 'rebase-merge', 'head-name');
      if (existsSync(headNamePath)) {
        const raw = readFileSync(headNamePath, 'utf8').trim();
        return raw.replace('refs/heads/', '');
      }
    }
    try {
      return await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], this.workspaceRoot);
    } catch {
      return 'HEAD';
    }
  }

  private async getSourceBranch(operation: OperationType, gitDir: string): Promise<string> {
    if (operation === 'merge') {
      const msgPath = join(gitDir, 'MERGE_MSG');
      if (existsSync(msgPath)) {
        const msg = readFileSync(msgPath, 'utf8');
        const branch = parseMergeMsgBranch(msg);
        if (branch) return branch;
      }
      return 'unknown';
    }
    if (operation === 'rebase') {
      const ontoPath = join(gitDir, 'rebase-merge', 'onto');
      if (existsSync(ontoPath)) {
        const hash = readFileSync(ontoPath, 'utf8').trim();
        try {
          const name = await execGit(['name-rev', '--name-only', hash], this.workspaceRoot);
          return name.replace(/~\d+$/, '');
        } catch {
          return hash.substring(0, 7);
        }
      }
      return 'unknown';
    }
    const cpPath = join(gitDir, 'CHERRY_PICK_HEAD');
    if (existsSync(cpPath)) {
      const hash = readFileSync(cpPath, 'utf8').trim();
      return hash.substring(0, 7);
    }
    return 'unknown';
  }

  async getConflicts(): Promise<ConflictFile[]> {
    try {
      const output = await execGit(['status', '--porcelain'], this.workspaceRoot);
      return parseConflicts(output);
    } catch {
      return [];
    }
  }

  private static readonly RESOLVE_ACTIONS: Record<string, [string, string]> = {
    UU: ['checkout-ours', 'checkout-theirs'],
    AA: ['checkout-ours', 'checkout-theirs'],
    DD: ['rm', 'rm'],
    AU: ['add', 'rm'],
    UA: ['rm', 'checkout-theirs'],
    DU: ['rm', 'checkout-theirs'],
    UD: ['checkout-ours', 'rm'],
  };

  async acceptOurs(file: string, operation: OperationType): Promise<void> {
    await this.resolveConflict(file, operation, 'ours');
  }

  async acceptTheirs(file: string, operation: OperationType): Promise<void> {
    await this.resolveConflict(file, operation, 'theirs');
  }

  private async resolveConflict(file: string, operation: OperationType, side: 'ours' | 'theirs'): Promise<void> {
    const conflicts = await this.getConflicts();
    const conflict = conflicts.find(c => c.path === file);
    if (!conflict) return;

    const actions = GitService.RESOLVE_ACTIONS[conflict.statusCode];
    if (!actions) return;

    const isRebase = operation === 'rebase';
    const effectiveSide = isRebase ? (side === 'ours' ? 'theirs' : 'ours') : side;
    const actionIndex = effectiveSide === 'ours' ? 0 : 1;
    const action = actions[actionIndex];

    if (action === 'checkout-ours' || action === 'checkout-theirs') {
      const flag = action === 'checkout-ours' ? '--ours' : '--theirs';
      await execGit(['checkout', flag, '--', file], this.workspaceRoot);
      await execGit(['add', '--', file], this.workspaceRoot);
    } else if (action === 'add') {
      await execGit(['add', '--', file], this.workspaceRoot);
    } else if (action === 'rm') {
      await execGit(['rm', '--', file], this.workspaceRoot);
    }
  }

  runMergetool(file: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', ['mergetool', '--no-prompt', '--', file], {
        cwd: this.workspaceRoot,
        stdio: 'ignore',
      });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git mergetool exited with code ${code}`));
      });
      proc.on('error', reject);
    });
  }

  async getMergetoolConfig(): Promise<string | null> {
    try {
      return await execGit(['config', 'merge.tool'], this.workspaceRoot);
    } catch {
      return null;
    }
  }

  async configureMergetool(toolName: string, binaryPath: string): Promise<void> {
    await execGit(['config', 'merge.tool', toolName], this.workspaceRoot);
    const safePath = binaryPath.replace(/"/g, '\\"');
    const cmd = `"${safePath}" merge "$LOCAL" "$REMOTE" "$BASE" "$MERGED"`;
    await execGit(['config', `mergetool.${toolName}.cmd`, cmd], this.workspaceRoot);
    await execGit(['config', `mergetool.${toolName}.trustExitCode`, 'true'], this.workspaceRoot);
  }

  async isMergeInProgress(): Promise<boolean> {
    try {
      const gitDir = await this.getGitDir();
      return this.detectOperation(gitDir) !== null;
    } catch {
      return false;
    }
  }
}
