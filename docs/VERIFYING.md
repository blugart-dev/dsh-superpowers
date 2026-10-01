# Verifying an install

## Verified so far

These results come from a headless profile on DSH `0.2.0-rc.2` (Windows 11), with
the bundle installed from GitHub. See the CONTRIBUTING "End-to-end test" section
for the procedure.

| Behaviour | Evidence from the session log |
|---|---|
| Rows compose, and relative row paths resolve | `--dump-config` lists the 3 rows, with the gate disabled |
| Bootstrap is in the system prompt, once | `inspect-session`: `present once` |
| Skills are served from the package | the `Base directory` points into the installed package |
| An armed gate denies, and the escape hatch recovers | `write` denied, `superpowers-workflow` loaded, retry allowed |

| Skill routing for build, feature, bug, plan and done prompts, without over-triggering | `npm run eval:harness`: 3/3 per scenario (see CHANGELOG 0.2.0) |
| Subagents get no bootstrap | `subagent` scenario: parent 1x, child 0x; also confirmed in DSH Desktop |
| Gate on resume (state rebuilt from the log) | `gate-resume` 3/3 |
| Gate in forks | `gate-fork` 3/3, always "denied, then recovered" (forks do not inherit the current turn) |
| Gate `requiredSkills` | `gate-required` 3/3 |
| Bundle composes on an installed DSH | `npm run compat`, plus the weekly `compat` workflow (latest and next) |
| Visual-companion server starts and serves (Git Bash, outside DSH) | `server-started` JSON, HTTP 200 |

**Not yet verified:**

- **Behaviour on macOS and Linux.** The `compat` workflow covers composition on
  Linux only.
- **Starting the visual companion as a DSH job,** and its page in a browser.

A successful install proves nothing about what the model receives. Verify the
outcome from DSH's own session log instead.

1. Restart DSH. Open a **new** session in any workspace and send one message.
2. From a clone of this repository, run `npm run inspect-session`. To pick a
   workspace, add `-- --workspace <name>`.

| Line | Healthy | If not |
|---|---|---|
| `Bootstrap` | `present once in the system prompt` | **Not present:** the bootstrap row is disabled, or it activated before the system-prompt service existed. Set `diagnosticsLog` on the row and restart. **Present twice or more:** the old `@local` bundles are probably still installed. Remove them. |
| `Skills` | skills appear as the agent loads them | **`(FAILED)` next to a name:** the skill did not resolve. Check that the skills row is enabled and that no older provider shadows it. |
| `Writes … first write` | after the first skill load | **Before any skill:** the agent ignored the bootstrap. That can happen, because the bootstrap is advisory; the gate is the enforcing option. |

## Manual check

Session logs live at
`<dshHome>/sessions/<workspace-slug>/<session-id>/session.v4.jsonl.zstd`. They are
JSONL written as several zstd frames, so decode **every** frame, not just the
first.

- **`system/message` events** hold the assembled system prompt. Search it for
  `You have superpowers.`
- **`tool/call` events named `skill`** are the skill loads.
- **The matching `tool/result`** tells you whether a load succeeded:
  `message.isError`.

## Diagnostics

Add `diagnosticsLog: C:\path\to\file.log` (any absolute path) to a row's config.
That row then appends each activation decision to the file:

```
2026-10-01T11:51:38.321Z [DeepSeek Harness.exe pid 20460] registered: 5104 chars from …/skills/using-superpowers/SKILL.md
```

The executable name tells you which process wrote the line. A Host activation is
written by DSH, and a unit-test run by `node`.
