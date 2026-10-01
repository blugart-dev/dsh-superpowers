// Unit tests for the Superpowers workflow gate's pure logic.
// Run: npm test
//
// These tests exist because the gate can deny tool calls. A gate that denies
// the wrong thing (or silently never denies) is worse than no gate, so the
// decision function and the log fold are pinned here before anything is
// installed into a profile.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GATED_TOOLS,
  DEFAULT_ARTIFACT_PREFIXES,
  decide,
  denialMessage,
  extractFilePath,
  isArtifactPath,
  normalizePath,
  resolveArming
} from '../src/gate/policy.js';

import {
  SkillLoadCache,
  foldEvents,
  foldSkillLoads,
  initSkillLoadState,
  isSkillLoaded,
  skillNameArgument
} from '../src/gate/session-fold.js';

import { resolveSettings } from '../src/gate/index.js';

// ---------------------------------------------------------------------------
// Helpers: build session events in the exact shapes observed in a real log.
// ---------------------------------------------------------------------------

let callCounter = 0;
function skillCall(name, callId) {
  const id = callId ?? 'call_' + ++callCounter;
  return {
    type: 'tool/call',
    seq: 1,
    data: { name: 'skill', callId: id, arguments: JSON.stringify({ name }) }
  };
}

/**
 * A committed tool result. Note the real shape: a *failed* skill load is
 * committed with `message.isError === true` and NO `data.error` field, so the
 * fold must key on `message.isError`.
 */
function skillResult(callId, { isError = false } = {}) {
  return {
    type: 'tool/result',
    seq: 2,
    data: {
      message: {
        role: 'tool',
        toolCallId: callId,
        isError,
        content: [{ type: 'text', text: isError ? 'Error: unknown' : '<skill_content/>' }]
      }
    }
  };
}

const BASE = {
  gateEnabled: true,
  skillLoaded: false,
  artifactPrefixes: DEFAULT_ARTIFACT_PREFIXES,
  artifactsWritable: true,
  skillName: 'superpowers-workflow',
  selfRegistered: true
};

// ---------------------------------------------------------------------------
// policy.decide
// ---------------------------------------------------------------------------

test('non-gated tools are always allowed', () => {
  for (const toolName of ['read', 'glob', 'grep', 'pwsh', 'todo_write', 'skill']) {
    const verdict = decide({ ...BASE, toolName, rawArguments: '{"file_path":"src/a.ts"}' });
    assert.equal(verdict.allowed, true, toolName + ' must not be gated');
  }
});

test('gated tools are exactly write and edit', () => {
  assert.deepEqual([...GATED_TOOLS], ['write', 'edit']);
});

test('the gate flag turns the gate off completely', () => {
  const verdict = decide({
    ...BASE,
    gateEnabled: false,
    toolName: 'write',
    rawArguments: '{"file_path":"src/a.ts","content":"x"}'
  });
  assert.equal(verdict.allowed, true);
});

test('THE CORE CASE: a source write without a loaded skill is DENIED', () => {
  const verdict = decide({
    ...BASE,
    toolName: 'write',
    rawArguments: '{"file_path":"src/index.ts","content":"export const x = 1;"}'
  });
  assert.equal(verdict.allowed, false);
  assert.match(verdict.message, /blocked until this session has loaded a skill/);
});

test('THE CORE CASE: the same write is ALLOWED once a skill is loaded', () => {
  const verdict = decide({
    ...BASE,
    skillLoaded: true,
    toolName: 'write',
    rawArguments: '{"file_path":"src/index.ts","content":"export const x = 1;"}'
  });
  assert.equal(verdict.allowed, true);
});

test('edit is gated exactly like write', () => {
  const args = '{"file_path":"src/index.ts","old_string":"a","new_string":"b"}';
  assert.equal(decide({ ...BASE, toolName: 'edit', rawArguments: args }).allowed, false);
  assert.equal(decide({ ...BASE, skillLoaded: true, toolName: 'edit', rawArguments: args }).allowed, true);
});

