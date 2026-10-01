import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSkills } from '../scripts/lib/build.mjs';

const pin = {
  files: {
    LICENSE: 'x',
    'skills/a/SKILL.md': 'x',
    'skills/a/helper.md': 'x'
  }
};

const upstream = {
  'skills/a/SKILL.md': 'use superpowers:b first\nline two\n',
  'skills/a/helper.md': 'plain\n'
};
const read = async (path) => Buffer.from(upstream[path]);

const patch = [
  '--- a/x', '+++ b/x', '@@ -1,2 +1,3 @@', ' use superpowers:b first', ' line two', '+DSH note', ''
].join('\n');

test('builds every pinned skill file verbatim (no transformation), under its skills-relative path', async () => {
  const out = await buildSkills({ pin, read, patches: new Map(), added: new Map() });
  assert.deepEqual([...out.keys()].sort(), ['a/SKILL.md', 'a/helper.md']);
  assert.equal(out.get('a/SKILL.md').toString(), 'use superpowers:b first\nline two\n');
});

test('applies an overlay patch after the transformation', async () => {
  const out = await buildSkills({ pin, read, patches: new Map([['a/SKILL.md', patch]]), added: new Map() });
  assert.equal(out.get('a/SKILL.md').toString(), 'use superpowers:b first\nline two\nDSH note\n');
  assert.equal(out.get('a/helper.md').toString(), 'plain\n');
});

test('adds DSH-only files', async () => {
  const added = new Map([['a/references/dsh.md', Buffer.from('dsh only\n')]]);
  const out = await buildSkills({ pin, read, patches: new Map(), added });
  assert.equal(out.get('a/references/dsh.md').toString(), 'dsh only\n');
});

test('an overlay for a file upstream does not have is an error, not a silent no-op', async () => {
  await assert.rejects(
    buildSkills({ pin, read, patches: new Map([['gone/SKILL.md', patch]]), added: new Map() }),
    /gone\/SKILL\.md.*not in the pinned upstream/
  );
});

test('an added file may not shadow an upstream file', async () => {
  const added = new Map([['a/SKILL.md', Buffer.from('x')]]);
  await assert.rejects(buildSkills({ pin, read, patches: new Map(), added }), /a\/SKILL\.md.*shadows/);
});

test('every overlay that no longer applies is reported, not just the first', async () => {
  const twoFiles = { files: { 'skills/a/SKILL.md': 'x', 'skills/b/SKILL.md': 'x' } };
  const readBoth = async () => Buffer.from('changed upstream\n');
  const stale = '--- a/x\n+++ b/x\n@@ -1 +1,2 @@\n original\n+note\n';
  await assert.rejects(
    buildSkills({ pin: twoFiles, read: readBoth, patches: new Map([['a/SKILL.md', stale], ['b/SKILL.md', stale]]), added: new Map() }),
    (error) => {
      assert.deepEqual(error.failures.map((f) => f.path), ['a/SKILL.md', 'b/SKILL.md']);
      assert.match(error.message, /2 overlays no longer apply/);
      return true;
    }
  );
});

test('a patch that no longer applies fails the build and names the file', async () => {
  const stale = patch.replace(' line two', ' line 2');
  await assert.rejects(
    buildSkills({ pin, read, patches: new Map([['a/SKILL.md', stale]]), added: new Map() }),
    /a\/SKILL\.md/
  );
});
