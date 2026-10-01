import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * List files under a directory, recursively, as forward-slash relative paths,
 * sorted. A missing directory is an empty list.
 *
 * @param {string} dir - directory to walk.
 * @returns {string[]} relative paths.
 */
export function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (current, prefix) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(current, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(dir, '');
  return out.sort();
}
