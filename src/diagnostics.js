/**
 * Opt-in activation diagnostics shared by the plugins in this bundle.
 *
 * The Host's console is not visible from a session, so verifying that a plugin
 * activated (and what it decided) needs a side channel. Setting a row's
 * `diagnosticsLog` to an absolute path appends one line per decision there. Each
 * line names the executable that wrote it, so a unit-test run (node) can never
 * be mistaken for a Host activation (DeepSeek Harness).
 *
 * Off by default. Writing never throws.
 */

import { appendFileSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * @param {string | undefined} logPath - absolute path, or undefined for no file.
 * @param {{ info?: Function } | undefined} logger - the plugin context's logger.
 * @returns {(message: string) => void} a recorder for one plugin.
 */
export function createDiagnostics(logPath, logger) {
  return (message) => {
    try {
      logger?.info?.(message);
    } catch {
      /* never break activation */
    }
    if (typeof logPath !== 'string' || logPath.length === 0) return;
    try {
      const writer = basename(process.execPath);
      appendFileSync(logPath, `${new Date().toISOString()} [${writer} pid ${process.pid}] ${message}\n`);
    } catch {
      /* never break activation */
    }
  };
}
