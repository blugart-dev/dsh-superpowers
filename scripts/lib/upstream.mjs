/**
 * Upstream access: fetch the pinned obra/superpowers files, verify each against
 * the git blob hash recorded in upstream/pin.json, and apply the one
 * transformation every vendored file receives.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The git blob SHA-1 of a buffer (what `git hash-object` prints).
 *
 * @param {Buffer} buffer - file contents.
 * @returns {string} 40-char hex digest.
 */
export function gitBlobSha(buffer) {
  return createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
}

/**
 * The single permitted transformation of upstream text.
 *
 * Upstream addresses skills as `superpowers:<name>`; DeepSeek Harness resolves
 * skills by bare name, where the prefixed form does not resolve. Only a prefix
 * followed by a kebab-case name is removed; prose such as "superpowers: the
 * plugin" and paths like `docs/superpowers/` are untouched.
 *
 * @param {string} text - upstream file contents.
 * @returns {string} the transformed text.
 */
export function stripSkillPrefix(text) {
  return text.replace(/superpowers:(?=[a-z0-9-])/g, '');
}

/**
 * Read an upstream file, from the local cache or from GitHub, and verify it.
 *
 * @param {object} pin - parsed upstream/pin.json.
 * @param {string} path - repository-relative path, e.g. "skills/brainstorming/SKILL.md".
 * @param {string} cacheRoot - directory for downloaded files.
 * @param {{ offline?: boolean }} [options] - offline: never fetch.
 * @returns {Promise<Buffer>} verified file contents.
 */
export async function readUpstreamFile(pin, path, cacheRoot, { offline = false } = {}) {
  const expected = pin.files[path];
  if (expected === undefined) throw new Error(`upstream: ${path} is not in pin.json`);

  const cached = join(cacheRoot, pin.commit, path);
  if (existsSync(cached)) {
    const buffer = readFileSync(cached);
    if (gitBlobSha(buffer) === expected) return buffer;
  }
  if (offline) throw new Error(`upstream: ${path} is not cached and --offline was given`);

  const url = `https://raw.githubusercontent.com/${pin.repository}/${pin.commit}/${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`upstream: GET ${url} -> HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const actual = gitBlobSha(buffer);
  if (actual !== expected) {
    throw new Error(`upstream: ${path} hash mismatch: pin says ${expected}, GitHub served ${actual}`);
  }
  mkdirSync(dirname(cached), { recursive: true });
  writeFileSync(cached, buffer);
  return buffer;
}
