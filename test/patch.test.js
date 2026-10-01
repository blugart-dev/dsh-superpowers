import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyPatch } from '../scripts/lib/patch.mjs';

// A header exactly as `git diff --no-index` writes it, so the applier is tested
// against the format the overlay generator really produces.
const HEADER = [
  'diff --git a/x.md b/x.md',
  'index 1111111..2222222 100644',
  '--- a/x.md',
  '+++ b/x.md'
].join('\n');

test('replaces a line inside its context', () => {
  const original = 'one\ntwo\nthree\n';
  const patch = `${HEADER}\n@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n`;
  assert.equal(applyPatch(original, patch), 'one\nTWO\nthree\n');
});

test('inserts lines and applies several hunks in order', () => {
  const original = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n') + '\n';
  const patch = [
    HEADER,
    '@@ -1,2 +1,3 @@',
    ' a',
    '+a2',
    ' b',
    '@@ -9,2 +10,4 @@',
    ' i',
    ' j',
    '+k',
    '+l',
    ''
  ].join('\n');
  assert.equal(
    applyPatch(original, patch),
    ['a', 'a2', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].join('\n') + '\n'
  );
});

test('refuses to apply when the context no longer matches (no fuzz)', () => {
  const patch = `${HEADER}\n@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n`;
  assert.throws(() => applyPatch('one\nchanged upstream\nthree\n', patch), /hunk 1 .*line 2/);
});

test('refuses a hunk whose lines are out of range', () => {
  const patch = `${HEADER}\n@@ -5,1 +5,1 @@\n-x\n+y\n`;
  assert.throws(() => applyPatch('a\n', patch), /hunk 1/);
});

test('honours "no newline at end of file" markers', () => {
  const original = 'a\nb';
  const patch = `${HEADER}\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n`;
  assert.equal(applyPatch(original, patch), 'a\nc');
});

test('can add a trailing newline that was missing', () => {
  const patch = `${HEADER}\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+a\n`;
  assert.equal(applyPatch('a', patch), 'a\n');
});

test('a patch with no hunks is rejected rather than silently doing nothing', () => {
  assert.throws(() => applyPatch('a\n', HEADER + '\n'), /no hunks/);
});
