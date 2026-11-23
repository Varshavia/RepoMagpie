# 0067 — `doctor` reports what the plugin provides

**Status:** accepted (2026-11-23, from the maintainer's brief after the marketplace install). Supersedes the consequence of [0064](0064-the-plugin-note-tool-behind-a-switch.md) that `doctor` doesn't report the plugin's switch. The rest of 0064, and [0065](0065-the-plugin-note-tool-off-by-default.md)'s default, are unchanged.

## Context
On 2026-11-23 the maintainer installed the plugin from this repository's marketplace on Windows. `repomagpie doctor` ended with "Everything is wired", but two of its lines read as if something were missing:
- under "Claude Code hook": `none`, although the plugin's hook runs;
- under "MCP server in each agent", Claude Code: `installed; no repomagpie entry in ~/.claude.json`, which doesn't say the server comes from the plugin, and shows none of what the other agents' lines show: code generation, and the note tool.

What the documentation says (read 2026-11-23: [settings reference](https://code.claude.com/docs/en/settings-reference), [plugins reference](https://code.claude.com/docs/en/plugins-reference)):
- Claude Code keeps a plugin's non-sensitive `userConfig` answers in the user's `settings.json`, under `pluginConfigs["<plugin>@<marketplace>"].options`. A value is a string, number, Boolean or array of strings.
- It ignores project and local entries there, "because it substitutes these values into plugin hook, MCP, and LSP configurations, and a cloned repository must not be able to supply them."
- An option's `default` is the "value used when the user provides nothing".

## Decision
While Claude Code runs the plugin (0063: on, and installed), `doctor` says what it brings:
- **The hook:** `from the plugin repomagpie@repomagpie 0.3.0` under "Claude Code hook", in place of `none`, or above `setup`'s entries when they are there too.
- **The MCP server:** Claude Code's line is `from the plugin, version 0.3.0, code generation off, note tool off (turn it on in /plugin, repomagpie, Configure options)`. When `setup`'s entry is there too, its line stays and the plugin's comes under it, starting `also`.
- **Where each fact comes from:** the version from the cache folder (the newest, when several are there); code generation from the installed version's `.claude-plugin/plugin.json`; the note tool from `pluginConfigs` in `~/.claude/settings.json`, else the switch's `default` in that `plugin.json`. Project and local settings aren't read for it, as Claude Code doesn't read them.
- **Nothing guessed:** a fact a file doesn't give is left out (code generation) or named as unknown (`note tool: set in /plugin`): an unreadable settings file, an answer that isn't a Boolean, a missing `plugin.json`.
- **`--json`:** `claude_plugin.provides`, `{"version", "code_generation_off", "note_tool"}`, each `null` when unknown; `provides` is `null` while Claude Code doesn't run the plugin. No other field changes.
- With the plugin off, the output is the same, byte for byte. The double install's to-do (0063) stays.

## Consequences
- A plugin user's `doctor` shows the plugin as the source of the hook and the MCP server, and whether the note tool is on, without opening `/config`.
- `doctor` reads one more file, the installed `plugin.json`, and one more key in a file it already reads. It stays read-only.
- With no answer stored, `doctor` shows the switch's default, as the documentation says Claude Code uses it. If Claude Code ever keeps the answers elsewhere, that line would show the default while the user's answer differs, until `doctor` reads the new place.
