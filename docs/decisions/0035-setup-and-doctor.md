# 0035 — `setup` and `doctor` change other tools' settings safely

**Status:** accepted (2026-10-14); revised on its branch the same day: the skill is one folder in `~/.agents/skills/` with a link from `~/.claude/skills/`, as the `skills` CLI installs it, instead of two copies; every MCP entry starts node with `--disallow-code-generation-from-strings`; the details found while building `setup` (the agents' exact commands, reading each change back, the prompts, `--project` in the second part). Builds on [0034](0034-the-mcp-server.md) (the MCP server), [0031](0031-the-command-is-repomagpie.md) (the command is `repomagpie`; "the planned `setup` command will move old entries to the new name") and [0032](0032-note-text-is-data.md), rule 5 (never write through a link). Agent facts, with sources and dates: [agents](../agents.md).

## Context
Wiring RepoMagpie into an agent is manual today: the user edits `~/.claude/settings.json` for the hook, and runs `npx skills add` for the skill. With the MCP server ([0034](0034-the-mcp-server.md)), each agent also needs an MCP entry, and every agent keeps it in a different place and format: JSON with `mcpServers` or `servers`, TOML, YAML, or a file only the agent's own CLI should touch.

These files belong to other tools and hold the user's other settings, sometimes secrets. A setup command that damages one, leaves a server path that no longer exists, or quietly turns on auto-approval does more harm than the manual steps it replaces.

Two other installers set the expectation: `npx skills add` and REA's `npx rea-agents setup` detect the agents, show what they will do, ask, then do it.

## Decision

### `repomagpie setup`
**The flow:**
1. Detect the installed agents of the first set: Claude Code, Codex CLI, Cursor, Gemini CLI and VS Code. An agent counts as installed when its config folder exists or its CLI is on `PATH`.
2. Show a plan: for each agent, what changes, in which file, how (the agent's CLI or a JSON edit), and the backup that will be written.
3. Ask: which agents (a multi-select, all detected ones chosen), then whether to turn on `--allow-write` (no by default), then the plan for those, then "Make these changes?".
4. Apply.
5. Print a summary: what changed, the backups, and anything left to do by hand.

**Flags:** `--yes` (no questions; the detected agents, `--allow-write` only if given), `--dry-run` (the plan, nothing written), `--agents <list>`, `--remove`, `--json` (implies no questions; with neither `--yes` nor `--dry-run` it is a usage error, so `--json` never writes by surprise), `--project`, `--allow-write`. Without a terminal, setup can't ask, so it needs `--yes` or `--dry-run` too (a usage error otherwise).

**`--project` is the global flag** (`repomagpie --project <dir>`, the project root): with it, `setup` writes that project's files instead of the user's. It comes with `setup`'s second part, together with the project forms of the skill and the hook; the first part writes user scope only.

**The prompts** are a minimal multi-select and yes/no on `node:readline`'s keypress events, not a library: about 60 lines, no new dependency. In raw mode Node's terminal layer turns arrow keys into the same escape sequences on Windows consoles (cmd, PowerShell, Windows Terminal) as on macOS and Linux, so one code path serves all. They draw on stderr; Ctrl+C or Esc cancels, and nothing changes.

**What it installs, per agent:**
- the MCP server entry, named `repomagpie`;
- the skill, from the package itself, so the skill's version always matches the CLI's;
- for Claude Code only, the hook. An entry that runs `magpie hook claude-code` is changed to `repomagpie hook claude-code`; nothing else in `settings.json` changes.

For the other agents in [agents](../agents.md) (Copilot CLI, Windsurf, Cline, Zed, OpenCode, Goose, Claude Desktop), `setup` prints the snippet and the path to paste it into. It writes nothing for them.

### How it writes
- **The agent's own CLI first**, where one exists. The agent then owns its format. Claude Code's `~/.claude.json` is rewritten by Claude Code while it runs, and Codex's `config.toml` is TOML: editing either ourselves would race the agent or need a TOML writer. The commands, with `--` before the server's command so that node's flags reach node, not the agent's CLI:

  | Agent | Add | Remove |
  |---|---|---|
  | Claude Code | `claude mcp add --scope user --transport stdio repomagpie -- <node> <args…>` | `claude mcp remove --scope user repomagpie` |
  | Codex CLI | `codex mcp add repomagpie -- <node> <args…>` | `codex mcp remove repomagpie` |
  | Gemini CLI | `gemini mcp add --scope user repomagpie -- <node> <args…>` | `gemini mcp remove --scope user repomagpie` |
  | VS Code | `code --add-mcp '{"name":"repomagpie","command":…,"args":[…]}'` | none: a JSON edit of the user `mcp.json` |

  An entry that differs is removed first, then added. VS Code's CLI can't remove, so changing or removing its entry is a JSON edit of `…/Code/User/mcp.json` (the path checked on a real install, [agents](../agents.md)).
- **Read back:** after every change, `setup` reads the file again with `doctor`'s reader. The change counts as done only when the file holds exactly the entry meant (or, for `--remove`, none); otherwise the summary says what the file holds now. A CLI's own bugs, or a newer CLI that writes elsewhere, show up there rather than as a silent success.
- **Otherwise a round-trip-safe JSON edit**, as for Cursor's `~/.cursor/mcp.json` and Claude Code's `~/.claude/settings.json` (the hook): only our entry changes; key order, indentation, line endings and a final newline stay as they were.
- **Never a file it can't round-trip.** JSON with comments or trailing commas, a file that isn't valid JSON, a value of the wrong type where our entry goes, or TOML without the agent's CLI: `setup` changes nothing there, and prints the exact snippet and the path instead.
- On Windows an agent's CLI can be a `.cmd` shim. `setup` runs it through `cmd.exe` with each argument quoted, never through a shell string it builds from untrusted text, and treats a non-zero exit as "not changed" with the CLI's message. The quoting is the one the cross-spawn package uses (MIT): the C runtime's rules for quotes and backslashes, then cmd.exe's special characters escaped with `^`, twice, because a shim reads its arguments again through `%*`. A test passes `%PATH%`, `&`, `|`, quotes, a trailing backslash, a JSON document and an empty string through a `.cmd` shim in a folder with a space, and the program receives each one exactly.

### The skill
`setup` lays the skill out the way the `skills` CLI (`npx skills add`) does today, so the two produce the same result and never fight:
- **One real folder:** `~/.agents/skills/repomagpie/`, copied from the installed package's `skills/repomagpie/`. Codex, Cursor, Gemini CLI, VS Code, Copilot CLI and Zed read this folder directly ([agents](../agents.md), "The shared skills folder").
- **A link for Claude Code:** `~/.claude/skills/repomagpie` is a link to that folder: a relative symlink on macOS and Linux, a directory junction on Windows (it needs no admin rights or Developer Mode). This is what the `skills` CLI's installer does: canonical copy in `.agents/skills/<name>`, `symlink(…, 'junction')` on `win32`, a relative path elsewhere ([`src/installer.ts`](https://github.com/vercel-labs/skills/blob/417405ecc8a03136f1675bcb19d5c05b299123f4/src/installer.ts), commit of 2026-10-07, read on 2026-10-14).
- **A copy only when a link can't be made** (a file system without links, a refused junction). The summary says it copied, and `doctor` then checks that both copies match.
- **An existing install:**
  - the same layout, from `npx skills` or an earlier `setup`: `setup` updates the files in `~/.agents/skills/repomagpie/` in place and leaves the link as it is. The `skills` CLI's lock file (`~/.agents/.skill-lock.json`) isn't ours and isn't edited, so `npx skills update` may later replace our files with the version on GitHub; `doctor` shows the version either way.
  - `~/.claude/skills/repomagpie` is a real folder with our skill in it (an older copy): it is replaced by the link, after a backup, and the summary names both.
  - anything else in either place (another skill named `repomagpie`, a link that points elsewhere): `setup` changes nothing there and says so.
- **The link rule:** `setup` never writes through a link. It creates the one link above and writes only into the real folder it points to. If `~/.agents/skills/repomagpie` itself is a link (the user's own), `setup` leaves it and says so.
- `--remove` deletes the link and the real folder only when the folder holds RepoMagpie's skill; it never follows a link to delete.

### Safety
- **A backup before every edit**, next to the file: `<file>.repomagpie-backup-<timestamp>`, named in the summary. An edit made through the agent's CLI gets the same backup of the file the CLI writes, when `setup` knows that file.
- **Never through a link** ([0032](0032-note-text-is-data.md), rule 5): a config file or folder that is a link (or a junction) is refused, and named. The skill's link for Claude Code is the one link `setup` creates ("The skill", above). **Never outside the user's home**: a path that resolves outside it is refused.
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

**The decision:** `command` is the absolute path of `node`, and `args` are node's `--disallow-code-generation-from-strings`, the absolute path of the installed CLI's entry file (`<package>/dist/cli/main.js`) and `mcp` (plus `--allow-write` when chosen, and `--home <journal>` when the journal was chosen with `--home` or `MAGPIE_HOME`, which the agent won't have). The flag stands before the script, so node reads it: the server needs no generated code ([0034](0034-the-mcp-server.md), "No generated code"), so with it the server can't run any either, whatever reaches it. For example, on Windows:

```json
{ "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": ["--disallow-code-generation-from-strings", "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\repomagpie\\dist\\cli\\main.js", "mcp"] }
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
- the MCP entry in each detected agent: present or not, whether its `node` and entry file exist, whether it is this version, whether node gets `--disallow-code-generation-from-strings` before the script (a to-do when not), and whether `--allow-write` is on;
- the journals found, with note counts and skipped files (links, files over 256 KB, unparseable notes).

It has human output and `--json`, and exits 0 whatever it finds: it is a report, not a check, so a tester can always attach its output to a bug report. It never prints a secret: a value from a config file's `env` is shown as its key only.

## Consequences
- Installing becomes `npm install -g repomagpie`, then `repomagpie setup`. The README's manual hook and skill steps move to `docs/`.
- `setup` needs a test per agent and per file: before and after, idempotency, `--remove`, comments, links, Windows paths, and fake agent CLIs on `PATH` that record their arguments. Tests point `HOME`, `USERPROFILE`, `APPDATA` and the XDG variables at scratch folders and never touch a real agent's settings.
- The package ships `skills/repomagpie/`. The skill carries the CLI's version in its frontmatter (`metadata`), kept equal to `package.json` by a test, so `doctor` can compare them.
- **Skills:** one real folder and one link, as the `skills` CLI lays them out, so a user can mix `npx skills add` and `repomagpie setup` in either order. Cursor and VS Code read both `~/.agents/skills/` and `~/.claude/skills/`, so they may list the skill twice; that is true of an `npx skills` install too. Junctions are absolute paths, so moving the home folder breaks the link on Windows; `doctor` shows it.
- The MCP entry pins one Node.js and one install. After switching Node.js versions, the user runs `repomagpie doctor`, then `repomagpie setup` again.
- An MCP entry written for one OS doesn't work on another, so a dotfiles repository that syncs `~/.cursor/mcp.json` across machines carries a broken path to the others. `doctor` shows it; `--project` files carry the same risk and are opt-in.
- `SECURITY.md` says what `setup` writes, its backups, `--remove`, and that MCP is local stdio only.