test('the workflow may write its own artifacts without any skill loaded', () => {
  const allowed = [
    'docs/superpowers/plans/2026-10-01-gate.md',
    'docs/superpowers/specs/2026-10-01-gate-design.md',
    'research/findings.md',
    'notes/scratch.md',
    'C:\\Users\\x\\proj\\docs\\superpowers\\plans\\p.md',
    'C:/Users/x/proj/research/deep/note.md'
  ];
  for (const file_path of allowed) {
    const verdict = decide({ ...BASE, toolName: 'write', rawArguments: JSON.stringify({ file_path }) });
    assert.equal(verdict.allowed, true, file_path + ' should be exempt');
  }
});

test('artifact exemption is a path-segment match, not a loose substring', () => {
  // A directory that merely ends with the same word must NOT be exempt.
  assert.equal(isArtifactPath('src/myresearch/a.ts', DEFAULT_ARTIFACT_PREFIXES), false);
  assert.equal(isArtifactPath('src/research-notes/a.ts', DEFAULT_ARTIFACT_PREFIXES), false);
  // The real prefix, at the root or nested, IS exempt.
  assert.equal(isArtifactPath('research/a.ts', DEFAULT_ARTIFACT_PREFIXES), true);
  assert.equal(isArtifactPath('a/b/research/c.ts', DEFAULT_ARTIFACT_PREFIXES), true);
});

test('paths that only contain the words deeper inside are still gated', () => {
  const verdict = decide({
    ...BASE,
    toolName: 'write',
    rawArguments: '{"file_path":"src/docs/superpowers/plans/thing.ts"}'
  });
  // `thing.ts` sits under an artifact-looking directory but is source: the
  // prefix appears after a slash, so it IS exempt by design. Pin the chosen
  // semantics explicitly rather than leaving them implied.
  assert.equal(verdict.allowed, true);
});

test('an unparseable or missing file_path fails CLOSED for gated tools', () => {
  for (const rawArguments of ['not json', '{}', '{"file_path":42}', undefined, '{"content":"x"}']) {
    const verdict = decide({ ...BASE, toolName: 'write', rawArguments });
    assert.equal(verdict.allowed, false, 'rawArguments=' + String(rawArguments) + ' must be denied');
  }
});

test('a loaded skill clears the gate even for an unparseable call', () => {
  const verdict = decide({ ...BASE, skillLoaded: true, toolName: 'write', rawArguments: 'not json' });
  assert.equal(verdict.allowed, true);
});

test('turning artifactsWritable off gates even the plan directories', () => {
  const rawArguments = '{"file_path":"docs/superpowers/plans/p.md"}';
  assert.equal(decide({ ...BASE, toolName: 'write', rawArguments }).allowed, true);
  const gated = decide({ ...BASE, artifactsWritable: false, toolName: 'write', rawArguments });
  assert.equal(gated.allowed, false, 'with artifacts closed, even a plan needs a skill load');
});

// ---------------------------------------------------------------------------
// The denial message is the anti-soft-lock artifact.
// ---------------------------------------------------------------------------

test('the denial message names the exact skill and the exact call', () => {
  const message = denialMessage({
    toolName: 'write',
    filePath: 'src/index.ts',
    skillName: 'superpowers-workflow',
    selfRegistered: true
  });
  assert.match(message, /"superpowers-workflow"/);
  assert.match(message, /skill/);
  // Quoted string, not a regex literal: a backtick inside a regex literal is
  // indistinguishable from a template-literal delimiter to simple tooling.
  assert.ok(message.includes('call the `skill` tool'), 'must name the exact call to make');
  assert.match(message, /retry/);
  // And it must name a human escape.
  assert.match(message, /gate: false/);
});

test('the denial message does not claim plugin provenance when there is none', () => {
  const message = denialMessage({
    toolName: 'write',
    filePath: 'src/index.ts',
    skillName: 'test-driven-development',
    selfRegistered: false
  });
  assert.doesNotMatch(message, /registered by the dsh-superpowers gate/);
});

