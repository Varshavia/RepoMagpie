# Vision

## One-liner

RepoMagpie remembers what you and your team learned about every dependency, and tells your coding agent before it installs one.

([Decision 0009](decisions/0009-positioning-dependency-memory.md).)

## The problem

1. **Coding agents install packages on their own.** At that moment two questions come up: *is this package dangerous?* and *have we been here before, and what did we decide?* Security tools answer the first. Nobody answers the second.
2. **What you learned is scattered.** It sits in someone's head, a daily note, an old chat thread, or a wiki page nobody finds. We expect that the same mistake then gets made twice, and every agent suggestion gets checked again from scratch. That is a hypothesis: the step 1.5 interviews have to show it happens ([validation](validation.md)).
3. **Stars are cheap, so they become noise.** A star records *that* you saw something, never *what it's for* or *when to avoid it*.
4. **Skills are a supply chain too.** With the Agent Skills standard, one repository can ship dozens of skills, and agents install them as readily as packages.

## Who it's for

In launch order ([strategy](strategy.md), §8):
1. **Claude Code power users** who let the agent install dependencies. Hook mode works best there.
2. **Small teams** using any coding agent with a shared repository: the project journal.
3. Later, users of other agent clients through skill mode, as their hook support matures.

Anyone who explores repositories, skills and tools can keep what they judged in the personal journal, not only the dependencies they use.

## Positioning

| | Knows the world (CVEs, malware, popularity) | Knows *you* (your verdicts, your team's history) |
|---|---|---|
| **Before install** | Security tools: Socket, Aikido, SafeDep… | **RepoMagpie** |
| **Browsing later** | GitHub search, star managers | Starcat (macOS), notes apps |

Security scanners know the world. RepoMagpie knows you, and composes with them instead of competing. See [competitors](competitors.md).

Compared with a typical star manager:

| | Typical star manager | RepoMagpie |
|---|---|---|
| Entry point | Bulk import of all stars | One deliberate entry at a time, or a list you wrote (`magpie import`) |
| Who writes the judgment | AI | You: when to use it, when to avoid it |
| When it helps | When you search | When you search, and before your agent installs |
| Storage | App database / plugin data | Plain Markdown files you own |
| Sharing | None | A project journal committed with the code |
| Primary interface | GUI app | CLI + `SKILL.md` (agent-native), any Markdown editor |

## Two journals

([Decision 0013](decisions/0013-two-journal-scopes.md).)
- **Personal journal:** a folder outside any repository, private by default. It holds anything you explored and judged: repositories, skills, tools.
- **Project journal:** `.magpie/` inside a project repository, committed with the code. The team shares it, reviews it and keeps its history through git, with no server.

Search, suggest and recall work across both. `magpie adopt` copies a note from your personal journal into a project.

## Why "magpie"

Magpies are known for collecting shiny things and keeping them in their nest. The daily habit — notice something interesting, bring it home, keep it — is the product.

## Non-goals

- **Not a security scanner.** RepoMagpie never claims to detect malware or vulnerabilities. It shows what you and your team recorded.
- **Not a star importer.** `magpie import` adds lines you wrote, not your stars. Imported notes land as `status: inbox`, and none becomes `reviewed` without your own judgment.
- **Not a hosted service.** No accounts, no server, no telemetry by default.
- **Not tied to Obsidian.** Journals are Obsidian-friendly, but Obsidian is optional.
- **Not an installer.** RepoMagpie never installs packages or skills. `magpie adopt` prints the install command; you or your agent run it.

## Success looks like

- At least one beta tester reports a real install-time recall that changed what they did ([strategy](strategy.md), §12). Stars are a secondary signal.
- The maintainer uses it daily for at least a month before public launch.
- Asking "what do I have for X?" returns the right note in the top 3 results most of the time.
- A new user can go from `install` to first note in under two minutes.
