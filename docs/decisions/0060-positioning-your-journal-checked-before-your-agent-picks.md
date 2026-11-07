# 0060 — Positioning: your journal of repos and tools, checked before your agent picks one

**Status:** accepted (2026-11-07, from the maintainer's brief for `docs/readme-positioning`). Supersedes [0009](0009-positioning-dependency-memory.md)'s one-liner and its framing as dependency memory. 0009's "empty square" (*before install* × *knows you*) and its rule to compose with security tools stay.

## Context
Over the week before the launch, the message narrowed to one feature: stopping your agent from installing a package. That feature is real and it is the most striking demo, but it isn't what RepoMagpie is. People write notes on CLIs, MCP servers and agent skills, not only on dependencies. The agent reads them when it chooses a tool (`search`, `suggest`), not only before an install (`recall`, the hook). Discover adds repositories the user hasn't tried yet. 0009's one-liner, "remembers what you and your team learned about every dependency, and tells your coding agent before it installs one", covers only the install moment, and it puts the team first.

## Decision
- **What it is:** RepoMagpie is your personal journal of the open-source repos and tools you've tried (libraries, CLIs, MCP servers, agent skills), with your own verdict on each. Your coding agent checks it before it picks a tool. It suggests what worked for you, and it stops on what you ruled out.
- **The one-liner,** used as the README's tagline and everywhere else: **"Your coding agent remembers the repos you've tried, and what you thought of them."**
- **Three parts, in this order:** Remember (your verdict, in your words: when to use it, when to avoid it, what to use instead), Recall (your agent checks those verdicts before it picks a tool, through the skill and the MCP server, and the hook stops an install you ruled out), Discover (find new repos on GitHub and add them with your take).
- **Proof:** the hook's output (the README's hero example), seven agents, and everything local: plain files, no account, no hosted server.
- **Teams come second:** the same notes can live in the repository and be shared through git. One short section or sentence after the individual story, never in the tagline.
- **What it isn't:** not session or conversation memory (it remembers decisions about tools, which you write); not a star list or an awesome list (those hold no opinion your agent can use).
- **Words:** "repos and tools" in the opening, not "packages"; "package" stays where it is literally about package managers (the hook, install commands). "Note", "Verdict" and "journal" stay the product's terms ([glossary](../glossary.md)).

## Consequences
- The README's tagline, opening and "How it works" text, its five translations, `package.json`'s `description`, [vision](../vision.md), [ideas](../ideas.md) and [marketing](../marketing.md) carry the new one-liner.
- `server.json`'s `description` changes with the next release, since the MCP Registry stores it per version ([roadmap](../roadmap.md#launch)).
- `SKILL.md` keeps its wording: it is written for agents and tuned by the skill-compliance eval.
- 0009's risk stays: a star manager could add install-time recall. The answer is still cross-platform plain Markdown and shared project journals ([0013](0013-two-journal-scopes.md)).
