# 0065 — The plugin's note tool is off by default

**Status:** accepted (2026-11-13, the maintainer applying [0064](0064-the-plugin-note-tool-behind-a-switch.md)'s fallback after its manual checks). Supersedes 0064's default (rule 3, "on by default") and the two reasons it gave. 0064's variable, its `CLAUDE_PLUGIN_ROOT` guard, the switch itself and the `note` tool's rules are unchanged.

## Context
0064 put the plugin's `note` tool behind a `note_tool` switch, on by default. It gave two reasons, and named a fallback: if the enable dialog doesn't show the switch, or Claude Code doesn't ask before the `note` call, the default becomes `false`.

The maintainer ran the plugin's manual checks on Windows, with Claude Code 2.1.323 and RepoMagpie 0.3.0-beta.1 installed from a local marketplace listing the npm package (2026-11-13):
- **No dialog.** Claude Code installed the plugin with "Installed and configured repomagpie. Plugin is now active." and asked nothing, at install or at enable. The switch appears only in `/config`, as "Note tool · repomagpie true", where Enter toggles it. The documentation says `userConfig` is prompted for "when the plugin is enabled", without naming a condition.
- **No prompt before `note`.** The tool saved the Verdict with no permission prompt twice: once in auto mode, and once in a session the maintainer couldn't confirm was in manual mode, where `recall` did ask. No permission rule in the user's settings or the project matched it.
- **The switch's value reaches the server.** With the switch on, `/mcp` listed six tools, `note` among them, and the Verdict was saved word for word.

Both of 0064's reasons failed, so the fallback applies.

## Decision
- **`userConfig.note_tool` defaults to `false`.** A plugin user turns the tool on themselves: the "Note tool" row in `/config`, or "Configure options" in `/plugin`, or `claude plugin configure`, then a restart.
- **Turning it on is the consent.** Nothing asks again before each save: the check found no prompt. Until something does, the guards are the tool's own rules (0034): the text is the user's words, never the agent's summary, and an existing Verdict is never replaced. The skill tells the agent the same.
- **What stays from 0064:** the server's `env` maps the switch to `REPOMAGPIE_ALLOW_WRITE`; only `true` or `1` turns the tool on; only in a plugin's server.
- **Tests:** `scripts/plugin.test.ts` checks the default is `false`. `npm run check:build` runs the installed tarball's MCP server at the default, without `note`, and with the switch on, with `note`.

## Consequences
- A new plugin user can't save a Verdict until they turn the switch on. Without it the skill gives the command to run, and the plugin user may not have the npm package for it.
- A 0.3.0-beta.1 user who already has the switch on in `/config` keeps it on. Whether Claude Code saved the old default under `pluginConfigs` at install isn't known, so the changelog says how to turn it off.
- A prompt on every `note` call, through the tool's `_meta["anthropic/requiresUserInteraction"]`, is planned as its own change and record. The [MCP documentation](https://code.claude.com/docs/en/mcp) says Claude Code then asks on every call, in every mode. That change would answer the second failed check, but not the first: the default stays `false` until the switch is offered when the plugin is turned on.