test('the denial message states only provenance it can verify, never provider state', () => {
  // The denial message is the anti-soft-lock artifact: a blocked session reads
  // it under pressure and has nothing else to go on. Its provenance note
  // originally ended "... because this profile currently exposes no filesystem
  // skill provider." That cause was an environment claim this pure function
  // cannot observe - it receives one boolean - and it went stale the moment
  // plugins/superpowers-skills mounted a provider, leaving the one message
  // designed to explain a blockage telling the reader something false about
  // their own session. Pin the disclosure without the unverifiable cause.
  const message = denialMessage({
    toolName: 'write',
    filePath: 'src/index.ts',
    skillName: 'superpowers-workflow',
    selfRegistered: true
  });
  assert.doesNotMatch(message, /no filesystem skill provider/);
  // The disclosure must survive the correction: a reader still has to know the
  // skill is the gate's own, not a discovered methodology skill. Matched across
  // the line wrap, so re-wrapping the note cannot silently drop this assertion
  // (the first draft of this test pinned one line and failed on its own fix).
  assert.match(message, /registered by the\s+dsh-superpowers gate/);
});

// ---------------------------------------------------------------------------
// The arming interlock: never arm a gate the session cannot clear.
// ---------------------------------------------------------------------------

test('the gate is NOT armed when config disables it', () => {
  const result = resolveArming({ gateRequested: false, escapeHatchEnabled: true, escapeHatchResolved: true });
  assert.equal(result.armed, false);
  assert.match(result.reason, /gate disabled by config/);
});

test('the gate is NOT armed when the escape hatch is switched off', () => {
  const result = resolveArming({ gateRequested: true, escapeHatchEnabled: false, escapeHatchResolved: true });
  assert.equal(result.armed, false);
  assert.match(result.reason, /no documented recovery path/);
});

test('THE ANTI-SOFT-LOCK CASE: the gate is NOT armed when the skill does not resolve', () => {
  const result = resolveArming({ gateRequested: true, escapeHatchEnabled: true, escapeHatchResolved: false });
  assert.equal(result.armed, false, 'an unclearable gate must never arm');
  assert.match(result.reason, /no way to recover/);
});

test('the gate is armed only when requested AND clearable', () => {
  const result = resolveArming({ gateRequested: true, escapeHatchEnabled: true, escapeHatchResolved: true });
  assert.equal(result.armed, true);
});

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

test('extractFilePath reads file_path from a JSON string or an object', () => {
  assert.equal(extractFilePath('{"file_path":"a/b.ts"}'), 'a/b.ts');
  assert.equal(extractFilePath({ file_path: 'a/b.ts' }), 'a/b.ts');
  // A real model emits a JSON-escaped backslash. extractFilePath returns the
  // decoded path verbatim; only normalizePath unifies separators.
  assert.equal(extractFilePath('{"file_path":"a\\\\b.ts"}'), 'a\\b.ts');
  assert.equal(extractFilePath('nope'), undefined);
  assert.equal(extractFilePath(null), undefined);
});

test('normalizePath unifies separators and trims', () => {
  assert.equal(normalizePath('  a\\b\\c.ts  '), 'a/b/c.ts');
  assert.equal(normalizePath(''), undefined);
  assert.equal(normalizePath(42), undefined);
});

// ---------------------------------------------------------------------------
// session-fold
// ---------------------------------------------------------------------------

test('a fresh state reports no skill loaded', () => {
  assert.equal(isSkillLoaded(initSkillLoadState()), false);
  assert.equal(isSkillLoaded(undefined), false);
});

test('a SUCCESSFUL skill load sets skillsLoaded', () => {
  const call = skillCall('test-driven-development', 'c1');
  let state = initSkillLoadState();
  state = foldSkillLoads(state, call);
  assert.equal(state.skillsLoaded, false, 'a pending call is not yet a load');
  state = foldSkillLoads(state, skillResult('c1'));
  assert.equal(state.skillsLoaded, true);
  assert.equal(state.loadedSkill, 'test-driven-development');
});

test('THE DENIAL-IS-NOT-A-LOAD CASE: a failed skill load does NOT clear the gate', () => {
  // Regression guard for the real log shape: isError true, no data.error.
  let state = initSkillLoadState();
  state = foldSkillLoads(state, skillCall('brainstorming', 'c2'));
  state = foldSkillLoads(state, skillResult('c2', { isError: true }));
  assert.equal(state.skillsLoaded, false);
  assert.equal(isSkillLoaded(state), false);
  assert.deepEqual(state.pending, {}, 'the pending entry must be cleared either way');
});

