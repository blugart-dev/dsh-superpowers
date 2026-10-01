import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SCENARIOS, firstMethodologySkill } from '../evals/harness/scenarios.mjs';

const byId = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

/** A summary as summarizeSession() returns it, with only the fields checks read. */
function summary({ bootstrapCount = 1, skills = [], writes = [] } = {}) {
  return {
    bootstrapCount,
    skillLoads: skills.map(([name, time, ok = true]) => ({ name, time, ok })),
    writes: writes.map(([path, time, denied = false]) => ({ tool: 'write', path, time, denied })),
    firstSkillLoadTime: skills[0]?.[1],
    firstWriteTime: writes[0]?.[1]
  };
}

test('scenario ids are unique and every scenario has a prompt and a check', () => {
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length);
  for (const scenario of SCENARIOS) {
    assert.equal(typeof scenario.prompt, 'string');
    assert.equal(typeof scenario.check, 'function');
  }
});

test('prompts never name a skill or Superpowers (that would steer the agent)', () => {
  const skillNames = /brainstorm|writing-plans|test-driven|systematic-debugging|verification-before|superpowers|skill/i;
  for (const scenario of SCENARIOS.filter((s) => !s.mechanics)) {
    assert.doesNotMatch(scenario.prompt, skillNames, scenario.id);
  }
});

test('firstMethodologySkill ignores using-superpowers and failed loads', () => {
  const s = summary({ skills: [['using-superpowers', 1], ['no-such', 2, false], ['brainstorming', 3]] });
  assert.equal(firstMethodologySkill(s).name, 'brainstorming');
});

test('bootstrap: passes on exactly one occurrence', () => {
  assert.equal(byId.bootstrap.check(summary({ bootstrapCount: 1 })).pass, true);
  assert.equal(byId.bootstrap.check(summary({ bootstrapCount: 0 })).pass, false);
  assert.equal(byId.bootstrap.check(summary({ bootstrapCount: 2 })).pass, false);
});

test('routing: the expected skill must come first, and before any write', () => {
  const route = byId['route-bug'];
  assert.equal(route.check(summary({ skills: [['systematic-debugging', 2]], writes: [['src/sum.js', 5]] })).pass, true);
  assert.equal(route.check(summary({ skills: [['test-driven-development', 2]] })).pass, false);
  assert.equal(route.check(summary({ skills: [['systematic-debugging', 6]], writes: [['src/sum.js', 5]] })).pass, false);
  assert.equal(route.check(summary({ skills: [] })).pass, false);
});

test('control: no methodology skill should load for a trivial question', () => {
  assert.equal(byId.control.check(summary({ skills: [['using-superpowers', 1]] })).pass, true);
  assert.equal(byId.control.check(summary({ skills: [['brainstorming', 1]] })).pass, false);
});

test('gate-deny: denied, then the escape skill, then an allowed write', () => {
  const ok = summary({
    bootstrapCount: 0,
    skills: [['superpowers-workflow', 2]],
    writes: [['src/hello.txt', 1, true], ['src/hello.txt', 3, false]]
  });
  assert.equal(byId['gate-deny'].check(ok).pass, true);
  const neverDenied = summary({ skills: [['superpowers-workflow', 2]], writes: [['src/hello.txt', 3]] });
  assert.equal(byId['gate-deny'].check(neverDenied).pass, false);
  assert.match(byId['gate-deny'].overlay, /announceInPrompt: false/);
});

test('gate-steer: the escape hatch must not be loaded pre-emptively', () => {
  const steer = byId['gate-steer'];
  assert.match(steer.overlay, /announceInPrompt: true/);
  // Good: a real skill before the first write.
  assert.equal(steer.check(summary({ skills: [['test-driven-development', 1]], writes: [['src/a.js', 2]] })).pass, true);
  // Good: no skill, denied, recovered through the escape hatch.
  assert.equal(steer.check(summary({
    skills: [['superpowers-workflow', 2]], writes: [['src/a.js', 1, true], ['src/a.js', 3]]
  })).pass, true);
  // Bad: the ritual - escape hatch first, with no denial to recover from.
  assert.equal(steer.check(summary({ skills: [['superpowers-workflow', 1]], writes: [['src/a.js', 2]] })).pass, false);
  // Bad: nothing written at all.
  assert.equal(steer.check(summary({ skills: [['test-driven-development', 1]] })).pass, false);
  // Bad: the ritual alongside a real skill still counts as the ritual.
  assert.equal(steer.check(summary({
    skills: [['superpowers-workflow', 1], ['systematic-debugging', 2]], writes: [['src/sum.js', 3]]
  })).pass, false);
  // The task must be one that is written without a design-approval stop.
  assert.match(steer.prompt, /fix/i);
});

