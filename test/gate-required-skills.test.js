// requiredSkills: let a project say WHICH skills unlock writes, not just "any".
// The default (empty list) keeps the original "any skill" behaviour; the escape
// hatch always unlocks, so a configured gate can never soft-lock a session.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { denialMessage } from '../src/gate/policy.js';
import { foldEvents, initSkillLoadState, satisfiesGate } from '../src/gate/session-fold.js';
import apply, { resolveSettings } from '../src/gate/index.js';

const call = (name, id) => ({ type: 'tool/call', data: { name: 'skill', callId: id, arguments: JSON.stringify({ name }) } });
const ok = (id) => ({ type: 'tool/result', data: { message: { toolCallId: id, isError: false } } });
const failed = (id) => ({ type: 'tool/result', data: { message: { toolCallId: id, isError: true } } });
const fold = (events) => foldEvents(initSkillLoadState(), events);

test('the fold records every successfully loaded skill, once, in order', () => {
  const state = fold([
    call('brainstorming', 'a'), ok('a'),
    call('nope', 'b'), failed('b'),
    call('test-driven-development', 'c'), ok('c'),
    call('brainstorming', 'd'), ok('d')
  ]);
  assert.deepEqual(state.loadedSkills, ['brainstorming', 'test-driven-development']);
});

test('with no requiredSkills, any loaded skill satisfies the gate', () => {
  assert.equal(satisfiesGate(fold([call('brainstorming', 'a'), ok('a')]), [], 'superpowers-workflow'), true);
  assert.equal(satisfiesGate(fold([]), [], 'superpowers-workflow'), false);
});

test('with requiredSkills, only those skills or the escape hatch satisfy it', () => {
  const required = ['test-driven-development', 'systematic-debugging'];
  assert.equal(satisfiesGate(fold([call('brainstorming', 'a'), ok('a')]), required, 'superpowers-workflow'), false);
  assert.equal(satisfiesGate(fold([call('systematic-debugging', 'a'), ok('a')]), required, 'superpowers-workflow'), true);
  assert.equal(satisfiesGate(fold([call('superpowers-workflow', 'a'), ok('a')]), required, 'superpowers-workflow'), true);
  assert.equal(satisfiesGate(undefined, required, 'superpowers-workflow'), false);
});

test('requiredSkills defaults to empty and keeps only non-empty strings', () => {
  assert.deepEqual(resolveSettings(undefined).requiredSkills, []);
  assert.deepEqual(resolveSettings({ requiredSkills: ['tdd', '', 3, 'x'] }).requiredSkills, ['tdd', 'x']);
});

test('the denial message names the required skills when there are any', () => {
  const base = { toolName: 'write', filePath: 'src/a.js', skillName: 'superpowers-workflow', selfRegistered: true };
  assert.doesNotMatch(denialMessage(base), /requires one of/);
  const message = denialMessage({ ...base, requiredSkills: ['test-driven-development', 'systematic-debugging'] });
  assert.match(message, /requires one of: test-driven-development, systematic-debugging/);
});

test('the armed guard enforces requiredSkills against the session log', async () => {
  const guards = [];
  const context = {
    effect() { return () => {}; },
    tools: { guard(fn) { guards.push(fn); return () => {}; } },
    get(service) {
      if (service === 'skills') {
        return { register: () => () => {}, get: async (name) => (name === 'superpowers-workflow' ? { name } : undefined) };
      }
      return undefined;
    }
  };
  apply(context, { gate: true, requiredSkills: ['test-driven-development'] });
  await new Promise((resolve) => setImmediate(resolve));
  const execution = (events) => ({
    name: 'write',
    arguments: JSON.stringify({ file_path: 'src/a.js', content: 'x' }),
    agent: { session: { snapshotEvents: () => events, ownEvents: () => events } }
  });
  assert.match(String(guards[0](execution([call('brainstorming', 'a'), ok('a')]))), /blocked/);
  assert.equal(guards[0](execution([call('test-driven-development', 'b'), ok('b')])), undefined);
});
