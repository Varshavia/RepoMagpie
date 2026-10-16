// The setup text after `repomagpie hook <agent> --help` (spec §6). Its own module, so the help
// doesn't load the hook.

export const HOOK_HELP = `
Add this to ~/.claude/settings.json or a project's .claude/settings.json
(RepoMagpie never edits a settings file for you):

{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash|PowerShell",
        "hooks": [ { "type": "command", "command": "repomagpie hook claude-code" } ] }
    ]
  }
}

A note that says to avoid a package makes Claude Code ask you before the install.
For unattended runs (claude -p), where nobody can answer, use
"repomagpie hook claude-code --inform-only": notes then only inform.
`;

export const CODEX_HOOK_HELP = `
Add this to ~/.codex/hooks.json:

{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",
        "hooks": [ { "type": "command", "command": "repomagpie hook codex", "timeout": 10 } ] }
    ]
  }
}

On Windows, Codex runs the command in Windows PowerShell, whose execution policy
can block npm's repomagpie.ps1: write "repomagpie.cmd hook codex" there.
Codex skips a new or changed hook until you trust it: open /hooks in Codex.

Codex can't ask you before a command. So a note that says to avoid a package
stops the install's first try, and your agent should ask you; the same install
within 10 minutes goes through. "repomagpie hook codex --inform-only": notes
then only inform.
`;

export const GEMINI_HOOK_HELP = `
Add this to ~/.gemini/settings.json:

{
  "hooks": {
    "BeforeTool": [
      { "matcher": "run_shell_command",
        "hooks": [ { "type": "command", "name": "repomagpie", "command": "repomagpie hook gemini-cli", "timeout": 10000 } ] }
    ]
  }
}

On Windows, Gemini CLI runs the command in PowerShell, whose execution policy
can block npm's repomagpie.ps1: write "repomagpie.cmd hook gemini-cli" there.

A note that says to avoid a package makes Gemini CLI ask you before the install,
with the note in its prompt. Other notes show you a line. For unattended runs
(gemini -p), use "repomagpie hook gemini-cli --inform-only": notes then only inform.
`;

export const ANTIGRAVITY_HOOK_HELP = `
Add this to ~/.gemini/config/hooks.json (Antigravity CLI and the Antigravity IDE
both read it):

{
  "repomagpie": {
    "PreToolUse": [
      { "matcher": "run_command",
        "hooks": [ { "type": "command", "command": "repomagpie hook antigravity", "timeout": 10 } ] }
    ]
  }
}

On Windows, Antigravity CLI runs the command with cmd /c, where npm's
repomagpie.cmd runs as is.

A note that says to avoid a package makes Antigravity ask you before the install,
with the note in its prompt, even after you chose "always allow" for the command.
Other notes add nothing: Antigravity shows a hook's other answers to nobody.
`;
