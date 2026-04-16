// src/test/jetbrainsDetector.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { getJetBrainsSearchPaths, IDE_DEFINITIONS } from '../jetbrainsDetector';

describe('IDE_DEFINITIONS', () => {
  it('contains all expected IDEs', () => {
    const names = IDE_DEFINITIONS.map(d => d.name);
    assert.ok(names.includes('IntelliJ IDEA'));
    assert.ok(names.includes('WebStorm'));
    assert.ok(names.includes('PyCharm'));
    assert.ok(names.includes('GoLand'));
    assert.ok(names.includes('PhpStorm'));
    assert.ok(names.includes('Rider'));
    assert.ok(names.includes('CLion'));
    assert.ok(names.includes('RubyMine'));
    assert.ok(names.includes('DataGrip'));
  });
});

describe('getJetBrainsSearchPaths', () => {
  it('returns paths for darwin', () => {
    const paths = getJetBrainsSearchPaths('darwin');
    assert.ok(paths.length > 0);
    assert.ok(paths.some(p => p.includes('JetBrains/Toolbox/scripts')));
    assert.ok(paths.some(p => p.includes('/Applications')));
  });

  it('returns paths for linux', () => {
    const paths = getJetBrainsSearchPaths('linux');
    assert.ok(paths.length > 0);
    assert.ok(paths.some(p => p.includes('JetBrains/Toolbox/scripts')));
  });

  it('returns paths for win32', () => {
    const paths = getJetBrainsSearchPaths('win32');
    assert.ok(paths.length > 0);
  });

  it('returns empty for unknown platform', () => {
    const paths = getJetBrainsSearchPaths('freebsd');
    assert.deepStrictEqual(paths, []);
  });
});
