import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareVersions, pinFromTree } from '../scripts/lib/bump.mjs';

test('pinFromTree keeps skills/** and LICENSE blobs, sorted, with their git SHAs', () => {
  const tree = {
    truncated: false,
    tree: [
      { path: 'skills/b/SKILL.md', type: 'blob', sha: 'b1' },
      { path: 'skills/a', type: 'tree', sha: 't1' },
      { path: 'skills/a/SKILL.md', type: 'blob', sha: 'a1' },
      { path: 'README.md', type: 'blob', sha: 'r1' },
      { path: 'LICENSE', type: 'blob', sha: 'l1' },
      { path: 'hooks/session-start', type: 'blob', sha: 'h1' }
    ]
  };
  const pin = pinFromTree(tree, { repository: 'obra/superpowers', commit: 'c0ffee', version: '6.5.0' });
  assert.deepEqual(pin, {
    repository: 'obra/superpowers',
    version: '6.5.0',
    commit: 'c0ffee',
    license: 'MIT',
    files: { LICENSE: 'l1', 'skills/a/SKILL.md': 'a1', 'skills/b/SKILL.md': 'b1' }
  });
  assert.deepEqual(Object.keys(pin.files), ['LICENSE', 'skills/a/SKILL.md', 'skills/b/SKILL.md']);
});

test('a truncated tree is refused: a partial pin would silently drop files', () => {
  assert.throws(() => pinFromTree({ truncated: true, tree: [] }, { repository: 'x', commit: 'y', version: '1' }), /truncated/);
});

test('compareVersions orders release tags', () => {
  assert.equal(compareVersions('6.4.2', 'v6.5.0') < 0, true);
  assert.equal(compareVersions('v6.10.0', '6.9.9') > 0, true);
  assert.equal(compareVersions('6.4.2', 'v6.4.2'), 0);
});
