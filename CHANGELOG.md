# Changelog

This project follows [Semantic Versioning](https://semver.org/). The upstream
Superpowers version each release vendors is listed under it.

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
