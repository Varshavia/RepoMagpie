# Agents

How each coding agent registers a local MCP server, where it reads skills, and whether it has a hook that runs before a tool call. `repomagpie setup` and `repomagpie doctor` rely on these facts ([decision 0034](decisions/0034-the-mcp-server.md), [decision 0035](decisions/0035-setup-and-doctor.md)).

Every fact below was checked on **2026-10-14** against the source linked next to it, unless a row says otherwise. Agent config formats change monthly: check the source again before changing `setup` for an agent, and update the date. "Not documented" means the agent's own docs don't say; it doesn't mean the feature is missing.

`~` is the home folder: `%USERPROFILE%` on Windows.

## Summary

`setup` writes the MCP entry, the skill and (Claude Code only) the hook for the **first set**. For the others it prints the snippet and the path.

| Agent | MCP at user scope | Skills (user scope) | Hook before a tool call | `setup` |
|---|---|---|---|---|
| Claude Code | `claude mcp add --scope user` → `~/.claude.json` | `~/.claude/skills/` | `PreToolUse`: allow, deny, ask; context for the agent | first set |
| Codex CLI | `codex mcp add` → `~/.codex/config.toml` (TOML) | `~/.agents/skills/` | `PreToolUse`: deny, allow; context; `ask` not supported yet | first set |
| Cursor | `~/.cursor/mcp.json` (JSON edit) | `~/.agents/skills/`, `~/.cursor/skills/` (also reads `~/.claude/skills/`, `~/.codex/skills/`) | `beforeShellExecution`: allow, deny, ask | first set |
| Gemini CLI | `gemini mcp add --scope user` → `~/.gemini/settings.json` | `~/.gemini/skills/` or `~/.agents/skills/` | `BeforeTool`: allow, deny; no `ask`; a message for the user | first set |
| VS Code (GitHub Copilot) | `code --add-mcp` → the user profile's `mcp.json` | `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/` | `PreToolUse` (Preview): ask shown in the docs | first set |
| Copilot CLI | `copilot mcp add` → `~/.copilot/mcp-config.json` | `~/.copilot/skills/`, `~/.agents/skills/` | `preToolUse`: allow, deny, ask; no context on allow | snippet |
| Windsurf (Devin Desktop) | `~/.config/devin/mcp_config.json`; Windows `%APPDATA%\devin\mcp_config.json` | not documented (`~/.codeium/windsurf/skills/` per `npx skills`) | `pre_run_command`: proceed or block (exit 2) | snippet |
| Cline | `cline mcp add` → `~/.cline/data/settings/cline_mcp_settings.json` (CLI) | `~/.agents/skills/` per `npx skills` | SDK plugins: `beforeTool` can skip, require approval, add context | snippet |
| Zed | `context_servers` in Zed's `settings.json` | `~/.agents/skills/` | not documented; tool permission prompts instead | snippet |
| OpenCode | `mcp` in `~/.config/opencode/opencode.json` (JSONC allowed) | `~/.config/opencode/skills/` | plugins: `tool.execute.before` can block by throwing | snippet |
| Goose | `extensions` in `~/.config/goose/config.yaml`; Windows `%APPDATA%\Block\goose\config\config.yaml` | not documented (`~/.config/goose/skills/` per `npx skills`) | not documented | snippet |
| Claude Desktop | `mcpServers` in `claude_desktop_config.json` (macOS `~/Library/Application Support/Claude/`, Windows `%APPDATA%\Claude\`) | not documented | not documented | snippet |

## The first set

### Claude Code
- **MCP:** `claude mcp add [options] <name> -- <command> [args...]`, with `--scope user` for "available to you across all projects". "Everything after `--` is passed to the server untouched." User-scope servers are stored in `~/.claude.json`, at its top level; the docs don't show the exact shape. Remove with `claude mcp remove`. `claude mcp add-json <name> '<json>' --scope user` takes the entry as JSON. Source: [Claude Code MCP](https://code.claude.com/docs/en/mcp).
- **Why the CLI, not a JSON edit:** `~/.claude.json` also holds Claude Code's own state, and Claude Code rewrites it while it runs.
- **Limits that affect us:** server instructions, and the description of a tool that loads upfront, are cut at 4,096 characters. Claude Code sets `CLAUDE_PROJECT_DIR` in the server's environment. On connections that use the 2026-07-28 revision it declares elicitation; we don't use it ([decision 0034](decisions/0034-the-mcp-server.md)). Same source.
- **Windows:** community reports say an npx-based server needs `cmd /c npx …` on native Windows, and that `claude mcp add` once rewrote the `/c` argument into `C:/` ([report](https://claudeissues.com/issue/20061-windows-claude-mcp-add-mangles-c-flag-breaks-npx-based-mcp-servers); not in Anthropic's docs). The absolute `node` entry ([decision 0035](decisions/0035-setup-and-doctor.md)) needs neither.
- **Skills:** personal `~/.claude/skills/<name>/SKILL.md`; project `.claude/skills/`, in the start folder and every parent up to the repository root. The docs don't mention `~/.agents/skills/`. Source: [Claude Code skills](https://code.claude.com/docs/en/skills).
- **Hook:** `PreToolUse` in `~/.claude/settings.json` or the project's `.claude/settings.json`; `permissionDecision` `allow`, `deny` or `ask`; `additionalContext` reaches the agent. Checked against the [hooks reference](https://code.claude.com/docs/en/hooks) on 2026-10-04 ([spec](spec.md), section 6); not checked again today.

### Codex CLI
- **MCP:** `codex mcp add <server-name> --env VAR1=VALUE1 -- <stdio server-command>`, stored in `~/.codex/config.toml` as `[mcp_servers.<name>]` with `command`, `args`, `env`, `env_vars` ("allow and forward"), `cwd`, `startup_timeout_sec` (default 10), `tool_timeout_sec` (default 60), `enabled`, `required`, `enabled_tools`, `disabled_tools`, and `default_tools_approval_mode` (`auto`, `prompt`, `writes` or `approve`). A project `.codex/config.toml` works for trusted projects only. Remove with `codex mcp remove`. Source: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) (formerly developers.openai.com/codex/mcp, which redirects there).
- **Never set** `default_tools_approval_mode` or a per-tool `approval_mode`: approval is the user's choice ([decision 0035](decisions/0035-setup-and-doctor.md)).
- **Environment:** the docs don't say which variables reach a server. Codex's source passes a default list (on Unix the user, home and `PATH` variables; on Windows also `COMSPEC`, `SYSTEMROOT`, `APPDATA` and others) plus `env_vars`, so API keys aren't forwarded unless configured. Source: Codex's `codex-rs/rmcp-client/src/utils.rs`, read through a [mirror](https://forge.lthn.ai/core/core-agent-ide/src/commit/01ca2b5df666ca2594ce26b2867cc1a4337cc21e/codex-rs/rmcp-client/src/utils.rs) and [PR 4811](https://github.com/openai/codex/pull/4811/files); not in the docs.
- **Skills:** `$CWD/.agents/skills`, each parent up to `$REPO_ROOT/.agents/skills`, `$HOME/.agents/skills`, `/etc/codex/skills`, and the bundled ones. Two skills with the same name both appear. Source: [Codex skills](https://learn.chatgpt.com/docs/build-skills.md). Older guides name `~/.codex/skills/`; the docs no longer do.
- **Hook:** `PreToolUse` in `~/.codex/hooks.json` or `[hooks]` in `config.toml` (project ones only when the project is trusted); on by default (`[features] hooks = false` turns them off). Shell commands match as `Bash`, with the command at `tool_input.command`. Output: `permissionDecision: "deny"` with a reason, `"allow"` with `updatedInput`, `additionalContext` for the agent, `systemMessage`. `permissionDecision: "ask"` is "parsed but not supported yet": the hook run counts as failed and the call goes on. Windows: `commandWindows` overrides the command. Source: [Codex hooks](https://learn.chatgpt.com/docs/hooks).

### Cursor
- **MCP:** "Create `~/.cursor/mcp.json` in your home directory for tools available everywhere"; project `.cursor/mcp.json`. Shape: `mcpServers` → `{ "type": "stdio", "command", "args", "env", "envFile" }`. `command` "must be available on your system path or contain its full path." `command`, `args` and `env` expand `${env:NAME}`, `${userHome}`, `${workspaceFolder}` and `${/}`. No command-line way to add a server is documented; extensions can call `vscode.cursor.mcp.registerServer()`. Source: [Cursor MCP](https://cursor.com/docs/context/mcp).
- **JSON with comments:** not documented. `setup` edits the file only when it is plain JSON ([decision 0035](decisions/0035-setup-and-doctor.md)).
- **Skills:** project `.agents/skills/`, `.cursor/skills/`; user `~/.agents/skills/`, `~/.cursor/skills/`; "for compatibility" also `.claude/skills/`, `.codex/skills/`, `~/.claude/skills/` and `~/.codex/skills/`. Source: [Cursor skills](https://cursor.com/docs/context/skills).
- **Hook:** `~/.cursor/hooks.json` or `<project>/.cursor/hooks.json`, with `"version": 1`. `beforeShellExecution` gets `command`, `cwd` and `sandbox`, and answers `permission` (`allow`, `deny`, `ask`), `user_message` and `agent_message`. For `preToolUse`, "`"ask"` is accepted by the schema but not enforced … today". The docs describe the messages for a denied action; whether they show on `allow` isn't said. Source: [Cursor hooks](https://cursor.com/docs/agent/hooks).

### Gemini CLI
- **MCP:** `gemini mcp add [options] <name> <commandOrUrl> [args...]`; `-s, --scope` is `user` or `project` (default `project`); user scope writes `~/.gemini/settings.json`. Entry: `mcpServers` → `{ "command", "args", "env", "cwd", "timeout", "trust", "includeTools", "excludeTools" }`. `trust: true` "bypasses all tool call confirmations for this server"; `--trust` sets it. Stdio servers show as connected only in a trusted folder. Source: [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/).
- **Never set `trust`** ([decision 0035](decisions/0035-setup-and-doctor.md)).
- **Environment:** Gemini CLI "redacts sensitive environment variables from the base environment (inherited from the host process)": names matching `*TOKEN*`, `*SECRET*`, `*PASSWORD*`, `*KEY*`, `*AUTH*`, `*CREDENTIAL*`. So `GITHUB_TOKEN` doesn't reach our server there, which is fine: the MCP tools never call GitHub ([decision 0034](decisions/0034-the-mcp-server.md)). Same source.
- **Skills:** user `~/.gemini/skills/` or the `~/.agents/skills/` alias; workspace `.gemini/skills/` or `.agents/skills/`. Within a tier, `.agents/skills/` wins. `gemini skills install <git-url or path> --scope user`. Source: [Gemini CLI skills](https://geminicli.com/docs/cli/skills/).
- **Hook:** `BeforeTool` in `settings.json` → `hooks`; the matcher is the tool name (`run_shell_command`). Output: `decision` `allow` or `deny` (`block` is an alias), `reason` (sent to the agent on deny), `systemMessage` (shown to the user). No `ask`; `additionalContext` exists on `AfterTool` but not on `BeforeTool`. Exit code 2 blocks with stderr as the reason. Source: [Gemini CLI hooks reference](https://geminicli.com/docs/hooks/reference/).
- **Note:** the same page says Gemini CLI "was replaced by Antigravity CLI on June 18th, 2026, for unpaid tier and Google One users". Antigravity CLI isn't researched here.

### VS Code (GitHub Copilot)
- **MCP:** the user profile's `mcp.json`, opened with "MCP: Open User Configuration"; servers there "are available across all your workspaces", and each profile has its own. Workspace: `.vscode/mcp.json`. Shape: `servers` (not `mcpServers`) → `{ "type": "stdio", "command", "args", "cwd", "env", "envFile" }`. From a terminal: `code --add-mcp "{\"name\":\"my-server\",\"command\":\"uvx\",\"args\":[\"mcp-server-fetch\"]}"` adds a server to the user profile. Sources: [VS Code MCP servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers), [MCP configuration reference](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration).
- **Not documented:** the user `mcp.json`'s path on disk (VS Code keeps user settings in `%APPDATA%\Code\User\` on Windows, `~/Library/Application Support/Code/User/` on macOS and `~/.config/Code/User/` on Linux; that `mcp.json` sits there is to be confirmed on a real install before `doctor` reads it); whether comments are allowed; a command-line remove. `setup` writes only through `code --add-mcp`, and `--remove` points the user to the file.
- **Trust:** "VS Code shows a dialog when a server first starts or its configuration changes" for servers outside a trusted workspace's files. Same source.
- **Other files:** the portable `~/.copilot/mcp-config.json` (`mcpServers`) is read by the Agent Host, and by discovery when `chat.mcp.discovery.enabled` is on (off by default). Same source.
- **Skills:** personal `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/`; project `.github/skills/`, `.claude/skills/`, `.agents/skills/`. Source: [VS Code agent skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills).
- **Hook:** "The VS Code hooks experience is in Preview." User hooks in `~/.copilot/hooks/*.json`; workspace `.github/hooks/*.json`; Claude Code's `settings.json` files only with `chat.useClaudeHooks` (off by default). The `PreToolUse` example returns `permissionDecision: 'ask'` with a reason. Source: [VS Code hooks](https://code.visualstudio.com/docs/copilot/customization/hooks).

## The others (snippet only)

### Copilot CLI
- **MCP:** `copilot mcp add SERVER-NAME -- COMMAND [ARGS...]`, with `--env KEY=VALUE`; stored in `~/.copilot/mcp-config.json` (`COPILOT_HOME` moves it) under `mcpServers` → `{ "type": "local", "command", "args", "env", "tools": ["*"] }`. "The `PATH` variable is automatically inherited from your environment. All other environment variables must be configured here." Sources: [add MCP servers](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers), [use Copilot CLI](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli).
- **Skills:** personal `~/.copilot/skills/` or `~/.agents/skills/`; project `.github/skills/`, `.claude/skills/` or `.agents/skills/`. Source: [add skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills).
- **Hook:** user `~/.copilot/hooks/*.json`, repository `.github/hooks/*.json`, also a repository's `.claude/settings.json`. `preToolUse` answers `permissionDecision` `allow`, `deny` or `ask` (the cloud agent treats `ask` as `deny`) and `modifiedArgs`; `additionalContext` isn't listed for it. "A crash or non-zero exit (including exit code 2) denies the tool call", and timeouts fail open: an adapter must exit 0 on its own errors. Source: [Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference).

### Windsurf (Devin Desktop)
- The docs now call the product Devin Desktop; the old Windsurf URLs redirect.
- **MCP:** `mcpServers` → `{ "command", "args", "env" }` in `~/.config/devin/mcp_config.json` (or `$XDG_CONFIG_HOME/devin/`) on macOS and Linux, `%APPDATA%\devin\mcp_config.json` on Windows. `${env:VAR}` and `${file:/path}` expand. No command-line way to add one. The older `~/.codeium/windsurf/mcp_config.json` isn't on the page any more. Source: [Cascade MCP](https://docs.devin.ai/desktop/cascade/mcp).
- **Skills:** not documented. `npx skills` installs into `~/.codeium/windsurf/skills/` ([skills CLI](https://github.com/vercel-labs/skills)).
- **Hook:** user `~/.codeium/windsurf/hooks.json`, workspace `.devin/hooks.json`. `pre_run_command` gets `tool_info.command_line` and `cwd`; exit 0 proceeds, exit 2 blocks and "the Cascade agent will see the error message from stderr". No ask, and no documented way to pass context on an allowed command. Source: [Cascade hooks](https://docs.devin.ai/desktop/cascade/hooks).

### Cline
- **MCP:** the CLI keeps servers in `~/.cline/data/settings/cline_mcp_settings.json` (`CLINE_MCP_SETTINGS_PATH` moves it); `cline mcp add <name> --yes -- <command> [args]` adds one. In the IDE extensions, the file opens from the MCP Servers panel; its path isn't documented. Shape: `mcpServers` → `{ "command", "args", "env", "disabled", "autoApprove": [] }`. Source: [Cline MCP](https://docs.cline.bot/mcp/configuring-mcp-servers).
- **Never fill `autoApprove`** ([decision 0035](decisions/0035-setup-and-doctor.md)).
- **Skills:** not checked in Cline's docs. `npx skills` installs into `~/.agents/skills/` for Cline ([skills CLI](https://github.com/vercel-labs/skills)).
- **Hook:** SDK plugins have `beforeTool`, which can return `skip` with a reason ("goes back to the model"), replace the input, return `policy: { autoApprove: false }` to require approval, or `appendContext`. File-based hooks aren't documented on that page. Source: [Cline SDK plugins](https://docs.cline.bot/sdk/plugins).

### Zed
- **MCP:** `context_servers` → `{ "command", "args", "env" }` in Zed's `settings.json` (opened with `zed: open settings file`; its path isn't on the page). Whether that file may hold comments isn't on the page; `setup` prints the snippet and never edits it. Since Zed 0.224.0, `agent.tool_permissions.default` is `confirm` by default, and `mcp:<server>:<tool>` sets one tool. Source: [Zed MCP](https://zed.dev/docs/ai/mcp).
- **Skills:** `~/.agents/skills/` and `<worktree>/.agents/skills/`; each skill a direct child. Source: [Zed skills](https://zed.dev/docs/ai/skills).
- **Hook:** none documented; skills and tools go through the permission prompt. Same source.

### OpenCode
- **MCP:** `mcp` → `{ "type": "local", "command": [ … ], "environment", "enabled", "cwd", "timeout" }`. The global config is `~/.config/opencode/opencode.json`; "OpenCode supports both **JSON** and **JSONC**". No `opencode mcp add`. Sources: [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers/), [OpenCode config](https://opencode.ai/docs/config/).
- **Skills:** `~/.config/opencode/skills/` and `.opencode/skills/` (same config page); `npx skills` installs into `~/.config/opencode/skills/`.
- **Hook:** plugins in `~/.config/opencode/plugins/`; `tool.execute.before` can rewrite a bash command or throw to block. No ask or context documented. Source: [OpenCode plugins](https://opencode.ai/docs/plugins/).

### Goose
- **MCP:** `extensions` in `~/.config/goose/config.yaml` (Windows `%APPDATA%\Block\goose\config\config.yaml`): `{ type: stdio, name, enabled, cmd, args, env_keys, envs, timeout }`. `goose configure` adds one interactively; no non-interactive command is documented. Source: [Goose config files](https://goose-docs.ai/docs/guides/config-files).
- **Skills and hooks:** not documented on that page. `npx skills` installs into `~/.config/goose/skills/`.

### Claude Desktop
- **MCP:** `mcpServers` → `{ "command", "args", "env" }` in `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows); restart the app after a change. A server's stderr goes to `mcp-server-<name>.log` in `~/Library/Logs/Claude/` or `%APPDATA%\Claude\logs\`. Source: [Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers).
- **Skills and hooks:** not documented for local use.

## Who gets the shell's `PATH`

An MCP server inherits the environment of the agent that starts it. What that environment holds depends on how the agent was opened, and only one agent documents it.

| Agent | Started from | Its servers' `PATH` |
|---|---|---|
| Claude Code, Codex CLI, Gemini CLI, Copilot CLI, Cline CLI, OpenCode | a terminal | the shell's. Copilot CLI documents it ("The `PATH` variable is automatically inherited"). Codex passes `PATH` in its default list (source code, above). Gemini CLI passes the inherited environment minus secret-looking names. The others don't say. |
| Cursor, VS Code, Windsurf, Zed, Claude Desktop, Goose's desktop app | the Dock, the Start menu, a launcher | the launch environment, not the shell profile's. Not documented by any of them. On macOS, an app opened from the Dock gets launchd's short `PATH` without Homebrew's or nvm's folders; Claude Desktop's `spawn npx ENOENT` is the known result ([report](https://github.com/tomaspavlin/rohlik-mcp/issues/6)). VS Code resolves the login shell's environment at start on macOS and Linux ([a Claude Code issue that compares the two](https://claudeissues.com/issue/44649-claude-code-desktop-mac-does-not-inherit-user-shell-path-when-launched-from-dock); not in VS Code's docs). On Windows, apps get the user's and the system's `PATH` from the registry, which usually includes npm's global folder, but `repomagpie` there is a `.cmd` shim. |

**Windows `.cmd` shims:** "`.bat` and `.cmd` files are not executable on their own without a terminal", so a process started without a shell can't run them ([Node.js child_process](https://nodejs.org/api/child_process.html)). npm installs `repomagpie` as `repomagpie.cmd` on Windows.

That is why `setup` writes the absolute `node` and the absolute entry file, never `repomagpie` ([decision 0035](decisions/0035-setup-and-doctor.md), "How agents launch RepoMagpie").

## The shared skills folder

- `~/.agents/skills/` is read by Codex, Cursor, Gemini CLI (as an alias), VS Code, Copilot CLI and Zed. Claude Code reads only `~/.claude/skills/`. Cursor and VS Code also read `~/.claude/skills/`, so a skill in both folders can appear twice there.
- `npx skills add` installs a symlink per agent to one canonical copy by default, or copies with `--copy` ([skills CLI](https://github.com/vercel-labs/skills)). Its global lock file is `~/.agents/.skill-lock.json` (version 3; each entry has its source and a folder hash, which `npx skills update` compares with GitHub) ([lock files](https://www.mintlify.com/vercel-labs/skills/advanced/lock-files), a mirror of the project's docs).

## Hooks: what an adapter could do

For the hook-adapters brief. "Ask" is what our Claude Code hook does on an avoid note ([decision 0024](decisions/0024-recall-asks-on-avoid-notes.md)); "context on allow" is how the other notes reach the agent.

| Agent | Event | Ask | Context on allow | Fails open on error |
|---|---|---|---|---|
| Claude Code | `PreToolUse` | yes | yes (`additionalContext`) | our hook prints nothing and exits 0 ([spec](spec.md), section 6) |
| Codex CLI | `PreToolUse` | not yet ("parsed but not supported") | yes (`additionalContext`) | not documented; an unsupported `ask` lets the call go on |
| Cursor | `beforeShellExecution` | yes (`permission: "ask"`); not enforced on `preToolUse` | not documented on allow | not documented |
| Gemini CLI | `BeforeTool` | no | no (`systemMessage` for the user only) | a non-0, non-2 exit warns and continues |
| VS Code | `PreToolUse` (Preview) | yes, in the docs' example | not documented | not documented |
| Copilot CLI | `preToolUse` | yes (not in the cloud agent) | no | no: any non-zero exit denies; timeouts fail open |
| Windsurf | `pre_run_command` | no | no | exit codes other than 2 proceed |
| Cline | `beforeTool` (SDK plugins) | approval through `policy` | `appendContext` | not documented |
| OpenCode | `tool.execute.before` (plugins) | no | no | not documented |
| Zed, Goose, Claude Desktop | none documented | | | |
