# Changelog

This project follows [Semantic Versioning](https://semver.org/). The upstream
Superpowers version each release vendors is listed under it.

## 1.0.0-rc.3 — 2026-10-02

Upstream: obra/superpowers v6.4.2 (unchanged).

**Fixed in `dsh-tools.md`** (found by splitpot field test #2 and the new harness
scenarios, pinned by `test/mapping.test.js`)

- **Windows bash is now found with `git --exec-path`, and is Git's
  `bin\bash.exe`.**
  - Started from `pwsh`, the old `usr\bin\bash.exe` has no `/usr/bin` on its
    PATH, so the bundled SDD scripts died with `basename: command not found`
    (exit 127). Reproduced with the real `sdd-workspace` script: exit 127
    before the fix, exit 0 after.
  - Deriving Git's root from `Get-Command git` also broke whenever
    `mingw64\bin\git.exe` came first on PATH. `git --exec-path` finds the root
    either way.
- **New: Git Bash cannot start inside DSH's sandbox.** Under workspace-write,
  every msys bash dies with `NtCreateDirectoryObject … 0xC0000022`. The mapping
  now says so and gives the fallback: do the script's work in PowerShell, or ask
  the human to run it outside the sandbox. Before this note, one agent tried
  eight commands, an escalation among them.
- **Model naming is now conditional.** DSH's `subagent` tool takes `provider`
  and `model` only when the Host's subagent model selection setting is on. It is
  off by default, and then every child runs on the session's model (read from
  `@deepseek-ai/dsh-tool-subagent`). The mapping had told agents to name the
  model on every dispatch.
- **Concurrent dispatch is narrowed.** "Dispatch independent subagents together"
  now excludes implementers writing the same checkout: one implementer at a time,
  overlapping only read-only work. In splitpot, a fix-round implementer edited
  `src/settle.js` while the next task's implementer, still running in the same
  checkout, had just been restoring source files with `git checkout --`.
  Upstream SDD already forbids parallel implementers.

**Fixed in `inspect-session`**

- `npm run inspect-session -- <id>` ignored the id when it was the only
  argument and showed the newest session instead. The parser skipped `args[0]`
  whenever `--workspace` was absent. Parsing now lives in `parseInspectArgs`,
  with a test.

**Added**

- **Harness scenarios** `bundled-script` (auto mode), `bundled-script-sandbox`
  and `sandbox-runner` (a bug fix where `npm test` is plain `node --test`, which
  dies with `spawn EPERM` in the sandbox).
- **Per-scenario `permissionMode`.** The headless profile reads
  `DSH_PERMISSION_MODE`, and `danger-full-access` matches Desktop's auto mode.
- **Shell results in session summaries.** `summarizeSession` records each
  command's `exitCode` and `output`. Checks match failure text too, because a
  PowerShell "is not recognized" error carries no exit-code marker.
- **README: "Known limitations"**, in English and Chinese.

**Fixed in the harness**

- **Running a `node:test` file directly (`node test/x.test.js`) now counts as a
  test run.** Under the sandbox, two of five `sandbox-runner` agents verified
  their fix that way (in-process, `ℹ pass 1`, exit 0) and were wrongly scored as
  unverified. Re-scored with the fix, the five kept sessions pass 5/5.

**Verified**

- **Full harness, `--repeat 3`:** every one of the 20 scenarios passed 3/3
  (60/60). Run under a clean Windows PATH, as Desktop sees it.
- **A/B on the new scenarios**, rc.2 versus rc.3:

  | Scenario | rc.2 | rc.3 |
  |---|---|---|
  | `bundled-script` (auto mode) | 0/3 | 3/3 |
  | `bundled-script-sandbox` | 1/3 | 3/3 |
  | `sandbox-runner` | 3/3 | 3/3 |

  Under rc.2, every auto-mode run needed a PATH workaround, and sandboxed runs
  made up to 4 failed bash attempts. Under rc.3, sandboxed runs fall back to
  PowerShell after one.
- **Checks:** `npm run verify` 136/136; `npm run compat` composes on DSH
  0.2.0-rc.2.
- **The harness's inherited PATH can hide bugs.** An early `bundled-script` run
  started from Git Bash passed under rc.2, because Git Bash's PATH already holds
  `/usr/bin`. Run the harness from a plain Windows shell.

## 1.0.0-rc.2 — 2026-10-01

**Fixed in `dsh-tools.md`** (found by the splitpot field test)

