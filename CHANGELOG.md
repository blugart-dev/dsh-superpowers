# Changelog

This project follows [Semantic Versioning](https://semver.org/). The upstream
Superpowers version each release vendors is listed under it.

## 1.0.1 — 2026-10-02

Upstream: obra/superpowers v6.4.2 (unchanged).

**Added to `dsh-tools.md`** (each one checked against DSH's own tool source,
pinned by `test/mapping.test.js`):

- **DSH has no subagent types.** Where a skill names one, such as
  `Subagent (general-purpose):` or a code-reviewer, the role and its
  instructions go into the `subagent` prompt. DSH's subagent tool rejects
  `agentType` as an unsupported option, and upstream's porting guide asks the
  mapping to say how a type is passed.
- **`todo_write` replaces the whole list,** so every call must include every
  item.
- **`interrupt_agent`** stops a running subagent.

**Verified**

- `npm run verify`: 140/140, including the three new mapping tests, each
  seen failing first.
- Harness, 3 runs each, on DSH 0.2.0-rc.2: `bootstrap`, `route-build`,
  `route-plan`, `control` (no over-triggering) and `subagent` (parent 1x,
  child 0x) all 3/3.

## 1.0.0 — 2026-10-02

Upstream: obra/superpowers v6.4.2 (`8ca22dba`).

First public release.

**What ships**

- **All 15 skills, verbatim.** `skills/` holds every upstream file (74), each
  verified by git blob hash. 73 are byte-identical. The exception is one pointer
  line in `using-superpowers`'s Platform Adaptation list, the only edit
  upstream's porting guide allows.
- **Packaged skill provider (`dsh-superpowers-skills`).** It serves the skills
  from the package to every session, with no user-specific paths.
- **Session-start bootstrap (`dsh-superpowers-bootstrap`).** It puts upstream's
  session-start text, wrapping `using-superpowers`, in the system prompt once,
  followed by the DSH tool mapping. It replaces upstream's `SessionStart` hook.
  Subagents don't receive it, as with upstream.
- **Optional workflow gate (`dsh-superpowers-gate`), off by default.** It denies
  `write`/`edit` to source files until a skill is loaded. `requiredSkills` can
  name which skills unlock writes. An escape skill always unlocks, so the gate
  can never lock a session out. This row is not part of upstream.
- **Reproducible build.** `skills/` is generated from `upstream/pin.json` and
  `overlays/` by `npm run sync`, and `npm run sync:check` proves the match. A
  weekly `upstream` workflow opens a pull request when obra/superpowers releases.
- **Tooling:**
  - `npm run inspect-session` checks an install from DSH's own session logs.
  - `npm run eval:harness` runs real headless DSH sessions and scores them from
    the logs.
  - `npm run compat` checks, with no credentials and no model calls, that the
    bundle composes on the installed DSH.
- **English and Chinese** README and Plugins-page locale.

**The DSH mapping (`using-superpowers/references/dsh-tools.md`)**

Everything DSH-specific lives in this one file, including that
`superpowers:<name>` loads as `<name>`. Several entries come from field tests in
the desktop app:

- **Subagents:**
  - delegation depth is 1;
  - naming a subagent's model needs DSH's subagent model selection setting,
    which is off by default;
  - finished subagents can't be continued: dispatch a fresh one with the
    brief, the previous report and the findings as files;
  - only one implementer at a time per checkout;
  - no amending or rebasing a shared branch.
- **Bundled scripts on Windows:**
  - use Git's `bin\bash.exe`, found with `git --exec-path`;
  - Git Bash cannot start inside DSH's sandbox (`0xC0000022`), so do the work
    in PowerShell instead.
- **Test runners in the sandbox:** `spawn EPERM` comes from the sandbox, not
  from the code. Run the suite in-process (`--test-isolation=none`) before
  asking for full access.

**Verified** (DSH 0.2.0-rc.2, Windows 11)

- `npm run verify`: 137/137 tests, plus contract and sync checks. CI passes on
  Ubuntu and Windows, and `compat` passes against DSH latest and next.
- **Behavioural harness, 3 runs per scenario,** across 20 scenarios, including:
  - session-start bootstrap (present once);
  - routing for build, feature, bug, plan and done prompts;
  - the over-triggering control;
  - upstream's acceptance prompt;
  - `superpowers:` prefixes;
  - subagents;
  - the gate's deny, steer, resume, fork and `requiredSkills` paths;
  - bundled scripts in and out of the sandbox;
  - the sandbox test runner.

  All passed 3/3 except `wrap-up-own`, covered under **Known behaviour**.
- **Two full builds in DSH Desktop** (dice-lab and splitpot) ran the whole chain:
  - brainstorming, plans and subagent-driven development with reviewers;
  - test-first implementation;
  - code review that pushed back on a wrong suggestion with evidence;
  - debugging that reproduced the report before changing anything;
  - fresh verification and the branch-finishing options.

**Known behaviour**

- **About a third of wrap-up turns restate an earlier test result instead of
  re-running the tests** (`wrap-up-own`: 4/6, 8/12, 5/9 across A/B runs). It is
  model behaviour that upstream's `verification-before-completion` already
  forbids. The mapping does not change the rate, and the scenario stays as a
  guard.
