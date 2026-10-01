#!/usr/bin/env node
/**
 * Regenerate overlays/ from the current skills/ tree.
 *
 * Workflow for changing a DSH adaptation:
 *   1. edit the file under skills/
 *   2. npm run overlays      (this script: records the edit as a patch)
 *   3. npm run sync:check    (proves skills/ rebuilds identically from pin + overlays)
 *
 * For every pinned upstream file, the difference between the upstream text and
 * skills/ becomes overlays/patches/<path>.patch; a file that
 * matches upstream gets no patch. Files with no upstream counterpart are copied
 * to overlays/added/. Stale overlays are removed.
 *
 * Maintainer tool: it shells out to `git diff --no-index` to produce standard
 * unified diffs, so it needs git and does not run inside DSH's sandbox (which
 * cannot open pipes to child processes). Building and checking need neither.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listFiles } from './lib/files.mjs';
import { readUpstreamFile } from './lib/upstream.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const pin = JSON.parse(readFileSync(join(root, 'upstream/pin.json'), 'utf8'));
const cacheRoot = join(root, '.cache/upstream');
const skillsDir = join(root, 'skills');
const patchDir = join(root, 'overlays/patches');
const addedDir = join(root, 'overlays/added');

const work = mkdtempSync(join(tmpdir(), 'dsh-superpowers-overlays-'));
rmSync(patchDir, { recursive: true, force: true });
rmSync(addedDir, { recursive: true, force: true });

let patched = 0;
let addedCount = 0;
try {
  for (const path of listFiles(skillsDir)) {
    const current = readFileSync(join(skillsDir, path));
    const upstreamPath = 'skills/' + path;
    if (pin.files[upstreamPath] === undefined) {
      const target = join(addedDir, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, current);
      addedCount += 1;
      continue;
    }
    const raw = await readUpstreamFile(pin, upstreamPath, cacheRoot);
    const base = raw.toString('utf8');
    if (base === current.toString('utf8')) continue;

    const a = join(work, 'a', 'skills', path);
    const b = join(work, 'b', 'skills', path);
    mkdirSync(dirname(a), { recursive: true });
    mkdirSync(dirname(b), { recursive: true });
    writeFileSync(a, base);
    writeFileSync(b, current);
    const diff = spawnSync(
      'git',
      ['-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-color', '--no-prefix', '-U3',
        `a/skills/${path}`, `b/skills/${path}`],
      { cwd: work, encoding: 'utf8' }
    );
    if (diff.status !== 1) {
      throw new Error(`git diff for ${path} exited ${diff.status}: ${diff.stderr || diff.error}`);
    }
    const target = join(patchDir, path + '.patch');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, diff.stdout);
    patched += 1;
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(`overlays/: ${patched} patches, ${addedCount} added files. Now run \`npm run sync:check\`.`);
