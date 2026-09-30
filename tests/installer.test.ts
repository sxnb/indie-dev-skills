import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { destinationBase, exists, installSkills, loadCatalog, relativePath, type Skill } from '../src/library.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const silent = () => {};
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'skills-test-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
const original = (await loadCatalog(root)).find(s => s.name === 'review-pull-request')!;
const external = (await loadCatalog(root)).find(s => s.name === 'logo-design')!;
async function fakeFetch(skill: Skill, checkout: string) {
  const source = join(checkout, skill.path);
  await mkdir(source, { recursive: true });
  await writeFile(join(source, 'SKILL.md'), `---\nname: ${skill.name}\ndescription: Fixture skill.\n---\nFixture instructions.\n`);
  await mkdir(join(source, 'scripts'));
  await writeFile(join(source, 'scripts', 'never-run.js'), 'throw new Error("Do not execute me");');
  for (const notice of skill.notices!) await writeFile(join(checkout, notice), `Notice ${notice}`);
  return source;
}

test('catalog contains original and fully pinned external skill', async () => {
  const catalog = await loadCatalog(root);
  assert.equal(catalog.length, 2);
  assert.equal(original.repository, undefined);
  assert.match(external.commit!, /^[a-f0-9]{40}$/);
});

test('agent destinations use the caller directory or explicit home', () => {
  for (const [agent, folder] of [['claude', '.claude'], ['codex', '.agents']] as const) {
    assert.equal(destinationBase(agent, 'project', root, tmpdir()), join(root, folder, 'skills'));
    assert.equal(destinationBase(agent, 'user', root, tmpdir()), join(tmpdir(), folder, 'skills'));
  }
});

test('installs original resources and MIT notice outside the library', async t => {
  const dir = await fixture(t);
  for (const agent of ['claude', 'codex'] as const) {
    for (const scope of ['project', 'user'] as const) {
      const base = destinationBase(agent, scope, join(dir, 'project'), join(dir, 'home'));
      await installSkills({ root, skills: [original], base, log: silent });
      assert.equal(await readFile(join(base, original.name, 'SKILL.md'), 'utf8'), await readFile(join(root, original.path, 'SKILL.md'), 'utf8'));
      assert.match(await readFile(join(base, original.name, 'LICENSE'), 'utf8'), /Sorin Banica/);
    }
  }
});

test('dry run performs no fetching and creates no destination', async t => {
  const dir = await fixture(t); const base = join(dir, 'absent');
  await installSkills({ root, skills: [original, external], base, dryRun: true, log: silent,
    fetch: async () => { throw new Error('must not fetch'); } });
  assert.equal(await exists(base), false);
});

test('refuses overwrites, while force replaces stale content', async t => {
  const base = await fixture(t);
  const options = { root, skills: [original], base, log: silent };
  await installSkills(options);
  await writeFile(join(base, original.name, 'local.txt'), 'local edits');
  await assert.rejects(installSkills(options), /already exists/);
  assert.equal(await readFile(join(base, original.name, 'local.txt'), 'utf8'), 'local edits');
  await installSkills({ ...options, force: true });
  assert.equal(await exists(join(base, original.name, 'local.txt')), false);
});

test('copies external resources, notices, and provenance without executing scripts', async t => {
  const base = await fixture(t);
  await installSkills({ root, skills: [external], base, fetch: fakeFetch, log: silent });
  assert.equal(await readFile(join(base, external.name, '_upstream/LICENSE'), 'utf8'), 'Notice LICENSE');
  assert.equal(JSON.parse(await readFile(join(base, external.name, '_upstream/provenance.json'), 'utf8')).commit, external.commit);
  assert.equal(await exists(join(base, external.name, 'scripts/never-run.js')), true);
});

