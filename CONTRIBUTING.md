# Contributing

## Original skills

Create `skills/<lowercase-hyphenated-name>/SKILL.md` with YAML `name` and `description` fields and focused Markdown instructions. The folder and name must match. Add scripts, references, or assets only when the workflow needs them, and preserve relative links. Original contributions use the repository's MIT license; the installer supplies its license notice.

Add the skill to the README catalog. Exercise it with a realistic request and a nearby request that should not activate it. Record what was actually checked; metadata validation does not establish behavioral quality.

## Third-party skills

Add an entry to `third-party.yaml`, containing:

- Unique skill name and short description.
- HTTPS GitHub repository URL, repository-relative skill path, and full 40-character commit SHA.
- Author, license scope, and repository-relative license/notice file paths.
- Any usage requirements or asset exceptions in `notes`.

Check the instructions, required resources, scripts, and license scope at the pinned revision. Skills must be self-contained regular files and directories; the installer rejects symlinks and embedded Git metadata. Notice files outside the skill are installed under `_upstream/` with a provenance record. Do not add that reserved directory to an upstream skill.

To update, inspect the diff from the old pin to the proposed pin, recheck notices and dependencies, update the manifest, and test installation in a temporary project. Updates are reviewed commits, never an implicit fetch of `main` during skill installation. Linking to a public repository does not establish redistribution rights for every asset it contains.

## Development and distribution

Use Node.js 22+ and Git:

```sh
npm ci
npm run check
```

The tests use temporary directories and local fixtures; they do not need network access. `npm run check` typechecks, tests, validates the catalog, and rebuilds `dist/cli.js`. Commit source, generated output, and any lockfile changes together. CI rebuilds and fails if the committed bundle is stale.

`package.json` stays private. The build command is `npm run build:cli`. Do not name it `build`: npm treats that name as a reason to rebuild Git dependencies. There are no package lifecycle scripts. The compiled CLI and bundled YAML parser are committed so a GitHub package install needs no build step or runtime npm dependencies. Preserve bundled third-party license comments.

Before tagging a release, test `npm pack` and execute the packed CLI from a separate project, including a real pinned external install. Run it without build/install lifecycle scripts. Create an immutable release tag only after checks pass. A GitHub commit SHA also works as an installer version pin.

Agent installation paths are documented in README. Adding another agent requires verifying its official paths and adding destination tests. Copilot and Gemini CLI are candidates; this release supports only Claude Code and Codex.
