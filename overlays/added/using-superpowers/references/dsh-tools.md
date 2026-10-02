# DeepSeek Harness tool mapping

Skills describe actions. On DeepSeek Harness (DSH) they map to these tools.

| Action | DSH |
|---|---|
| Invoke a skill | `skill` with `{"name": "<name>"}`. A skill written as `superpowers:<name>` is loaded by its bare name: drop the `superpowers:` prefix (`skill {"name": "test-driven-development"}`). |
| Read / create / edit a file | `read` / `write` / `edit` |
| Find files / search contents | `glob` / `grep` |
| Run a shell command | the shell tool: `pwsh` on Windows (native `C:\...` paths, `$env:NAME`); on macOS and Linux, the shell tool your session lists |
| Run a long-lived command (a server, a watcher) | start it as a managed job instead of a blocking call; read it with `job_output`, stop it with `job_kill` |
| Create / update todos | `todo_write` |
| Ask your human partner | `ask_user_question` |
| Dispatch a subagent | `subagent` (fresh context: pass everything it needs) or `subagent_fork` (inherits this conversation's completed turns). It runs in the background; you are notified when it finishes, and its final report is the result. |
| Fetch a URL / search the web | `web_fetch` / `web_search` |
| Leave plan mode | `exit_plan_mode` |

## Subagents

- Dispatch independent subagents in the same message; they run concurrently.
  Agents that write the same checkout are not independent: run one implementer
  at a time there, and overlap only read-only work such as a review of a
  committed diff.
- Delegation depth is 1 and enforced: a subagent cannot dispatch its own subagents
  (it fails with "subagent depth 2 exceeds maxDepth 1"). Say so in implementer and
  reviewer briefs.
- Choosing a subagent's model needs DSH's subagent model selection setting,
  which is off by default. When it is on, `subagent` takes `provider` and `model`
  and `list_subagent_models` lists the allowed routes. When it is off, every
  subagent runs on this session's model; say so rather than claiming a model tier.
- Hand artifacts over as files. Text pasted into a dispatch prompt stays in your
  context for the rest of the session.
- A subagent's report is a claim. Verify it by reading what it changed.
- Do not count on continuing a subagent after it finishes. `list_agents`,
  `send_message` and `wait_agent` address live agents; with the agent-team
  bundle installed they address teammates only, and a finished subagent's id is
  rejected. For a follow-up, such as a fix round, dispatch a fresh subagent with
  the brief, its previous report and the findings as files.
- Do not let several agents amend or rebase a shared branch. Each one commits
  new commits only; rewriting history is the controller's call.

## Running bundled scripts

Skills run their helpers as `bash scripts/<name>` or `node <file>`. On macOS and
Linux, run them as written. On Windows the shell tool is `pwsh`, and a bare `bash`
can resolve to WSL; use Git for Windows' bash by absolute path. Take `bin\bash.exe`,
not `usr\bin\bash.exe`: started from `pwsh`, the latter has no `/usr/bin` on its
PATH, so scripts fail with `basename: command not found`.

```powershell
$bash = Join-Path (Split-Path (Split-Path (Split-Path (git --exec-path)))) 'bin\bash.exe'
& $bash <skill directory>/scripts/<name> <args>
```

`git --exec-path` finds Git's root whichever `git.exe` is first on PATH.

**Inside DSH's sandbox (workspace-write), Git Bash cannot start.** It fails with
`fatal error - NtCreateDirectoryObject(...): 0xC0000022`, whichever bash.exe
you pick. Don't try other bash paths. Do the script's work directly in PowerShell
and say so, or ask your human partner to run it outside the sandbox.

- Run scripts from where they are installed: some call sibling scripts by
  relative path.
- `task-done` exits 1 with no message when the test command prints nothing; use
  a test command that reports its result.
- The brainstorming server runs in the foreground under Git Bash. Start it as a
  managed job and take the URL from the `server-started` JSON line it prints.
- `render-graphs.js` needs Graphviz's `dot`. Check `dot -V` before offering to
  render; without it, keep diagrams inline as DOT code blocks.
- If no bash is available, do the script's work directly and say so.

## Windows shell differences

- Bash snippets that illustrate a technique: apply the technique in PowerShell
  rather than pasting POSIX syntax.
- Git prints forward-slash paths. Compare `(Resolve-Path (git rev-parse --git-dir)).Path`
  with `(Resolve-Path (git rev-parse --git-common-dir)).Path`, not raw strings.
- Word count without `wc -w`:
  ``(Get-Content FILE -Raw).Split(' ', "`n", "`t").Where({$_ -ne ''}).Count``

## Evidence on DSH

- A failing command shows `[exit code: N]` in its output and is not marked as a
  tool error. Read the exit code; plausible-looking output is not success.
- Long output is truncated to its tail and the full output is saved to a file
  named in the result. Read that file when your claim depends on all of it.
- `[sandbox: file access denied ...]` is a policy boundary, not a bug in the code.
  Report it and ask; never work around it.
- A test runner that starts child processes fails inside the sandbox with
  `spawn EPERM`, because the sandbox blocks their pipes. The code is not at
  fault. Run the suite in-process before asking for full access:
  `node --test --test-isolation=none <files>` (Node 22:
  `--experimental-test-isolation=none`), or run a test file with plain `node`.
  Keep the project's test script unchanged unless your human partner agrees.
- Shell network access may fail while `web_fetch` works.

## Skills on DSH

- These skills come from the `dsh-superpowers` bundle. A skill with the same name
  in a project's `.dsh/skills/` or in `~/.dsh/skills/` takes precedence.
- A skill is `<root>/<name>/SKILL.md` (or a flat `<root>/<name>.md`), one level
  deep; nested skills are not discovered.
- This bootstrap is part of your system prompt in every session and survives
  compaction. Subagents do not receive it.
