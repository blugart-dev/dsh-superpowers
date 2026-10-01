# dsh-superpowers

English | [中文](README.zh.md)

[![ci](https://github.com/blugart-dev/dsh-superpowers/actions/workflows/ci.yml/badge.svg)](https://github.com/blugart-dev/dsh-superpowers/actions/workflows/ci.yml) [![compat](https://github.com/blugart-dev/dsh-superpowers/actions/workflows/compat.yml/badge.svg)](https://github.com/blugart-dev/dsh-superpowers/actions/workflows/compat.yml)

[Superpowers](https://github.com/obra/superpowers) for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH):
Jesse Vincent's skill library for disciplined agentic development (brainstorming,
planning, test-driven development, systematic debugging, verification, code
review), packaged as one DSH bundle.

| | |
|---|---|
| Upstream | `obra/superpowers` **v6.4.2**, commit `8ca22dba` ([pin](upstream/pin.json)) |
| Skills | all 15, with every upstream file under `skills/` (74), each verified by git blob hash. 73 are byte-identical to upstream |
| Tested on | DeepSeek Harness Desktop `0.2.0-rc.2`, Windows 11 |

## What you get

The bundle adds three plugin rows to your DSH profile. Each one can be switched
on or off on its own.

| Row | Default | What it does |
|---|---|---|
| `dsh-superpowers-skills` | on | Serves the skills to every session, in every workspace. |
| `dsh-superpowers-bootstrap` | on | Puts upstream's session-start text, which wraps `using-superpowers`, in every session's system prompt, followed by the DSH tool mapping. It replaces upstream's `SessionStart` hook, which DSH does not have. |
| `dsh-superpowers-gate` | **off** | Optional enforcement. It denies `write`/`edit` to source files until the session has loaded a skill. This row is **not** part of upstream. |

How it differs from upstream: hardly at all, on purpose. Upstream's
[porting guide](https://github.com/obra/superpowers/blob/main/docs/porting-to-a-new-harness.md)
says to never edit skill bodies to fit a harness, and this port follows it:

- **The skills ship verbatim.** The one exception is a single line in
  `using-superpowers`'s "Platform Adaptation" list, which points to the DSH
  mapping. That pointer is the only edit the guide allows.
- **One DSH-only file:**
  [`using-superpowers/references/dsh-tools.md`](skills/using-superpowers/references/dsh-tools.md).
  It maps the skills' actions to DSH tools. It explains that `superpowers:<name>`
  loads as `<name>`, that subagents are limited to one level, and how to run the
  bash helper scripts on Windows. The bootstrap inlines it, so every session has
  it.
- **Every change is a reviewable file** in [`overlays/`](overlays/). Nothing in
  `skills/` is maintained by hand.

## Install

From the DSH Desktop **Plugins** page, choose **Install**, then enter:

```
github:blugart-dev/dsh-superpowers
```

To pin a release instead of tracking `main`, use
`github:blugart-dev/dsh-superpowers#v1.0.0-rc.1`.

You can also ask an agent in Creator mode:
`plugin_manager { action: install_bundle, spec: "github:blugart-dev/dsh-superpowers" }`.

While this repository is private, the installer needs git access to it. Your SSH
key must be registered with an account that can read the repository. Without
access, clone it and install from the local path instead.

**Restart DSH after installing or updating.** A replaced package needs a fresh
module generation.

### Check that it works

Open a new session in any workspace, send a message, and then run:

```
npm run inspect-session
```

This needs a clone of this repository. It reads DSH's own session log, so it
reports what the model actually received:

```
Bootstrap  present once in the system prompt
Skills     2 loaded
  14:04:26  brainstorming
  14:10:21  writing-plans
```

See [docs/VERIFYING.md](docs/VERIFYING.md) for what each line means and for the
manual equivalent.

## Configure

Toggle a row on the Plugins page, or with:

```
plugin_manager { action: set_plugin, target: dsh-superpowers-bootstrap, enabled: false }
```

**To arm the gate,** enable its row and override its config with `gate: true` in
your profile patch. A config override replaces the whole `config` block, so
restate every field you need:

```yaml
- id: dsh-superpowers-gate
  disabled: false
  config:
    gate: true
    artifactsWritable: true
    artifactPrefixes: [docs/superpowers/plans/, docs/superpowers/specs/, research/, notes/]
    escapeSkill: { enabled: true, name: superpowers-workflow }
    announceInPrompt: true
    requiredSkills: []   # e.g. [test-driven-development, systematic-debugging]
```

- **`requiredSkills`** narrows which skills unlock writes. The default empty list
  means any skill unlocks them. The escape hatch always unlocks, so a configured
  gate can never lock a session out.
- **Recovery.** A blocked session is told exactly how to recover: load
  `skill {"name": "superpowers-workflow"}`. Only the denial message names that
  skill. The announcement and the skill catalog deliberately don't, because when
  they did, agents loaded it as a ritual instead of a real skill.
- **Arming.** The gate refuses to arm if its escape hatch does not resolve.
- **Limits.** The gate cannot see shell writes, and its behaviour in forked
  subagents depends on what the fork inherits (see docs/VERIFYING.md).

Every row also accepts `diagnosticsLog: <absolute path>`. Each activation decision
is then appended to that file, which is useful when a row seems inactive.

### Skill names, overrides and collisions

DSH has no skill namespaces. Upstream's skills are addressed as `superpowers:<name>`
on Claude Code, but here they use bare names (`brainstorming`,
`test-driven-development`), and the skills refer to each other by those names.

- **To replace one of these skills,** put a skill with the same name in a project's
  `.dsh/skills/` or in `~/.dsh/skills/`. Those roots outrank this bundle (rank 600),
  so your version wins, and the rest of the methodology keeps pointing at it.
- **Another skill pack can collide.** If it ships a skill with the same name at a
  higher priority, it shadows ours silently; DSH logs only a warning. Check
  `npm run inspect-session` if a skill behaves unexpectedly.

### Subagents

Upstream's session-start hook never reaches subagents. To match that, the bootstrap
section is empty in delegated sessions (`delegationDepth > 0`). Set
`subagents: true` on the `dsh-superpowers-bootstrap` row to include it there too.

## Uninstall

Remove the bundle from the Plugins page, or run
`plugin_manager { action: remove_bundle, target: "@blugart-dev/dsh-superpowers" }`,
then restart DSH.

## Develop

Requires Node ≥ 23.6 and git.

```
npm run verify        # sync:check + contract checks + tests
npm run compat        # does the bundle compose on the installed DSH? (no model calls)
npm run eval:harness  # behavioural tests in real headless sessions (spends tokens)
```

- [CONTRIBUTING.md](CONTRIBUTING.md): how to edit a skill, upgrade upstream, and
  add a test.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit, and why.
- [evals/](evals/): behavioural scenarios for checking that DSH actually works
  the Superpowers way.
- [docs/RELEASING.md](docs/RELEASING.md): the release checklist.
- [SECURITY.md](SECURITY.md): what runs where, and how to report a vulnerability.

## License

MIT. The skills are derived from obra/superpowers, Copyright (c) 2025 Jesse Vincent,
under the MIT license in [LICENSE.superpowers](LICENSE.superpowers). See
[LICENSE](LICENSE) for this package.
