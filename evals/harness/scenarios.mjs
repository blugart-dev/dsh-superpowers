/**
 * Behavioural scenarios for `npm run eval:harness`.
 *
 * Each scenario is one real headless DSH session in a fresh, empty workspace:
 *   - `files`    fixture files written into the workspace before the run;
 *   - `overlay`  an optional profile patch passed with --patch;
 *   - `prompt`   the only user message - it never names a skill, because
 *                naming one would steer the agent;
 *   - `check`    a pure function of the session summary (and, for subagent
 *                scenarios, the child summaries) returning { pass, detail }.
 *
 * Checks read summarizeSession() output, so they score what DSH logged, not
 * what the agent says it did.
 */

/** Loaded skills that count as methodology choices (the bootstrap skill does not). */
export function firstMethodologySkill(summary) {
  return summary.skillLoads.find((load) => load.ok !== false && load.name !== 'using-superpowers');
}

/** Pass when the first methodology skill is one of `expected` and precedes any write. */
function routesTo(expected) {
  return (summary) => {
    const first = firstMethodologySkill(summary);
    if (first === undefined) return { pass: false, detail: 'no skill loaded' };
    if (!expected.includes(first.name)) return { pass: false, detail: `first skill was ${first.name}` };
    if (summary.firstWriteTime !== undefined && summary.firstWriteTime < first.time) {
      return { pass: false, detail: `${first.name} loaded only after the first write` };
    }
    return { pass: true, detail: `${first.name} first` };
  };
}

/** A profile patch that arms the gate. */
function gateOverlay({ bootstrap, announce }) {
  return [
    '- id: dsh-superpowers-bootstrap',
    '  config:',
    `    bootstrap: ${bootstrap}`,
    '- id: dsh-superpowers-gate',
    '  disabled: false',
    '  config:',
    '    gate: true',
    '    artifactsWritable: true',
    '    artifactPrefixes: [docs/superpowers/plans/, docs/superpowers/specs/, research/, notes/]',
    '    escapeSkill: { enabled: true, name: superpowers-workflow }',
    `    announceInPrompt: ${announce}`,
    ''
  ].join('\n');
}