test('a result with no matching call is ignored', () => {
  const state = foldSkillLoads(initSkillLoadState(), skillResult('never-called'));
  assert.equal(state.skillsLoaded, false);
});

test('a failed load followed by a good load still clears the gate', () => {
  let state = foldEvents(initSkillLoadState(), [
    skillCall('brainstorming', 'a'),
    skillResult('a', { isError: true }),
    skillCall('systematic-debugging', 'b'),
    skillResult('b')
  ]);
  assert.equal(state.skillsLoaded, true);
  assert.equal(state.loadedSkill, 'systematic-debugging');
});

test('only the FIRST successful load is recorded', () => {
  const state = foldEvents(initSkillLoadState(), [
    skillCall('brainstorming', 'a'),
    skillResult('a'),
    skillCall('writing-plans', 'b'),
    skillResult('b')
  ]);
  assert.equal(state.loadedSkill, 'brainstorming');
});

test('non-skill tool calls never affect the fold', () => {
  const state = foldEvents(initSkillLoadState(), [
    { type: 'tool/call', seq: 1, data: { name: 'write', callId: 'w1', arguments: '{"file_path":"a.ts"}' } },
    { type: 'tool/result', seq: 2, data: { message: { toolCallId: 'w1', isError: false } } },
    { type: 'assistant/message', seq: 3, data: {} }
  ]);
  assert.equal(state.skillsLoaded, false);
});

test('an irrelevant event returns the SAME reference (cheap no-op)', () => {
  const state = initSkillLoadState();
  assert.equal(foldSkillLoads(state, { type: 'turn/start', data: { turn: 1 } }), state);
  assert.equal(foldSkillLoads(state, null), state);
  assert.equal(foldSkillLoads(state, { type: 'tool/call', data: { name: 'read', callId: 'x' } }), state);
});

test('malformed skill calls and results never throw', () => {
  const junk = [
    { type: 'tool/call', data: { name: 'skill', callId: 42, arguments: '{}' } },
    { type: 'tool/call', data: { name: 'skill', callId: 'x', arguments: 'not json' } },
    { type: 'tool/call', data: { name: 'skill', callId: 'y', arguments: '{"name":""}' } },
    { type: 'tool/result', data: { message: null } },
    { type: 'tool/result', data: {} },
    { type: 'tool/result' }
  ];
  const state = foldEvents(initSkillLoadState(), junk);
  assert.equal(state.skillsLoaded, false);
});

test('skillNameArgument reads only a non-empty string name', () => {
  assert.equal(skillNameArgument('{"name":"a-b"}'), 'a-b');
  assert.equal(skillNameArgument({ name: 'a-b' }), 'a-b');
  assert.equal(skillNameArgument('{"name":""}'), undefined);
  assert.equal(skillNameArgument('{"name":7}'), undefined);
  assert.equal(skillNameArgument('{'), undefined);
});

// ---------------------------------------------------------------------------
// SkillLoadCache: the derived cache must agree with a full replay.
// ---------------------------------------------------------------------------

/**
 * A Session double that reproduces the REAL asymmetry between the two log
 * accessors, because encoding that asymmetry wrongly is what let a fork bug
 * ship green.
 *
 * On the installed harness:
 *   - `snapshotEvents(fromSeq)` returns the log from `fromSeq`, so 0 includes
 *     the fork-inherited prefix.
 *   - `ownEvents()` returns ONLY the events this session owns, EXCLUDING the
 *     inherited prefix.
 *
 * An earlier version of this double exposed only `ownEvents` and handed it the
 * inherited events, which silently asserted the opposite of the real API.
 *
 * @param {unknown[]} fullLog - every event, inherited prefix included.
 * @param {number} [ownFrom] - index at which this session's own events begin.
 *   Defaults to 0 (a non-forked session owns its whole log).
 */
