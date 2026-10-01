/**
 * Assemble the shipped skills/ tree, in memory, from three inputs:
 *
 *   1. the pinned upstream files (every `skills/**` entry in upstream/pin.json),
 *   2. the DSH overlays: unified-diff patches, plus DSH-only added files.
 *
 * Upstream text is used verbatim. Following upstream's porting guide, skills
 * are never edited to fit the harness; DSH differences live in the tool
 * mapping (`using-superpowers/references/dsh-tools.md`).
 *
 * Pure apart from the injected `read`, so it is unit-testable and the same code
 * serves both `sync` (write the tree) and `sync --check` (compare with disk).
 */

import { applyPatch } from './patch.mjs';

const SKILLS = 'skills/';

/**
 * @param {object} input
 * @param {{ files: Record<string, string> }} input.pin - parsed upstream/pin.json.
 * @param {(path: string) => Promise<Buffer>} input.read - verified upstream reader.
 * @param {Map<string, string>} input.patches - skills-relative path -> patch text.
 * @param {Map<string, Buffer>} input.added - skills-relative path -> DSH-only file.
 * @returns {Promise<Map<string, Buffer>>} skills-relative path -> final contents.
 */
export async function buildSkills({ pin, read, patches, added }) {
  const upstreamPaths = Object.keys(pin.files)
    .filter((path) => path.startsWith(SKILLS))
    .map((path) => path.slice(SKILLS.length));
  const known = new Set(upstreamPaths);

  for (const path of patches.keys()) {
    if (!known.has(path)) {
      throw new Error(`overlay ${path}.patch targets a file that is not in the pinned upstream`);
    }
  }
  for (const path of added.keys()) {
    if (known.has(path)) {
      throw new Error(`added file ${path} shadows an upstream file; use a patch instead`);
    }
  }

  const out = new Map();
  // Collect every stale overlay before failing, so an upstream upgrade reports
  // all the DSH notes that need re-applying at once, not one per attempt.
  const failures = [];
  for (const path of upstreamPaths.sort()) {
    const raw = await read(SKILLS + path);
    let text = raw.toString('utf8');
    const patch = patches.get(path);
    if (patch !== undefined) {
      try {
        text = applyPatch(text, patch);
      } catch (error) {
        failures.push({ path, reason: error.message });
        continue;
      }
    }
    // Byte-exact passthrough when nothing changed, so binary or odd encodings
    // in upstream survive untouched.
    out.set(path, text === raw.toString('utf8') ? raw : Buffer.from(text, 'utf8'));
  }
  if (failures.length > 0) {
    const noun = failures.length === 1 ? 'overlay no longer applies' : 'overlays no longer apply';
    const error = new Error(
      `${failures.length} ${noun}:\n` + failures.map((f) => `  - ${f.path}: ${f.reason}`).join('\n')
    );
    error.failures = failures;
    throw error;
  }
  for (const [path, buffer] of added) out.set(path, buffer);
  return out;
}
