import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GitService } from '../gitService';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'merge-test-'));
  git(['init'], dir);
  git(['config', 'user.email', 'test@test.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  return dir;
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

// ─── getMergeState ───

describe('GitService.getMergeState', () => {
  let dir: string;

  after(() => cleanup(dir));

  it('returns null when no merge in progress', async () => {
    dir = createRepo();
    writeFileSync(join(dir, 'file.txt'), 'init');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);

    const svc = new GitService(dir);
    const state = await svc.getMergeState();
    assert.strictEqual(state, null);
  });
});

describe('GitService.getMergeState — merge', () => {
  let dir: string;

  before(() => {
    dir = createRepo();
    writeFileSync(join(dir, 'file.txt'), 'init');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);

    git(['checkout', '-b', 'feature'], dir);
    writeFileSync(join(dir, 'file.txt'), 'feature');
    git(['commit', '-am', 'feature'], dir);

    git(['checkout', 'master'], dir);
    writeFileSync(join(dir, 'file.txt'), 'master');
    git(['commit', '-am', 'master'], dir);

    try { git(['merge', 'feature'], dir); } catch { /* conflict expected */ }
  });

  after(() => cleanup(dir));

  it('detects merge operation', async () => {
    const svc = new GitService(dir);
    const state = await svc.getMergeState();
    assert.ok(state);
    assert.strictEqual(state.operation, 'merge');
  });

  it('returns correct target branch', async () => {
    const svc = new GitService(dir);
    const state = await svc.getMergeState();
    assert.ok(state);
    assert.strictEqual(state.targetBranch, 'master');
  });

  it('returns correct source branch', async () => {
    const svc = new GitService(dir);
    const state = await svc.getMergeState();
    assert.ok(state);
    assert.strictEqual(state.sourceBranch, 'feature');
  });
});

describe('GitService.getMergeState — rebase', () => {
  let dir: string;

  before(() => {
    dir = createRepo();
    writeFileSync(join(dir, 'file.txt'), 'init');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);

    git(['checkout', '-b', 'feature'], dir);
    writeFileSync(join(dir, 'file.txt'), 'feature');
    git(['commit', '-am', 'feature'], dir);

    git(['checkout', 'master'], dir);
    writeFileSync(join(dir, 'file.txt'), 'master');
    git(['commit', '-am', 'master'], dir);

    git(['checkout', 'feature'], dir);
    try { git(['rebase', 'master'], dir); } catch { /* conflict expected */ }
  });

  after(() => cleanup(dir));

  it('detects rebase operation', async () => {
    const svc = new GitService(dir);
    const state = await svc.getMergeState();
    assert.ok(state);
    assert.strictEqual(state.operation, 'rebase');
  });

  it('returns the rebased branch as target', async () => {
    const svc = new GitService(dir);
    const state = await svc.getMergeState();
    assert.ok(state);
    assert.strictEqual(state.targetBranch, 'feature');
  });
});

describe('GitService.getMergeState — cherry-pick', () => {
  let dir: string;

  before(() => {
    dir = createRepo();
    writeFileSync(join(dir, 'file.txt'), 'init');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);

    git(['checkout', '-b', 'feature'], dir);
    writeFileSync(join(dir, 'file.txt'), 'feature');
    git(['commit', '-am', 'feature'], dir);
    const commitHash = git(['rev-parse', 'HEAD'], dir);

    git(['checkout', 'master'], dir);
    writeFileSync(join(dir, 'file.txt'), 'master');
    git(['commit', '-am', 'master'], dir);

    try { git(['cherry-pick', commitHash], dir); } catch { /* conflict expected */ }
  });

  after(() => cleanup(dir));

  it('detects cherry-pick operation', async () => {
    const svc = new GitService(dir);
    const state = await svc.getMergeState();
    assert.ok(state);
    assert.strictEqual(state.operation, 'cherry-pick');
  });

  it('returns short hash as source', async () => {
    const svc = new GitService(dir);
    const state = await svc.getMergeState();
    assert.ok(state);
    assert.strictEqual(state.sourceBranch.length, 7);
  });
});

// ─── isMergeInProgress ───

