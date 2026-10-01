#!/usr/bin/env node
/**
 * Automatic metrics for the dice-lab build phase, read from a DSH session log.
 *
 *   node evals/dice-lab/score.mjs [--workspace dice-lab]
 *
 * These are heuristics over tool calls, not a verdict. They tell you where to
 * look; RUBRIC.md is the judgement. "Code" means a write/edit to a path that is
 * not a doc, spec, plan or config file.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeSessionLog } from '../../scripts/lib/session.mjs';

const TEST_FILE = /(^|[\\/])(test|tests|__tests__)[\\/]|\.(test|spec)\.[cm]?[jt]sx?$/;
const NON_CODE = /\.(md|json|ya?ml|txt|gitignore)$|(^|[\\/])docs[\\/]/i;
const TEST_COMMAND = /\bnpm (run )?test\b|\bnode\b.*--test\b|\bnpx (vitest|jest)\b/;

/** @param {string} raw */
function args(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * @param {object[]} events - decoded session events.
 * @returns {object} build-phase metrics.
 */
export function scoreBuildPhase(events) {
  const results = new Map();
  for (const e of events) {
    if (e.type === 'tool/result') results.set(e.data?.message?.toolCallId, e.data?.message ?? {});
  }
  const calls = events.filter((e) => e.type === 'tool/call').map((e) => ({
    time: e.time,
    name: e.data?.name,
    args: args(e.data?.arguments ?? ''),
    result: results.get(e.data?.callId)
  }));

  const writes = calls.filter((c) => c.name === 'write' || c.name === 'edit');
  const pathOf = (c) => String(c.args.file_path ?? c.args.path ?? '');
  const code = writes.filter((c) => !NON_CODE.test(pathOf(c)));
  const firstCode = code[0]?.time ?? Infinity;
  const firstTest = code.find((c) => TEST_FILE.test(pathOf(c)))?.time ?? Infinity;
  const firstSource = code.find((c) => !TEST_FILE.test(pathOf(c)))?.time ?? Infinity;
  const skillAt = (name) => calls.find((c) => c.name === 'skill' && c.args.name === name)?.time ?? Infinity;
  const testRuns = calls.filter((c) => ['pwsh', 'bash', 'shell'].includes(c.name) && TEST_COMMAND.test(String(c.args.command ?? '')));
  // DSH commits a failing shell command with isError=false; the failure is only
  // visible as "[exit code: N]" (or the runner's own fail count) in the output.
  const failed = (c) => {
    const text = (c.result?.content ?? []).map((part) => part?.text ?? '').join('');
    return c.result?.isError === true || /\[exit code: [1-9]\d*\]/.test(text) || /ℹ fail [1-9]/.test(text);
  };

  return {
    skills: calls.filter((c) => c.name === 'skill').map((c) => c.args.name),
    brainstormedBeforeCode: skillAt('brainstorming') < firstCode,
    questionsBeforeCode: calls.filter((c) => c.name === 'ask_user_question' && c.time < firstCode).length,
    plannedBeforeCode: skillAt('writing-plans') < firstCode,
    testWrittenBeforeSource: firstTest < firstSource,
    // A red run: a test command that failed before any non-test source existed.
    failingRunBeforeSource: testRuns.some((c) => c.time < firstSource && failed(c)),
    testRuns: testRuns.length,
    codeWrites: code.length
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const workspace = argv[argv.indexOf('--workspace') + 1] ?? 'dice-lab';
  const root = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'sessions');
  const logs = [];
  for (const slug of existsSync(root) ? readdirSync(root) : []) {
    if (!slug.toLowerCase().includes(workspace.toLowerCase())) continue;
    for (const id of readdirSync(join(root, slug))) {
      const file = join(root, slug, id, 'session.v4.jsonl.zstd');
      if (existsSync(file)) logs.push({ file, mtime: statSync(file).mtimeMs });
    }
  }
  const main = logs
    .sort((a, b) => b.mtime - a.mtime)
    .map((log) => decodeSessionLog(readFileSync(log.file)))
    .find((events) => events.find((e) => e.type === 'session')?.origin !== 'subagent');
  if (!main) {
    console.error(`No top-level session found for workspace "${workspace}".`);
    process.exit(1);
  }
  console.log(JSON.stringify(scoreBuildPhase(main), null, 2));
}
