#!/usr/bin/env node
/**
 * Compatibility check against an installed DSH: does this bundle still compose?
 *
 *   npm run compat
 *
 * Needs no model credentials and touches none of your profiles. In an isolated
 * temporary DSH home it creates a headless profile, installs the packed bundle
 * (exactly what users get), dumps the composed profile and checks that the
 * three rows are present, resolve into the package, and have their shipped
 * enabled/disabled state. A row DSH denies (for example over a peer-range
 * mismatch) shows up as missing.
 */

import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkComposition } from './lib/compat.mjs';
import { npmPack, runDsh } from './lib/dsh.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const home = mkdtempSync(join(tmpdir(), 'dsh-sp-compat-home-'));
const pack = mkdtempSync(join(tmpdir(), 'dsh-sp-compat-pack-'));
const env = { DSH_HOME: home };
const PROFILE = 'compat';

function step(name, result) {
  if (result.status !== 0) {
    console.error(`${name} failed (exit ${result.status}):\n${result.stderr || result.stdout}`);
    cleanup();
    process.exit(1);
  }
  return result;
}
function cleanup() {
  rmSync(home, { recursive: true, force: true });
  rmSync(pack, { recursive: true, force: true });
}

const version = runDsh(['--version'], { env }).stdout.trim();
const packed = npmPack(root, pack);
if (packed.status !== 0) {
  console.error('npm pack failed:\n' + packed.stderr);
  cleanup();
  process.exit(1);
}
const tarball = join(pack, readdirSync(pack).find((f) => f.endsWith('.tgz')));

step('create profile', runDsh([PROFILE, '--from-default-profile', 'headless', '--dump-config'], { env }));
step('install bundle', runDsh(['plugin', '--profile', PROFILE, 'add', tarball], { env }));
const dump = step('dump composition', runDsh(['--profile', PROFILE, '--dump-config'], { env })).stdout;

const problems = checkComposition(dump);
cleanup();
if (problems.length > 0) {
  console.error(`DSH ${version}: dsh-superpowers does NOT compose as shipped:`);
  for (const problem of problems) console.error('  - ' + problem);
  process.exit(1);
}
console.log(`DSH ${version}: dsh-superpowers composes as shipped (skills on, bootstrap on, gate off).`);