describe('GitService.isMergeInProgress', () => {
  let dir: string;

  after(() => cleanup(dir));

  it('returns false when no merge', async () => {
    dir = createRepo();
    writeFileSync(join(dir, 'f.txt'), 'x');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);

    const svc = new GitService(dir);
    assert.strictEqual(await svc.isMergeInProgress(), false);
  });

  it('returns true during merge', async () => {
    git(['checkout', '-b', 'feat'], dir);
    writeFileSync(join(dir, 'f.txt'), 'feat');
    git(['commit', '-am', 'feat'], dir);
    git(['checkout', 'master'], dir);
    writeFileSync(join(dir, 'f.txt'), 'main');
    git(['commit', '-am', 'main'], dir);
    try { git(['merge', 'feat'], dir); } catch {}

    const svc = new GitService(dir);
    assert.strictEqual(await svc.isMergeInProgress(), true);
  });
});

// ─── getConflicts ───

describe('GitService.getConflicts', () => {
  let dir: string;

  before(() => {
    dir = createRepo();
    writeFileSync(join(dir, 'both.txt'), 'init');
    writeFileSync(join(dir, 'delete-ours.txt'), 'init');
    writeFileSync(join(dir, 'delete-theirs.txt'), 'init');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);

    git(['checkout', '-b', 'feature'], dir);
    writeFileSync(join(dir, 'both.txt'), 'feature');
    git(['rm', 'delete-theirs.txt'], dir);
    writeFileSync(join(dir, 'delete-ours.txt'), 'feature-edit');
    git(['add', '.'], dir);
    git(['commit', '-m', 'feature'], dir);

    git(['checkout', 'master'], dir);
    writeFileSync(join(dir, 'both.txt'), 'master');
    writeFileSync(join(dir, 'delete-theirs.txt'), 'master-edit');
    git(['rm', 'delete-ours.txt'], dir);
    git(['add', '.'], dir);
    git(['commit', '-m', 'master'], dir);

    try { git(['merge', 'feature'], dir); } catch {}
  });

  after(() => cleanup(dir));

  it('lists all conflicted files', async () => {
    const svc = new GitService(dir);
    const conflicts = await svc.getConflicts();
    assert.ok(conflicts.length >= 2);
  });

  it('returns UU for both-modified files', async () => {
    const svc = new GitService(dir);
    const conflicts = await svc.getConflicts();
    const both = conflicts.find(c => c.path === 'both.txt');
    assert.ok(both);
    assert.strictEqual(both.statusCode, 'UU');
    assert.strictEqual(both.oursStatus, 'Modified');
    assert.strictEqual(both.theirsStatus, 'Modified');
  });

  it('returns UD for ours-modified theirs-deleted', async () => {
    const svc = new GitService(dir);
    const conflicts = await svc.getConflicts();
    const f = conflicts.find(c => c.path === 'delete-theirs.txt');
    assert.ok(f);
    assert.strictEqual(f.statusCode, 'UD');
    assert.strictEqual(f.oursStatus, 'Modified');
    assert.strictEqual(f.theirsStatus, 'Deleted');
  });

  it('returns DU for ours-deleted theirs-modified', async () => {
    const svc = new GitService(dir);
    const conflicts = await svc.getConflicts();
    const f = conflicts.find(c => c.path === 'delete-ours.txt');
    assert.ok(f);
    assert.strictEqual(f.statusCode, 'DU');
    assert.strictEqual(f.oursStatus, 'Deleted');
    assert.strictEqual(f.theirsStatus, 'Modified');
  });

  it('returns sorted by path', async () => {
    const svc = new GitService(dir);
    const conflicts = await svc.getConflicts();
    const paths = conflicts.map(c => c.path);
    const sorted = [...paths].sort();
    assert.deepStrictEqual(paths, sorted);
  });
});

// ─── acceptOurs / acceptTheirs during merge ───

describe('GitService.acceptOurs — merge (UU)', () => {
  let dir: string;

  before(() => {
    dir = createRepo();
    writeFileSync(join(dir, 'file.txt'), 'init');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);

    git(['checkout', '-b', 'feature'], dir);
    writeFileSync(join(dir, 'file.txt'), 'feature-content');
    git(['commit', '-am', 'feature'], dir);

    git(['checkout', 'master'], dir);
    writeFileSync(join(dir, 'file.txt'), 'master-content');
    git(['commit', '-am', 'master'], dir);

    try { git(['merge', 'feature'], dir); } catch {}
  });

  after(() => cleanup(dir));

  it('keeps our version and resolves conflict', async () => {
    const svc = new GitService(dir);
    await svc.acceptOurs('file.txt', 'merge');

    const content = readFileSync(join(dir, 'file.txt'), 'utf8').trim();
    assert.strictEqual(content, 'master-content');

    const remaining = await svc.getConflicts();
    assert.strictEqual(remaining.find(c => c.path === 'file.txt'), undefined);
  });
});