// Found in dice-lab Phase 3: asked to wrap up, the agent restated an earlier
// "76/76 passing" instead of re-running the suite. Iron Law 3 wants fresh evidence.
test('wrap-up: passes only if the tests are run in that session', () => {
  const wrap = byId['wrap-up'];
  const ran = { ...summary(), shellCommands: [{ command: 'npm test', time: 2 }] };
  const ranNode = { ...summary(), shellCommands: [{ command: 'cd x; node --test 2>&1', time: 2 }] };
  const restated = { ...summary(), shellCommands: [{ command: 'git status --short', time: 2 }] };
  assert.equal(wrap.check(ran).pass, true);
  assert.equal(wrap.check(ranNode).pass, true);
  assert.equal(wrap.check(restated).pass, false);
  assert.match(wrap.prompt, /already/i);
  assert.ok(wrap.files['package.json'] && wrap.files['test/greet.test.js']);
});

test('multi-turn scenarios declare their follow-up prompts', () => {
  for (const id of ['wrap-up-own', 'gate-resume']) {
    assert.ok(Array.isArray(byId[id].followUps) && byId[id].followUps.length === 1, id);
  }
});

test('wrap-up-own: the tests must run after the final user message', () => {
  const s = (commands) => ({ ...summary(), userMessageTimes: [1, 10], shellCommands: commands });
  assert.equal(byId['wrap-up-own'].check(s([{ command: 'npm test', time: 2 }, { command: 'npm test', time: 11 }])).pass, true);
  assert.equal(byId['wrap-up-own'].check(s([{ command: 'npm test', time: 2 }])).pass, false);
});

test('gate-resume: the resumed write is allowed because the skill load is in the log', () => {
  const s = (writes) => ({ ...summary({ skills: [['test-driven-development', 2]], writes }), userMessageTimes: [1, 10] });
  assert.equal(byId['gate-resume'].check(s([['src/hello.txt', 11, false]])).pass, true);
  assert.equal(byId['gate-resume'].check(s([['src/hello.txt', 11, true]])).pass, false);
  assert.equal(byId['gate-resume'].check(s([])).pass, false);
});

test('gate-fork: the fork must end up writing, and the path taken is reported', () => {
  const parent = summary({ skills: [['systematic-debugging', 1]] });
  const allowed = summary({ writes: [['src/fork.txt', 3, false]] });
  const recovered = summary({ skills: [['superpowers-workflow', 4]], writes: [['src/fork.txt', 3, true], ['src/fork.txt', 5, false]] });
  const stuck = summary({ writes: [['src/fork.txt', 3, true]] });
  assert.match(byId['gate-fork'].check(parent, [allowed]).detail, /inherited/);
  assert.equal(byId['gate-fork'].check(parent, [recovered]).pass, true);
  assert.match(byId['gate-fork'].check(parent, [recovered]).detail, /recovered/);
  assert.equal(byId['gate-fork'].check(parent, [stuck]).pass, false);
  assert.equal(byId['gate-fork'].check(parent, []).pass, false);
});

test('gate-required: a non-required skill does not unlock writes', () => {
  const required = byId['gate-required'];
  assert.match(required.overlay, /requiredSkills: \[test-driven-development\]/);
  const deniedAfterBrainstorm = summary({ skills: [['brainstorming', 1]], writes: [['src/a.txt', 2, true]] });
  const allowedAfterBrainstorm = summary({ skills: [['brainstorming', 1]], writes: [['src/a.txt', 2, false]] });
  assert.equal(required.check(deniedAfterBrainstorm).pass, true);
  assert.equal(required.check(allowedAfterBrainstorm).pass, false);
  assert.equal(required.check(summary({ skills: [['brainstorming', 1]] })).pass, false);
});

test('subagent: the parent has the bootstrap and every child does not', () => {
  const parent = summary({ bootstrapCount: 1 });
  assert.equal(byId.subagent.check(parent, [summary({ bootstrapCount: 0 })]).pass, true);
  assert.equal(byId.subagent.check(parent, [summary({ bootstrapCount: 1 })]).pass, false);
  assert.equal(byId.subagent.check(parent, []).pass, false);
});
