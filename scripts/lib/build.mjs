/**
 * Assemble the shipped skills/ tree, in memory, from three inputs:
 *
 *   1. the pinned upstream files (every `skills/**` entry in upstream/pin.json),
 *   2. the one permitted transformation (`stripSkillPrefix`),
 *   3. the DSH overlays: unified-diff patches, plus DSH-only added files.
 *
 * Pure apart from the injected `read`, so it is unit-testable and the same code
 * serves both `sync` (write the tree) and `sync --check` (compare with disk).
 */

import { applyPatch } from './patch.mjs';
import { stripSkillPrefix } from './upstream.mjs';

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
  for (const path of upstreamPaths.sort()) {
    const raw = await read(SKILLS + path);
    let text = stripSkillPrefix(raw.toString('utf8'));
    const patch = patches.get(path);
    if (patch !== undefined) {
      try {
        text = applyPatch(text, patch);
      } catch (error) {
        throw new Error(`overlay for ${path} no longer applies: ${error.message}`);
      }
    }
    // Byte-exact passthrough when nothing changed, so binary or odd encodings
    // in upstream survive untouched.
    out.set(path, text === raw.toString('utf8') ? raw : Buffer.from(text, 'utf8'));
  }
  for (const [path, buffer] of added) out.set(path, buffer);
  return out;
}
