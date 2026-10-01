# Behavioural evals

Unit tests prove the bundle registers its pieces. They cannot prove that DSH then
*behaves* the Superpowers way. These scenarios check that, by running a real
session and reading its log afterwards.

Rules that keep an eval honest:

- **Run it in its own empty workspace, never inside this repository.** An agent
  that can read the rubric is no longer being tested. Earlier attempts were
  contaminated exactly this way.
- **Paste the prompts exactly as written.** Wording that mentions skills or
  Superpowers steers the agent.
- **Use the default permission mode** unless the scenario says otherwise.
- **Score from the log, not from the agent's own summary.**

## Automated: `npm run eval:harness`

[`harness/`](harness/) runs short scenarios as real headless DSH sessions and scores
each one from its session log. It works like upstream's `claude -p` suite:

1. **Install what users get.** `npm pack` the repository, then install the
   tarball into a throwaway headless profile.
2. **Run each scenario in isolation.** Every scenario gets its own empty temporary
   workspace, with fixture files where the scenario needs them.
3. **Score from the logs** with the checks in [`harness/scenarios.mjs`](harness/scenarios.mjs).
4. **Clean up.** Remove the profile, the workspaces and their sessions.

```
npm run eval:harness                                   # every scenario once
npm run eval:harness -- --repeat 3                     # pass rates
npm run eval:harness -- --only gate-deny,subagent --keep  # keep artifacts for inspection
```

Scenarios can span several turns: each `followUps` prompt resumes the same
session with `--session-id` in a fresh process. "Mechanics" scenarios instruct
the agent directly, because they test machinery rather than routing.

| Scenario | Pass when |
|---|---|
| `bootstrap` | the bootstrap is in the system prompt exactly once |
| `acceptance` | upstream's definition-of-done prompt, "Let's make a react todo list", loads `brainstorming` before any code |
| `prefix` | a `superpowers:`-prefixed skill reference loads the bare-named skill |
| `route-build`, `route-feature`, `route-bug`, `route-plan`, `route-done` | the expected skill is the first one loaded, before any write |
| `wrap-up` | told "I already ran the tests", the agent runs them itself before calling the work ready |
| `wrap-up-own` | two turns. After its *own* earlier test run, "wrap it up" still makes it re-run the tests. **Expect about 2/3, not 3/3:** restating an earlier result is a model behaviour seen in about a third of runs, in every bundle version measured |
| `control` | a trivial question loads no methodology skill |
| `gate-deny` | gate armed, with no announcement: write denied, then `superpowers-workflow` loaded, then write allowed |
| `gate-steer` | gate armed, with bootstrap and announcement on: a real skill comes before the first write, and the escape hatch is never loaded as a ritual |
| `gate-required` | with `requiredSkills: [test-driven-development]`, a write after loading only `brainstorming` is denied |
| `gate-resume` | the skill is loaded in turn 1, and the write in resumed turn 2 is allowed, so state is rebuilt from the log |
| `gate-fork` | a forked subagent ends up writing, either through inherited state or by being denied and then recovering |
| `subagent` | the parent has the bootstrap and the subagent does not |

**Fixtures must run inside the sandbox.** Harness sessions use DSH's default
`workspace-write` sandbox, where a process cannot open pipes to its children. A
fixture test script must therefore be `node --test --test-isolation=none`; plain
`node --test` fails with `spawn EPERM`. A unit test enforces this.

**Comparing releases.** `--bundle <dir>` installs another checkout's bundle,
for example an older tag in a `git worktree`, under the current scenarios. That
keeps an A/B honest: only the bundle differs.

**Costs.** It uses your DSH credentials and costs real tokens. Each session is
capped by `--timeout`, 180 s by default. Routing is a model decision, so read the
results as pass rates over several repeats, not a single pass or fail. Reports
are written to `.cache/eval-harness/`.

## Manual: long scenarios

| Scenario | Exercises |
|---|---|
| [dice-lab](dice-lab/) | brainstorming, writing-plans, TDD, systematic debugging against a true claim and a false one, verification, finishing a branch |
