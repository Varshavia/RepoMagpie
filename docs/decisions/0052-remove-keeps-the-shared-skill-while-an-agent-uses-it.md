# 0052 — `setup --remove` keeps the shared skill while another agent uses it

**Status:** accepted (2026-10-31, from the maintainer's bug report). Refines [0035](0035-setup-and-doctor.md), "The skill": "`--remove` deletes the link and the real folder only when the folder holds RepoMagpie's skill". 0035 stays as written for everything else; its index row points here. Agent facts: [agents](../agents.md), "The shared skills folder".

## Context
`setup` puts the skill in one real folder, `~/.agents/skills/repomagpie/`, which Codex CLI, Cursor, Gemini CLI, VS Code and Copilot CLI read themselves. Claude Code and Antigravity CLI read it through a link from their own skills folder. 0035 was written with a whole `--remove` in mind: every agent goes, so the shared folder goes too.

`--agents` limits a run to some agents. `repomagpie setup --remove --agents codex` deleted the shared folder, so the agents still set up lost the skill, and Claude Code's link pointed nowhere.

## Decision
- **With `--remove`, the shared folder stays while an agent this run doesn't remove still uses it.** An agent uses it when it is found (by its command, its app or its folder) and:
  - for Claude Code, and Antigravity CLI outside a project: its own skills folder is a link to the shared folder;
  - for the agents that read the shared folder themselves: RepoMagpie's MCP entry is still in their settings. A settings file that can't be read counts as using it: deleting is the step that can't be undone.
- **An installed agent with nothing of RepoMagpie's left doesn't count.** After `--remove --agents codex`, Codex CLI is still installed but no longer uses the skill, so removing the last agent set up takes the folder out.
- **The plan says so** on the skill's line: `leave: ~/.agents/skills/repomagpie: Claude Code and Gemini CLI still read it; setup removes it with the last agent that does.` The links of the agents this run removes still go.
- A whole `--remove` (no `--agents`) chooses every agent found, so it still removes the shared folder.

## Consequences
- `setup --remove --agents <one>` never takes the skill from the other agents.
- With `--project`, the same rule applies to the project's `.agents/skills/repomagpie`. On Windows the project's Claude Code folder is a copy, not a link, so it doesn't keep the shared folder.
- The [spec](../spec.md), section 2 (`setup`), describes this rule.
