# 0035 — `setup` and `doctor` change other tools' settings safely

**Status:** accepted (2026-10-14). Builds on [0034](0034-the-mcp-server.md) (the MCP server), [0031](0031-the-command-is-repomagpie.md) (the command is `repomagpie`; "the planned `setup` command will move old entries to the new name") and [0032](0032-note-text-is-data.md), rule 5 (never write through a link). Agent facts, with sources and dates: [agents](../agents.md).

## Context
Wiring RepoMagpie into an agent is manual today: the user edits `~/.claude/settings.json` for the hook, and runs `npx skills add` for the skill. With the MCP server ([0034](0034-the-mcp-server.md)), each agent also needs an MCP entry, and every agent keeps it in a different place and format: JSON with `mcpServers` or `servers`, TOML, YAML, or a file only the agent's own CLI should touch.

These files belong to other tools and hold the user's other settings, sometimes secrets. A setup command that damages one, leaves a server path that no longer exists, or quietly turns on auto-approval does more harm than the manual steps it replaces.

Two other installers set the expectation: `npx skills add` and REA's `npx rea-agents setup` detect the agents, show what they will do, ask, then do it.

## Decision

### `repomagpie setup`
**The flow:**
1. Detect the installed agents of the first set: Claude Code, Codex CLI, Cursor, Gemini CLI and VS Code. An agent counts as installed when its config folder exists or its CLI is on `PATH`.
2. Show a plan: for each agent, what changes, in which file, how (the agent's CLI or a JSON edit), and the backup that will be written.
3. Ask: which agents (a multi-select, all detected ones chosen), then whether to turn on `--allow-write` (no by default).
4. Apply.
5. Print a summary: what changed, the backups, and anything left to do by hand.

**Flags:** `--yes` (no questions; the detected agents, `--allow-write` only if given), `--dry-run` (the plan, nothing written), `--agents <list>`, `--remove`, `--json` (implies no questions; with neither `--yes` nor `--dry-run` it is a usage error, so `--json` never writes by surprise), `--project`, `--allow-write`.

**What it installs, per agent:**
- the MCP server entry, named `repomagpie`;
- the skill, from the package itself, so the skill's version always matches the CLI's;
- for Claude Code only, the hook. An entry that runs `magpie hook claude-code` is changed to `repomagpie hook claude-code`; nothing else in `settings.json` changes.

For the other agents in [agents](../agents.md) (Copilot CLI, Windsurf, Cline, Zed, OpenCode, Goose, Claude Desktop), `setup` prints the snippet and the path to paste it into. It writes nothing for them.

### How it writes
- **The agent's own CLI first**, where one exists: `claude mcp add --scope user`, `codex mcp add`, `gemini mcp add --scope user`, `code --add-mcp`. The agent then owns its format. Claude Code's `~/.claude.json` is rewritten by Claude Code while it runs, and Codex's `config.toml` is TOML: editing either ourselves would race the agent or need a TOML writer.
- **Otherwise a round-trip-safe JSON edit**, as for Cursor's `~/.cursor/mcp.json` and Claude Code's `~/.claude/settings.json` (the hook): only our entry changes; key order, indentation, line endings and a final newline stay as they were.
- **Never a file it can't round-trip.** JSON with comments or trailing commas, a file that isn't valid JSON, a value of the wrong type where our entry goes, or TOML without the agent's CLI: `setup` changes nothing there, and prints the exact snippet and the path instead.
- On Windows an agent's CLI can be a `.cmd` shim. `setup` runs it through `cmd.exe` with each argument quoted, never through a shell string it builds from untrusted text, and treats a non-zero exit as "not changed" with the CLI's message.

### Safety
- **A backup before every edit**, next to the file: `<file>.repomagpie-backup-<timestamp>`, named in the summary. An edit made through the agent's CLI gets the same backup of the file the CLI writes, when `setup` knows that file.
- **Never through a link** ([0032](0032-note-text-is-data.md), rule 5): a config file or folder that is a link (or a junction) is refused, and named. **Never outside the user's home**: a path that resolves outside it is refused.
- **Idempotent:** a second run finds every entry as it should be and changes nothing, not even a backup.
- **An entry named `repomagpie` that runs something else** (another program, or another copy of RepoMagpie) is shown in the plan as a change, with the old command, and changed only with the user's yes (or `--yes`).
- **`--remove`** deletes only RepoMagpie's own entries: the MCP entry, the hook entry and the skill folders it installed. It never restores a backup over the file, because the user or another tool may have changed it since. It uses the agent's CLI where `setup` did (`claude mcp remove`, `codex mcp remove`, `gemini mcp remove`). VS Code has no command-line remove, so `--remove` names the entry and the command that opens the file ("MCP: Open User Configuration").
- **Never weaken an agent's safety.** `setup` never sets auto-approval, trust or a bypass: not Gemini's `trust`, not Codex's `default_tools_approval_mode`, not Cline's `autoApprove`, not Claude Code's permission rules. Whether the agent may run RepoMagpie's tools without asking stays the user's decision, in their agent.
- **User scope only by default.** Project files (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`) only with `--project`, since they are committed and shared with a team.
- **No network.** `setup` downloads nothing: the skill comes from the installed package, and nothing is fetched to check a version.

### How agents launch RepoMagpie
The MCP entry has to start the server from any agent, on any platform, without depending on how the agent was opened. The constraints:
- **GUI apps don't get the shell's `PATH`.** Cursor, VS Code, Windsurf, Zed, Claude Desktop and Goose's desktop app get the environment they were launched with. On macOS, an app opened from the Dock gets launchd's short `PATH`, without Homebrew's or nvm's folders; Claude Desktop's well-known `spawn npx ENOENT` comes from this ([agents](../agents.md), "Who gets the shell's `PATH`").
- **On Windows, `repomagpie` is a `.cmd` shim.** Node's documentation says `.bat` and `.cmd` files "are not executable on their own without a terminal" and need a shell ([child_process](https://nodejs.org/api/child_process.html)). An agent that spawns its server without a shell, as most do, fails on the shim. The usual workaround, `cmd /c`, has its own bugs: `claude mcp add` was reported to rewrite `/c` into `C:/`.
- **Never an unpinned `npx`:** it runs whatever version the registry has that day, and it needs the network at every start.
- **Never a path into a temporary npx cache**, which npm may clear at any time.
- **`PATH` can hold another `repomagpie` or `magpie`** ([0031](0031-the-command-is-repomagpie.md)); a name looked up on `PATH` runs whichever comes first.

Options:

| Entry | GUI apps | Windows | Pinned | Rejected because |
|---|---|---|---|---|
| `repomagpie mcp` | no: needs the shell's `PATH` | no: a `.cmd` shim | no: whatever `PATH` finds | fails in GUI apps and on Windows |
| `npx -y repomagpie@<version> mcp` | only if `npx` is found | needs `cmd /c` | yes | the network at every start, seconds of cold start, the npx cache |
| `cmd /c repomagpie mcp` (Windows) | needs `PATH` | yes | no | `PATH`-dependent; argument mangling |
| the shim's absolute path | yes | no: still a `.cmd` | yes | Windows; on macOS and Linux the shim is `#!/usr/bin/env node`, which needs `node` on `PATH` |
| **absolute `node`, absolute entry file, `mcp`** | **yes** | **yes** | **yes** | **chosen** |

**The decision:** `command` is the absolute path of `node`, and `args` are the absolute path of the installed CLI's entry file (`<package>/dist/cli/main.js`) and `mcp` (plus `--allow-write` when chosen). For example, on Windows:

```json
{ "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": ["C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\repomagpie\\dist\\cli\\main.js", "mcp"] }
```

- **Which `node`:** the one running `setup`. If the `node` that `PATH` names is the same program (the same file once links are resolved), `setup` writes the `PATH` form, which survives upgrades (`/opt/homebrew/bin/node` rather than a versioned folder under `Cellar/`). Otherwise it writes the running node's own path.
- **Which entry file:** the one running `setup`, found from the module's own location, as core already finds `package.json`.
- **Run from the npx cache** (`npx repomagpie setup`), from a temporary folder, or from a version manager's per-shell folder (fnm's `fnm_multishells`): `setup` writes no MCP entry. It explains why and says to install globally first: `npm install -g repomagpie`, then `repomagpie setup`. It still shows the plan, so the user sees what will happen.
- **No new runtime and no wrapper script:** the agent starts `node` directly. No shell is involved, so nothing in the path is parsed by a shell.
- **The cost:** the entry holds two absolute paths. Uninstalling that Node.js version, switching with a version manager to one where RepoMagpie isn't installed, or moving npm's global folder breaks it. `repomagpie doctor` checks that both paths exist and says to run `repomagpie setup` again; a second `setup` from the new install rewrites the entry.

**The Claude Code hook keeps `repomagpie hook claude-code`.** Claude Code runs hook commands through a shell, so the `.cmd` shim works on Windows, and Claude Code is a terminal program that has the user's `PATH`. Its entry is the one the spec and the README show.

### `repomagpie doctor`
Read-only: it writes nothing, not even a cache. It reports:
- which programs `repomagpie` and `magpie` run on `PATH`, and whether each is this package; a `magpie` that isn't ours (such as yetone/magpie, [0031](0031-the-command-is-repomagpie.md)) is flagged;
- the CLI's version against the installed skill's version, in each skills folder it finds (`npx skills` installs included);
- the Claude Code hook entry, including the old `magpie hook claude-code` form;
- the MCP entry in each detected agent: present or not, whether its `node` and entry file exist, whether it is this version, and whether `--allow-write` is on;
- the journals found, with note counts and skipped files (links, files over 256 KB, unparseable notes).

It has human output and `--json`, and exits 0 whatever it finds: it is a report, not a check, so a tester can always attach its output to a bug report. It never prints a secret: a value from a config file's `env` is shown as its key only.

## Consequences
- Installing becomes `npm install -g repomagpie`, then `repomagpie setup`. The README's manual hook and skill steps move to `docs/`.
- `setup` needs a test per agent and per file: before and after, idempotency, `--remove`, comments, links, Windows paths, and fake agent CLIs on `PATH` that record their arguments. Tests point `HOME`, `USERPROFILE`, `APPDATA` and the XDG variables at scratch folders and never touch a real agent's settings.
- The package ships `skills/repomagpie/`. The skill carries the CLI's version in its frontmatter (`metadata`), kept equal to `package.json` by a test, so `doctor` can compare them.
- **Skills:** `setup` installs one copy in the shared folder `~/.agents/skills/repomagpie/` (read by Codex, Cursor, Gemini CLI, VS Code, Copilot CLI and Zed) and one in `~/.claude/skills/repomagpie/` (Claude Code reads only its own folder). Both copies are identical and come from the same package. Cursor and VS Code read both folders, so they may list the skill twice, with the same text. An `npx skills` install is updated in place or left alone, and the summary says which; its lock file isn't ours and isn't edited. Details on the branch, in `setup`'s second part.
- The MCP entry pins one Node.js and one install. After switching Node.js versions, the user runs `repomagpie doctor`, then `repomagpie setup` again.
- An MCP entry written for one OS doesn't work on another, so a dotfiles repository that syncs `~/.cursor/mcp.json` across machines carries a broken path to the others. `doctor` shows it; `--project` files carry the same risk and are opt-in.
- `SECURITY.md` says what `setup` writes, its backups, `--remove`, and that MCP is local stdio only.