describe('GitService.acceptTheirs — merge (UU)', () => {
  let dir: string;

  before(() => {
    dir = createRepo();
    writeFileSync(join(dir, 'file.txt'), 'init');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);

    git(['checkout', '-b', 'feature'], dir);
    writeFileSync(join(dir, 'file.txt'), 'feature-content');
    git(['commit', '-am', 'feature'], dir);

    git(['checkout', 'master'], dir);
    writeFileSync(join(dir, 'file.txt'), 'master-content');
    git(['commit', '-am', 'master'], dir);

    try { git(['merge', 'feature'], dir); } catch {}
  });

  after(() => cleanup(dir));

  it('takes their version and resolves conflict', async () => {
    const svc = new GitService(dir);
    await svc.acceptTheirs('file.txt', 'merge');

    const content = readFileSync(join(dir, 'file.txt'), 'utf8').trim();
    assert.strictEqual(content, 'feature-content');

    const remaining = await svc.getConflicts();
    assert.strictEqual(remaining.find(c => c.path === 'file.txt'), undefined);
  });
});

// ─── acceptOurs / acceptTheirs for delete conflicts ───

describe('GitService.acceptOurs — merge (DU, ours deleted)', () => {
  let dir: string;

  before(() => {
    dir = createRepo();
    writeFileSync(join(dir, 'file.txt'), 'init');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);

    git(['checkout', '-b', 'feature'], dir);
    writeFileSync(join(dir, 'file.txt'), 'feature-edit');
    git(['commit', '-am', 'feature'], dir);

    git(['checkout', 'master'], dir);
    git(['rm', 'file.txt'], dir);
    git(['commit', '-m', 'delete on master'], dir);

    try { git(['merge', 'feature'], dir); } catch {}
  });

  after(() => cleanup(dir));

  it('removes the file (accepts our deletion)', async () => {
    const svc = new GitService(dir);
    await svc.acceptOurs('file.txt', 'merge');

    assert.strictEqual(existsSync(join(dir, 'file.txt')), false);
    const remaining = await svc.getConflicts();
    assert.strictEqual(remaining.find(c => c.path === 'file.txt'), undefined);
  });
});

describe('GitService.acceptTheirs — merge (DU, keep theirs)', () => {
  let dir: string;

  before(() => {
    dir = createRepo();
    writeFileSync(join(dir, 'file.txt'), 'init');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);

    git(['checkout', '-b', 'feature'], dir);
    writeFileSync(join(dir, 'file.txt'), 'feature-edit');
    git(['commit', '-am', 'feature'], dir);

    git(['checkout', 'master'], dir);
    git(['rm', 'file.txt'], dir);
    git(['commit', '-m', 'delete on master'], dir);

    try { git(['merge', 'feature'], dir); } catch {}
  });

  after(() => cleanup(dir));

  it('keeps their version', async () => {
    const svc = new GitService(dir);
    await svc.acceptTheirs('file.txt', 'merge');

    const content = readFileSync(join(dir, 'file.txt'), 'utf8').trim();
    assert.strictEqual(content, 'feature-edit');
    const remaining = await svc.getConflicts();
    assert.strictEqual(remaining.find(c => c.path === 'file.txt'), undefined);
  });
});

describe('GitService.acceptTheirs — merge (UD, theirs deleted)', () => {
  let dir: string;

  before(() => {
    dir = createRepo();
    writeFileSync(join(dir, 'file.txt'), 'init');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);

    git(['checkout', '-b', 'feature'], dir);
    git(['rm', 'file.txt'], dir);
    git(['commit', '-m', 'delete on feature'], dir);

    git(['checkout', 'master'], dir);
    writeFileSync(join(dir, 'file.txt'), 'master-edit');
    git(['commit', '-am', 'master'], dir);

    try { git(['merge', 'feature'], dir); } catch {}
  });

  after(() => cleanup(dir));

  it('removes the file (accepts their deletion)', async () => {
    const svc = new GitService(dir);
    await svc.acceptTheirs('file.txt', 'merge');

    assert.strictEqual(existsSync(join(dir, 'file.txt')), false);
    const remaining = await svc.getConflicts();
    assert.strictEqual(remaining.find(c => c.path === 'file.txt'), undefined);
  });
});