test('failed external preparation leaves all existing skills untouched', async t => {
  const base = await fixture(t);
  await installSkills({ root, skills: [original], base, log: silent });
  await writeFile(join(base, original.name, 'local.txt'), 'keep');
  await assert.rejects(installSkills({ root, skills: [original, external], base, force: true, log: silent,
    fetch: async () => { throw new Error('network unavailable'); } }), /network unavailable/);
  assert.equal(await readFile(join(base, original.name, 'local.txt'), 'utf8'), 'keep');
  assert.equal(await exists(join(base, external.name)), false);
});

test('invalid upstream metadata or missing notices leave destination absent', async t => {
  const dir = await fixture(t);
  for (const failure of ['name', 'notice']) {
    const base = join(dir, failure);
    await assert.rejects(installSkills({ root, skills: [external], base, log: silent, fetch: async (skill, checkout) => {
      const source = await fakeFetch(skill, checkout);
      if (failure === 'name') await writeFile(join(source, 'SKILL.md'), '---\nname: wrong\ndescription: Wrong.\n---\nBody');
      else await rm(join(checkout, 'LICENSE'));
      return source;
    } }));
    assert.equal(await exists(base), false);
  }
});

test('rejects symlink destinations even with force', { skip: process.platform === 'win32' }, async t => {
  const dir = await fixture(t); const base = join(dir, 'skills'); const elsewhere = join(dir, 'elsewhere');
  await mkdir(base); await mkdir(elsewhere); await writeFile(join(elsewhere, 'keep'), 'safe');
  await symlink(elsewhere, join(base, original.name));
  await assert.rejects(installSkills({ root, skills: [original], base, force: true, log: silent }), /symlink/);
  assert.equal(await readFile(join(elsewhere, 'keep'), 'utf8'), 'safe');
});

test('rejects symlinks shipped inside external skill content', { skip: process.platform === 'win32' }, async t => {
  const base = join(await fixture(t), 'skills');
  await assert.rejects(installSkills({ root, skills: [external], base, log: silent, fetch: async (skill, checkout) => {
    const source = await fakeFetch(skill, checkout);
    await symlink(join(checkout, 'LICENSE'), join(source, 'linked'));
    return source;
  } }), /Unsupported file type/);
  assert.equal(await exists(base), false);
});

test('rejects path traversal and absolute paths', () => {
  for (const path of ['../escape', '/tmp/escape', 'skills/../../escape', 'C:\\escape', 'a//b', 'a/.git/config']) assert.throws(() => relativePath(path));
  assert.doesNotThrow(() => relativePath('skills/logo-design'));
});

test('manifest validation rejects mutable refs and duplicate names', async t => {
  const dir = await fixture(t);
  await cp(join(root, 'skills'), join(dir, 'skills'), { recursive: true });
  const manifest = await readFile(join(root, 'third-party.yaml'), 'utf8');
  await writeFile(join(dir, 'third-party.yaml'), manifest.replace(external.commit!, 'main'));
  await assert.rejects(loadCatalog(dir), /full commit SHA/);
  await writeFile(join(dir, 'third-party.yaml'), manifest.replace('name: logo-design', 'name: review-pull-request'));
  await assert.rejects(loadCatalog(dir), /Duplicate/);
});

test('rolls back earlier installs if a later destination appears during preparation', async t => {
  const base = await fixture(t);
  await assert.rejects(installSkills({ root, skills: [original, external], base, log: silent, fetch: async (skill, checkout) => {
    const source = await fakeFetch(skill, checkout);
    await mkdir(join(base, external.name));
    await writeFile(join(base, external.name, 'concurrent.txt'), 'preserve');
    return source;
  } }), /appeared during installation/);
  assert.equal(await exists(join(base, original.name)), false);
  assert.equal(await readFile(join(base, external.name, 'concurrent.txt'), 'utf8'), 'preserve');
});

test('GitHub package can install without building or runtime npm dependencies', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.dependencies, undefined);
  for (const name of ['build', 'prepare', 'prepack', 'preinstall', 'install', 'postinstall']) assert.equal(pkg.scripts[name], undefined);
  assert.ok(pkg.files.includes('dist/cli.js'));
  assert.ok(pkg.files.includes('THIRD_PARTY_NOTICES.md'));
});
