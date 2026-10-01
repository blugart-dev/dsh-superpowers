# Contributing

## Ground rules

- **`skills/` is generated.** It is built from `upstream/pin.json` and
  `overlays/`. CI fails if the committed tree does not match a fresh build.
- **Upstream text stays upstream's.** The DSH changes are additive notes, plus a
  small number of documented line replacements. Do not reword upstream prose to
  taste.
- **Test first.** Every change to `src/` or `scripts/` starts with a failing test
  in `test/`. Run it and see it fail for the right reason, then implement.
- **`npm run verify` must pass** before you commit.

## Change a DSH note in a skill

1. Edit the file under `skills/`.
2. Run `npm run overlays`. This regenerates `overlays/` from the edited tree
   (it uses `git diff`, so it needs git).
3. Run `npm run verify`.
4. Commit `skills/` and `overlays/` together.

## Upgrade upstream

1. Update `upstream/pin.json`. Set `commit` and `version`, then list every
   `skills/**` file and `LICENSE` with its git blob SHA from the new commit's tree:

   ```
   gh api "repos/obra/superpowers/git/trees/<commit>?recursive=1"
   ```

2. Run `npm run sync`. If an overlay no longer applies, the build fails and names
   the file and hunk. Re-apply that note by hand in `skills/`, then run
   `npm run overlays`.
3. Read upstream's release notes. Check whether any DSH note is now wrong or
   redundant, for example when upstream adds its own guidance for the same thing.
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

## Testing inside DeepSeek Harness

DSH's sandbox cannot open pipes to child processes. That is why `npm test`
passes `--test-isolation=none`, and why `sync`, `check` and the tests never spawn
processes. `npm run overlays` is the exception, because it runs `git diff`. Run
it from a normal terminal.
