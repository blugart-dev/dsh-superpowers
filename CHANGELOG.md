# Changelog

This project follows [Semantic Versioning](https://semver.org/). The upstream
Superpowers version each release vendors is listed under it.

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
