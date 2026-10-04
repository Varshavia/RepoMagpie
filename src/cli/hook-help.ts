// The setup text after `magpie hook claude-code --help` (spec §6). Its own module, so the help
// doesn't load the hook.
export const HOOK_HELP = `
Add this to ~/.claude/settings.json or a project's .claude/settings.json
(magpie never edits a settings file for you):

{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash|PowerShell",
        "hooks": [ { "type": "command", "command": "magpie hook claude-code" } ] }
    ]
  }
}

A note that says to avoid a package makes Claude Code ask you before the install.
For unattended runs (claude -p), where nobody can answer, use
"magpie hook claude-code --inform-only": notes then only inform.
`;
