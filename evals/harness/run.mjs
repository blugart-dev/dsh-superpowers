#!/usr/bin/env node
/**
 * Behavioural test harness: run real headless DSH sessions against this bundle.
 *
 *   npm run eval:harness                          every scenario once
 *   npm run eval:harness -- --only gate,control   selected scenarios
 *   npm run eval:harness -- --repeat 3            each scenario three times
 *   npm run eval:harness -- --keep                keep profile, workspaces and sessions
 *
 * What it does, all outside your own profiles:
 *   1. `npm pack` this repository - the exact files a user installs;
 *   2. creates a throwaway headless profile and installs that tarball into it;
 *   3. runs each scenario in a fresh temporary workspace (fixtures written first);
 *   4. scores each run from DSH's own session log (evals/harness/scenarios.mjs);
 *   5. removes the profile, workspaces and their sessions.
 *
 * Costs real model tokens: every scenario is a live session using your DSH
 * credentials. Each run is capped by --timeout (seconds, default 180).
 *
 * Launcher: DSH_SUPERPOWERS_DSH=<path to dsh> overrides discovery. On Windows
 * the Desktop install is found automatically and started directly (no shell),
 * so prompts are never re-quoted.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { npmPack, runDsh } from '../../scripts/lib/dsh.mjs';
import { decodeSessionLog, summarizeSession } from '../../scripts/lib/session.mjs';
import { SCENARIOS } from './scenarios.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const argv = process.argv.slice(2);
const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const only = option('--only')?.split(',');
const repeat = Number(option('--repeat') ?? 1);
const timeoutMs = Number(option('--timeout') ?? 180) * 1000;
const keep = argv.includes('--keep');

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const PROFILE = 'dsh-superpowers-eval';
const WORKSPACE_PREFIX = 'dsh-sp-eval-';

function must(step, result) {
  if (result.status !== 0) {
    console.error(`${step} failed (exit ${result.status}):\n${result.stderr || result.stdout}`);
    process.exit(1);
  }
  return result;
}

/** Every session whose workspace is one of ours, decoded. */
function evalSessions() {
  const sessionsRoot = join(dshHome, 'sessions');
  const found = [];
  for (const slug of existsSync(sessionsRoot) ? readdirSync(sessionsRoot) : []) {
    if (!slug.includes(WORKSPACE_PREFIX)) continue;
    for (const id of readdirSync(join(sessionsRoot, slug))) {
      const file = join(sessionsRoot, slug, id, 'session.v4.jsonl.zstd');
      if (!existsSync(file)) continue;
      const events = decodeSessionLog(readFileSync(file));
      found.push({ dir: join(sessionsRoot, slug), header: events.find((e) => e.type === 'session') ?? {}, events });
    }
  }
  return found;
}

// 1-2. Package and install into a throwaway profile.
const profileDir = join(dshHome, 'profiles', PROFILE);
if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true });
const packDir = mkdtempSync(join(tmpdir(), 'dsh-sp-pack-'));
const packed = npmPack(root, packDir);
if (packed.status !== 0) {
  console.error('npm pack failed:\n' + packed.stderr);
  process.exit(1);
}
const tarball = join(packDir, readdirSync(packDir).find((f) => f.endsWith('.tgz')));
must('create profile', runDsh([PROFILE, '--from-default-profile', 'headless', '--dump-config']));
must('install bundle', runDsh(['plugin', '--profile', PROFILE, 'add', tarball]));
console.log(`Installed ${tarball.split(/[\\/]/).pop()} into profile ${PROFILE}.\n`);

// 3-4. Run and score.
const selected = SCENARIOS.filter((s) => !only || only.includes(s.id));
const results = [];
const workspaces = [];
for (const scenario of selected) {
  for (let round = 1; round <= repeat; round += 1) {
    const workspace = mkdtempSync(join(tmpdir(), `${WORKSPACE_PREFIX}${scenario.id}-`));
    workspaces.push(workspace);
    for (const [path, content] of Object.entries(scenario.files ?? {})) {
      mkdirSync(dirname(join(workspace, path)), { recursive: true });
      writeFileSync(join(workspace, path), content);
    }
    const args = [PROFILE];
    if (scenario.overlay) {
      const overlay = join(workspace, '..', `${workspace.split(/[\\/]/).pop()}.overlay.yml`);
      writeFileSync(overlay, scenario.overlay);
      args.push('--patch', overlay);
    }
    const started = Date.now();
    let run = runDsh([...args, '-'], { cwd: workspace, input: scenario.prompt, timeout: timeoutMs });
    const topLevel = () =>
      evalSessions().find((s) => s.header.cwd === workspace && s.header.origin !== 'subagent');

    // Follow-up turns resume the same session in a fresh process, which is
    // also what exercises state rebuilt from the log (resume).
    for (const followUp of scenario.followUps ?? []) {
      const sessionId = topLevel()?.header.id;
      if (sessionId === undefined) break;
      run = runDsh([...args, '--session-id', sessionId, '-'], { cwd: workspace, input: followUp, timeout: timeoutMs });
    }
    const seconds = Math.round((Date.now() - started) / 1000);

    const sessions = evalSessions();
    const parent = topLevel();
    let outcome;
    if (parent === undefined) {
      outcome = { pass: false, detail: `no session log found (exit ${run.status}${run.timedOut ? ', timed out' : ''})` };
    } else {
      const summary = summarizeSession(parent.events);
      const children = sessions.filter((s) => s.header.parentSession === summary.id).map((s) => summarizeSession(s.events));
      outcome = scenario.check(summary, children);
    }
    results.push({ id: scenario.id, round, seconds, timedOut: run.timedOut, ...outcome });
    console.log(`${outcome.pass ? 'PASS' : 'FAIL'}  ${scenario.id.padEnd(14)} #${round}  ${String(seconds).padStart(4)}s${run.timedOut ? ' (timeout)' : ''}  ${outcome.detail}`);
  }
}

// Summary + report.
console.log('');
for (const scenario of selected) {
  const runs = results.filter((r) => r.id === scenario.id);
  console.log(`${scenario.id.padEnd(14)} ${runs.filter((r) => r.pass).length}/${runs.length}`);
}
const reportDir = join(root, '.cache', 'eval-harness');
mkdirSync(reportDir, { recursive: true });
const report = join(reportDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(report, JSON.stringify({ when: new Date().toISOString(), repeat, results }, null, 2));
console.log(`\nReport: ${report}`);

// 5. Clean up.
if (!keep) {
  for (const session of evalSessions()) rmSync(session.dir, { recursive: true, force: true });
  for (const workspace of workspaces) {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(`${workspace}.overlay.yml`, { force: true });
  }
  rmSync(profileDir, { recursive: true, force: true });
  rmSync(packDir, { recursive: true, force: true });
}
process.exit(results.every((r) => r.pass) ? 0 : 1);
