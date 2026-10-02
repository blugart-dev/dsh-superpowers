# Releasing

A release is a git tag (`vX.Y.Z`), plus a GitHub release whose notes are that
version's `CHANGELOG.md` section. Users install a tag with
`github:blugart-dev/dsh-superpowers#vX.Y.Z`.

## Checklist

1. **Scope the release.** Pick the version. This project follows semver for
   its own behaviour; the vendored upstream version is recorded separately in
   `upstream/pin.json`.
2. **Run the unit and contract checks.** Run `npm run verify` (sync check,
   contract, unit tests).
3. **Run the composition check.** Run `npm run compat` against your installed
   DSH. After pushing, also run the `compat` workflow (latest and next, Ubuntu
   and Windows).
4. **Run the behavioural checks.** Use `npm run eval:harness -- --repeat 3`,
   either across every scenario or across those touched by the change. Paste
   the pass rates into the changelog. A scenario under 3/3 needs a root cause
   before release, not a retry until it passes.
5. **Update the changelog.** Add a section with Added, Changed and Verified,
   and bump `package.json` `version`. Update the pinned tag in `README.md` and
   `README.zh.md`.
6. **Commit and push, then wait for `ci` to pass on both operating systems.**
7. **Tag and release:**

   ```
   git tag -a vX.Y.Z -m "vX.Y.Z — <summary>"
   git push --follow-tags
   awk '/^## X.Y.Z/{f=1;next} /^## /{f=0} f' CHANGELOG.md > notes.md
   gh release create vX.Y.Z --title "vX.Y.Z — <summary>" --notes-file notes.md --verify-tag
   ```

   Add `--prerelease` for `-rc.N` versions.
8. **Publish to npm** from the tagged commit, with a clean tree:

   ```
   npm publish --dry-run   # check the file list and version
   npm publish --otp=<code>
   ```

   The `blugart-dev` npm account owns the `@blugart-dev` scope and requires
   2FA for writes, so the maintainer runs this step. A version number can
   never be reused, and unpublishing is only allowed for 72 hours, so check
   the dry run first. Use `--tag next` for `-rc.N` versions, so that `latest`
   stays on a stable release. A new package can take a few minutes to appear
   on the registry.
9. **Upgrade a real profile and restart DSH:**
   `dsh plugin --profile <p> add @blugart-dev/dsh-superpowers@X.Y.Z`.
   Confirm with `npm run inspect-session` in a fresh session.

## Upstream releases

The weekly `upstream` workflow opens a pull request when obra/superpowers
publishes a release. Before merging one:

- read upstream's release notes against the DSH notes in `overlays/`;
- run the harness;
- release a minor version that names the new upstream version.
