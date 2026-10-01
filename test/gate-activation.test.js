// Activation test for the durable prompt section.
// Run: npm test
//
// Why this file exists, and why it took until now.
//
// `announceInPrompt` is the gate's only proactive channel. Every other way a
// session learns the gate exists involves being denied a write first. Arming is
// asynchronous (`resolveEscapeHatch` is a promise) while the prompt section was
// registered synchronously, a few lines later in the same tick - so the section
// was gated on a flag that could not have been set yet, and the announcement
// never fired. No unit test could see it: the bug is an ordering fact about
// `run()`, not about any pure helper. The arming promise must be awaited before
// the section is registered.
//
// These tests drive the real `run()` through a stub context. They then had to
// survive the plugin's own activation-time crash: `PROMPT_SECTION_ORDER` is a
// module-level `const` declared AFTER `run`, so evaluating it while the applier
// is still on the stack throws a temporal-dead-zone ReferenceError before a
// promise is ever created. That error prevents this test from observing the
// ordering bug, so the plugin must define the constant before use.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import apply, { resolveSettings } from '../src/gate/index.js';

/** The module exports the applier as a function carrying `.inject`. */
const run = apply;

/** Let queued promise callbacks settle (the arming verification is async). */
const tick = () => new Promise((resolve) => setImmediate(resolve));

const SKILL = 'superpowers-workflow';

/**
 * A minimal stand-in for the Host context.
 *
 * @param {object} [options] - which services to expose.
 * @param {boolean} [options.systemPrompt] - expose a `systemPrompt` service.
 * @param {boolean} [options.skills] - expose a `skills` registry.
 * @returns {object} the stub context, with call recorders attached.
 */
function stubContext({ systemPrompt = true, skills = true } = {}) {
  const calls = { guards: [], sections: [], effects: [], registrations: [], disposed: [] };

  const context = {
    effect(fn, label) {
      calls.effects.push(label);
      return () => {};
    },
    tools: {
      guard(fn) {
        calls.guards.push(fn);
        return () => {};
      }
    },
    get(service) {
      if (service === 'skills' && skills) {
        return {
          register(definition) {
            calls.registrations.push(definition);
            return () => {};
          },
          async get(name) {
            return name === SKILL ? { name, content: '# superpowers-workflow' } : undefined;
          }
        };
      }
      if (service === 'systemPrompt' && systemPrompt) {
        return {
          section(section) {
            calls.sections.push(section);
            return () => calls.disposed.push(section.name);
          }
        };
      }
      return undefined;
    }
  };

  return { context, calls };
}

test('an armed gate publishes its durable prompt section', async () => {
  const { context, calls } = stubContext();

  // Capture rather than propagate: an activation crash is itself a finding, and
  // the assertion below should name it instead of the runner reporting a
  // mysterious import-time failure.
  let activationError;
  try {
    run(context, { gate: true, announceInPrompt: true });
  } catch (error) {
    activationError = error;
  }
  await tick();
  await tick();

  assert.equal(activationError, undefined, `run() threw during activation: ${activationError}`);
  assert.equal(calls.registrations.length, 1, 'the escape hatch must be registered');
  assert.equal(
    calls.sections.length,
    1,
    'an armed gate with announceInPrompt must register exactly one prompt section; ' +
      'registering none means the session is told about the gate only by being denied'
  );
  assert.equal(calls.sections[0].name, 'superpowers-gate');
  // Assert the real announcement wording, not the denial message's. They are
  // deliberately different documents: `promptText` warns before a write is
  // attempted, `denialMessage` recovers after one is refused.
  assert.match(calls.sections[0].text, /`write` and `edit` calls to workspace source files are denied/);
  // Observed live (eval harness, gate scenario, 1 run in 3): when the
  // announcement named the recovery skill, the agent loaded it pre-emptively as
  // a ritual instead of the methodology skill for its task. The announcement now
  // steers to the task's skill; only the denial message names the escape hatch.
  assert.doesNotMatch(calls.sections[0].text, /superpowers-workflow/, 'must not advertise the escape hatch');
  assert.match(calls.sections[0].text, /skill that applies to your task/);
  assert.ok(Number.isFinite(calls.sections[0].order), 'the section order must be a finite number');
});

test('an inert gate publishes no prompt text and denies nothing', async () => {
  const { context, calls } = stubContext();

  let activationError;
  try {
    // The shipped default: gate off. Adding prompt text would itself be a
    // behaviour change, so a disabled gate must stay silent.
    run(context, { gate: false });
  } catch (error) {
    activationError = error;
  }
  await tick();
  await tick();

  assert.equal(activationError, undefined, `run() threw during activation: ${activationError}`);
  assert.equal(calls.sections.length, 0, 'a disabled gate must not add prompt text');
  assert.equal(calls.guards.length, 1, 'the guard is installed but stays inert');

  const execution = {
    name: 'write',
    arguments: '{"file_path":"src/app.ts"}',
    agent: { session: { snapshotEvents: () => [], ownEvents: () => [] } }
  };
  assert.equal(calls.guards[0](execution), undefined, 'a disabled gate must never deny');
});

test('the escape hatch is verified before the gate can deny', async () => {
  // The anti-soft-lock interlock, asserted through the real activation path
  // rather than only through the pure resolveArming helper: if the escape skill
  // does not resolve, no denial may occur, whatever the config says.
  const { context, calls } = stubContext({ skills: false });

  let activationError;
  try {
    run(context, { gate: true });
  } catch (error) {
    activationError = error;
  }
  await tick();
  await tick();

  assert.equal(activationError, undefined, `run() threw during activation: ${activationError}`);
  const execution = {
    name: 'write',
    arguments: '{"file_path":"src/app.ts"}',
    agent: { session: { snapshotEvents: () => [], ownEvents: () => [] } }
  };
  assert.equal(
    calls.guards[0](execution),
    undefined,
    'an unverifiable escape hatch must leave the gate shut, never deny'
  );
});

test('resolveSettings still reports the shipped defaults', () => {
  const settings = resolveSettings(undefined);
  assert.equal(settings.gate, false);
  assert.equal(settings.announceInPrompt, true);
});

// Observed live (eval harness, gate-steer, 4 runs in 4): the catalog description
// "Load this to clear the ... write gate" made agents load the escape hatch
// before doing anything else. The catalog line must read as recovery-only.
test('the escape skill is described as recovery-only in the catalog', async () => {
  const { ESCAPE_SKILL_DESCRIPTION } = await import('../src/gate/escape-skill.js');
  assert.match(ESCAPE_SKILL_DESCRIPTION, /^Only after/);
  assert.match(ESCAPE_SKILL_DESCRIPTION, /denied/);
  assert.doesNotMatch(ESCAPE_SKILL_DESCRIPTION, /^Load this to clear/);
});

// Regression: the first build appended to gate-diag.log beside the module on
// every activation. Installed, that is a write into the profile's node_modules.
test('activation writes no file beside the module unless diagnosticsLog is set', async () => {
  const { existsSync, readdirSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const here = fileURLToPath(new URL('../src/gate/', import.meta.url));
  const before = readdirSync(here).sort();
  const { context } = stubContext();
  run(context, { gate: true });
  await tick();
  assert.deepEqual(readdirSync(here).sort(), before);
  assert.equal(existsSync(here + 'gate-diag.log'), false);
});
