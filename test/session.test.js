import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zstdCompressSync } from 'node:zlib';

import { decodeSessionLog, parseInspectArgs, summarizeSession } from '../scripts/lib/session.mjs';
import { denialMessage } from '../src/gate/policy.js';

// Built from the real message so the detector cannot drift from the gate.
const denial = 'Tool call denied: ' + denialMessage({
  toolName: 'write', filePath: 'src/a.js', skillName: 'superpowers-workflow', selfRegistered: true
});

const event = (type, time, data) => JSON.stringify({ type, seq: 0, time, data });

const lines = [
  JSON.stringify({ type: 'session', version: 4, id: 's-1', createdAt: 1000, cwd: 'C:\\work\\demo' }),
  event('system/message', 1001, {
    message: { role: 'system', content: [{ type: 'text', text: 'intro\n<EXTREMELY_IMPORTANT>\nYou have superpowers.\n...' }] }
  }),
  event('user/message', 1002, { source: { kind: 'user' }, content: [{ type: 'text', text: 'build a thing' }] }),
  event('tool/call', 1003, { name: 'skill', callId: 'c1', arguments: '{"name":"brainstorming"}' }),
  event('tool/result', 1004, { message: { toolCallId: 'c1', isError: false, content: [] } }),
  event('tool/call', 1005, { name: 'write', callId: 'c2', arguments: '{"file_path":"src/a.js","content":"x"}' }),
  event('tool/result', 1006, {
    message: { toolCallId: 'c2', isError: false, content: [{ type: 'text', text: denial }] }
  }),
  event('tool/call', 1007, { name: 'skill', callId: 'c3', arguments: '{"name":"no-such-skill"}' }),
  event('tool/result', 1008, { message: { toolCallId: 'c3', isError: true, content: [] } }),
  event('turn/end', 1009, { turn: 1, reason: { kind: 'completed' } })
];

test('decodes a multi-frame zstd session log', () => {
  const text = lines.join('\n') + '\n';
  const half = Math.floor(text.length / 2);
  const buffer = Buffer.concat([
    zstdCompressSync(Buffer.from(text.slice(0, half))),
    zstdCompressSync(Buffer.from(text.slice(half)))
  ]);
  const events = decodeSessionLog(buffer);
  assert.equal(events.length, lines.length);
  assert.equal(events[0].type, 'session');
});

test('summarizes bootstrap presence, skill loads and writes', () => {
  const events = lines.map((line) => JSON.parse(line));
  const summary = summarizeSession(events);
  assert.equal(summary.id, 's-1');
  assert.equal(summary.cwd, 'C:\\work\\demo');
  assert.equal(summary.bootstrapCount, 1);
  assert.deepEqual(
    summary.skillLoads.map((load) => [load.name, load.ok]),
    [['brainstorming', true], ['no-such-skill', false]]
  );
  assert.deepEqual(summary.writes.map((w) => [w.path, w.denied]), [['src/a.js', true]]);
  assert.equal(summary.firstSkillLoadTime, 1003);
  assert.equal(summary.firstWriteTime, 1005);
  assert.equal(summary.userMessages, 1);
  assert.deepEqual(summary.userMessageTimes, [1002]);
  assert.equal(summary.turns, 1);
});

test('inspect-session arguments: a lone id is the wanted session, not skipped', () => {
  assert.deepEqual(parseInspectArgs(['0221fd7c']), { wanted: '0221fd7c', workspace: undefined, subagents: false });
  assert.deepEqual(parseInspectArgs(['--workspace', 'dice-lab']), { wanted: undefined, workspace: 'dice-lab', subagents: false });
  assert.deepEqual(parseInspectArgs(['--workspace', 'dice-lab', 'abc', '--subagents']), { wanted: 'abc', workspace: 'dice-lab', subagents: true });
  assert.deepEqual(parseInspectArgs(['abc', '--workspace', 'dice-lab']), { wanted: 'abc', workspace: 'dice-lab', subagents: false });
  assert.deepEqual(parseInspectArgs([]), { wanted: undefined, workspace: undefined, subagents: false });
});

test('shell commands carry their exit code (from DSH\'s "[exit code: N]") and output', () => {
  const shell = (callId, time, command, text) => [
    event('tool/call', time, { name: 'pwsh', callId, arguments: JSON.stringify({ command }) }),
    event('tool/result', time + 1, { message: { toolCallId: callId, isError: false, content: [{ type: 'text', text }] } })
  ];
  const events = [
    ...shell('p1', 2000, 'npm test', 'ℹ pass 1\nℹ fail 0\n'),
    ...shell('p2', 2010, 'bash x', 'x: line 41: basename: command not found\n[exit code: 127]')
  ].map((line) => JSON.parse(line));
  const [ok, bad] = summarizeSession(events).shellCommands;
  assert.equal(ok.exitCode, 0);
  assert.equal(bad.exitCode, 127);
  assert.match(bad.output, /basename: command not found/);
});
