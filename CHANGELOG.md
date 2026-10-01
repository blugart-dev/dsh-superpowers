# Changelog

This project follows [Semantic Versioning](https://semver.org/). The upstream
Superpowers version each release vendors is listed under it.

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