- **It no longer tells agents to continue a subagent with `send_message`, or to
  find subagents with `list_agents`.**
  - In a profile with the agent-team bundle, those tools address teammates
    only: `send_message` to a finished subagent's id fails with "active teammate
    … not found", and `list_agents` lists only the lead.
  - In a plain headless profile, `list_agents` shows no subagents once they
    finish.
  - The mapping now says to dispatch a fresh subagent with the brief, the
    previous report and the findings as files. That claim had been carried over
    unverified from the early DSH sessions.
- **New rule: agents must not amend or rebase a shared branch.** In splitpot an
  implementer's `git commit --amend` landed on the controller's commit. Nothing
  was lost (the controller caught it from the reflog), but history was rewritten.

## 1.0.0-rc.1 — 2026-10-01

Upstream: obra/superpowers v6.4.2 (unchanged). This is a release candidate: the
repository stays private, and nothing is published to npm or proposed upstream.

**Changed: skills now ship verbatim, following upstream's porting guide.**

- **The rule.** `docs/porting-to-a-new-harness.md` (upstream) says to never edit
  skill bodies to fit a harness; differences belong in a tool mapping.
- **Before:** 0.1–0.3 patched 13 `SKILL.md` files with "DeepSeek Harness notes"
  and stripped `superpowers:` prefixes.
- **Now:** 73 of 74 upstream files are byte-identical. The exception is one line
  in `using-superpowers`'s Platform Adaptation list, the only edit the guide
  allows.
- **The new mapping.** Everything DSH-specific lives in a rewritten, shorter
  `using-superpowers/references/dsh-tools.md`. That includes the rule that
  `superpowers:<name>` is loaded as `<name>`.
- **The bootstrap inlines the mapping** after the skill (the guide's Shape B
  pattern), so it is in context every session.
- **Dropped:** the unverified claim that DSH silently drops a skill whose
  frontmatter name differs from its directory. DSH's provider code has no such
  check.

**Added**

- **Harness scenario `acceptance`:** upstream's definition-of-done prompt, "Let's
  make a react todo list". **3/3**, with `brainstorming` loaded before any code.
- **Harness scenario `prefix`:** a `superpowers:`-prefixed reference resolves to
  the bare skill. **3/3**, loaded by bare name directly.
- **Harness `--bundle <dir>`:** runs the current scenarios against another
  checkout's bundle, for A/B comparisons between releases.
- **Release readiness:**
  - GitHub issue and PR templates, `SECURITY.md` and `docs/RELEASING.md`;
  - CI and compat badges, plus npm metadata (`publishConfig`, `homepage`,
    `bugs`; `npm publish --dry-run` is clean);
  - repository topics.

**Fixed**

- **Harness fixtures used `node --test`,** which fails with `spawn EPERM` in DSH's
  default sandbox, so their suite could never be green. Agents then correctly
  refused to claim readiness, which the wrap-up checks misread as failures.
  Fixtures now use `--test-isolation=none`, and a unit test pins it.

**Verified** (DSH 0.2.0-rc.2, Windows)

- **Full harness, 17 scenarios × 3:** 16 at 3/3, and `wrap-up-own` at 2/3.
- **`wrap-up-own` A/B with a fixed fixture, old bundle (0.3.0) against new:**

  | Bundle | Result |
  |---|---|
  | 0.3.0 | 4/6 (67%) |
  | 1.0.0-rc.1 | 8/12 (67%) |

  There is no regression. About a third of runs restate an earlier test result
  instead of re-running it, in both designs. It is a model behaviour that
  upstream's `verification-before-completion` already forbids; the scenario
  stays as a guard.
- **The system prompt is not repeated per step.** A 186-step session logged one
  system-prompt event, containing the bootstrap once.

## 0.3.0 — 2026-10-01

Upstream: obra/superpowers v6.4.2 (unchanged).

**Added**

- **Gate `requiredSkills`.** A project can name which skills unlock writes, for
  example `[test-driven-development, systematic-debugging]`. The default empty
  list keeps "any skill". The escape hatch always unlocks, so a configured gate
  can never lock a session out. The denial message lists the required skills.
- **Multi-turn harness scenarios.** Follow-up prompts resume the session with
  `--session-id`. New scenarios: `wrap-up`, `wrap-up-own`, `gate-required`,
  `gate-resume` and `gate-fork`.
- **`npm run compat`.** Checks, with no credentials and no model calls, that the
  packed bundle composes as shipped on the installed DSH. It runs in an isolated
  DSH home. The weekly `compat` workflow runs it against
  `@deepseek-ai/dsh@latest` and `@next` on Ubuntu and Windows.
- **`evals` workflow.** Runs the behavioural harness in CI. It is manual only and
  needs a `DEEPSEEK_API_KEY` repository secret; without the secret it skips.
- **Chinese localisation:** `README.zh.md` and `locale/zh.json` for the Plugins
  page.

