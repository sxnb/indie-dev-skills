import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { assertPlainTree, loadCatalog } from '../src/library.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const skills = await loadCatalog(root);
for (const skill of skills.filter(s => !s.repository)) await assertPlainTree(join(root, skill.path));
console.log(`Validated ${skills.length} catalog entries and all original skill folders.`);
