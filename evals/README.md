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
npm run eval:harness -- --only gate,subagent --keep    # keep artifacts for inspection
```

| Scenario | Pass when |
|---|---|
| `bootstrap` | the bootstrap is in the system prompt exactly once |
| `route-build`, `route-feature`, `route-bug`, `route-plan`, `route-done` | the expected skill is the first one loaded, before any write |
| `control` | a trivial question loads no methodology skill |
| `gate` | with the gate armed: write denied, then `superpowers-workflow` loaded, then write allowed |
| `subagent` | the parent has the bootstrap and the subagent does not |

**Costs.** It uses your DSH credentials and costs real tokens. Each session is
capped by `--timeout`, 180 s by default. Routing is a model decision, so read the
results as pass rates over several repeats, not a single pass or fail. Reports
are written to `.cache/eval-harness/`.

## Manual: long scenarios

| Scenario | Exercises |
|---|---|
| [dice-lab](dice-lab/) | brainstorming, writing-plans, TDD, systematic debugging against a true claim and a false one, verification, finishing a branch |
