# Contributing

## Ground rules

- **`skills/` is generated.** It is built from `upstream/pin.json` and
  `overlays/`. CI fails if the committed tree does not match a fresh build.
- **Never edit skill bodies.** This is upstream's porting rule: skills describe
  actions, and harness differences go in the tool mapping. The only edits allowed
  are the "DeepSeek Harness" line in `using-superpowers`'s Platform Adaptation
  list and the added file `using-superpowers/references/dsh-tools.md`. If a
  change seems to need a `SKILL.md` edit, the fix belongs in the mapping.
- **Test first.** Every change to `src/` or `scripts/` starts with a failing test
  in `test/`. Run it and see it fail for the right reason, then implement.
- **`npm run verify` must pass** before you commit.

## Change the DSH tool mapping

1. Edit `skills/using-superpowers/references/dsh-tools.md`. The bootstrap inlines
   it into every session's system prompt, so keep it short and action-oriented.
2. Run `npm run overlays`. This records the file in `overlays/added/` (it uses
   `git diff`, so it needs git).
3. Run `npm run verify`. Then run the harness scenarios the change could affect,
   for example `npm run eval:harness -- --only prefix,acceptance --repeat 3`.
4. Commit `skills/` and `overlays/` together.

## Upgrade upstream

A weekly GitHub Action (`.github/workflows/upstream.yml`) opens this pull request
for you when obra/superpowers publishes a release. To do it by hand:

1. Run `node scripts/bump-upstream.mjs --latest`, or pass a tag, branch or commit.
   This rewrites `upstream/pin.json` from GitHub's tree for that commit.
   `--check` only reports whether a newer release exists.
2. Run `npm run sync`. The only overlay is the Platform Adaptation pointer. If
   upstream reworded that list, the build fails and names the hunk. Re-add the
   line by hand in `skills/`, then run `npm run overlays`.
3. Read upstream's release notes against `dsh-tools.md`. A new action, a renamed
   tool or a new helper script may need a line in the mapping.
4. Refresh `LICENSE.superpowers` if the license changed. `npm run check`
   compares it with the pin.
5. Record the upstream version under a new `CHANGELOG.md` entry, and run
   `npm run verify`.

## Layout

| Path | What it is |
|---|---|
| `src/skills.js` | skill provider plugin |
| `src/bootstrap.js` | session-start bootstrap plugin |
| `src/gate/` | optional workflow gate plugin (`policy.js` holds pure decisions, `session-fold.js` reads skill loads from the session log) |
| `cordis.patch.yml` | the bundle's plugin rows |
| `skills/` | generated skill tree, shipped |
| `upstream/pin.json` | pinned upstream commit and per-file hashes |
| `overlays/patches/` | DSH changes to upstream files, as unified diffs |
| `overlays/added/` | DSH-only files |
| `scripts/` | `sync`, `overlays`, `check`, `inspect-session` |
| `evals/` | behavioural scenarios |

## End-to-end test against a real DSH

Unit tests stub the Host. Before a release, check the real thing in a throwaway
**headless** profile. This needs no GUI and leaves your own profile untouched.

```powershell
$dsh = "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
& $dsh sp-e2e --from-default-profile headless --dump-config > $null   # create the profile
& $dsh plugin --profile sp-e2e add github:blugart-dev/dsh-superpowers  # or an absolute path to a clone
& $dsh --profile sp-e2e --dump-config | Select-String dsh-superpowers  # three rows, gate disabled

# In an empty folder: one real session
& $dsh sp-e2e "Does your system prompt contain 'You have superpowers.'? Load test-driven-development and quote its base directory line."
npm run inspect-session -- --workspace <that folder's name>         # expect: Bootstrap present once
```

To test the gate, pass an overlay with `--patch gate.yml` that sets
`disabled: false` and `gate: true` on `dsh-superpowers-gate`. Then ask for a
`write` to `src/` without loading a skill. `inspect-session` should show the
write denied, then `superpowers-workflow` loaded, then the retry allowed.

When you are done, delete `~/.dsh/profiles/sp-e2e`.

## Testing inside DeepSeek Harness

DSH's sandbox cannot open pipes to child processes. That is why `npm test`
passes `--test-isolation=none`, and why `sync`, `check` and the tests never spawn
processes. `npm run overlays` is the exception, because it runs `git diff`. Run
it from a normal terminal.
