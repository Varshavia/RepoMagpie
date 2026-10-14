// The setup text after `repomagpie hook claude-code --help` (spec §6). Its own module, so the help
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
