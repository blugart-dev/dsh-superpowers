#!/usr/bin/env node
/**
 * Move the upstream pin to another obra/superpowers release.
 *
 *   node scripts/bump-upstream.mjs --check      is a newer release out? (exit 0 either way)
 *   node scripts/bump-upstream.mjs --latest     pin the latest release
 *   node scripts/bump-upstream.mjs v6.5.0       pin a specific tag, branch or commit
 *
 * Writes upstream/pin.json only. Then run `npm run sync`: it fetches and verifies
 * every file and re-applies the DSH overlays, failing loudly on any overlay that
 * no longer fits. Set GITHUB_TOKEN to avoid API rate limits.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareVersions, pinFromTree } from './lib/bump.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const pinPath = join(root, 'upstream/pin.json');
const current = JSON.parse(readFileSync(pinPath, 'utf8'));
const repo = current.repository;

async function api(path) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-superpowers-bump' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`GET ${path} -> HTTP ${response.status}`);
  return response.json();
}

const args = process.argv.slice(2);
const latest = (await api(`/repos/${repo}/releases/latest`)).tag_name;

if (args.includes('--check')) {
  const newer = compareVersions(latest, current.version) > 0;
  console.log(newer ? `newer: ${latest} (pinned ${current.version})` : `up to date: ${current.version}`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `newer=${newer}\ntag=${latest}\n`, { flag: 'a' });
  process.exit(0);
}

const ref = args.includes('--latest') ? latest : args.find((a) => !a.startsWith('--'));
if (!ref) {
  console.error('usage: bump-upstream.mjs --check | --latest | <tag|branch|commit>');
  process.exit(2);
}

const commit = (await api(`/repos/${repo}/commits/${encodeURIComponent(ref)}`)).sha;
const manifest = await fetch(`https://raw.githubusercontent.com/${repo}/${commit}/package.json`).then((r) => r.json());
const tree = await api(`/repos/${repo}/git/trees/${commit}?recursive=1`);
const pin = pinFromTree(tree, { repository: repo, commit, version: manifest.version });

const added = Object.keys(pin.files).filter((p) => !(p in current.files));
const removed = Object.keys(current.files).filter((p) => !(p in pin.files));
const changed = Object.keys(pin.files).filter((p) => p in current.files && current.files[p] !== pin.files[p]);

writeFileSync(pinPath, JSON.stringify(pin, null, 2) + '\n');
console.log(`Pinned ${repo}@${commit.slice(0, 7)} (v${pin.version}), was v${current.version}.`);
console.log(`  ${changed.length} changed, ${added.length} added, ${removed.length} removed upstream files`);
for (const p of [...added.map((x) => `+ ${x}`), ...removed.map((x) => `- ${x}`)]) console.log('  ' + p);
console.log('Next: npm run sync, then read upstream release notes against the DSH notes (CONTRIBUTING.md).');
