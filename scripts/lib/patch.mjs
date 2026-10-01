/**
 * A strict unified-diff applier for overlay patches.
 *
 * Overlays are the DSH adaptations layered on top of the pinned upstream skills.
 * They are generated with `git diff --no-index` and applied here, in-process, so
 * building `skills/` needs neither git nor a child process (DSH's sandbox cannot
 * open pipes to children).
 *
 * Strict on purpose: there is no fuzz and no offset search. If upstream changed
 * the lines a hunk touches, applying fails and names the hunk, so an upgrade can
 * never silently drop or misplace an adaptation.
 */

/**
 * @param {string} text - file contents.
 * @returns {{ lines: string[], eofNewline: boolean }} lines without terminators.
 */
function splitLines(text) {
  if (text === '') return { lines: [], eofNewline: false };
  const lines = text.split('\n');
  const eofNewline = lines[lines.length - 1] === '';
  if (eofNewline) lines.pop();
  return { lines, eofNewline };
}

/**
 * Parse the hunks of a single-file unified diff.
 *
 * @param {string} patch - the patch text.
 * @returns {Array<{ oldStart: number, oldCount: number, body: Array<{ op: string, text: string, noEol: boolean }> }>}
 */
function parseHunks(patch) {
  const hunks = [];
  let current;
  for (const line of patch.split('\n')) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header) {
      current = {
        oldStart: Number(header[1]),
        oldCount: header[2] === undefined ? 1 : Number(header[2]),
        body: []
      };
      hunks.push(current);
      continue;
    }
    if (current === undefined) continue; // file header lines
    if (line.startsWith('\\')) {
      const last = current.body[current.body.length - 1];
      if (last === undefined) throw new Error('patch: "No newline" marker with no preceding line');
      last.noEol = true;
      continue;
    }
    const op = line[0];
    if (op === ' ' || op === '-' || op === '+') {
      current.body.push({ op, text: line.slice(1), noEol: false });
    } else if (line === '') {
      // Trailing blank line at the end of the patch text, not part of a hunk.
      continue;
    } else {
      throw new Error(`patch: unexpected line in hunk ${hunks.length}: ${JSON.stringify(line)}`);
    }
  }
  return hunks;
}

/**
 * Apply a single-file unified diff to `original`.
 *
 * @param {string} original - the file the patch was generated against.
 * @param {string} patch - unified diff text for that one file.
 * @returns {string} the patched file.
 * @throws {Error} when any hunk does not match exactly.
 */
export function applyPatch(original, patch) {
  const hunks = parseHunks(patch);
  if (hunks.length === 0) throw new Error('patch: no hunks found');

  const { lines, eofNewline } = splitLines(original);
  const result = [...lines];
  let resultEofNewline = eofNewline;
  let delta = 0;

  hunks.forEach((hunk, index) => {
    const number = index + 1;
    const oldLines = hunk.body.filter((entry) => entry.op !== '+');
    const newLines = hunk.body.filter((entry) => entry.op !== '-');
    // For an empty old range, unified diff names the line *after which* to insert.
    const start = (hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1) + delta;

    if (oldLines.length !== hunk.oldCount) {
      throw new Error(`patch: hunk ${number} declares ${hunk.oldCount} old lines but contains ${oldLines.length}`);
    }
    if (start < 0 || start + oldLines.length > result.length) {
      throw new Error(`patch: hunk ${number} (line ${hunk.oldStart}) is out of range for a ${result.length}-line file`);
    }
    oldLines.forEach((entry, offset) => {
      const actual = result[start + offset];
      if (actual !== entry.text) {
        throw new Error(
          `patch: hunk ${number} does not match at line ${hunk.oldStart + offset}: ` +
            `expected ${JSON.stringify(entry.text)}, found ${JSON.stringify(actual)}`
        );
      }
    });

    const oldNoEol = oldLines.some((entry) => entry.noEol);
    const newNoEol = newLines.some((entry) => entry.noEol);
    if (oldNoEol && eofNewline) {
      throw new Error(`patch: hunk ${number} expects no newline at end of file, but the file has one`);
    }
    if (newNoEol) resultEofNewline = false;
    else if (oldNoEol) resultEofNewline = true;

    result.splice(start, oldLines.length, ...newLines.map((entry) => entry.text));
    delta += newLines.length - oldLines.length;
  });

  return result.join('\n') + (resultEofNewline && result.length > 0 ? '\n' : '');
}
