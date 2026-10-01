import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scoreBuildPhase } from '../evals/dice-lab/score.mjs';

const call = (time, name, args) => ({ type: 'tool/call', time, data: { name, callId: `c${time}`, arguments: JSON.stringify(args) } });
const result = (time, isError = false) => ({ type: 'tool/result', time: time + 0.5, data: { message: { toolCallId: `c${time}`, isError, content: [] } } });

function session(steps) {
  return [{ type: 'session', id: 's', createdAt: 0, cwd: 'x' }, ...steps.flatMap(([c, r]) => [c, r])];
}

test('a disciplined run: brainstorm, ask, plan, then test before source', () => {
  const events = session([
    [call(1, 'skill', { name: 'brainstorming' }), result(1)],
    [call(2, 'ask_user_question', { questions: [] }), result(2)],
    [call(3, 'write', { file_path: 'docs/superpowers/specs/design.md' }), result(3)],
    [call(4, 'skill', { name: 'writing-plans' }), result(4)],
    [call(5, 'write', { file_path: 'test/dice.test.js' }), result(5)],
    [call(6, 'pwsh', { command: 'npm test' }), result(6, true)],
    [call(7, 'write', { file_path: 'src/dice.js' }), result(7)],
    [call(8, 'pwsh', { command: 'npm test' }), result(8)]
  ]);
  const score = scoreBuildPhase(events);
  assert.equal(score.brainstormedBeforeCode, true);
  assert.equal(score.questionsBeforeCode, 1);
  assert.equal(score.plannedBeforeCode, true);
  assert.equal(score.testWrittenBeforeSource, true);
  assert.equal(score.failingRunBeforeSource, true);
  assert.equal(score.testRuns, 2);
});

// Observed in a real DSH session: a failing `node --test` run commits with
// isError=false; the failure is only in the output text.
test('a failing run is detected from the exit code in the output, not isError', () => {
  const failing = { type: 'tool/result', time: 2.5, data: { message: {
    toolCallId: 'c2', isError: false,
    content: [{ type: 'text', text: 'ℹ tests 3\nℹ pass 2\nℹ fail 1\n[exit code: 1]' }]
  } } };
  const events = session([
    [call(1, 'write', { file_path: 'test/rational.test.js' }), result(1)],
    [call(2, 'pwsh', { command: 'node --test test/rational.test.js' }), failing],
    [call(3, 'write', { file_path: 'src/rational.js' }), result(3)]
  ]);
  assert.equal(scoreBuildPhase(events).failingRunBeforeSource, true);
});

test('a careless run: source first, no plan', () => {
  const events = session([
    [call(1, 'write', { file_path: 'src/dice.js' }), result(1)],
    [call(2, 'write', { file_path: 'test/dice.test.js' }), result(2)],
    [call(3, 'pwsh', { command: 'node --test' }), result(3)]
  ]);
  const score = scoreBuildPhase(events);
  assert.equal(score.brainstormedBeforeCode, false);
  assert.equal(score.plannedBeforeCode, false);
  assert.equal(score.testWrittenBeforeSource, false);
  assert.equal(score.failingRunBeforeSource, false);
});
