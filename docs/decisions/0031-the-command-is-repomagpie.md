# 0031 — The command is `repomagpie`

**Status:** accepted (2026-10-13). Amends the command name in [0002](0002-cli-first.md) ("a CLI (`magpie`)") and settles the question [0015](0015-typescript-on-node.md) left to the spec ("whether the installed command is still called `magpie`"). The package name, the journal folders and the note format are unchanged.

## Context
Two other projects in our own space use the name `magpie`. Both were checked on 2026-10-13.

- **[yetone/magpie](https://github.com/yetone/magpie/blob/main/docs/reference.md)** switches the model behind coding agents. It was created on 2026-09-23 and has about 10k stars.
  - Its CLI is also called `magpie`, and it also has a `magpie import`.
  - It writes `~/.claude/settings.json`, the file that holds our hook entry.
  - Its own data lives in `~/.config/magpie/`, so it doesn't collide with our journals.
  - It reads about twenty `MAGPIE_*` environment variables, among them `MAGPIE_DEBUG`, `MAGPIE_ADDR` and `MAGPIE_THEME`.
- **[Apache Magpie](https://magpie.apache.org/start)** is a framework of agent skills. Its Claude Code plugins are named `magpie-*` (`magpie-setup`, `magpie-agent-guard`, `magpie-utilities`), and it links its skills into `.claude/skills/` and `.agents/skills/` under the same prefix.

On a machine with both CLIs, `PATH` decides which `magpie` runs. Our hook (`magpie hook claude-code`) and our skill (`magpie recall`) can then call the other program. The hook fails open ([spec](../spec.md), section 6), so the user loses the warning before an install and nothing tells them.

## Decision

### The command
- `package.json`'s `bin` has two names for the same file: **`repomagpie`**, the canonical command, and **`magpie`**, a short alias.
- `npx repomagpie …` runs the CLI. A package with two bins makes npx pick by name, so a test against a packed tarball checks which one it runs.
- `--help` and `--version` name `repomagpie`.

### Where each name is used
- **Everything a machine runs uses `repomagpie`:**
  - the hook entry in the docs and in `repomagpie hook claude-code --help`;
  - `SKILL.md` and its references;
  - help, error and hint text that suggests a command (`+1 more (repomagpie recall pdfkit --full)`);
  - the app's copy-paste snippets;
  - later, `setup` and the MCP server's config.
- **Docs for people** (the README, the spec, `docs/ui.md`, `--help`) show `repomagpie`. Each says once that `magpie` works as a short alias when no other `magpie` is on `PATH`.
- A check in the `check:*` family fails when a doc or `SKILL.md` tells someone to run `magpie …`. The one alias sentence is allowed, and so are decision records and the changelog's past releases, which record what was true then.

### Output prefixes
- The hook's texts start with `RepoMagpie:`.
- CLI messages start with `repomagpie:` (`repomagpie note: …`, `repomagpie ui: …`), instead of `magpie:`.

### The skill
- The skill is named `repomagpie`, in its folder name and in its frontmatter `name`. It is never `magpie` or `magpie-*`, which is Apache Magpie's prefix.
- It has had that name since it was first committed (`skills/repomagpie/`), so no one has an old skill to remove and nothing is renamed.

### Environment variables
We read three:

| Variable | What for | Clash? |
|---|---|---|
| `MAGPIE_HOME` | the personal journal's folder ([0016](0016-journal-locations-and-config.md)) | No. yetone/magpie's reference doesn't name it (checked 2026-10-13). |
| `GITHUB_TOKEN` | GitHub requests | No. A standard name, read on purpose. |
| `NO_COLOR` | no colour ([no-color.org](https://no-color.org/)) | No. A standard name, read on purpose. |

None collides with a documented variable, so none is renamed.

### Unchanged
- The npm package `repomagpie`.
- The folders `~/.magpie` and `.magpie/`.
- The note format.

In prose, the product is always "RepoMagpie", never a bare "Magpie".

### Existing setups
- A hook entry that calls `magpie hook claude-code` keeps working through the alias.
- The docs' hook section shows `repomagpie hook claude-code`. The planned `setup` command will move old entries to the new name.

## Consequences
- What a machine runs no longer depends on which `magpie` comes first on `PATH`. A user who has only RepoMagpie can still type `magpie`.
- **The alias can shadow yetone/magpie.** If both are installed, our `magpie` and theirs compete for the same name on `PATH`, and installing RepoMagpie can change what their users' `magpie` runs. Reconsider the alias before 1.0.
- `MAGPIE_HOME` is in a namespace another tool uses. If yetone/magpie ever documents its own `MAGPIE_HOME`, we add `REPOMAGPIE_HOME`, keep `MAGPIE_HOME` as a fallback, and say so in the changelog.
- Text changes for every user: the hook's prefixes, error messages and hints. Golden outputs and the skill's tests change with them. These are human texts, not `--json` fields, so the JSON contract ([0008](0008-machine-readable-output.md), [0023](0023-api-is-the-json-contract.md)) is unchanged.
- Earlier records keep `magpie …` in their examples. They describe the same command, which is now `repomagpie`, with `magpie` as its alias.
- `CHANGELOG.md` lists the new name under Changed, with the alias kept.
