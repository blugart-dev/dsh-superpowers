#!/usr/bin/env node
/**
 * Show what Superpowers did in a DeepSeek Harness session, from DSH's own log.
 *
 *   npm run inspect-session                    newest session in any workspace
 *   npm run inspect-session -- <id-or-prefix>  a specific session
 *   npm run inspect-session -- --workspace dice-lab   newest session whose workspace matches
 *
 * Reads <dshHome>/sessions (DSH_HOME, else ~/.dsh). Read-only.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { decodeSessionLog, summarizeSession } from './lib/session.mjs';

const args = process.argv.slice(2);
const workspaceIndex = args.indexOf('--workspace');
const workspace = workspaceIndex === -1 ? undefined : args[workspaceIndex + 1];
const wanted = args.find((arg, i) => !arg.startsWith('--') && i !== workspaceIndex + 1);

const sessionsRoot = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'sessions');
if (!existsSync(sessionsRoot)) {
  console.error(`No DSH sessions directory at ${sessionsRoot}`);
  process.exit(1);
}

const logs = [];
for (const slug of readdirSync(sessionsRoot)) {
  if (workspace && !slug.toLowerCase().includes(workspace.toLowerCase())) continue;
  const slugDir = join(sessionsRoot, slug);
  if (!statSync(slugDir).isDirectory()) continue;
  for (const id of readdirSync(slugDir)) {
    const file = join(slugDir, id, 'session.v4.jsonl.zstd');
    if (!existsSync(file)) continue;
    if (wanted && !id.includes(wanted)) continue;
    logs.push({ file, id, mtime: statSync(file).mtimeMs });
  }
}
if (logs.length === 0) {
  console.error('No matching session found.');
  process.exit(1);
}
logs.sort((a, b) => b.mtime - a.mtime);

// Prefer the newest top-level session; subagents are summarized beneath it.
const includeSubagents = args.includes('--subagents');
const decoded = logs.map((log) => ({ ...log, events: decodeSessionLog(readFileSync(log.file)) }));
const header = (entry) => entry.events.find((e) => e.type === 'session') ?? {};
const chosen = decoded.find((entry) => includeSubagents || header(entry).origin !== 'subagent') ?? decoded[0];
const summary = summarizeSession(chosen.events);
const children = decoded
  .filter((entry) => header(entry).parentSession === summary.id)
  .map((entry) => summarizeSession(entry.events));
const clock = (ms) => (ms === undefined ? '-' : new Date(ms).toLocaleTimeString());

console.log(`Session    ${summary.id}${summary.origin ? ` (${summary.origin})` : ''}`);
console.log(`Workspace  ${summary.cwd}`);
console.log(`Started    ${summary.createdAt ? new Date(summary.createdAt).toLocaleString() : '-'}`);
console.log(`Messages   ${summary.userMessages} from the user, ${summary.turns} turns`);
console.log('');
console.log(`Bootstrap  ${summary.bootstrapCount === 1 ? 'present once in the system prompt' : summary.bootstrapCount === 0 ? 'NOT present in the system prompt' : `present ${summary.bootstrapCount} times (duplicated)`}`);
console.log(`Skills     ${summary.skillLoads.length === 0 ? 'none loaded' : `${summary.skillLoads.length} loaded`}`);
for (const load of summary.skillLoads) {
  console.log(`  ${clock(load.time)}  ${load.name}${load.ok === false ? '  (FAILED)' : ''}`);
}
const denied = summary.writes.filter((w) => w.denied);
console.log(`Writes     ${summary.writes.length} write/edit calls${denied.length ? `, ${denied.length} denied by the gate` : ''}`);
if (summary.firstWriteTime !== undefined) {
  const order = summary.firstSkillLoadTime !== undefined && summary.firstSkillLoadTime < summary.firstWriteTime
    ? 'after the first skill load' : 'BEFORE any skill was loaded';
  console.log(`  first write at ${clock(summary.firstWriteTime)}, ${order}`);
}
if (children.length > 0) {
  console.log(`Subagents  ${children.length}`);
  for (const child of children) {
    const loads = child.skillLoads.map((l) => l.name).join(', ') || 'no skills';
    console.log(`  ${clock(child.createdAt)}  ${child.id.slice(0, 8)}  ${loads}; ${child.writes.length} writes`);
  }
}
