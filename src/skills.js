/**
 * Superpowers skill provider - a Host plugin for DeepSeek Harness.
 *
 * Serves the skills shipped inside this package (`../skills/<name>/SKILL.md`)
 * through the `ctx.skills` registry, so every session in the profile sees them
 * regardless of workspace, with no user-specific paths in configuration.
 *
 * Implements the registry's provider contract (@deepseek-ai/dsh-skill):
 *   - list() returns summaries read from each skill's frontmatter;
 *   - get()  returns the full body for the winning candidate.
 * Candidates rank at 600, the registry's standard rank for packaged providers,
 * so a same-named skill in a project, custom or user root overrides ours.
 *
 * The shipped files never change while the package is installed, so the
 * provider keeps no watcher and never invalidates.
 *
 * @module @blugart-dev/dsh-superpowers/skills
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Cordis plugin name used by loader diagnostics. */
export const name = 'superpowers-skills';

/** Registry provider name. Must be unique per layer and is not "runtime". */
export const PROVIDER_NAME = 'dsh-superpowers';

/** The registry's standard precedence for packaged skill providers. */
export const PACKAGED_RANK = 600;

/** The skills shipped with this package. */
export const SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url));

const SOURCE = 'bundled';
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_INVOCATION = Object.freeze({ modelInvocable: true, userInvocable: true });

/**
 * Parse a SKILL.md YAML frontmatter block of one-line scalars.
 *
 * Deliberately small: the shipped skills use only `key: value` lines with plain,
 * single-quoted or double-quoted scalars. Anything else is left out rather than
 * guessed at; the tests pin every shipped skill through this parser.
 *
 * @param {string} text - file contents.
 * @returns {{ data: Record<string, string>, body: string } | null} null without a block.
 */
export function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  const end = normalized.indexOf('\n---', 3);
  if (end === -1) return null;
  const data = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    const match = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(line);
    if (match) data[match[1]] = scalar(match[2].trim());
  }
  const afterFence = normalized.indexOf('\n', end + 1);
  const body = afterFence === -1 ? '' : normalized.slice(afterFence + 1);
  return { data, body };
}

/**
 * @param {string} raw - a YAML scalar as written.
 * @returns {string} its string value.
 */
function scalar(raw) {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\(["\\nt])/g, (_, c) => ({ n: '\n', t: '\t' })[c] ?? c);
  }
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  return raw;
}

/**
 * Read one skill directory into a candidate, or explain why it was skipped.
 *
 * @param {string} dir - the skills root.
 * @param {string} directory - one skill's directory name.
 * @returns {Promise<{ candidate?: object, skipped?: string }>}
 */
async function readCandidate(dir, directory) {
  const skillDir = join(dir, directory);
  const path = join(skillDir, 'SKILL.md');
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return { skipped: `${path}: unreadable or missing` };
  }
  const parsed = parseFrontmatter(text);
  if (parsed === null) return { skipped: `${path}: missing YAML frontmatter` };
  const { name: skillName, description, whenToUse } = parsed.data;
  if (!skillName || !description) return { skipped: `${path}: frontmatter requires name and description` };
  if (!SKILL_NAME.test(skillName)) return { skipped: `${path}: invalid skill name "${skillName}"` };
  if (skillName !== directory) {
    return { skipped: `${path}: frontmatter name "${skillName}" does not match directory "${directory}"` };
  }
  return {
    candidate: {
      name: skillName,
      description,
      ...(whenToUse ? { whenToUse } : {}),
      invocation: DEFAULT_INVOCATION,
      provider: PROVIDER_NAME,
      source: SOURCE,
      rank: PACKAGED_RANK,
      path,
      resourceBase: { kind: 'directory', path: skillDir },
      locator: { path, directory: skillDir }
    }
  };
}

/**
 * Create the registry provider for a skills directory.
 *
 * @param {{ dir: string, warn?: (message: string) => void }} options
 * @returns {{ name: string, list: Function, get: Function }} the provider.
 */
export function createProvider({ dir, warn = () => {} }) {
  return {
    name: PROVIDER_NAME,

    async list() {
      const entries = await readdir(dir, { withFileTypes: true });
      const candidates = [];
      for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const { candidate, skipped } = await readCandidate(dir, entry.name);
        if (candidate) candidates.push(candidate);
        else warn(`dsh-superpowers: skill skipped: ${skipped}`);
      }
      return candidates;
    },

    async get(candidate, options = {}) {
      options.signal?.throwIfAborted?.();
      let text;
      try {
        text = await readFile(candidate.locator.path, 'utf8');
      } catch {
        return undefined;
      }
      const parsed = parseFrontmatter(text);
      if (parsed === null) return undefined;
      return {
        name: parsed.data.name,
        description: parsed.data.description,
        ...(parsed.data.whenToUse ? { whenToUse: parsed.data.whenToUse } : {}),
        invocation: DEFAULT_INVOCATION,
        source: candidate.source,
        provider: PROVIDER_NAME,
        path: candidate.locator.path,
        resourceBase: { kind: 'directory', path: candidate.locator.directory },
        content: parsed.body.trim()
      };
    }
  };
}

/**
 * Register the provider. The registry files it into this plugin's layer and
 * removes it when the plugin is disposed.
 *
 * @param {object} ctx - the plugin context.
 */
function run(ctx) {
  ctx.skills.registerProvider(() =>
    createProvider({ dir: SKILLS_DIR, warn: (message) => ctx.logger?.warn?.(message) })
  );
}

/**
 * The applier in the shape the installed Host accepts: a function carrying
 * `inject`. `skills` is required: without a registry there is nothing to serve.
 */
const apply = Object.assign(run, { inject: ['skills'] });

export default apply;