const NODE_PROJECT = {
  'package.json': JSON.stringify({ name: 'fixture', type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n'
};

export const SCENARIOS = [
  {
    id: 'bootstrap',
    prompt: 'Reply with exactly one word: ready',
    check: (summary) => ({
      pass: summary.bootstrapCount === 1,
      detail: `bootstrap present ${summary.bootstrapCount}x`
    })
  },
  {
    id: 'route-build',
    prompt: "Let's build a small command-line tool that converts temperatures between Celsius and Fahrenheit.",
    check: routesTo(['brainstorming'])
  },
  {
    id: 'route-feature',
    files: {
      ...NODE_PROJECT,
      'src/parse.js': 'export function parseAge(text) {\n  return Number.parseInt(text, 10);\n}\n',
      'test/parse.test.js':
        "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { parseAge } from '../src/parse.js';\n\n" +
        "test('parses a number', () => assert.equal(parseAge('42'), 42));\n"
    },
    prompt: 'Add validation to parseAge in src/parse.js so that negative ages throw a RangeError.',
    check: routesTo(['brainstorming', 'test-driven-development'])
  },
  {
    id: 'route-bug',
    files: {
      ...NODE_PROJECT,
      'src/sum.js': 'export function sum(a, b) {\n  return a + b - 1;\n}\n',
      'test/sum.test.js':
        "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from '../src/sum.js';\n\n" +
        "test('adds', () => assert.equal(sum(2, 3), 5));\n"
    },
    prompt: 'npm test is failing: test/sum.test.js expects 5 but gets 4. Please fix it.',
    check: routesTo(['systematic-debugging'])
  },
  {
    id: 'route-plan',
    files: {
      'docs/spec.md':
        '# Spec: word counter (approved)\n\nA CLI `wc-lite <file>` that prints the number of words in a UTF-8 text file.\n' +
        'Words are maximal runs of non-whitespace. Exit 1 with a message if the file is missing.\n' +
        'Node, no dependencies, tests with node:test.\n'
    },
    prompt: 'The spec in docs/spec.md has been approved. Write the implementation plan for it.',
    check: routesTo(['writing-plans'])
  },
  {
    id: 'route-done',
    files: {
      ...NODE_PROJECT,
      'src/greet.js': "export const greet = (name) => `Hello, ${name}!`;\n",
      'test/greet.test.js':
        "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { greet } from '../src/greet.js';\n\n" +
        "test('greets', () => assert.equal(greet('Ada'), 'Hello, Ada!'));\n"
    },
    prompt: "I've finished refactoring greet.js. Confirm it's done so I can ship it.",
    check: routesTo(['verification-before-completion'])
  },
  {
    id: 'control',
    prompt: 'What is 17 times 3? Answer with just the number.',
    check: (summary) => {
      const first = firstMethodologySkill(summary);
      return first === undefined
        ? { pass: true, detail: 'no methodology skill loaded' }
        : { pass: false, detail: `over-triggered: ${first.name}` };
    }
  },
  {
    // Mechanics: the agent is not told about the gate (no bootstrap, no
    // announcement), so its first write must be denied and then recovered.
    id: 'gate-deny',
    overlay: gateOverlay({ bootstrap: false, announce: false }),
    prompt:
      'Use the write tool right now to create src/hello.txt containing the word hi. ' +
      'If a tool call is refused, follow the instructions in the refusal and retry once.',
    check: (summary) => {
      const denied = summary.writes.find((w) => w.denied === true);
      const escape = summary.skillLoads.find((l) => l.name === 'superpowers-workflow' && l.ok !== false);
      const allowed = summary.writes.find((w) => w.denied === false && denied && w.time > denied.time);
      if (!denied) return { pass: false, detail: 'no write was denied' };
      if (!escape || escape.time < denied.time) return { pass: false, detail: 'escape skill not loaded after the denial' };
      if (!allowed || allowed.time < escape.time) return { pass: false, detail: 'no allowed write after the escape skill' };
      return { pass: true, detail: 'denied -> superpowers-workflow -> allowed' };
    }
  },
  {
    // Behaviour: the realistic configuration (bootstrap and announcement on).
    // The gate should push the agent to the skill for its task; loading the
    // escape hatch pre-emptively, with no denial to recover from, is the failure.
    id: 'gate-steer',
    // A bug fix: Superpowers writes it without stopping for design approval,
    // which a feature request would (headless has nobody to approve).
    overlay: gateOverlay({ bootstrap: true, announce: true }),
    files: {
      ...NODE_PROJECT,
      'src/sum.js': 'export function sum(a, b) {\n  return a + b - 1;\n}\n',
      'test/sum.test.js':
        "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from '../src/sum.js';\n\n" +
        "test('adds', () => assert.equal(sum(2, 3), 5));\n"
    },
    prompt: 'npm test is failing: test/sum.test.js expects 5 but gets 4. Please fix it.',
    check: (summary) => {
      const firstWrite = summary.writes[0];
      if (firstWrite === undefined) return { pass: false, detail: 'nothing was written' };
      const firstDenial = summary.writes.find((w) => w.denied === true);
      const ritual = summary.skillLoads.find(
        (l) => l.name === 'superpowers-workflow' && (firstDenial === undefined || l.time < firstDenial.time)
      );
      if (ritual) return { pass: false, detail: 'escape hatch loaded pre-emptively (ritual)' };
      const before = summary.skillLoads.filter((l) => l.ok !== false && l.time < firstWrite.time);
      const methodology = before.find((l) => l.name !== 'superpowers-workflow' && l.name !== 'using-superpowers');
      if (methodology) return { pass: true, detail: `${methodology.name} before the first write` };
      return firstWrite.denied
        ? { pass: true, detail: 'denied, then recovered' }
        : { pass: false, detail: 'first write allowed with no skill loaded' };
    }
  },
  {
    id: 'subagent',
    prompt:
      'Use the subagent tool to start one subagent whose whole task is to reply with the single word pong. ' +
      'Then tell me what it replied.',
    check: (summary, children = []) => {
      if (summary.bootstrapCount !== 1) return { pass: false, detail: `parent bootstrap ${summary.bootstrapCount}x` };
      if (children.length === 0) return { pass: false, detail: 'no subagent session found' };
      const leaking = children.filter((child) => child.bootstrapCount > 0).length;
      return leaking === 0
        ? { pass: true, detail: `parent 1x, ${children.length} child(ren) 0x` }
        : { pass: false, detail: `${leaking} of ${children.length} child(ren) carry the bootstrap` };
    }
  }
];
