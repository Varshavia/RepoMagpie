# Setting up by hand

`repomagpie setup` does all of this for you ([README](../README.md#quick-start)). This page is for an agent `setup` doesn't know yet, a settings file with comments, or when you want to write the entries yourself. `repomagpie setup --dry-run` prints the entries with your machine's paths and changes nothing: its first line, `Each agent will start: …`, is the command and then the arguments, with full paths, ready to copy into `command` and `args`. `repomagpie doctor` checks what you wrote.

## The MCP server

The entry starts Node with code generation turned off, then the installed command's entry file, then `mcp`:

```json
{
  "mcpServers": {
    "repomagpie": {
      "command": "<node>",
      "args": ["--disallow-code-generation-from-strings", "<npm root>/repomagpie/dist/cli/main.js", "mcp"]
    }
  }
}
```

- `<node>`: Node's absolute path. `where node` on Windows, `command -v node` elsewhere.
- `<npm root>`: what `npm root -g` prints, such as `C:\Users\you\AppData\Roaming\npm\node_modules`. In JSON, write each `\` as `\\`.
- For the `note` tool, which writes notes, add `"--allow-write"` after `"mcp"`.

Where each agent keeps the entry, and under which key, is in [agents](agents.md): most use `mcpServers` as above; VS Code uses `servers`; Codex CLI uses TOML:

```toml
[mcp_servers.repomagpie]
command = "<node>"
args = ["--disallow-code-generation-from-strings", "<npm root>/repomagpie/dist/cli/main.js", "mcp"]
```

Why not `"command": "repomagpie"`: an agent started from the Start menu or the Dock may not get your shell's `PATH` ([agents](agents.md#who-gets-the-shells-path)), on Windows `repomagpie` is a `.cmd` file that only a shell runs, and another program named `repomagpie` earlier on `PATH` would run instead.

## The agent skill

```bash
npx skills add Varshavia/RepoMagpie
```

The [skills CLI](https://github.com/vercel-labs/skills) installs it for every agent it knows. It takes the skill from GitHub, which can be newer than your installed `repomagpie`. `setup` copies the skill from your installed package instead, so the two always match; `repomagpie doctor` shows each copy's version.

By hand: copy the folder `<npm root>/repomagpie/skills/repomagpie/` to `~/.agents/skills/repomagpie/` (Codex CLI, Cursor, Gemini CLI, VS Code and others read it) and to `~/.claude/skills/repomagpie/` (Claude Code). Other agents' folders are in [agents](agents.md).

## The Claude Code hook

Add this to `~/.claude/settings.json`, or to a project's `.claude/settings.json` to share it with your team:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash|PowerShell",
        "hooks": [ { "type": "command", "command": "repomagpie hook claude-code" } ] }
    ]
  }
}
```

In your own settings, `setup` writes a faster form that starts Node directly instead of through a shell (86 ms per shell command on Windows instead of about 280 ms through Git Bash):

```json
{ "type": "command", "command": "<node>", "args": ["--disallow-code-generation-from-strings", "<npm root>/repomagpie/dist/cli/main.js", "hook", "claude-code"] }
```

The hook never blocks an install. When a note says to avoid the package, Claude Code asks you first, and the prompt names the alternatives you noted ("Alternatives: puppeteer: default for PDF rendering in new projects"). When nothing matches, or anything fails, it stays silent. For unattended `claude -p` runs, add `--inform-only` (to the command, or as the last argument), so notes inform the agent and never ask.

## The Codex CLI hook

Add this to `~/.codex/hooks.json` (Codex 0.159.0 or later on Windows):

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",
        "hooks": [ { "type": "command", "command": "repomagpie hook codex", "timeout": 10 } ] }
    ]
  }
}
```

On Windows, Codex runs the command in Windows PowerShell, where the default execution policy can block npm's `repomagpie.ps1`: write `repomagpie.cmd hook codex` there. Codex skips a new or changed hook until you trust it: open `/hooks` in Codex and trust it. If nothing happens, check that `config.toml` doesn't turn hooks off (`[features] hooks = false`).

Codex can't ask you before a command, so the hook stops the first try instead. When a note says to avoid the package, the install is stopped once, with the note for your agent and a line for you: `RepoMagpie: stopped installing pdfkit: you noted to avoid pdfkit. Your agent should ask you; the same install goes through for the next 10 minutes.` If you tell the agent to go ahead, the same install goes through, in any form (`npm.cmd`, `pnpm add`), until 10 minutes after the stop. Other notes only inform. `--inform-only` never stops an install.
