# Security

## What runs where

Each part of this bundle runs with different privileges:

- **Host plugins** (`src/`). These run inside DeepSeek Harness's Host process,
  outside the workspace sandbox, with the user's permissions. By default they
  read only files shipped in the package. The bootstrap's `skillFile` setting
  can point elsewhere, but only if you set it. The gate also reads the current
  session's own event log.
- **Network and processes.** The plugins open no network connections and spawn
  no processes.
- **Optional diagnostics.** A row with `diagnosticsLog` set appends activation
  lines to the file you name, and to nothing else.
- **Skill helper scripts** (`skills/*/scripts/`). These come from upstream
  Superpowers and run only when an agent executes them, through the session's
  shell tool and its sandbox.
- **Maintainer scripts** (`scripts/`, `evals/`). They run on a maintainer's
  machine and never inside DSH. `eval:harness` runs real sessions with your DSH
  credentials. `bump-upstream` and `sync` fetch from GitHub and verify every file
  against a pinned git blob hash before using it.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Report it privately
through GitHub's **Report a vulnerability** button on the Security tab, and
include the affected version and the steps to reproduce.
