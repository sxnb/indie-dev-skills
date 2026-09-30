import { build } from 'esbuild';
import { chmod, readFile } from 'node:fs/promises';
await build({ entryPoints: ['src/cli.ts'], outfile: 'dist/cli.js', bundle: true,
  platform: 'node', target: 'node22', format: 'esm', legalComments: 'inline',
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as bundledCreateRequire } from \'node:module\';\nconst require = bundledCreateRequire(import.meta.url);\n/*!\n' + await readFile('node_modules/yaml/LICENSE', 'utf8') + '\n*/' } });
await chmod('dist/cli.js', 0o755);
