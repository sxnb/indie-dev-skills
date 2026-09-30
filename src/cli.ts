import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { destinationBase, installSkills, loadCatalog, type Agent, type Scope } from './library.ts';

const help = `indie-dev-skills — install original and curated coding-agent skills

Usage:
  indie-dev-skills list
  indie-dev-skills install <skill> --agent claude|codex [--scope project|user]
  indie-dev-skills install --all --agent claude|codex [--scope project|user]

Options:
  --scope project   Install relative to the current directory (default)
  --scope user      Install in your home directory
  --dry-run         Preview destinations; no downloads or writes
  --force           Replace complete existing skill folders (local edits are lost)
  --help            Show this help

Requires Node.js 22+; third-party installs also require Git and network access.`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    agent: { type: 'string' }, scope: { type: 'string' },
    all: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, force: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help || !positionals.length) { console.log(help); return; }
  const [command, name, ...extra] = positionals;
  if (command !== 'install' && command !== 'list') throw new Error(`Unknown command: ${command}. Use --help.`);
  const root = fileURLToPath(new URL('../', import.meta.url));
  const catalog = await loadCatalog(root);
  if (command === 'list') {
    if (name || Object.keys(values).length) throw new Error('list takes no arguments.');
    for (const skill of catalog) console.log(`${skill.name} [${skill.repository ? 'third-party' : 'original'}]\n  ${skill.description}`);
    return;
  }
  if (extra.length || (!!name === !!values.all)) throw new Error('Choose exactly one skill name or --all.');
  if (values.agent !== 'claude' && values.agent !== 'codex') throw new Error('--agent must be claude or codex.');
  const scope = values.scope ?? 'project';
  if (scope !== 'project' && scope !== 'user') throw new Error('--scope must be project or user.');
  const skills = values.all ? catalog : catalog.filter(skill => skill.name === name);
  if (!skills.length) throw new Error(`Unknown skill: ${name}. Use list to see available skills.`);
  await installSkills({ root, skills, base: destinationBase(values.agent as Agent, scope as Scope),
    dryRun: values['dry-run'], force: values.force });
}
main().catch(error => { console.error(`Error: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
