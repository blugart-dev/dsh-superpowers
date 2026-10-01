# Claude Code → DeepSeek Harness (DSH) mapping and adaptations

The upstream Superpowers skills were written for Claude Code and name its
PascalCase tools. This installation targets **DeepSeek Harness (DSH)**. Read this
file whenever a skill names a tool, file, path, or command that does not exist
here.

## Tool equivalences

| Claude Code | DSH | Notes |
|---|---|---|
| `Bash` | `pwsh` on Windows | DSH's Windows shell tool; on macOS/Linux use the shell tool your session lists |
| `Read` | `read` | |
| `Write` | `write` | Replaces the whole file |
| `Edit` | `edit` | Prefer this for targeted changes |
| `Glob` | `glob` | |
| `Grep` | `grep` | |
| `TodoWrite` | `todo_write` | |
| `Task` (subagent) | `subagent` / `subagent_fork` | `subagent_fork` inherits the conversation |
| `ExitPlanMode` | `exit_plan_mode` | Only valid in plan mode |
| `AskUserQuestion` | `ask_user_question` | |
| `WebFetch` / `WebSearch` | `web_fetch` / `web_search` | |
| Skill tool | `skill` tool | |
| `NotebookEdit` | — | Not available |
| `SlashCommand` | — | No slash-command registration |
| hooks / `SessionStart` | `dsh-superpowers` bundle | No hook system; the bundle injects `using-superpowers` as a system-prompt section |

Additional DSH tools with no Claude Code equivalent:

- `job_list` / `job_output` / `job_kill` — managed background jobs. Use for
  long-running commands instead of blocking.
- `list_agents` / `send_message` / `interrupt_agent` — inspect and control subagents.
- `workflow` — JS-orchestrated fan-out across many subagents. Use only when
  explicitly asked for a workflow or large-scale orchestration.
- `present` — declare existing files as deliverables.
- `create_goal` / `get_goal` / `update_goal` — persisted multi-round goals.
- `read_image`, `load_workspace_dependencies`.

## Skills are addressed by bare name

Use `test-driven-development`, **not** `superpowers:test-driven-development`. The
prefixed form does not resolve on DSH. Load a skill with the `skill` tool.

Names must be kebab-case and the frontmatter `name` must exactly match the
containing directory, or DSH silently drops the skill.

## Upstream files

Every file under upstream's `skills/` at the pinned commit is installed (74 files,
each verified against its git blob hash by the bundle's `sync` script). Templates, prompts and
references that a skill names are there to read. Never invent file contents and
present them as upstream.

The executable helpers are **bash** scripts: `brainstorming/scripts/*.sh`,
`executing-plans/scripts/*`, `subagent-driven-development/scripts/*` and
`systematic-debugging/find-polluter.sh`. On macOS and Linux run them directly.
On Windows run them through Git for Windows' bash by absolute path, never bare
`bash` (it can resolve to WSL):

```powershell
$bash = Join-Path (Split-Path (Split-Path (Get-Command git).Source)) 'usr\bin\bash.exe'
& $bash <script> <args>
```

`writing-skills/render-graphs.js` needs Graphviz's `dot` on PATH.

Some upstream prose also names companion skills that do not exist in this install
(`frontend-design`, `mcp-builder`,
`elements-of-style:writing-clearly-and-concisely`). Treat those as no-ops — there
is no skill to invoke.

## Commands that differ from upstream

Upstream's `bash scripts/…` lines are runnable through Git Bash (see above). If Git
Bash is unavailable, the work is the same; do it with the tools you have.

| Upstream command | Fallback on DSH without Git Bash |
|---|---|
| `bash scripts/sdd-workspace PLAN_FILE` | Create a git-ignored directory for the plan's artifacts — `<repo-root>/.superpowers/sdd/<plan-basename>/` — and keep the ledger, briefs, reports and review packages there |
| `bash scripts/task-brief PLAN_FILE N` | Extract that task's text from the plan into its own file in the workspace and pass the file path to the implementer |
| `bash scripts/task-done PLAN_FILE N BASE -- <test cmd>` | Run the test command yourself; on pass, append the completion line to the ledger |
| `bash scripts/review-package PLAN_FILE BASE HEAD` | Write `git log --oneline`, `git diff --stat` and `git diff -U10` for the range into one file; hand the reviewer that path |
| `git worktree add …` | Works from the shell tool when `git` is present — see `using-git-worktrees` |

**Bash examples are not always commands to run.** Where a skill shows `bash` only
to *illustrate* a technique (the debugging instrumentation examples, `npm test`
invocations, and the cross-platform `GIT_DIR`/`GIT_COMMON` detection blocks), the
technique is what matters. On Windows run the equivalent in `pwsh`. Do not transliterate
shell syntax literally — `$VAR` expansion, `&&` chaining, and `2>/dev/null` differ.

## Subagent notes

- `subagent` runs in its own context and returns only its final result. It does
  **not** inherit this conversation — pass everything it needs explicitly.
- `subagent_fork` inherits completed turns of this conversation. Use it when the
  subtask genuinely builds on this session's context.
- Delegation depth defaults to **1** and **the harness enforces it**: a nested
  dispatch fails with "subagent depth 2 exceeds maxDepth 1". Never design a
  workflow needing grandchildren, and never instruct an implementer to dispatch
  helpers or its own reviewer.
- Start independent subagents **in the same message** so they run concurrently.
  One dispatch per message serializes them.
- `send_message` continues a live subagent, so fix-loop rounds 1–3 genuinely
  resume the original implementer. `list_agents` reconciles what is running;
  `interrupt_agent` stops one.
- Verify a subagent's claims by inspecting what it wrote. Its summary is a claim,
  not evidence — see `verification-before-completion`.
- Hand artifacts over as **files**, not pasted text. Everything pasted into a
  dispatch prompt stays in your context and is re-read on every later turn.

## Environment notes

- **Shell:** on Windows the shell tool is `pwsh`, not bash, and paths use native
  `C:\...` form. On macOS and Linux, use the shell tool your session lists.
- **Sandbox:** file policy may be `read-only`, `workspace-write`, or
  `danger-full-access`. The policy governs **filesystem effects only** — network
  and process visibility are outside it. A `[sandbox: file access denied]`
  marker is a **policy** boundary, not a bug and not a permissions problem to
  work around. Report it and ask.
- **Shell network access may be unavailable.** In some configurations
  `Invoke-WebRequest` and `curl` fail with TLS/credential errors while the
  `web_fetch` tool works. If a command needs the network and the shell cannot
  reach it, use `web_fetch` rather than retrying the shell route.
- **Session transcripts** live under `<dshHome>/sessions/` (`~/.dsh` by
  default); derived session state under `<dshHome>/storages/`.

## The session-start bootstrap

Upstream injects the `using-superpowers` bootstrap with a session-start hook.
**DSH has no hook system.** The equivalent here is the `dsh-superpowers`
bundle, which registers `using-superpowers` as a durable system-prompt section
(`ctx.systemPrompt.section`) in every session of the profile, wrapped exactly as
upstream's hook wraps it. A system-prompt section survives compaction.

It is advisory, as upstream's is: it tells you to check the catalog; nothing
forces you to. The same bundle carries an opt-in workflow gate (plugin row
`superpowers-gate`, disabled by default) that can deny `write`/`edit` until a
skill is loaded.
