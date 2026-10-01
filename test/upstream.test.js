import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as upstream from '../scripts/lib/upstream.mjs';
const { gitBlobSha } = upstream;

test('gitBlobSha matches git hash-object for known inputs', () => {
  // `git hash-object` of an empty file and of "hello\n".
  assert.equal(gitBlobSha(Buffer.from('')), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(gitBlobSha(Buffer.from('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
});

test('there is no skill-text transformation: skills ship verbatim', () => {
  assert.equal(upstream.stripSkillPrefix, undefined);
});
