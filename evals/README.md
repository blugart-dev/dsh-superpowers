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

| Scenario | Exercises |
|---|---|
| [dice-lab](dice-lab/) | brainstorming, writing-plans, TDD, systematic debugging against a true claim and a false one, verification, finishing a branch |
