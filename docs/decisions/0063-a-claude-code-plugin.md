# 0063 — The npm package is a Claude Code plugin

**Status:** accepted (2026-11-13, from the maintainer's brief "distribute RepoMagpie as a Claude Code plugin" and their answers to its report). Refines [0035](0035-setup-and-doctor.md)'s "How agents launch RepoMagpie" for the plugin's two entries only: they start `node` by name from `PATH` instead of by absolute path (rule 3 below). `setup`'s entries, and [0061](0061-the-hook-form-follows-claude-code-version.md)'s rule for them, are unchanged. The read-only MCP server of rule 2, and `check:build`'s "without `note`" in rule 4, are refined by [0064](0064-the-plugin-note-tool-behind-a-switch.md) (2026-11-13): the `note` tool sits behind a `note_tool` switch, off by default since [0065](0065-the-plugin-note-tool-off-by-default.md); `bin/` was dropped. The node-missing check before the marketplace goes live is superseded by [0066](0066-the-node-missing-check-after-launch.md) (2026-11-13): it comes after launch; the older-`node` check ran and found nothing to guard.

## Context
For Claude Code, `repomagpie setup` writes three things: the MCP entry (through `claude mcp add`), the skill (a link in `~/.claude/skills/`) and the hook (in `~/.claude/settings.json`). The user has to install the npm package globally and run `setup` first.

A Claude Code plugin ships skills, MCP servers and hooks as one unit that Claude Code installs and turns on. What the official documentation said when this was decided (read on 2026-11-13: [plugins reference](https://code.claude.com/docs/en/plugins-reference), [plugins](https://code.claude.com/docs/en/plugins), [plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), [discover plugins](https://code.claude.com/docs/en/discover-plugins), [hooks](https://code.claude.com/docs/en/hooks), [MCP](https://code.claude.com/docs/en/mcp)):
- **Manifest:** `.claude-plugin/plugin.json`, where only `name` is required. A `version`, once set, decides when an installed plugin updates: users stay on the cached copy until it changes.
- **Components:** a `skills/` folder at the plugin's root is read by default. MCP servers and hooks can be written inline in `plugin.json` (`mcpServers`, `hooks`), or in `.mcp.json` and `hooks/hooks.json`.
- **Paths:** an installed plugin is copied into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. `${CLAUDE_PLUGIN_ROOT}` names that folder in a command and its arguments, and the folder changes with every version. The other variables are `${CLAUDE_PLUGIN_DATA}`, `${CLAUDE_PROJECT_DIR}` and `${user_config.*}`. None names the user's `node`.
- **Hooks:** the exec form (`command` plus `args`) is supported in plugins. On Windows it needs a real executable. A plugin's hook runs beside the same hook in the user's settings; the two aren't merged.
- **MCP servers:** they start when the plugin is turned on, as `plugin:<plugin>:<server>`.
- **Marketplaces:** a marketplace can list a plugin from an npm package, at an exact version, a range or a dist-tag. Its install scripts never run.

## Decision

**1. The npm package is the plugin.**
- `.claude-plugin/plugin.json` sits at the repository's root, and `package.json`'s `files` ships it.
- The package already holds `dist/` and `skills/repomagpie/`, the default skills folder, so the plugin needs no other file, no separate repository and no committed build output.
- The manifest's `name` is `repomagpie`. Its `version` is always `package.json`'s: `npm test` and the release check refuse anything else. Its description and licence are the package's.
- A marketplace can't list the plugin from this repository's folder, since `dist/` isn't committed. It lists it from npm, at an exact version. That marketplace is the next part of this work, not part of this decision.

**2. The MCP server and the hook are written inline in `plugin.json`.**
- Not in a `.mcp.json` at the repository's root: Claude Code would read that file as this repository's own project configuration, for everyone who works on it.
- Not in `hooks/hooks.json`: one file is enough.
- **The MCP server:** `node`, `--disallow-code-generation-from-strings`, `${CLAUDE_PLUGIN_ROOT}/dist/cli/main.js`, `mcp`. It is read-only, without `--allow-write`. A plugin's arguments are fixed, so they can't follow a setting, and the maintainer chose read-only first (2026-11-13). Until a launcher in the plugin's `bin/` or an environment variable gives plugin users a way to save notes, saving one needs the npm install.
- **The hook:** `PreToolUse` with matcher `Bash|PowerShell|Monitor`, in exec form, with the same arguments and `hook claude-code` in place of `mcp`. That is `setup`'s exec entry with the plugin's folder in place of the paths.
- **Always the exec form.** A static file can't read `claude --version` the way `setup` does under 0061.
- **No Stop reminder.** It stays an opt-in of `setup` ([0042](0042-the-stop-reminder.md)).

**3. `node` comes from `PATH`: a departure from 0035.** 0035 never writes a name looked up on `PATH`; its entries name the absolute `node` running `setup`. The plugin can't, because:
- **Nothing on the user's machine writes the plugin's files.** They are written once, before any install, and copied as they are. No `setup` runs to find the user's `node`, and no plugin variable names it.
- **0035's rejected options stay rejected.**
  - The `repomagpie` command is a `.cmd` shim on Windows. The exec form can't start it, and the shell form took 281 ms against the hook's 150 ms budget.
  - `npx` needs the network and seconds at every start.
- **A wrapper script doesn't remove the need.** It needs an interpreter too: a `.cmd` needs a shell, and the exec form needs a real executable on Windows.
- **The documentation's own examples start `node` this way** (`"command": "node"`).
- **Only `node` is looked up.** The entry file is `${CLAUDE_PLUGIN_ROOT}/dist/cli/main.js`, an absolute path to this exact version. 0035's concern that `PATH` can hold another `repomagpie` doesn't apply.
- **What 0035 asks for still holds:** code generation off, no shell, and an entry pinned to one version (the plugin's).

The cost is that the `node` Claude Code finds on its `PATH` must be Node.js 22.12 or later. A version manager that switches `node` changes which one runs. A Claude Code app opened outside a terminal may not get the shell's `PATH` ([agents](../agents.md), "Who gets the shell's `PATH`").

Before the marketplace goes live, the manual checks cover the hook with `node` missing from `PATH` and with a `node` older than 22.12. A hook that prints an error on every shell command isn't acceptable (the maintainer, 2026-11-13); if that is what happens, a guard comes first.

**4. Tested without Claude Code.**
- `scripts/plugin.test.ts` checks the manifest: the package's name, version, description and licence; the MCP server's and the hook's arguments, against `setup`'s constants.
- `scripts/release-check.ts` refuses a tag whose manifest names another version.
- `npm run check:build` runs both commands from the installed tarball's manifest. The hook must answer as the built CLI does; the MCP server must list its tools, without `note`.
- Installing through Claude Code, `claude plugin validate` and the double install are manual checks.

## Consequences
- The package ships one more file. Each release sets the manifest's version at step 1 ([release](../release.md)), and a stale version can't be tagged.
- A plugin user needs Node.js 22.12 or later on `PATH`, and a Claude Code with hook `args`, which shipped in 2.1.139 ([agents](../agents.md#claude-code)). The documentation names no minimum version for plugins.
- A user with both the plugin and an earlier `setup` gets two hooks and two MCP servers (different commands aren't merged), and the skill twice. `setup` and `doctor` learn about the plugin in the next part: `setup` skips Claude Code when the plugin is on and suggests `repomagpie setup --remove --agents claude-code`; it never removes anything unasked.
- Anthropic's plugin directory is a later decision: it reads plugins from GitHub repositories, where the built files would have to live.
- Not confirmed by the documentation:
  - whether two hooks answering `ask` give one prompt or two;
  - what `PATH` an MCP server or hook gets when Claude Code runs as a desktop app;
  - whether a `bin/` launcher from an npm source keeps its execute permission.
