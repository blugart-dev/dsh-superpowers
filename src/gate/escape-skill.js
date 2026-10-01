/**
 * The escape-hatch skill content, embedded as a literal.
 *
 * Why embedded rather than read from disk: this skill is the *only* documented
 * way out of the write gate, so it must be registrable synchronously during
 * `apply()` with no I/O that could fail. Reading it from the workspace would
 * make the recovery path depend on the workspace being readable and on a
 * filesystem skill provider existing - and the provider is exactly what is
 * missing in this profile.
 *
 * This is not a substitute for the vendored Superpowers skills. It is the gate's
 * own recovery document, and it carries the three Iron Laws so that loading it
 * delivers real value rather than merely clearing a flag.
 *
 * @module @blugart-dev/dsh-superpowers/gate/escape-skill
 */

export const ESCAPE_SKILL_NAME = 'superpowers-workflow';

export const ESCAPE_SKILL_DESCRIPTION =
  'Load this to clear the Superpowers workflow write gate. Explains why source writes are ' +
  'blocked, which methodology skill applies to the task in front of you, and the three Iron Laws.';

export const ESCAPE_SKILL_CONTENT = `# Superpowers workflow gate

You loaded this skill, so the write gate is now clear for the rest of this
session. Nothing else is required to unblock a \`write\` or \`edit\`.

## Why you were blocked

This session runs a Harness plugin that refuses \`write\` and \`edit\` calls to
workspace source files until the session has loaded a skill. The reason is
measured, not theoretical: skills route reliably, but the Superpowers bootstrap
is plain text in \`AGENTS.md\`, and text is something an agent weighs rather than
something that binds it. The gate makes the first step of the methodology
mechanical instead of advisory.

## The three Iron Laws

These are not suggestions. They are the part of the methodology that the gate
exists to protect.

1. **NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.** Write the test, watch it
   fail for the right reason, then write the minimum code to pass. Code written
   before its test is deleted, not retro-fitted.
2. **NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.** Trace the failure to its
   origin before changing anything. Three failed fixes means question the
   architecture, not attempt a fourth.
3. **NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.** Run the command,
   read the output, then make the claim. A summary is a claim, not evidence.

## Which skill actually applies

This skill clears the gate; it does not replace the methodology. Route by intent
before you write:

| Situation | Skill |
|---|---|
| "Let's build X", "add a feature" | \`brainstorming\`, then \`writing-plans\` |
| Fixing a bug, any test failure | \`systematic-debugging\` |
| Writing any feature or bugfix code | \`test-driven-development\` |
| About to claim something is done or passing | \`verification-before-completion\` |
| Reviewing a change | \`requesting-code-review\` |
| Finishing a branch | \`finishing-a-development-branch\` |

Load the applicable one with the \`skill\` tool before writing code.

## What this gate does NOT cover

- **It gates \`write\` and \`edit\`, not shells.** A file written through \`pwsh\`
  is not intercepted. This is a deliberate limit, not an oversight: classifying
  an arbitrary command line needs a parser this increment does not have.
- **It does not check that you followed the skill.** It checks that you loaded
  one. Loading a skill is necessary, not sufficient.
- **It exempts the workflow's own artifacts** (plans, specs, research notes), so
  you can always write the plan that precedes the code.

## If the gate is wrong

Tell the user. Do not route around it with a shell command - that defeats the
only mechanism holding the workflow in place. A user can disable the gate with
the plugin config flag \`gate: false\`.
`;
