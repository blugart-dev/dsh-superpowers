/**
 * Read a `dsh --dump-config` composition and check this bundle's rows.
 */

const EXPECTED = [
  { id: 'dsh-superpowers-skills', module: 'dsh-superpowers/src/skills.js', disabled: false },
  { id: 'dsh-superpowers-bootstrap', module: 'dsh-superpowers/src/bootstrap.js', disabled: false },
  { id: 'dsh-superpowers-gate', module: 'dsh-superpowers/src/gate/index.js', disabled: true }
];

/**
 * Split a dumped entry list into rows: each starts at "- id: <id>" in column 0
 * and runs until the next one (or a "# ==" bundle comment).
 *
 * @param {string} dump - `--dump-config` output.
 * @returns {Map<string, string>} row id -> the row's text.
 */
function rowsOf(dump) {
  const rows = new Map();
  let id;
  let lines = [];
  const flush = () => {
    if (id !== undefined) rows.set(id, lines.join('\n'));
  };
  for (const line of dump.split(/\r?\n/)) {
    const start = /^- id:\s*(\S+)/.exec(line);
    if (start || line.startsWith('# ==')) {
      flush();
      id = start ? start[1] : undefined;
      lines = [];
    }
    if (id !== undefined) lines.push(line);
  }
  flush();
  return rows;
}

/**
 * @param {string} dump - `--dump-config` output for a profile with the bundle installed.
 * @returns {string[]} problems; empty when the bundle composed as shipped.
 */
export function checkComposition(dump) {
  const rows = rowsOf(dump);
  const problems = [];
  for (const expected of EXPECTED) {
    const row = rows.get(expected.id);
    if (row === undefined) {
      problems.push(`${expected.id}: missing from the composed profile (not installed, or denied)`);
      continue;
    }
    if (!row.replace(/\\/g, '/').includes(expected.module)) {
      problems.push(`${expected.id}: resolves outside the installed package`);
    }
    const disabled = /^\s{2}disabled:\s*true\s*$/m.test(row);
    if (disabled !== expected.disabled) {
      problems.push(`${expected.id}: expected ${expected.disabled ? 'disabled' : 'enabled'}, composed ${disabled ? 'disabled' : 'enabled'}`);
    }
  }
  return problems;
}