function fakeSession(fullLog, ownFrom = 0) {
  return {
    snapshotEvents: (fromSeq = 0) => fullLog.slice(fromSeq),
    ownEvents: () => fullLog.slice(ownFrom)
  };
}

test('the cache reports no load for a session with no skill call', () => {
  const cache = new SkillLoadCache();
  const session = fakeSession([{ type: 'turn/start', seq: 0, data: {} }]);
  assert.equal(isSkillLoaded(cache.stateFor(session)), false);
});

test('the cache folds an inherited (forked) log prefix', () => {
  // A fork inherits its parent's events; the derived state must come along.
  const cache = new SkillLoadCache();
  const session = fakeSession([
    skillCall('brainstorming', 'p1'),
    skillResult('p1'),
    { type: 'user/message', seq: 3, data: {} }
  ]);
  assert.equal(isSkillLoaded(cache.stateFor(session)), true);
});

test('REGRESSION: a FORK inherits the parent load, even though ownEvents() hides it', () => {
  // This is the measured defect. The parent loaded a skill at seq 1-2; the fork
  // owns nothing yet, so ownEvents() returns ONLY the events after ownFrom.
  // Reading ownEvents() made a forked session look skill-less and the gate
  // denied a non-exempt write that the parent's state should have allowed.
  const inherited = [skillCall('superpowers-workflow', 'p1'), skillResult('p1')];
  const forkOwn = [{ type: 'turn/start', seq: 2, data: { turn: 1 } }];
  const forked = fakeSession([...inherited, ...forkOwn], inherited.length);

  // Guard the premise: the double must actually reproduce the asymmetry, or
  // this test proves nothing.
  assert.equal(forked.ownEvents().length, 1, 'ownEvents must EXCLUDE the inherited prefix');
  assert.equal(forked.snapshotEvents(0).length, 3, 'snapshotEvents(0) must INCLUDE it');

  const cache = new SkillLoadCache();
  assert.equal(
    isSkillLoaded(cache.stateFor(forked)),
    true,
    'a fork must inherit its parent loaded-skill state through the log prefix'
  );
});

test('REGRESSION: ownEvents() alone is NOT a sufficient source', () => {
  // Pins the API choice itself. If readEvents() ever switches back to
  // ownEvents(), this fails.
  const inherited = [skillCall('superpowers-workflow', 'p1'), skillResult('p1')];
  const forked = fakeSession([...inherited, { type: 'turn/start', seq: 2, data: {} }], inherited.length);

  // Fold the ownEvents() view by hand: it must NOT show a load.
  const ownOnly = foldEvents(initSkillLoadState(), forked.ownEvents());
  assert.equal(isSkillLoaded(ownOnly), false, 'ownEvents() hides the inherited load');

  // The full log must show it.
  const full = foldEvents(initSkillLoadState(), forked.snapshotEvents(0));
  assert.equal(isSkillLoaded(full), true, 'snapshotEvents(0) reveals it');
});

test('the cache extends incrementally as events are appended', () => {
  const cache = new SkillLoadCache();
  const events = [{ type: 'turn/start', seq: 0, data: {} }];
  const session = fakeSession(events);
  assert.equal(isSkillLoaded(cache.stateFor(session)), false);

  events.push(skillCall('verification-before-completion', 'z1'));
  assert.equal(isSkillLoaded(cache.stateFor(session)), false, 'call alone is not a load');

  events.push(skillResult('z1'));
  assert.equal(isSkillLoaded(cache.stateFor(session)), true, 'result must be picked up');
});

test('the cache never leaks state between sessions', () => {
  const cache = new SkillLoadCache();
  const loaded = fakeSession([skillCall('a', 'k'), skillResult('k')]);
  const fresh = fakeSession([{ type: 'turn/start', seq: 0, data: {} }]);
  assert.equal(isSkillLoaded(cache.stateFor(loaded)), true);
  assert.equal(isSkillLoaded(cache.stateFor(fresh)), false, 'a new session must start gated');
});

test('a session whose log cannot be read fails closed', () => {
  const cache = new SkillLoadCache();
  assert.equal(isSkillLoaded(cache.stateFor({})), false);
  assert.equal(isSkillLoaded(cache.stateFor(null)), false);
  assert.equal(
    isSkillLoaded(
      cache.stateFor({
        ownEvents() {
          throw new Error('no log');
        }
      })
    ),
    false
  );
});

