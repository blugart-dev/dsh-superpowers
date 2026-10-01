// Tests for the session-start bootstrap.
//
// Upstream Superpowers injects `using-superpowers` at session start with a hook
// (hooks/session-start at the pinned commit). DeepSeek Harness has no hook
// system, so this bundle registers the same text as a durable system-prompt
// section. These tests pin three things: the wrapper matches upstream's, the
// section is registered safely (literal, never interpolated), and every failure
// degrades to "no bootstrap" rather than a failed activation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import apply, { SECTION_NAME, bootstrapText, resolveSettings } from '../src/bootstrap.js';

const VENDORED_SKILL = fileURLToPath(
  new URL('../skills/using-superpowers/SKILL.md', import.meta.url)
);

/**
 * A minimal stand-in for the Host context.
 *
 * `effect` runs its callback immediately and keeps the disposer it returns, as
 * cordis does, so a test can check the section is torn down with the plugin.
 *
 * @param {object} [options] - which services to expose.
 * @param {boolean} [options.systemPrompt] - expose a `systemPrompt` service.
 * @param {boolean} [options.sectionThrows] - make `section()` throw.
 * @returns {{ context: object, calls: object }} the stub and its recorders.
 */
function stubContext({ systemPrompt = true, sectionThrows = false } = {}) {
  const calls = { sections: [], disposers: [], disposed: [] };
  const context = {
    effect(fn) {
      const disposer = fn();
      calls.disposers.push(disposer);
      return disposer;
    },
    get(service) {
      if (service !== 'systemPrompt' || !systemPrompt) return undefined;
      return {
        section(section) {
          if (sectionThrows) throw new Error('duplicate section name');
          calls.sections.push(section);
          return () => calls.disposed.push(section.name);
        }
      };
    }
  };
  return { context, calls };
}

test('the wrapper matches upstream hooks/session-start, adapted only for DSH naming', () => {
  const text = bootstrapText('SKILL BODY');
  assert.equal(
    text,
    '<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\n' +
      "**Below is the full content of your 'using-superpowers' skill - your introduction " +
      "to using skills. For all other skills, use the 'skill' tool:**\n\n" +
      'SKILL BODY\n</EXTREMELY_IMPORTANT>'
  );
});

test('an active bootstrap registers the vendored using-superpowers skill as one literal section', () => {
  const { context, calls } = stubContext();
  apply(context, {});

  assert.equal(calls.sections.length, 1);
  const [section] = calls.sections;
  assert.equal(section.name, SECTION_NAME);
  assert.ok(Number.isFinite(section.order));
  // The renderer throws on unknown {{...}} references and a throw there breaks
  // prompt assembly for every session, so the skill text must never be
  // interpolated, whatever it contains.
  assert.equal(section.interpolate, false);
  assert.equal(section.text, bootstrapText(readFileSync(VENDORED_SKILL, 'utf8')));
});

test('the section is disposed with the plugin', () => {
  const { context, calls } = stubContext();
  apply(context, {});
  calls.disposers.forEach((dispose) => dispose());
  assert.deepEqual(calls.disposed, [SECTION_NAME]);
});

test('no systemPrompt service: activation succeeds and registers nothing', () => {
  const { context, calls } = stubContext({ systemPrompt: false });
  assert.doesNotThrow(() => apply(context, {}));
  assert.equal(calls.sections.length, 0);
});

test('an unreadable skill file registers nothing rather than an empty bootstrap', () => {
  const { context, calls } = stubContext();
  assert.doesNotThrow(() => apply(context, { skillFile: 'C:/does/not/exist/SKILL.md' }));
  assert.equal(calls.sections.length, 0);
});

test('a rejected registration (e.g. a duplicate name) does not break activation', () => {
  const { context } = stubContext({ sectionThrows: true });
  assert.doesNotThrow(() => apply(context, {}));
});

test('bootstrap: false turns the injection off', () => {
  const { context, calls } = stubContext();
  apply(context, { bootstrap: false });
  assert.equal(calls.sections.length, 0);
});

// Found live, 2026-10-01: with `inject: []` the Host activated the plugin before
// the system-prompt service existed, and `ctx.get('systemPrompt')` returned
// undefined ("not registered: no systemPrompt service on this context"). Declaring
// the dependency makes cordis delay activation until the service is available.
test('the applier declares systemPrompt as an injected dependency', () => {
  assert.ok(Array.isArray(apply.inject));
  assert.ok(apply.inject.includes('systemPrompt'));
});

test('settings default to on, reading the vendored skill', () => {
  const settings = resolveSettings(undefined);
  assert.equal(settings.bootstrap, true);
  assert.equal(settings.skillFile, VENDORED_SKILL);
});

test('diagnostics are off by default and opt-in to a file that names the writer', () => {
  assert.equal(resolveSettings(undefined).diagnosticsLog, undefined);
  const dir = mkdtempSync(join(tmpdir(), 'dsh-superpowers-diag-'));
  try {
    const log = join(dir, 'diag.log');
    apply(stubContext().context, { diagnosticsLog: log });
    const line = readFileSync(log, 'utf8');
    assert.match(line, /\[node(\.exe)? pid \d+\] registered: \d+ chars/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
