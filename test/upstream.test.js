import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gitBlobSha, stripSkillPrefix } from '../scripts/lib/upstream.mjs';

test('gitBlobSha matches git hash-object for known inputs', () => {
  // `git hash-object` of an empty file and of "hello\n".
  assert.equal(gitBlobSha(Buffer.from('')), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(gitBlobSha(Buffer.from('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
});

test('the prefix transformation removes only skill references', () => {
  assert.equal(
    stripSkillPrefix('use superpowers:test-driven-development and superpowers:brainstorming'),
    'use test-driven-development and brainstorming'
  );
  // Not a skill reference: no kebab-case name follows the colon.
  assert.equal(stripSkillPrefix('superpowers: the plugin'), 'superpowers: the plugin');
  assert.equal(stripSkillPrefix('docs/superpowers/plans'), 'docs/superpowers/plans');
  assert.equal(stripSkillPrefix('superpowers:Upper'), 'superpowers:Upper');
});
