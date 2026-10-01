import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { patchRows, runChecks } from '../scripts/check.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('patchRows reads inserted rows, their names and disabled flags', () => {
  const rows = patchRows(
    "- insert:\n    - id: a\n      name: ./src/a.js\n\n    - id: b\n      name: './src/b.js'\n      disabled: true\n      config:\n        name: not-a-row\n"
  );
  assert.deepEqual(rows, [
    { id: 'a', name: './src/a.js', disabled: false },
    { id: 'b', name: './src/b.js', disabled: true }
  ]);
});

test('the repository passes every contract check', async () => {
  assert.deepEqual(await runChecks(root), []);
});

test('a row pointing at a missing module is reported', async () => {
  const copy = mkdtempSync(join(tmpdir(), 'dsh-superpowers-contract-'));
  try {
    for (const entry of ['package.json', 'cordis.patch.yml', 'src', 'skills', 'locale', 'icon.svg',
      'LICENSE', 'LICENSE.superpowers', 'README.md', 'CHANGELOG.md', 'upstream']) {
      cpSync(join(root, entry), join(copy, entry), { recursive: true });
    }
    writeFileSync(join(copy, 'cordis.patch.yml'), '- insert:\n    - id: x\n      name: ./src/missing.js\n');
    const problems = await runChecks(copy);
    assert.ok(problems.some((p) => /missing\.js/.test(p)), problems.join('\n'));
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});
