# 0066 — The plugin's node-missing check comes after launch

**Status:** accepted (2026-11-13, the maintainer's decision on the two node checks). Supersedes the part of [0063](0063-a-claude-code-plugin.md)'s consequences that runs both checks before the marketplace goes live: the check with `node` missing from `PATH` moves after launch. The check with an older `node` ran before it, as 0063 asks (below). The rest of 0063 is unchanged.

## Context
The plugin's two entries, the hook and the MCP server, start `node` by name from `PATH` (0063, rule 3). 0063 asked for two manual checks before the marketplace goes live: the hook with `node` missing from `PATH`, and with a `node` older than 22.12. A hook that prints an error on every shell command isn't acceptable; if one did, a guard would come first. Any guard changes `.claude-plugin/plugin.json` or the CLI, which ship in the npm package, so the checks had to be settled before `0.3.0`.

- **An older `node` (checked 2026-11-13, by running the hook directly, not through Claude Code):** under Node 20.9.0 and 20.20.2, fetched into the repository's scratch folder, the built CLI and the published `0.3.0-beta.1` ran the hook with the plugin's arguments (`--disallow-code-generation-from-strings <main.js> hook claude-code`). For `npm install moment` with an avoid note it answered `ask` with the reason; for `git status` it printed nothing. Both exited 0, with nothing on stderr. The plugin's MCP server started, listed its tools and answered a call. So an older `node` doesn't print an error on every shell command, and needs no guard. Node 18 wasn't tried; it is past its end of life. Node.js 22.12 or later stays the requirement (`engines`, the README).
- **`node` missing:** not checked. What Claude Code shows when a plugin hook's `command` can't be started is Claude Code's behaviour, and only a session in Claude Code can show it. The maintainer ran no more sessions after the plugin's checks.

## Decision
- **The node-missing check is an after-launch item** ([roadmap](../roadmap.md#the-claude-code-plugin-after-launch)) and stays pending in the [manual checks](../testing/manual-checks.md#windows). The marketplace doesn't wait for it.
- **Why** (the maintainer, 2026-11-13):
  - without Node, nothing in the plugin can run: not the hook, not the MCP server;
  - the README states the requirement: Node.js 22.12 or later on `PATH`, with `node --version` to check it;
  - no guard inside the package can help when the program that starts it is missing. The entries start `node` directly, in exec form, with no shell to check first (0063, 0035). A shell-form guard would bring back the shell 0035 removed, and its slower start on every shell command (about 280 ms through Git Bash on Windows instead of 86 ms, [agents](../agents.md#claude-code)), for users the README already tells what they need.
- **No guard for an older `node`:** the check above found nothing to guard.

## Consequences
- A Claude Code user without Node.js who installs the plugin may see an error from Claude Code on every shell command until they install Node or turn the plugin off. How Claude Code shows it isn't known yet; the after-launch check records it.
- If that check finds an error on every shell command, the fix belongs in the README and in Claude Code's own handling of a hook that can't start, not in the package; a new record decides it then.
- `npm install -g repomagpie` users are unaffected: `setup`'s entries name `node` by absolute path and, for the agents that block on a failed hook, start it only when it is there (0035, [0036](0036-hooks-in-other-agents.md)).
