import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkComposition } from '../scripts/lib/compat.mjs';

// Shape copied from a real `dsh --profile <p> --dump-config` on DSH 0.2.0-rc.2.
const DUMP = [
  '- id: system-prompt',
  "  name: '@deepseek-ai/dsh-system-prompt'",
  '# == @blugart-dev/dsh-superpowers',
  '- id: dsh-superpowers-skills',
  '  name: >-',
  '    file:///C:/p/node_modules/@blugart-dev/dsh-superpowers/src/skills.js',
  '- id: dsh-superpowers-bootstrap',
  '  name: >-',
  '    file:///C:/p/node_modules/@blugart-dev/dsh-superpowers/src/bootstrap.js',
  '  config:',
  '    bootstrap: true',
  '- id: dsh-superpowers-gate',
  '  name: >-',
  '    file:///C:/p/node_modules/@blugart-dev/dsh-superpowers/src/gate/index.js',
  '  disabled: true',
  '  config:',
  '    gate: false',
  ''
].join('\n');

test('a healthy composition: skills and bootstrap enabled, gate present and disabled', () => {
  assert.deepEqual(checkComposition(DUMP), []);
});

test('a missing row is reported (e.g. denied by a peer range)', () => {
  const problems = checkComposition(DUMP.replace(/- id: dsh-superpowers-bootstrap[\s\S]*?bootstrap: true\n/, ''));
  assert.ok(problems.some((p) => /dsh-superpowers-bootstrap.*missing/.test(p)), problems.join('\n'));
});

test('a gate that composed enabled is reported', () => {
  const problems = checkComposition(DUMP.replace('  disabled: true\n', ''));
  assert.ok(problems.some((p) => /dsh-superpowers-gate.*disabled/.test(p)), problems.join('\n'));
});

test('a row that resolves outside the installed package is reported', () => {
  const problems = checkComposition(DUMP.replace('dsh-superpowers/src/skills.js', 'elsewhere/skills.js'));
  assert.ok(problems.some((p) => /dsh-superpowers-skills.*resolves/.test(p)), problems.join('\n'));
});