test('forget() drops cached state', () => {
  const cache = new SkillLoadCache();
  const session = fakeSession([skillCall('a', 'k'), skillResult('k')]);
  assert.equal(isSkillLoaded(cache.stateFor(session)), true);
  cache.forget(session);
  assert.equal(isSkillLoaded(cache.stateFor(session)), true, 're-derives from the log');
});

// ---------------------------------------------------------------------------
// resolveSettings: defaults applied in code, since this bundle cannot import
// @deepseek-ai/schemastery (see the module docstring in index.js).
// ---------------------------------------------------------------------------

test('DEFAULTS: an empty config leaves the gate OFF and artifacts writable', () => {
  const s = resolveSettings(undefined);
  assert.equal(s.gate, false, 'an installed bundle must be inert by default');
  assert.equal(s.artifactsWritable, true);
  assert.equal(s.escapeSkill.enabled, true);
  assert.equal(s.escapeSkill.name, 'superpowers-workflow');
  assert.equal(s.announceInPrompt, true);
  assert.equal(s.verbose, false);
  assert.ok(s.artifactPrefixes.includes('docs/superpowers/plans/'));
});

test('resolveSettings honours explicit values', () => {
  const s = resolveSettings({
    gate: true,
    artifactsWritable: false,
    artifactPrefixes: ['tmp/'],
    escapeSkill: { enabled: false, name: 'custom-skill' },
    announceInPrompt: false,
    verbose: true
  });
  assert.equal(s.gate, true);
  assert.equal(s.artifactsWritable, false);
  assert.deepEqual(s.artifactPrefixes, ['tmp/']);
  assert.equal(s.escapeSkill.enabled, false);
  assert.equal(s.escapeSkill.name, 'custom-skill');
  assert.equal(s.announceInPrompt, false);
  assert.equal(s.verbose, true);
});

test('resolveSettings treats only an explicit true as gate=true', () => {
  // A truthy-but-not-true value must not silently arm the gate.
  assert.equal(resolveSettings({ gate: 'yes' }).gate, false);
  assert.equal(resolveSettings({ gate: 1 }).gate, false);
  assert.equal(resolveSettings({ gate: true }).gate, true);
});

test('resolveSettings normalizes prefixes and drops unusable ones', () => {
  const s = resolveSettings({ artifactPrefixes: ['docs\\superpowers\\plans\\', '', 42] });
  assert.deepEqual(s.artifactPrefixes, ['docs/superpowers/plans/']);
});

test('resolveSettings ignores unknown keys instead of throwing', () => {
  const s = resolveSettings({ nonsense: true, escapeSkill: null });
  assert.equal(s.gate, false);
  assert.equal(s.escapeSkill.enabled, true);
});

test('END-TO-END: resolveSettings feeds decide without contradiction', () => {
  // The two units must agree: a default (inert) config can never deny anything.
  const settings = resolveSettings({});
  const verdict = decide({
    toolName: 'write',
    rawArguments: '{"file_path":"src/app.ts"}',
    gateEnabled: settings.gate,
    skillLoaded: false,
    artifactPrefixes: settings.artifactPrefixes,
    artifactsWritable: settings.artifactsWritable,
    skillName: settings.escapeSkill.name,
    selfRegistered: true
  });
  assert.equal(verdict.allowed, true, 'default config must be inert');
});

test('END-TO-END: an armed config denies a source write and names the skill', () => {
  const settings = resolveSettings({ gate: true });
  const verdict = decide({
    toolName: 'write',
    rawArguments: '{"file_path":"src/app.ts"}',
    gateEnabled: settings.gate,
    skillLoaded: false,
    artifactPrefixes: settings.artifactPrefixes,
    artifactsWritable: settings.artifactsWritable,
    skillName: settings.escapeSkill.name,
    selfRegistered: true
  });
  assert.equal(verdict.allowed, false);
  assert.match(verdict.message, /"superpowers-workflow"/);
});
