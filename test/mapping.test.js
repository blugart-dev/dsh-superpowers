/**
 * Contract checks on the DSH tool mapping (dsh-tools.md), for advice that was
 * wrong in a field test. Each test names the failure it pins.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const mapping = readFileSync(new URL('../skills/using-superpowers/references/dsh-tools.md', import.meta.url), 'utf8');

test('Windows bash is Git for Windows\' bin\\bash.exe wrapper, not the bare usr\\bin\\bash.exe', () => {
  // usr\bin\bash.exe started from pwsh has no /usr/bin on PATH, so the SDD
  // scripts die with "basename: command not found" (exit 127). The bin\ wrapper
  // sets PATH up and runs them.
  const snippet = mapping.match(/^\$bash = .*$/m)?.[0];
  assert.ok(snippet, 'the mapping shows how to find bash');
  assert.match(snippet, /'bin\\bash\.exe'\s*$/);
  // `Get-Command git` can be Git\cmd\git.exe or Git\mingw64\bin\git.exe; only
  // `git --exec-path` (<root>/mingw64/libexec/git-core) locates the root either way.
  assert.match(snippet, /git --exec-path/);
});

test('inside the DSH sandbox, Git Bash cannot start: say so and give the fallback', () => {
  // Headless workspace-write: msys bash dies with "NtCreateDirectoryObject ...
  // 0xC0000022"; one agent spent eight commands, including an escalation, first.
  assert.match(mapping, /0xC0000022/);
  assert.match(mapping, /do the script's work (directly|in PowerShell)/i);
});

test('subagent model naming is conditional on model selection being enabled', () => {
  // DSH's subagent tool exposes provider/model only when the Host's subagent
  // model selection setting is on (off by default); otherwise children inherit.
  assert.doesNotMatch(mapping, /Name the model on every dispatch/);
  assert.match(mapping, /list_subagent_models/);
  assert.match(mapping, /off by default/);
});

test('concurrent dispatch excludes implementers writing the same checkout', () => {
  // A fix-round implementer and the next task's implementer ran at once in one
  // checkout while one of them restored files with `git checkout --`.
  assert.match(mapping, /one\s+implementer\s+at\s+a\s+time/i);
});
