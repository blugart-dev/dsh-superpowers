/**
 * Start the DSH CLI from scripts, without shell quoting where possible.
 *
 * Resolution order:
 *   1. DSH_SUPERPOWERS_DSH - an explicit path or command (e.g. `dsh` from npm);
 *   2. Windows Desktop install - its executable run as Node on the CLI entry;
 *   3. `dsh` on PATH.
 *
 * Callers pass prompts on stdin (`-`), never as arguments, so the shell needed
 * for a Windows `.cmd` shim only ever sees simple arguments.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Join arguments into one command line, double-quoting any with spaces or quotes.
 *
 * @param {string[]} parts - command and arguments.
 * @returns {string}
 */
export function commandLine(parts) {
  return parts.map((part) => (/[\s"]/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part)).join(' ');
}

/**
 * Run `npm pack` for a package directory into a destination directory.
 *
 * @param {string} cwd - the package root.
 * @param {string} destination - where the tarball goes.
 * @returns {{ status: number | null, stderr: string }}
 */
export function npmPack(cwd, destination) {
  const line = commandLine(['npm', 'pack', '--silent', '--pack-destination', destination]);
  const result = spawnSync(line, { cwd, encoding: 'utf8', shell: true });
  return { status: result.status, stderr: result.stderr ?? '' };
}

/** @returns {{ command: string, prefix: string[], env: Record<string, string>, shell: boolean }} */
export function launcher() {
  const explicit = process.env.DSH_SUPERPOWERS_DSH;
  if (explicit) {
    return { command: explicit, prefix: [], env: {}, shell: process.platform === 'win32' && !/\.exe$/i.test(explicit) };
  }
  const install = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DeepSeek Harness');
  const exe = join(install, 'DeepSeek Harness.exe');
  const cli = join(install, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js');
  if (process.platform === 'win32' && existsSync(exe)) {
    return { command: exe, prefix: ['--expose-internals', cli], env: { ELECTRON_RUN_AS_NODE: '1' }, shell: false };
  }
  return { command: 'dsh', prefix: [], env: {}, shell: process.platform === 'win32' };
}

/**
 * Run the DSH CLI.
 *
 * @param {string[]} args - CLI arguments (no prompts; pass those as `input`).
 * @param {{ cwd?: string, input?: string, timeout?: number, env?: Record<string, string> }} [options]
 * @returns {{ status: number | null, stdout: string, stderr: string, timedOut: boolean }}
 */
export function runDsh(args, { cwd, input, timeout = 300_000, env = {} } = {}) {
  const dsh = launcher();
  const options = {
    cwd,
    input,
    timeout,
    encoding: 'utf8',
    env: { ...process.env, ...dsh.env, ...env },
    maxBuffer: 64 * 1024 * 1024
  };
  // A shell (only for a Windows .cmd shim) gets one pre-quoted command line;
  // passing an argument array with `shell: true` is deprecated (DEP0190).
  const result = dsh.shell
    ? spawnSync(commandLine([dsh.command, ...dsh.prefix, ...args]), { ...options, shell: true })
    : spawnSync(dsh.command, [...dsh.prefix, ...args], options);
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: result.error?.code === 'ETIMEDOUT'
  };
}