**Changed**

- **Brainstorming visual-companion note.** The server scripts were checked on
  Windows under Git Bash: the server starts, prints `server-started` JSON and
  serves HTTP 200. Launching it as a DSH job is still not verified.
- **Shared DSH launcher (`scripts/lib/dsh.mjs`).** The harness and compat now
  share one launcher. Windows `.cmd` shims get a single pre-quoted command line,
  which avoids Node's DEP0190 warning.
- **dice-lab rubric.** Phase 3 now adapts when Phase 2 correctly changed nothing,
  and restating an earlier test result no longer counts as fresh evidence.

**Verified** (DSH 0.2.0-rc.2, Windows, 3 runs each)

| Scenario | Result | Note |
|---|---|---|
| wrap-up | 3/3 | |
| wrap-up-own | 3/3 | The dice-lab Phase 3 slip (restating a stale "76/76") does not reproduce in short sessions; it seems specific to long sessions |
| gate-required | 3/3 | |
| gate-resume | 3/3 | Resume is verified for the first time |
| gate-fork | 3/3 | Every fork took the "denied, then recovered" path: forks inherit only completed turns, so a skill loaded in the current turn is not visible to them |
| bootstrap, gate-deny | 3/3 | Re-run on the refactored harness |

## 0.2.0 — 2026-10-01

Upstream: obra/superpowers v6.4.2 (unchanged).

**Added**

- **`npm run eval:harness`.** Automated behavioural tests that run real headless
  DSH sessions against the packed bundle and score them from the session logs.
  Ten scenarios: bootstrap, five routing prompts, an over-triggering control,
  the gate's mechanics, the gate's steering, and subagents.
- **`scripts/bump-upstream.mjs`, plus a weekly `upstream` workflow.** When
  obra/superpowers publishes a release, the workflow opens a pull request that
  moves the pin and rebuilds `skills/`, listing any DSH overlay that no longer
  applies.
- **README: skill names, overrides and collisions.**

**Changed**

- **The bootstrap is no longer injected into subagent sessions**
  (`delegationDepth > 0`), matching upstream's `SessionStart` hook, which
  subagents never see. This saves about 5 KB of prompt per subagent. Set
  `subagents: true` to opt back in.
- **Gate: neither the announcement nor the catalog advertises the escape hatch.**
  Both the announcement ("To clear it: call … superpowers-workflow") and the
  catalog description ("Load this to clear the … gate") led agents to load the
  escape skill as a ritual before working. In a controlled comparison with the
  same prompt, that happened in 3 of 3 runs before the change and 0 of 3 after.
  The escape hatch is now named only in the denial message.
- **`sync` reports every overlay that no longer applies,** with a clear message
  instead of a stack trace.

**Verified** (`eval:harness`, DSH 0.2.0-rc.2, Windows; each scenario run 3
times):

| Scenario | Result |
|---|---|
| bootstrap | 3/3 |
| route-build | 3/3 |
| route-feature | 3/3 |
| route-bug | 3/3 |
| route-plan | 3/3 |
| route-done | 3/3 |
| control (no over-triggering) | 3/3 |
| gate-deny | 3/3 |
| gate-steer | 3/3 |
| subagent | 3/3 |

## 0.1.0 — 2026-10-01

Upstream: obra/superpowers v6.4.2 (`8ca22dba`).

First packaged release. It replaces an earlier, machine-specific setup made of two
linked `@local` bundles.

**Added**

- **Packaged skill provider (`dsh-superpowers-skills`).** It serves the skills
  shipped in the package at the registry's packaged rank (600), so no
  user-specific paths are configured anywhere.
- **Session-start bootstrap (`dsh-superpowers-bootstrap`).** It adds upstream's
  `hooks/session-start` text, wrapping `using-superpowers`, as a durable
  system-prompt section.
- **Optional workflow gate (`dsh-superpowers-gate`).** It ships disabled.
- **Reproducible skills.** `skills/` is generated from `upstream/pin.json` and
  `overlays/` by `npm run sync`. `npm run sync:check` proves the generated tree
  matches.
- **Contract checks and tests.** `npm run check` checks the bundle contract, and
  the unit tests cover the patch applier, build, provider, bootstrap, gate and the
  session-log reader.
- **`npm run inspect-session`.** It verifies an install from DSH's own session
  logs.
- **Behavioural eval (`evals/dice-lab`).**

**Changed, relative to the earlier setup**

- **DSH notes in the skills are now platform-conditional.** They had said "the
  shell is `pwsh` on this machine" and hard-coded a Git Bash path.
- **The gate no longer writes a log beside its own module.** Diagnostics are
  opt-in, through `diagnosticsLog`.
