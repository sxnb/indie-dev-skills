import { execFileSync } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, parse as parsePath, resolve } from 'node:path';
import { parse } from 'yaml';

export type Agent = 'claude' | 'codex';
export type Scope = 'project' | 'user';
export interface Skill {
  name: string; description: string; path: string;
  repository?: string; commit?: string; author?: string; license?: string;
  notices?: string[]; notes?: string;
}
export const agentPaths: Record<Agent, string> = { claude: '.claude/skills', codex: '.agents/skills' };
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function validName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.length > 64 || !namePattern.test(name)) throw new Error(`Invalid skill name: ${String(name)}`);
}
export function relativePath(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || isAbsolute(value) || value.includes('\\') || value.split('/').some(p => !p || p === '.' || p === '..' || p === '.git') || value.includes(':')) {
    throw new Error(`Unsafe relative path: ${String(value)}`);
  }
}
function requiredText(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${field}`);
}
export async function skillMetadata(folder: string): Promise<{ name: string; description: string }> {
  const content = await readFile(join(folder, 'SKILL.md'), 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) throw new Error(`Missing YAML frontmatter: ${folder}/SKILL.md`);
  const metadata = parse(match[1]);
  validName(metadata?.name);
  requiredText(metadata?.description, 'skill description');
  if (metadata.description.length > 1024) throw new Error(`Description exceeds 1024 characters: ${folder}`);
  if (metadata.name !== basename(folder)) throw new Error(`Skill name must match folder: ${folder}`);
  if (!content.slice(match[0].length).trim()) throw new Error(`Empty skill body: ${folder}`);
  return metadata;
}
export async function loadCatalog(root: string): Promise<Skill[]> {
  const own: Skill[] = [];
  for (const entry of await readdir(join(root, 'skills'), { withFileTypes: true })) {
    if (!entry.isDirectory()) throw new Error(`Expected skill directory: ${entry.name}`);
    const path = `skills/${entry.name}`;
    own.push({ ...await skillMetadata(join(root, path)), path });
  }
  const manifest = parse(await readFile(join(root, 'third-party.yaml'), 'utf8'));
  if (manifest?.version !== 1 || !Array.isArray(manifest.skills)) throw new Error('Unsupported third-party manifest');
  for (const skill of manifest.skills) {
    validName(skill?.name);
    requiredText(skill.description, 'description');
    relativePath(skill.path);
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(skill.repository ?? '')) throw new Error(`Expected HTTPS GitHub repository: ${skill.name}`);
    if (!/^[a-f0-9]{40}$/.test(skill.commit ?? '')) throw new Error(`Expected full commit SHA: ${skill.name}`);
    requiredText(skill.author, 'author');
    requiredText(skill.license, 'license');
    if (!Array.isArray(skill.notices) || !skill.notices.length) throw new Error(`Missing notices: ${skill.name}`);
    skill.notices.forEach(relativePath);
  }
  const all = [...own, ...manifest.skills] as Skill[];
  if (new Set(all.map(s => s.name)).size !== all.length) throw new Error('Duplicate skill names');
  return all.sort((a, b) => a.name.localeCompare(b.name));
}
export async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
// Refuse linked destination ancestors so --force cannot escape the selected tree.
export async function assertNoSymlinks(path: string): Promise<void> {
  let current = resolve(path);
  const root = parsePath(current).root;
  while (current !== root) {
    if (await exists(current) && (await lstat(current)).isSymbolicLink()) throw new Error(`Refusing symlink: ${current}`);
    current = dirname(current);
  }
}
export async function assertPlainTree(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error(`Unsupported file type: ${path}`);
  if (info.isDirectory()) {
    for (const entry of await readdir(path)) {
      if (entry === '.git') throw new Error(`Unexpected Git metadata in skill: ${path}`);
      await assertPlainTree(join(path, entry));
    }
  }
}
export function destinationBase(agent: Agent, scope: Scope, cwd = process.cwd(), home = homedir()): string {
  return resolve(scope === 'project' ? cwd : home, agentPaths[agent]);
}
function git(args: string[], cwd: string): string {
  try {
    return execFileSync('git', ['-c', 'core.hooksPath=', '-c', 'protocol.file.allow=never', ...args], {
      cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const e = error as NodeJS.ErrnoException & { stderr?: string };
    throw new Error(e.code === 'ENOENT' ? 'Git is required for third-party skills.' : `Git failed: ${e.stderr?.trim() || e.message}`);
  }
}
export async function fetchSkill(skill: Skill, checkout: string): Promise<string> {
  await mkdir(checkout, { recursive: true });
  git(['init', '--quiet', '--template=', '.'], checkout);
  git(['fetch', '--quiet', '--depth=1', skill.repository!, skill.commit!], checkout);
  const commit = git(['rev-parse', 'FETCH_HEAD'], checkout);
  if (commit !== skill.commit) throw new Error(`Commit verification failed for ${skill.name}`);
  git(['-c', 'core.autocrlf=false', 'checkout', '--quiet', '--detach', commit], checkout);
  const source = join(checkout, skill.path);
  await assertNoSymlinks(source);
  return source;
}
export interface InstallOptions {
  root: string; skills: Skill[]; base: string; force?: boolean; dryRun?: boolean;
  log?: (line: string) => void;
  fetch?: typeof fetchSkill;
}
export async function installSkills(options: InstallOptions): Promise<void> {
  const { root, skills, base, force = false, dryRun = false, log = console.log } = options;
  await assertNoSymlinks(base);
  for (const skill of skills) {
    validName(skill.name);
    const target = join(base, skill.name);
    await assertNoSymlinks(target);
    if (await exists(target) && !force) throw new Error(`${target} already exists. Use --force to replace it.`);
    log(`${dryRun ? 'Would install' : 'Installing'} ${skill.name} → ${target}${skill.commit ? ` (${skill.commit})` : ''}`);
    if (skill.notes) log(`  ${skill.notes}`);
  }
  if (dryRun) return;
  // Prepare every skill before touching existing installations, including for --all.
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'indie-dev-skills-')));
  try {
    for (const skill of skills) {
      const checkout = join(temp, `upstream-${skill.name}`);
      const source = skill.repository ? await (options.fetch ?? fetchSkill)(skill, checkout) : join(root, skill.path);
      await assertPlainTree(source);
      const metadata = await skillMetadata(source);
      if (metadata.name !== skill.name) throw new Error(`Upstream skill name mismatch: ${skill.name}`);
      const staged = join(temp, skill.name);
      await cp(source, staged, { recursive: true, errorOnExist: true, force: false });
      if (skill.repository) {
        const noticeDir = join(staged, '_upstream');
        if (await exists(noticeDir)) throw new Error(`Reserved _upstream directory: ${skill.name}`);
        await mkdir(noticeDir);
        for (const notice of skill.notices!) {
          const sourceNotice = join(checkout, notice);
          await assertNoSymlinks(sourceNotice);
          if (!(await lstat(sourceNotice)).isFile()) throw new Error(`Notice is not a file: ${notice}`);
          const destNotice = join(noticeDir, notice);
          await mkdir(dirname(destNotice), { recursive: true });
          await cp(sourceNotice, destNotice);
        }
        await writeFile(join(noticeDir, 'provenance.json'), JSON.stringify(skill, null, 2) + '\n');
      } else {
        if (await exists(join(staged, 'LICENSE'))) throw new Error(`Original skill already has LICENSE: ${skill.name}`);
        await cp(join(root, 'LICENSE'), join(staged, 'LICENSE'));
      }
    }
    await assertNoSymlinks(base);
    await mkdir(base, { recursive: true });
    // Stage on the destination filesystem, then rename with rollback for replacements.
    const transaction = await mkdtemp(join(base, '.indie-install-'));
    const applied: { target: string; backup: string; hadOriginal: boolean }[] = [];
    let retainRecovery = false;
    try {
      for (const skill of skills) {
        const target = join(base, skill.name);
        await assertNoSymlinks(target);
        const hadOriginal = await exists(target);
        if (hadOriginal && !force) throw new Error(`${target} appeared during installation; refusing to overwrite.`);
        const next = join(transaction, `new-${skill.name}`);
        const backup = join(transaction, `old-${skill.name}`);
        await cp(join(temp, skill.name), next, { recursive: true });
        if (hadOriginal) await rename(target, backup);
        try { await rename(next, target); } catch (error) {
          if (hadOriginal) {
            try { await rename(backup, target); } catch (recoveryError) {
              retainRecovery = true;
              throw new Error(`Could not restore ${target}; recovery files retained at ${transaction}. ${String(recoveryError)}`);
            }
          }
          throw error;
        }
        applied.push({ target, backup, hadOriginal });
      }
    } catch (error) {
      for (const item of applied.reverse()) {
        try {
          await rm(item.target, { recursive: true, force: true });
          if (item.hadOriginal) await rename(item.backup, item.target);
        } catch { retainRecovery = true; }
      }
      if (retainRecovery) throw new Error(`Installation failed; some recovery files remain at ${transaction}. Original error: ${String(error)}`);
      throw error;
    } finally { if (!retainRecovery) await rm(transaction, { recursive: true, force: true }); }
    log(`Installed ${skills.length} skill(s). Reload your agent if they do not appear.`);
  } finally { await rm(temp, { recursive: true, force: true }); }
}
