#!/usr/bin/env node
/**
 * Build skills/ from the pinned upstream plus the DSH overlays.
 *
 *   node scripts/sync.mjs            rebuild skills/ (fetches upstream on first run)
 *   node scripts/sync.mjs --check    exit 1 if skills/ differs from what would be built
 *   node scripts/sync.mjs --offline  use only .cache/upstream, never the network
 *
 * skills/ is generated. Never edit it by hand without running
 * `npm run overlays` afterwards, or the next sync will undo the edit.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSkills } from './lib/build.mjs';
import { readUpstreamFile } from './lib/upstream.mjs';
import { listFiles } from './lib/files.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const check = args.has('--check');
const offline = args.has('--offline');

const pin = JSON.parse(readFileSync(join(root, 'upstream/pin.json'), 'utf8'));
const cacheRoot = join(root, '.cache/upstream');

const patchDir = join(root, 'overlays/patches');
const addedDir = join(root, 'overlays/added');
const patches = new Map(
  listFiles(patchDir)
    .filter((path) => path.endsWith('.patch'))
    .map((path) => [path.slice(0, -'.patch'.length), readFileSync(join(patchDir, path), 'utf8')])
);
const added = new Map(listFiles(addedDir).map((path) => [path, readFileSync(join(addedDir, path))]));

const built = await buildSkills({
  pin,
  read: (path) => readUpstreamFile(pin, path, cacheRoot, { offline }),
  patches,
  added
});

const skillsDir = join(root, 'skills');

if (check) {
  const onDisk = new Set(listFiles(skillsDir));
  const problems = [];
  for (const [path, buffer] of built) {
    if (!onDisk.has(path)) problems.push(`missing:   skills/${path}`);
    else if (!readFileSync(join(skillsDir, path)).equals(buffer)) problems.push(`differs:   skills/${path}`);
    onDisk.delete(path);
  }
  for (const path of onDisk) problems.push(`unexpected: skills/${path}`);
  if (problems.length > 0) {
    console.error(`skills/ is out of sync with upstream/pin.json + overlays/ (${problems.length}):`);
    for (const line of problems) console.error('  ' + line);
    console.error('Run `npm run sync` to rebuild, or `npm run overlays` if you meant to edit skills/.');
    process.exit(1);
  }
  console.log(`skills/ is in sync: ${built.size} files from ${pin.repository}@${pin.commit.slice(0, 7)} (v${pin.version}), ${patches.size} patches, ${added.size} added.`);
} else {
  if (existsSync(skillsDir)) rmSync(skillsDir, { recursive: true });
  for (const [path, buffer] of built) {
    const target = join(skillsDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buffer);
  }
  console.log(`Built skills/: ${built.size} files from ${pin.repository}@${pin.commit.slice(0, 7)} (v${pin.version}), ${patches.size} patches, ${added.size} added.`);
}
