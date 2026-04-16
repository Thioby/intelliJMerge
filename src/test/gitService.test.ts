import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { parseConflicts, parseMergeMsgBranch } from '../gitService';

describe('parseConflicts', () => {
  it('parses UU as Modified/Modified', () => {
    const result = parseConflicts('UU src/file.ts\n');
    assert.deepStrictEqual(result, [{
      path: 'src/file.ts',
      oursStatus: 'Modified',
      theirsStatus: 'Modified',
      statusCode: 'UU',
    }]);
  });

  it('parses DU as Deleted/Modified', () => {
    const result = parseConflicts('DU config.yml\n');
    assert.deepStrictEqual(result, [{
      path: 'config.yml',
      oursStatus: 'Deleted',
      theirsStatus: 'Modified',
      statusCode: 'DU',
    }]);
  });

  it('parses UD as Modified/Deleted', () => {
    const result = parseConflicts('UD old-file.ts\n');
    assert.deepStrictEqual(result, [{
      path: 'old-file.ts',
      oursStatus: 'Modified',
      theirsStatus: 'Deleted',
      statusCode: 'UD',
    }]);
  });

  it('parses AA as Added/Added', () => {
    const result = parseConflicts('AA new-file.ts\n');
    assert.deepStrictEqual(result, [{
      path: 'new-file.ts',
      oursStatus: 'Added',
      theirsStatus: 'Added',
      statusCode: 'AA',
    }]);
  });

  it('parses DD as Deleted/Deleted', () => {
    const result = parseConflicts('DD gone.ts\n');
    assert.deepStrictEqual(result, [{
      path: 'gone.ts',
      oursStatus: 'Deleted',
      theirsStatus: 'Deleted',
      statusCode: 'DD',
    }]);
  });

  it('parses AU as Added/Unmerged', () => {
    const result = parseConflicts('AU added-by-us.ts\n');
    assert.deepStrictEqual(result, [{
      path: 'added-by-us.ts',
      oursStatus: 'Added',
      theirsStatus: 'Unmerged',
      statusCode: 'AU',
    }]);
  });

  it('parses UA as Unmerged/Added', () => {
    const result = parseConflicts('UA added-by-them.ts\n');
    assert.deepStrictEqual(result, [{
      path: 'added-by-them.ts',
      oursStatus: 'Unmerged',
      theirsStatus: 'Added',
      statusCode: 'UA',
    }]);
  });

  it('parses multiple conflicts sorted alphabetically', () => {
    const result = parseConflicts('UU z-file.ts\nUU a-file.ts\n');
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].path, 'a-file.ts');
    assert.strictEqual(result[1].path, 'z-file.ts');
  });

  it('ignores non-conflict lines', () => {
    const result = parseConflicts('M  normal.ts\nUU conflict.ts\n?? untracked.ts\n');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].path, 'conflict.ts');
  });

  it('returns empty array for no conflicts', () => {
    const result = parseConflicts('M  normal.ts\n');
    assert.deepStrictEqual(result, []);
  });
});

describe('parseMergeMsgBranch', () => {
  it('extracts branch from standard merge message', () => {
    assert.strictEqual(
      parseMergeMsgBranch("Merge branch 'feature/auth' into main"),
      'feature/auth'
    );
  });

  it('extracts branch from remote merge message', () => {
    assert.strictEqual(
      parseMergeMsgBranch("Merge remote-tracking branch 'origin/develop' into main"),
      'origin/develop'
    );
  });

  it('returns null for non-merge message', () => {
    assert.strictEqual(parseMergeMsgBranch('some random text'), null);
  });
});
