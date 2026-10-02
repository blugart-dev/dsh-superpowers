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

test('spawn EPERM from a test runner: run it in-process before asking for full access', () => {
  // Default-mode desktop field test: the agent named the cause of `spawn EPERM`,
  // used --test-isolation=none for one file, then asked for danger-full-access
  // for every full-suite run instead.
  assert.match(mapping, /spawn EPERM/);
  assert.match(mapping, /--test-isolation=none/);
  assert.match(mapping, /--experimental-test-isolation=none/);
  assert.match(mapping, /before asking for (full|wider) access/i);
});

test('typed subagents: DSH has no agent type, so the role goes into the prompt', () => {
  // Skills dispatch "Subagent (general-purpose):" and a code-reviewer; DSH's
  // subagent tool rejects `agentType` as an unsupported Claude Code option.
  // Upstream's porting guide asks the mapping to say how a type is passed.
  assert.match(mapping, /no (subagent|agent) types?/i);
  assert.match(mapping, /general-purpose/);
});

test('todo_write replaces the whole list on every call', () => {
  // DSH: "The model resends the entire list". Sending only the changed items
  // drops the rest.
  assert.match(mapping, /todo_write[^\n]*(entire|whole) list/i);
});

test('interrupt_agent stops a running subagent', () => {
  assert.match(mapping, /interrupt_agent/);
});
