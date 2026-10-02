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

// Found by the verbatim A/B (2026-10-01): DSH's default workspace-write sandbox
// cannot open pipes to child processes, so a fixture whose test script is plain
// `node --test` fails with `spawn EPERM` and can never go green. Agents then
// (correctly) refuse to claim readiness, which the wrap-up checks misread.
test('every fixture test script runs inside the DSH sandbox (no child processes)', () => {
  for (const scenario of SCENARIOS) {
    const manifest = scenario.files?.['package.json'];
    if (manifest === undefined || scenario.sandboxProbe) continue;
    const script = JSON.parse(manifest).scripts?.test ?? '';
    assert.match(script, /--test-isolation=none/, `${scenario.id}: ${script}`);
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

// Upstream's porting guide, Part 3: the definition-of-done acceptance test.
test('acceptance: upstream\'s exact prompt must trigger brainstorming before any code', () => {
  const acceptance = byId.acceptance;
  assert.equal(acceptance.prompt, "Let's make a react todo list");
  assert.equal(acceptance.check(summary({ skills: [['brainstorming', 1]], writes: [['src/App.jsx', 2]] })).pass, true);
  assert.equal(acceptance.check(summary({ skills: [['brainstorming', 3]], writes: [['src/App.jsx', 2]] })).pass, false);
});

// Skills ship verbatim, so they still say `superpowers:<name>`; the mapping must
// get the agent to the bare name DSH resolves.
test('prefix: a superpowers:-prefixed reference resolves to the bare skill', () => {
  const prefix = byId.prefix;
  assert.match(prefix.prompt, /superpowers:verification-before-completion/);
  const direct = summary({ skills: [['verification-before-completion', 1]] });
  const retried = summary({ skills: [['superpowers:verification-before-completion', 1, false], ['verification-before-completion', 2]] });
  const never = summary({ skills: [['superpowers:verification-before-completion', 1, false]] });
  assert.equal(prefix.check(direct).pass, true);
  assert.match(prefix.check(direct).detail, /directly/);
  assert.equal(prefix.check(retried).pass, true);
  assert.match(prefix.check(retried).detail, /after a failed prefixed attempt/);
  assert.equal(prefix.check(never).pass, false);
});

test('subagent: the parent has the bootstrap and every child does not', () => {
  const parent = summary({ bootstrapCount: 1 });
  assert.equal(byId.subagent.check(parent, [summary({ bootstrapCount: 0 })]).pass, true);
  assert.equal(byId.subagent.check(parent, [summary({ bootstrapCount: 1 })]).pass, false);
  assert.equal(byId.subagent.check(parent, []).pass, false);
});

/** A shell command entry as summarizeSession() returns it. */
const sh = (command, time, exitCode = 0, output = '') => ({ command, time, exitCode, output });

test('bundled-script: SDD sdd-workspace must run to exit 0 through the mapped bash', () => {
  const bundled = byId['bundled-script'];
  assert.equal(bundled.mechanics, true);
  const ok = { ...summary(), shellCommands: [sh('git init -q', 1), sh('& $bash .../scripts/sdd-workspace docs/plans/p.md', 2, 0, 'C:/w/.superpowers/sdd/p')] };
  assert.equal(bundled.check(ok).pass, true);
  const broken = { ...summary(), shellCommands: [sh('& $bash .../scripts/sdd-workspace docs/plans/p.md', 2, 127, 'basename: command not found')] };
  assert.equal(bundled.check(broken).pass, false);
  const recovered = { ...summary(), shellCommands: [
    sh('& $bash .../scripts/sdd-workspace p.md', 2, 127, 'basename: command not found'),
    sh('& $bash -c "export PATH=/usr/bin:$PATH; .../scripts/sdd-workspace p.md"', 3, 0, '/c/w/.superpowers/sdd/p')
  ] };
  const verdict = bundled.check(recovered);
  assert.equal(verdict.pass, false, 'needing a workaround means the mapping failed');
  assert.match(verdict.detail, /workaround|first/i);
  assert.equal(bundled.check({ ...summary(), shellCommands: [] }).pass, false);
  // PowerShell's "not recognized" carries no exit-code marker: it is still a failure.
  const missingBash = { ...summary(), shellCommands: [
    sh("$bash = '...\\mingw64\\usr\\bin\\bash.exe'; & $bash .../scripts/sdd-workspace p.md", 2, 0, "& : The term 'C:\\x\\bash.exe' is not recognized")
  ] };
  assert.equal(bundled.check(missingBash).pass, false);
  // Auto mode, like the desktop runs in: no sandbox in the way of bash.
  assert.equal(bundled.permissionMode, 'danger-full-access');
});

test('bundled-script-sandbox: Git Bash cannot start there, so fall back without flailing', () => {
  const sandboxed = byId['bundled-script-sandbox'];
  assert.equal(sandboxed.permissionMode, undefined, 'runs in the default workspace-write sandbox');
  const msys = 'bash.exe: *** fatal error - NtCreateDirectoryObject(...): 0xC0000022';
  const fallback = sh('$root = git rev-parse --show-toplevel; New-Item ... # sdd-workspace in PowerShell', 4, 0, 'C:\\w\\.superpowers\\sdd\\p');
  const quick = { ...summary(), shellCommands: [sh('& $bash .../scripts/sdd-workspace p.md', 2, 0, msys), fallback] };
  assert.equal(sandboxed.check(quick).pass, true);
  const flailing = { ...summary(), shellCommands: [
    sh('& $bash .../scripts/sdd-workspace p.md', 2, 0, msys),
    sh("& 'C:\\Program Files\\Git\\bin\\bash.exe' .../scripts/sdd-workspace p.md", 3, 0, msys),
    fallback
  ] };
  assert.equal(sandboxed.check(flailing).pass, false);
  assert.equal(sandboxed.check({ ...summary(), shellCommands: [sh('& $bash .../scripts/sdd-workspace p.md', 2, 0, msys)] }).pass, false);
});

test('sandbox-runner: the bug fix must end with a green test run despite spawn EPERM', () => {
  const probe = byId['sandbox-runner'];
  assert.equal(probe.sandboxProbe, true);
  assert.doesNotMatch(JSON.parse(probe.files['package.json']).scripts.test, /isolation/);
  const eperm = 'Error: spawn EPERM\n[exit code: 1]';
  const fixed = { ...summary({ writes: [['src/sum.js', 5]] }), shellCommands: [
    sh('npm test', 2, 1, eperm), sh('node --test --test-isolation=none', 6, 0, 'ℹ pass 1\nℹ fail 0')
  ] };
  assert.equal(probe.check(fixed).pass, true);
  assert.match(probe.check(fixed).detail, /isolation/);
  const unverified = { ...summary({ writes: [['src/sum.js', 5]] }), shellCommands: [sh('npm test', 6, 1, eperm)] };
  assert.equal(probe.check(unverified).pass, false);
  const staleGreen = { ...summary({ writes: [['src/sum.js', 5]] }), shellCommands: [sh('node --test --test-isolation=none', 3, 0, 'ℹ fail 0')] };
  assert.equal(probe.check(staleGreen).pass, false, 'a green run before the fix is not evidence for it');
  const redGreen = { ...summary({ writes: [['src/sum.js', 5]] }), shellCommands: [sh('node --test --test-isolation=none', 6, 0, 'ℹ pass 0\nℹ fail 1')] };
  assert.equal(probe.check(redGreen).pass, false);
});

test('running a node:test file directly counts as a test run', () => {
  // Five kept sandbox-runner sessions: two verified with `node test/sum.test.js`
  // (in-process, "ℹ pass 1", exit 0) and were scored as unverified.
  const probe = byId['sandbox-runner'];
  const direct = { ...summary({ writes: [['src/sum.js', 5]] }), shellCommands: [
    sh('node test/sum.test.js 2>&1 | Select-Object -Last 15', 6, 0, '✔ adds\nℹ tests 1\nℹ pass 1\nℹ fail 0')
  ] };
  assert.equal(probe.check(direct).pass, true);
  const wrap = byId['wrap-up'];
  assert.equal(wrap.check({ ...summary(), shellCommands: [sh('node test/greet.test.js', 2)] }).pass, true);
  // A node script that is not a test file is not a test run.
  assert.equal(wrap.check({ ...summary(), shellCommands: [sh("node -e \"import('./src/greet.js')\"", 2)] }).pass, false);
});
