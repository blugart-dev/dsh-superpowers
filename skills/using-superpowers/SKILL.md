---
name: using-superpowers
description: Use when starting any conversation - establishes how to find and use skills, requiring skill invocation before ANY response including clarifying questions
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, ignore this skill.
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill.

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.

This is not negotiable. You cannot rationalize your way out of this.
</EXTREMELY-IMPORTANT>

## The Rule

**Invoke relevant or requested skills BEFORE any response or action** — including clarifying questions, exploring the codebase, or checking files. If it turns out wrong for the situation, you don't have to use it.

**Before entering plan mode:** if you haven't already brainstormed, invoke the brainstorming skill first.

Then announce "Using [skill] to [purpose]" and follow the skill exactly. If it has a checklist, create a todo per item.

## Skill Priority

When multiple skills apply, process skills come first — they set the approach, then implementation skills (frontend-design, etc.) carry it out. Brainstorming and systematic-debugging are Superpowers' most common process skills, but the rule holds for any of them.

- "Let's build X" → brainstorming first, then implementation skills.
- "Fix this bug" → systematic-debugging first, then domain skills.

## Red Flags

These thoughts mean STOP—you're rationalizing:

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first. |
| "I can check git/files quickly" | Files lack conversation context. Check for skills. |
| "Let me gather information first" | Skills tell you HOW to gather information. |
| "This doesn't need a formal skill" | If a skill exists, use it. |
| "I remember this skill" | Skills evolve. Read current version. |
| "This doesn't count as a task" | Action = task. Check for skills. |
| "The skill is overkill" | Simple things become complex. Use it. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |
| "This feels productive" | Undisciplined action wastes time. Skills prevent this. |
| "I know what that means" | Knowing the concept ≠ using the skill. Invoke it. |

## Platform Adaptation

If your harness appears here, read its reference file for special instructions:

- Claude Code: `references/claude-code-tools.md`
- Codex: `references/codex-tools.md`
- Pi: `references/pi-tools.md`
- Antigravity: `references/antigravity-tools.md`
- Hermes Agent: `references/hermes-tools.md`
- Muse: `references/muse-tools.md`
- DeepSeek Harness: `references/dsh-tools.md` — **this is the harness you are on.**

Read `references/dsh-tools.md` for the complete Claude Code → DeepSeek Harness
tool mapping. In short:

| Upstream names | On DeepSeek Harness |
|---|---|
| `Bash` | the `pwsh` tool (Windows) |
| `Read` / `Write` / `Edit` | `read` / `write` / `edit` |
| `Glob` / `Grep` | `glob` / `grep` |
| `TodoWrite` | `todo_write` |
| `Task` (subagent) | `subagent` / `subagent_fork` |
| `ExitPlanMode` | `exit_plan_mode` |
| `AskUserQuestion` | `ask_user_question` |
| `WebFetch` / `WebSearch` | `web_fetch` / `web_search` |
| Load a skill | the `skill` tool |

**Skills are addressed by their bare kebab-case name.** `test-driven-development`,
not `superpowers:test-driven-development`. A prefixed name does not resolve.

**Where skills live.** DeepSeek Harness scans roots in priority order:
`<projectRoot>/.dsh/skills` (100), `<projectRoot>/.agents/skills` (200),
`Config.customSkillDirs` (300), `<dshHome>/skills` (400, i.e. `~/.dsh/skills`),
`<agentsHome>/skills` (500). A skill is a directory bundle `<name>/SKILL.md`
whose frontmatter `name` matches the directory, or a flat `<name>.md`. **Nested
`**/SKILL.md` discovery is not supported** — never nest a skill inside another
skill's folder. The filesystem watcher picks up added bundles live, so a new
skill appears in the catalog without restarting anything. The Superpowers skills
themselves are served by the `dsh-superpowers` bundle at the packaged rank (600),
so a same-named skill in any of those roots overrides them.

**How this bootstrap reaches you.** On Claude Code a session-start hook injects
this skill into every session. DeepSeek Harness has no hook system; here the
`dsh-superpowers` bundle registers this skill as a system-prompt section in
every session of the profile instead, which also survives compaction. If you are
reading this only because you loaded it with the `skill` tool, that section may
not be active. Either way the catalog is not self-triggering: checking it before
you respond is your responsibility.

## User Instructions

User instructions (`AGENTS.md` on DeepSeek Harness; `CLAUDE.md`, `GEMINI.md`, etc. elsewhere; and direct requests) take precedence over skills, which in turn override default behavior. Only skip skill workflows or instructions when your human partner has explicitly told you to.
