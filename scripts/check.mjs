#!/usr/bin/env node
/**
 * Bundle contract checks: the things that, if wrong, break a user's install or
 * profile boot rather than a unit test.
 *
 *   node scripts/check.mjs     exit 1 and list every problem found
 *
 * Checks:
 *   - package.json declares the bundle patch, and every `files`/`exports`/icon
 *     target exists;
 *   - the icon is an accepted type and under the Plugins page's 256 KiB limit;
 *   - locale/en.json carries display metadata;
 *   - every patch row has a unique id and a relative module path that exists
 *     and exports a Host applier (a function carrying an `inject` array);
 *   - every shipped skill directory parses, with a frontmatter name matching it;
 *   - LICENSE.superpowers is byte-identical to upstream's LICENSE at the pin.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { gitBlobSha } from './lib/upstream.mjs';

/**
 * Read the inserted rows of a bundle patch. Only the subset of YAML this
 * bundle's patch uses is understood: `- id:` items with `name:` and `disabled:`
 * at the row's own indentation. Keys nested deeper (inside `config`) are ignored.
 *
 * @param {string} text - cordis.patch.yml contents.
 * @returns {Array<{ id: string, name: string | undefined, disabled: boolean }>}
 */
export function patchRows(text) {
  const rows = [];
  let current;
  let rowIndent = -1;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || line.trim() === '') continue;
    const item = /^(\s*)- id:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line);
    if (item) {
      current = { id: item[2], name: undefined, disabled: false };
      rows.push(current);
      rowIndent = item[1].length + 2;
      continue;
    }
    if (current === undefined) continue;
    const key = /^(\s*)(name|disabled):\s*['"]?([^'"]*?)['"]?\s*$/.exec(line);
    if (key && key[1].length === rowIndent) {
      if (key[2] === 'name') current.name = key[3];
      else current.disabled = key[3] === 'true';
    }
  }
  return rows;
}

/**
 * @param {string} root - the package directory.
 * @returns {Promise<string[]>} problems; empty when the bundle is sound.
 */
export async function runChecks(root) {
  const problems = [];
  const at = (path) => join(root, path);

  // package.json
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(at('package.json'), 'utf8'));
  } catch (error) {
    return [`package.json unreadable: ${error.message}`];
  }
  const patchFile = pkg.dsh?.bundle?.patch;
  if (typeof patchFile !== 'string') problems.push('package.json: dsh.bundle.patch is not declared');
  else if (!existsSync(at(patchFile))) problems.push(`package.json: dsh.bundle.patch ${patchFile} does not exist`);
  for (const entry of pkg.files ?? []) {
    if (!existsSync(at(entry))) problems.push(`package.json: files entry ${entry} does not exist`);
  }
  for (const [key, target] of Object.entries(pkg.exports ?? {})) {
    if (!target.includes('*') && !existsSync(at(target))) problems.push(`package.json: export ${key} -> ${target} does not exist`);
  }

  // icon + display metadata
  if (typeof pkg.icon === 'string') {
    if (!/\.(svg|png|jpe?g|webp)$/i.test(pkg.icon)) problems.push(`icon ${pkg.icon}: unsupported type`);
    else if (!existsSync(at(pkg.icon))) problems.push(`icon ${pkg.icon} does not exist`);
    else if (statSync(at(pkg.icon)).size > 256 * 1024) problems.push(`icon ${pkg.icon} exceeds 256 KiB`);
  }
  try {
    const meta = JSON.parse(readFileSync(at('locale/en.json'), 'utf8')).meta;
    if (!meta?.title || !meta?.description) problems.push('locale/en.json: meta.title and meta.description are required');
  } catch (error) {
    problems.push(`locale/en.json unreadable: ${error.message}`);
  }

  // patch rows
  if (typeof patchFile === 'string' && existsSync(at(patchFile))) {
    const rows = patchRows(readFileSync(at(patchFile), 'utf8'));
    if (rows.length === 0) problems.push(`${patchFile}: no rows found`);
    const seen = new Set();
    for (const row of rows) {
      if (seen.has(row.id)) problems.push(`${patchFile}: duplicate row id ${row.id}`);
      seen.add(row.id);
      if (!row.name?.startsWith('./')) {
        problems.push(`${patchFile}: row ${row.id} name must be a ./relative module path, got ${row.name}`);
        continue;
      }
      const modulePath = resolve(root, row.name);
      if (!existsSync(modulePath)) {
        problems.push(`${patchFile}: row ${row.id} module ${row.name} does not exist`);
        continue;
      }
      try {
        const mod = await import(pathToFileURL(modulePath).href);
        if (typeof mod.default !== 'function' || !Array.isArray(mod.default.inject)) {
          problems.push(`${patchFile}: row ${row.id} module ${row.name} must default-export an applier with an inject array`);
        }
      } catch (error) {
        problems.push(`${patchFile}: row ${row.id} module ${row.name} fails to import: ${error.message}`);
      }
    }
  }

  // skills
  const skillsDir = at('skills');
  if (!existsSync(skillsDir)) problems.push('skills/ does not exist; run `npm run sync`');
  else {
    const { createProvider } = await import(pathToFileURL(at('src/skills.js')).href);
    const warnings = [];
    const listed = await createProvider({ dir: skillsDir, warn: (m) => warnings.push(m) }).list();
    const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    for (const warning of warnings) problems.push(warning);
    if (listed.length !== dirs.length) problems.push(`skills/: ${dirs.length} directories but ${listed.length} valid skills`);
  }

  // upstream license
  try {
    const pin = JSON.parse(readFileSync(at('upstream/pin.json'), 'utf8'));
    const license = readFileSync(at('LICENSE.superpowers'));
    if (gitBlobSha(license) !== pin.files.LICENSE) problems.push('LICENSE.superpowers differs from upstream LICENSE at the pin');
  } catch (error) {
    problems.push(`upstream license check failed: ${error.message}`);
  }

  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const problems = await runChecks(root);
  if (problems.length > 0) {
    console.error(`Bundle contract: ${problems.length} problem(s):`);
    for (const problem of problems) console.error('  - ' + problem);
    process.exit(1);
  }
  console.log('Bundle contract: OK');
}
