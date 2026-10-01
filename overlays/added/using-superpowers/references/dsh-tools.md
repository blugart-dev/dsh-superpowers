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
| Dispatch a subagent | `subagent` (fresh context: pass everything it needs) or `subagent_fork` (inherits this conversation's completed turns). Continue one with `send_message`; see them with `list_agents`; stop one with `interrupt_agent`. |
| Fetch a URL / search the web | `web_fetch` / `web_search` |
| Leave plan mode | `exit_plan_mode` |

## Subagents

- Dispatch independent subagents in the same message; they run concurrently.
- Delegation depth is 1 and enforced: a subagent cannot dispatch its own subagents
  (it fails with "subagent depth 2 exceeds maxDepth 1"). Say so in implementer and
  reviewer briefs.
- Name the model on every dispatch; an omitted model inherits this session's.
- Hand artifacts over as files. Text pasted into a dispatch prompt stays in your
  context for the rest of the session.
- A subagent's report is a claim. Verify it by reading what it changed.

## Running bundled scripts

Skills run their helpers as `bash scripts/<name>` or `node <file>`. On macOS and
Linux, run them as written. On Windows the shell tool is `pwsh`, and a bare `bash`
can resolve to WSL; use Git for Windows' bash by absolute path:

```powershell
$bash = Join-Path (Split-Path (Split-Path (Get-Command git).Source)) 'usr\bin\bash.exe'
& $bash <skill directory>/scripts/<name> <args>
```

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
- Shell network access may fail while `web_fetch` works.

## Skills on DSH

- These skills come from the `dsh-superpowers` bundle. A skill with the same name
  in a project's `.dsh/skills/` or in `~/.dsh/skills/` takes precedence.
- A skill is `<root>/<name>/SKILL.md` (or a flat `<root>/<name>.md`), one level
  deep; nested skills are not discovered.
- This bootstrap is part of your system prompt in every session and survives
  compaction. Subagents do not receive it.
