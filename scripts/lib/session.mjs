/**
 * Read DeepSeek Harness session logs.
 *
 * DSH appends each session to `<dshHome>/sessions/<workspace-slug>/<id>/session.v4.jsonl.zstd`:
 * JSONL events, written as a sequence of independent zstd frames. Reading only
 * the first frame silently drops most of the session, so every frame is decoded.
 */

import { zstdDecompressSync } from 'node:zlib';

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/**
 * The gate's denial sentence (src/gate/policy.js denialMessage). Unanchored: the
 * Host may wrap a guard's reason in its own text.
 */
const GATE_DENIAL = /Superpowers workflow gate: "[^"]+" on .+ is blocked until this session has loaded a skill/;

/**
 * Decode a multi-frame zstd session log into events.
 *
 * @param {Buffer} buffer - the raw .zstd file.
 * @returns {object[]} parsed events; malformed lines are skipped.
 */
export function decodeSessionLog(buffer) {
  const starts = [];
  for (let at = buffer.indexOf(ZSTD_MAGIC); at !== -1; at = buffer.indexOf(ZSTD_MAGIC, at + 4)) starts.push(at);
  const parts = [];
  for (let i = 0; i < starts.length; i += 1) {
    try {
      parts.push(zstdDecompressSync(buffer.subarray(starts[i], starts[i + 1] ?? buffer.length)));
    } catch {
      // A magic-number match inside compressed data is not a frame start.
    }
  }
  const events = [];
  for (const line of Buffer.concat(parts).toString('utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* partial trailing line of a live session */
    }
  }
  return events;
}

/** @param {unknown} content - a message content array. */
function textOf(content) {
  return Array.isArray(content) ? content.map((part) => (part?.type === 'text' ? part.text : '')).join('') : '';
}

/** @param {string} raw - tool-call arguments JSON. */
function parseArguments(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Summarize what matters for verifying Superpowers in a session.
 *
 * @param {object[]} events - decoded events.
 * @returns {object} summary.
 */
export function summarizeSession(events) {
  const header = events.find((e) => e.type === 'session') ?? {};
  const results = new Map();
  for (const e of events) {
    if (e.type === 'tool/result') {
      const message = e.data?.message ?? {};
      results.set(message.toolCallId, { isError: message.isError === true, text: textOf(message.content), time: e.time });
    }
  }

  const systemPrompts = events.filter((e) => e.type === 'system/message').map((e) => textOf(e.data?.message?.content));
  const lastPrompt = systemPrompts[systemPrompts.length - 1] ?? '';

  const skillLoads = [];
  const writes = [];
  const shellCommands = [];
  for (const e of events.filter((x) => x.type === 'tool/call')) {
    const args = parseArguments(e.data?.arguments ?? '');
    const result = results.get(e.data?.callId);
    if (e.data?.name === 'skill') {
      skillLoads.push({ name: args.name, time: e.time, ok: result ? !result.isError : undefined });
    } else if (e.data?.name === 'write' || e.data?.name === 'edit') {
      writes.push({
        tool: e.data.name,
        path: args.file_path ?? args.path,
        time: e.time,
        // The gate's denial text is fixed by policy.denialMessage(); match its
        // opening sentence rather than isError, because a denied call can
        // commit as a successful tool result.
        denied: result === undefined ? undefined : GATE_DENIAL.test(result.text)
      });
    } else if (['pwsh', 'bash', 'shell'].includes(e.data?.name)) {
      shellCommands.push({ command: String(args.command ?? ''), time: e.time, isError: result?.isError });
    }
  }

  return {
    id: header.id,
    cwd: header.cwd,
    createdAt: header.createdAt,
    origin: header.origin,
    bootstrapCount: (lastPrompt.match(/You have superpowers\./g) ?? []).length,
    skillLoads,
    writes,
    shellCommands,
    firstSkillLoadTime: skillLoads[0]?.time,
    firstWriteTime: writes[0]?.time,
    userMessages: events.filter((e) => e.type === 'user/message' && e.data?.source?.kind === 'user').length,
    userMessageTimes: events.filter((e) => e.type === 'user/message' && e.data?.source?.kind === 'user').map((e) => e.time),
    turns: events.filter((e) => e.type === 'turn/end').length
  };
}