// ─── REBASE: ours/theirs swap ───

describe('GitService.acceptOurs — rebase (UU)', () => {
  let dir: string;

  before(() => {
    dir = createRepo();
    writeFileSync(join(dir, 'file.txt'), 'init');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);

    git(['checkout', '-b', 'feature'], dir);
    writeFileSync(join(dir, 'file.txt'), 'my-feature-work');
    git(['commit', '-am', 'feature'], dir);

    git(['checkout', 'master'], dir);
    writeFileSync(join(dir, 'file.txt'), 'upstream-change');
    git(['commit', '-am', 'master'], dir);

    git(['checkout', 'feature'], dir);
    try { git(['rebase', 'master'], dir); } catch {}
  });

  after(() => cleanup(dir));

  it('keeps the users feature branch content despite git swap', async () => {
    const svc = new GitService(dir);
    // "Accept Yours" during rebase should keep the user's feature work
    await svc.acceptOurs('file.txt', 'rebase');

    const content = readFileSync(join(dir, 'file.txt'), 'utf8').trim();
    assert.strictEqual(content, 'my-feature-work');
  });
});

describe('GitService.acceptTheirs — rebase (UU)', () => {
  let dir: string;

  before(() => {
    dir = createRepo();
    writeFileSync(join(dir, 'file.txt'), 'init');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);

    git(['checkout', '-b', 'feature'], dir);
    writeFileSync(join(dir, 'file.txt'), 'my-feature-work');
    git(['commit', '-am', 'feature'], dir);

    git(['checkout', 'master'], dir);
    writeFileSync(join(dir, 'file.txt'), 'upstream-change');
    git(['commit', '-am', 'master'], dir);

    git(['checkout', 'feature'], dir);
    try { git(['rebase', 'master'], dir); } catch {}
  });

  after(() => cleanup(dir));

  it('takes the upstream content despite git swap', async () => {
    const svc = new GitService(dir);
    // "Accept Theirs" during rebase should take the upstream/master content
    await svc.acceptTheirs('file.txt', 'rebase');

    const content = readFileSync(join(dir, 'file.txt'), 'utf8').trim();
    assert.strictEqual(content, 'upstream-change');
  });
});

// ─── getGitDir caching ───

describe('GitService.getGitDir', () => {
  let dir: string;

  before(() => {
    dir = createRepo();
    writeFileSync(join(dir, 'f.txt'), 'x');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);
  });

  after(() => cleanup(dir));

  it('returns correct git dir', async () => {
    const svc = new GitService(dir);
    const gitDir = await svc.getGitDir();
    assert.ok(gitDir.endsWith('.git'));
    assert.ok(existsSync(gitDir));
  });

  it('caches the result', async () => {
    const svc = new GitService(dir);
    const first = await svc.getGitDir();
    const second = await svc.getGitDir();
    assert.strictEqual(first, second);
  });
});

// ─── configureMergetool ───

describe('GitService.configureMergetool', () => {
  let dir: string;

  before(() => {
    dir = createRepo();
    writeFileSync(join(dir, 'f.txt'), 'x');
    git(['add', '.'], dir);
    git(['commit', '-m', 'init'], dir);
  });

  after(() => cleanup(dir));

  it('sets merge.tool in git config', async () => {
    const svc = new GitService(dir);
    await svc.configureMergetool('idea', '/usr/bin/idea');

    const tool = git(['config', 'merge.tool'], dir);
    assert.strictEqual(tool, 'idea');
  });

  it('sets mergetool cmd', async () => {
    const svc = new GitService(dir);
    const cmd = git(['config', 'mergetool.idea.cmd'], dir);
    assert.ok(cmd.includes('/usr/bin/idea'));
    assert.ok(cmd.includes('merge'));
  });

  it('sets trustExitCode', async () => {
    const svc = new GitService(dir);
    const trust = git(['config', 'mergetool.idea.trustExitCode'], dir);
    assert.strictEqual(trust, 'true');
  });

  it('getMergetoolConfig returns the configured tool', async () => {
    const svc = new GitService(dir);
    const config = await svc.getMergetoolConfig();
    assert.strictEqual(config, 'idea');
  });
});
