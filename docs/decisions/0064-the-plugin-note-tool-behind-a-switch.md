# 0064 — The plugin's note tool, behind a switch

**Status:** accepted (2026-11-13, from the maintainer's approval of the note-tool plan). Refines [0063](0063-a-claude-code-plugin.md), rules 2 and 4: the plugin's MCP server is no longer read-only. Departs from [0034](0034-the-mcp-server.md)'s "`--allow-write` is off by default" for the plugin's server only (rule 3 below). `--allow-write`, `setup`'s question about it ([0035](0035-setup-and-doctor.md)) and the `note` tool's own rules are unchanged.

## Context
Under 0063 the plugin's MCP server is read-only. A plugin's arguments are fixed, so they can't follow a setting. The skill falls back to `repomagpie note` when there is no `note` tool, but a plugin user may not have the npm package, and then nothing saves a Verdict. The maintainer's brief asked that plugin users can still save one (2026-11-13).

Two ways were open: a launcher in the plugin's `bin/`, so the Bash tool finds `repomagpie`, or an environment variable that turns the tool on.

**Why `bin/` was dropped.** The maintainer ran a probe plugin with a `bin/` launcher on Windows (2026-11-13). It never installed from a local npm registry. Claude Code first refused the registry because it was unencrypted and not the default. With the registry set as the default, nothing installed either. The probe gave no answer on `PATH` or the execute permission, and a plugin listed from npm can't be tested before it is published. The maintainer dropped `bin/` and took the variable.

What the documentation says (read on 2026-11-13: [plugins reference](https://code.claude.com/docs/en/plugins-reference), [MCP](https://code.claude.com/docs/en/mcp)):
- An inline MCP server in `plugin.json` takes `env`, and `${user_config.KEY}` is substituted in an MCP server's configuration. The documentation's own example uses it in `env`.
- `userConfig` declares the options a user is asked for when the plugin is turned on. Each takes `type` (one of `string`, `number`, `boolean`, `directory`, `file`), `title` and `description`, all three required, and optional keys such as `default`. An unknown key fails validation. The user changes an answer in `/config` or with `claude plugin configure`.
- Claude Code gives a plugin's stdio servers `CLAUDE_PLUGIN_ROOT`, and the user's environment besides.
- Not documented: how a boolean is written when substituted, what an option with no answer and no default becomes, and whether Claude Code asks before each MCP tool call by default.

## Decision

**1. `repomagpie mcp` reads `REPOMAGPIE_ALLOW_WRITE`.**
- `true` or `1`, in any case, turns the `note` tool on, as `--allow-write` does.
- Anything else leaves it off: `false`, `0`, an empty value, `yes`, a value with spaces, and a `${user_config.note_tool}` left unexpanded. The check fails closed, since the documentation doesn't say how a boolean arrives.
- The start line on stderr names what turned the tool on: `repomagpie mcp: serving, note tool on (REPOMAGPIE_ALLOW_WRITE).` When the flag is given too, it names the flag.

**2. Only in a plugin's server.** The variable counts only when `CLAUDE_PLUGIN_ROOT` is set and not empty.
- An agent's MCP server gets the user's environment. Without the guard, the variable exported in a shell profile would turn the tool on in every entry `setup` wrote without `--allow-write`. The user said no to `setup`'s question, and `doctor`, which reads each entry's arguments, would still report the tool off.
- Claude Code sets `CLAUDE_PLUGIN_ROOT` for a plugin's servers, and `setup`'s entries never set it.

**3. The plugin's switch: `note_tool`, on by default.**
- `plugin.json`'s MCP server gets `"env": { "REPOMAGPIE_ALLOW_WRITE": "${user_config.note_tool}" }`.
- `userConfig.note_tool` is a `boolean` with `"default": true`. Its title is "Note tool", and its description says what it does and what "off" leaves.
- Its arguments never hold `--allow-write`. The switch is the only way in.
- **A departure from 0034.** 0034 keeps the tool off by default, and `setup` asks first. The plugin is on by default because:
  - Claude Code asks about the switch when the plugin is turned on, as `setup` asks its question. The answer can be changed in `/config`.
  - Claude Code asks before an MCP tool call unless the user allowed the tool, so the agent can't save a note unseen.
  - Without the tool, a plugin user without the npm package can't save a Verdict at all.
  - The tool's own rules don't change: the text is the user's words, never the agent's summary, and an existing Verdict is never replaced (0034).
- **The fallback.** The manual checks before the marketplace goes live cover four things:
  1. the dialog that turns the plugin on shows the switch and its default;
  2. the server gets `true` or `false`;
  3. Claude Code asks before the `note` call;
  4. changing the switch in `/config` and restarting makes `note` appear or disappear.

  If check 1 or 3 fails, the default becomes `false`: one word in `plugin.json`. Once this record is on `main`, that change gets a new record.

**4. Tested without Claude Code.**
- `src/core/launch.test.ts`: the values that turn the tool on, those that don't, and the guard.
- `src/mcp/server.test.ts`: the server over real stdio, with the variable on and off, without `CLAUDE_PLUGIN_ROOT`, and with the flag too.
- `scripts/plugin.test.ts`: the server's `env`, the switch's keys against the ones Claude Code accepts, its type and default, and every `${user_config.*}` declared.
- `npm run check:build`: the installed tarball's MCP server lists `note` with the switch's default and leaves it out with the switch off.

## Consequences
- A plugin user saves a Verdict through the `note` tool, without the npm package. `/config` turns the tool off.
- The variable does nothing outside a plugin's server. `setup`'s entries and what `doctor` reports about them are unchanged.
- `doctor` doesn't report the plugin's switch. Claude Code keeps it in its own settings, under `pluginConfigs`.
- The skill needs no change: it already uses `note` when it is listed and the command otherwise.
- Not confirmed by the documentation, and covered by the manual checks above: a boolean's form when substituted, and the prompt before an MCP tool call.
