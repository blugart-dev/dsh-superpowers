# Architecture

## The problem

Upstream Superpowers is two things:

- **A skill library.** Markdown playbooks the agent loads on demand.
- **A session-start hook.** It inserts the `using-superpowers` skill into every
  session, so the agent is told to check its skills before acting.

DeepSeek Harness has a skill registry, but no Superpowers skills and no hook
system. This bundle supplies both, using DSH's own extension points.

## Components

```
DSH profile
 └─ bundle @blugart-dev/dsh-superpowers   (cordis.patch.yml inserts 3 rows)
     ├─ dsh-superpowers-skills    ──registerProvider──► ctx.skills    ──► skill catalog + `skill` tool
     ├─ dsh-superpowers-bootstrap ──section()─────────► ctx.systemPrompt ──► every system prompt
     └─ dsh-superpowers-gate (off) ──guard()──────────► ctx.tools     ──► denies write/edit
                                       └─ register()──► ctx.skills    (its escape-hatch skill)
```

### Skill provider (`src/skills.js`)

- **Contract.** Implements the registry's provider contract from
  `@deepseek-ai/dsh-skill`. `list()` returns summaries from frontmatter, and
  `get()` returns the body with a `directory` resource base. The agent therefore
  sees `Base directory for this skill: …/skills/<name>` and can open the
  templates and references next to the skill.
- **Rank 600.** This is the registry's standard rank for packaged providers.
  Lower ranks win, so a same-named skill in a project's `.dsh/skills`, a custom
  root or the user root overrides the packaged one. Users can shadow any skill
  without forking the bundle.
- **Located from `import.meta.url`.** The provider finds its files relative to
  its own module, never from configuration. That makes the bundle relocatable.
- **No watcher.** Installed files do not change while the package is installed.

### Bootstrap (`src/bootstrap.js`)

- **Text.** Upstream's exact wrapper ("You have superpowers. … use the 'skill'
  tool"), around the full shipped `using-superpowers/SKILL.md`.
- **Delivery.** It is registered as a system-prompt section. Unlike a one-off
  injected message, a section survives compaction, which matches upstream
  re-running the hook on compact.
- **`interpolate: false`.** DSH's renderer throws on unknown `{{…}}`
  references, and that throw would break prompt assembly in every session.
- **`inject: ['systemPrompt']`.** Without it, the Host activated the plugin
  before the service existed and nothing was registered. This was observed live.
- **Subagents get no bootstrap.** The section text is a function DSH calls on
  every prompt assembly. It returns `''` when the assembly's
  `agent.session.header.delegationDepth > 0`, and the renderer drops empty
  sections. This matches upstream, whose hook never reaches subagents, and saves
  about 5 KB of prompt per subagent. Verified live by the `subagent` harness
  scenario.
- **Failure handling.** Every failure degrades to "no bootstrap", never to a
  failed activation.

### Gate (`src/gate/`, disabled by default)

- **What it is.** Not upstream. It was built to test whether DSH can *enforce*
  the workflow rather than suggest it.
- **How it denies.** A synchronous `ctx.tools.guard()` denies `write`/`edit` to
  non-artifact paths until the session log shows a successful `skill` call.
- **Design rules:**
  - **Disabled twice.** The row is `disabled: true`, and the config says
    `gate: false`.
  - **No soft-lock.** It registers its own escape-hatch skill
    (`superpowers-workflow`) and refuses to arm unless that skill resolves
    through the registry. The escape hatch always unlocks, even under
    `requiredSkills`.
  - **The escape hatch is a recovery path, not an invitation.** Only the denial
    message names it. The announcement and the catalog description steer the
    agent to the skill for its task. When they advertised the escape hatch,
    agents loaded it as a ritual (3/3 in an A/B test; 0/3 after the change).
  - **State comes from the session log, not plugin memory.** A resumed session
    therefore derives the same answer: the `gate-resume` harness scenario passes
    3/3.
  - **`requiredSkills`** (default `[]`, meaning any skill) narrows which loaded
    skills unlock writes. The reader records every successful load, in order.
- **Known limits.**
  - It cannot see shell writes.
  - Forks inherit only completed turns, so a skill loaded earlier in the same
    turn may not be in the fork's log. The `gate-fork` scenario records which
    path a fork takes.
  - In live testing, the plugin was mounted in more than one Host scope per
    activation, and only the scope with a skill registry armed.

## Why the skills are generated

- **What `skills/` is made of.** A pure function of `upstream/pin.json`,
  `overlays/patches/` and `overlays/added/`.
- **What `npm run sync` does.** It fetches each pinned file, verifies its git
  blob SHA-1, applies the single permitted transformation (strip `superpowers:`
  before a kebab-case name), applies the patches with a strict in-process applier
  (no fuzz), and adds the DSH-only files.
- **What the build guarantees:**
  - **Provenance.** Every shipped byte is either upstream at a known commit or a
    reviewable patch.
  - **Upgrades.** Moving the pin re-applies every DSH change automatically, and
    fails loudly, naming the hunk, where upstream moved underneath one.
  - **CI.** `sync --check` proves the committed tree is exactly what the inputs
    produce.

## Compatibility

- **Declared peers.** `@deepseek-ai/dsh-skill`, `-system-prompt` and `-tools` at
  `>=0.2.0-rc.2`. DSH checks these ranges before it imports the bundle.
- **Optional peers.** The peers are marked optional so pnpm does not try to
  install them; the Host supplies them.
- **Tested version.** Only DSH Desktop `0.2.0-rc.2` on Windows has been tested.
  The DSH notes in the skills are written to be platform-conditional, but have
  not been exercised on macOS or Linux.
