import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import apply, {
  PROVIDER_NAME,
  PACKAGED_RANK,
  SKILLS_DIR,
  createProvider,
  parseFrontmatter
} from '../src/skills.js';

const shipped = readdirSync(fileURLToPath(new URL('../skills/', import.meta.url)), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

test('frontmatter: plain, double-quoted and single-quoted scalars', () => {
  const parsed = parseFrontmatter(
    '---\nname: a-skill\ndescription: "Use when \\"quoted\\" - yes"\nwhenToUse: \'it\'\'s fine\'\n---\n\n# Body\n'
  );
  assert.deepEqual(parsed.data, { name: 'a-skill', description: 'Use when "quoted" - yes', whenToUse: "it's fine" });
  assert.equal(parsed.body, '\n# Body\n');
});

test('frontmatter: CRLF files parse the same', () => {
  const parsed = parseFrontmatter('---\r\nname: x\r\ndescription: y\r\n---\r\nbody\r\n');
  assert.deepEqual(parsed.data, { name: 'x', description: 'y' });
});

test('frontmatter: a file without a block is rejected', () => {
  assert.equal(parseFrontmatter('# no frontmatter\n'), null);
});

test('the provider lists every shipped skill with the registry contract fields', async () => {
  const provider = createProvider({ dir: SKILLS_DIR });
  const candidates = await provider.list({ cwd: process.cwd() });
  assert.deepEqual(candidates.map((c) => c.name), shipped);
  assert.equal(shipped.length, 15);
  for (const candidate of candidates) {
    assert.equal(candidate.provider, PROVIDER_NAME);
    assert.equal(candidate.rank, PACKAGED_RANK);
    assert.equal(typeof candidate.source, 'string');
    assert.ok(candidate.description.length > 0);
    assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: true });
    assert.equal(candidate.resourceBase.kind, 'directory');
    assert.ok(candidate.resourceBase.path.endsWith(candidate.name));
  }
});

test('get() returns the body without frontmatter, with a directory resource base', async () => {
  const provider = createProvider({ dir: SKILLS_DIR });
  const [candidate] = (await provider.list({ cwd: process.cwd() })).filter((c) => c.name === 'test-driven-development');
  const skill = await provider.get(candidate, {});
  assert.equal(skill.name, 'test-driven-development');
  assert.equal(skill.provider, PROVIDER_NAME);
  assert.ok(!skill.content.startsWith('---'));
  assert.match(skill.content, /^# Test-Driven Development/);
  assert.equal(skill.resourceBase.path, candidate.resourceBase.path);
});

test('a skill whose frontmatter name differs from its directory is skipped', async () => {
  const warnings = [];
  const provider = createProvider({
    dir: fileURLToPath(new URL('./fixtures/mismatched-skills/', import.meta.url)),
    warn: (message) => warnings.push(message)
  });
  const candidates = await provider.list({ cwd: process.cwd() });
  assert.deepEqual(candidates.map((c) => c.name), ['good-skill']);
  assert.match(warnings.join('\n'), /wrong-dir/);
});

test('the plugin registers one provider with the skill registry', () => {
  const registered = [];
  const ctx = {
    skills: {
      registerProvider(create) {
        registered.push(create({ signal: new AbortController().signal, invalidate() {} }));
        return () => {};
      }
    },
    logger: { warn() {} }
  };
  apply(ctx, {});
  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, PROVIDER_NAME);
  assert.deepEqual(apply.inject, ['skills']);
});
