# Working in this repository

This repository contains original Agent Skills and a manifest of pinned third-party skills. The installer is written in TypeScript and distributed directly through GitHub; it is not published to npm.

- Original skills live in `skills/<name>/SKILL.md`. Keep names unique across original and external skills. Put only workflow-relevant information in skills; shared installation and maintenance instructions belong in repository documentation.
- Third-party skills remain upstream. Record full commit SHAs, source paths, attribution, and applicable notices in `third-party.yaml`. Review the upstream diff and license changes before updating a pin. Do not silently modify third-party instructions during installation.
- `src/` is the installer source. Commit `dist/cli.js` after building; GitHub installs must work without lifecycle scripts or a TypeScript compiler. Do not hand-edit generated output.
- Installation resolves bundled resources relative to the package and project destinations relative to the caller's working directory. Preserve this distinction.
- Do not execute third-party scripts during installation. Keep dry runs free of downloads and writes, refuse overwrites without `--force`, and preserve existing installations on preparation failures.
- Run `npm run check` after installer or catalog changes. Tests must use temporary destinations, never real personal skill directories. Changes to installer behavior require meaningful tests; prose edits need proportionate review.
- The supported installer targets are Claude Code and Codex. Do not claim live agent validation based only on filesystem tests.
