import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, realpath, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const project = await realpath(await mkdtemp(join(tmpdir(), 'skills-cli-smoke-')));
const run = args => execFileSync(process.execPath, [cli, ...args], { cwd: project, encoding: 'utf8' });
try {
  assert.match(run(['list']), /logo-design \[third-party\]/);
  assert.match(run(['--help']), /Usage:/);
  assert.match(run(['install', '--all', '--agent', 'codex', '--dry-run']), /Would install/);
  for (const [agent, folder] of [['claude', '.claude'], ['codex', '.agents']]) {
    run(['install', 'review-pull-request', '--agent', agent]);
    assert.match(await readFile(join(project, folder, 'skills/review-pull-request/SKILL.md'), 'utf8'), /would-fix/);
    assert.notEqual(spawnSync(process.execPath, [cli, 'install', 'review-pull-request', '--agent', agent], { cwd: project }).status, 0);
  }
  for (const args of [ ['install', 'missing', '--agent', 'codex'], ['install', '--all', 'review-pull-request', '--agent', 'claude'], ['install', 'review-pull-request', '--agent', 'wrong'], ['install', 'review-pull-request', '--agent', 'claude', '--scope', 'wrong'], ['install', 'review-pull-request', '--agent', 'claude', '--unknown'] ]) {
    assert.notEqual(spawnSync(process.execPath, [cli, ...args], { cwd: project }).status, 0);
  }
  console.log('Compiled CLI smoke checks passed from a separate project.');
} finally { await rm(project, { recursive: true, force: true }); }
