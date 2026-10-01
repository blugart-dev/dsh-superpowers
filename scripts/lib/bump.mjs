/**
 * Pure helpers for moving the upstream pin.
 */

/**
 * Build upstream/pin.json from a GitHub recursive tree listing.
 *
 * @param {{ truncated: boolean, tree: Array<{ path: string, type: string, sha: string }> }} tree
 * @param {{ repository: string, commit: string, version: string }} meta
 * @returns {object} the pin.
 */
export function pinFromTree(tree, { repository, commit, version }) {
  if (tree.truncated) throw new Error('GitHub returned a truncated tree; refusing to write a partial pin');
  const files = {};
  const wanted = tree.tree
    .filter((entry) => entry.type === 'blob' && (entry.path === 'LICENSE' || entry.path.startsWith('skills/')))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const entry of wanted) files[entry.path] = entry.sha;
  return { repository, version, commit, license: 'MIT', files };
}

/**
 * Compare two dotted versions, ignoring a leading "v".
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} negative when a < b, 0 when equal, positive when a > b.
 */
export function compareVersions(a, b) {
  const parts = (v) => v.replace(/^v/, '').split(/[.-]/).map((p) => Number.parseInt(p, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
