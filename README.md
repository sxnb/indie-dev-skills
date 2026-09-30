# Indie Dev Skills

A personal, public library of coding-agent skills: original workflows by Sorin Banica and curated third-party skills pinned to reviewed upstream commits.

Use one TypeScript CLI to install individual skills into Claude Code or Codex. Distribution is through GitHub; nothing is published to the npm registry.

## Skills

| Skill | Origin | Purpose |
| --- | --- | --- |
| [review-pull-request](skills/review-pull-request/SKILL.md) | Original | Review changes using **critical**, **would-fix**, **nice-to-have**, and **nit** categories. |
| [logo-design](https://github.com/kaankiziltug/logo-design-skill) | kaankiziltug | Logo design, SVG tooling, and visual references. Fetched from the commit in [third-party.yaml](third-party.yaml). |

Third-party files are not vendored here. Installation fetches their pinned revision, copies the complete skill folder, and includes applicable upstream notices and provenance. The logo-design code and instructions use MIT; its reference logos are excluded from that license. Its tools require Python 3. See the upstream [trademark and asset notice](https://github.com/kaankiziltug/logo-design-skill/blob/0ecf52e9a4b3ac92b714f7cc6e3148ab8c774134/TRADEMARKS.md).

## Install from another project

Requires **Node.js 22+**, npm, and network access to fetch the CLI. Installing third-party skills also requires **Git** and network access to GitHub. No global installation or change to your project's `package.json` is needed.

From your target project's directory:

```sh
npx --package=github:sxnb/indie-dev-skills \
  indie-dev-skills install review-pull-request --agent claude --scope project
```

Install the external logo skill for Codex:

```sh
npx --package=github:sxnb/indie-dev-skills \
  indie-dev-skills install logo-design --agent codex --scope project
```

Preview installing everything:

```sh
npx --package=github:sxnb/indie-dev-skills \
  indie-dev-skills install --all --agent codex --scope project --dry-run
```

The installer does not download skills or write files during a dry run. `npx` may still download/cache the CLI itself before it starts.

Use `list` to browse the catalog, `--scope user` for personal installation, and `--help` for usage. `--scope` defaults to `project`; `--agent` is required. Run once per agent when installing for both.

| Agent | Project destination (relative to current directory) | User destination |
| --- | --- | --- |
| Claude Code (`claude`) | `.claude/skills/<name>` | `~/.claude/skills/<name>` |
| Codex (`codex`) | `.agents/skills/<name>` | `~/.agents/skills/<name>` |

Run from the project root if you want project-wide discovery. Paths follow the official [Claude Code](https://code.claude.com/docs/en/skills) and [Codex](https://learn.chatgpt.com/docs/build-skills) documentation. Installation layout is tested automatically; live model behavior must be evaluated separately. Reload the agent if a newly installed skill does not appear.

For repeatable CLI versions, append `#<full-commit-sha>` or an existing release tag to the GitHub package reference. An unpinned reference uses the default branch as resolved by npm and may be cached. External skills always use the commit recorded in that CLI version's manifest.

## Updates and replacement

Existing skill folders are preserved by default. To update an installed skill, rerun the installer using the desired CLI revision and pass `--force`. This replaces the complete selected skill folder, including local edits. Preview first with `--dry-run --force`. Unselected skills are unaffected.

The installer prepares all requested skills before replacing existing installations, uses staged renames with rollback on installation errors, and rejects symlinks in skill content and destination paths. Installation copies files without running upstream scripts, hooks, or package installers. This does not audit or sandbox a skill when your agent later uses it.

## Work on the library locally

```sh
git clone https://github.com/sxnb/indie-dev-skills.git
cd indie-dev-skills
npm ci
npm run check
npm link
```

Then, from another project's directory:

```sh
indie-dev-skills install review-pull-request --agent codex --scope project
```

Alternatively, invoke the compiled CLI by absolute path with Node from your target project. Build after changing TypeScript. The original skills and manifest are resolved relative to the CLI package, not your target project.

See [CONTRIBUTING.md](CONTRIBUTING.md) for authoring, third-party updates, and checks. The small initial scope is Claude Code and Codex; Copilot and Gemini CLI support can follow.

## License

Original skills and installer source are [MIT licensed](LICENSE). Installed original skills include that license. External skills retain their upstream licenses and exclusions; the repository's MIT license does not relicense external material. The compiled CLI includes YAML parser license attribution.
