# Vision

## One-liner

A plain-markdown field journal for the repos and agent skills you've actually understood — searchable by you and your coding agent.

## The problem

1. **Stars are cheap, so they become noise.** Starring is one click. After a few years, developers have hundreds or thousands of starred repositories and can't find the one they need. A star records *that* you saw something, never *what it's for* or *when you'd reach for it*.
2. **The unit of reuse is shrinking.** With the Agent Skills standard, a single repository can ship dozens of independent skills (for example, `mattpocock/skills` contains 30+). Directories such as skills.sh index hundreds of thousands of skills. "Which repo?" is becoming "which skill inside which repo?"
3. **Coding agents can't see what you know.** Your agent can search the web, but it can't ask "what has *this developer* already evaluated and trusted?"

## Who it's for

Primary: a developer who regularly explores GitHub (trending pages, newsletters, colleague links) and wants that time to compound instead of evaporate.

Secondary: anyone using coding agents (Claude Code, Codex, Cursor, Copilot, Gemini CLI) who wants the agent to recommend tools from a curated, personal shortlist rather than from the open web.

## Positioning

Existing tools (see [competitors](competitors.md)) start from **"import all your stars and let AI summarize them."**

RepoMagpie starts from **"you understand it, the machine remembers it."**

| | Typical star manager | RepoMagpie |
|---|---|---|
| Entry point | Bulk import of all stars | One deliberate entry at a time |
| Who writes the summary | AI | Facts: tool. *When it's useful*: you |
| Storage | App database / plugin data | Plain Markdown files you own |
| Granularity | Repository | Repository **and** individual skills |
| Primary interface | GUI app | CLI + `SKILL.md` (agent-native), any Markdown editor |

## Why "magpie"

Magpies are known for collecting shiny things and keeping them in their nest. The daily habit — notice something interesting, bring it home, keep it — is the product.

## Non-goals

- **Not a star importer.** We may offer an import later as an *inbox*, but nothing becomes a journal entry without a human-written "when it's useful".
- **Not a hosted service.** No accounts, no server, no telemetry by default.
- **Not tied to Obsidian.** The vault is Obsidian-friendly, but Obsidian is optional.
- **Not a skill installer.** Tools like the `skills` CLI already install skills. RepoMagpie remembers *which* ones are worth installing and *when*.

## Success looks like

- The maintainer uses it daily for at least a month before public launch.
- Asking "what do I have for X?" returns the right note in the top 3 results most of the time.
- A new user can go from `install` to first note in under two minutes.
