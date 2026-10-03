# RepoMagpie

> A plain-markdown field journal for the repos and agent skills you've actually understood — searchable by you and your coding agent.

**Status:** early development. Nothing is installable yet. Follow the [roadmap](docs/roadmap.md).

## Why

Starring a repository takes one click, so stars pile up and get forgotten. A year later you have hundreds of them and can't find the one you need, because a star records *that* you saw something, not *what it's for*.

Most tools try to fix this by importing all your stars and letting AI summarize them. RepoMagpie takes the opposite approach: nothing gets in until you've looked at it and written, in your own words, **when it would be useful**. That one sentence is what makes the journal searchable later.

## How it will work

1. You explore a repository, or a single agent skill inside one.
2. `magpie add <url>` drafts a Markdown note for the repository with the facts it can fetch: description, language, license, topics, and one line per agent skill it finds. A skill URL adds that skill's line to its repository's note.
3. You fill in the part only you can write: *when is this useful?*
4. Later, you — or your coding agent — ask: *"what do I have for browser testing?"* and get answers from your own notes.

## Principles

- **Plain Markdown.** Notes are files with YAML frontmatter. No database, no lock-in. Open them in Obsidian, VS Code, or anything else, and version them with git.
- **You write the "when it's useful" part.** AI can draft facts; judgment stays human.
- **Skill-level search.** One repository can contain dozens of agent skills. Each skill gets a line in its repository's note, and search returns that line as its own result, because a skill is what you'll actually search for.
- **Agent-native.** A CLI plus a `SKILL.md`, following the open [Agent Skills](https://agentskills.io) standard, so any compatible coding agent can query your journal.
- **Your journal stays yours.** The tool is open source; your personal vault lives outside this repository.

## Project docs

| Doc | What's in it |
|---|---|
| [Vision](docs/vision.md) | Problem, audience, positioning, non-goals |
| [Roadmap](docs/roadmap.md) | Ordered steps with acceptance criteria |
| [Ideas](docs/ideas.md) | Approved ideas beyond the first commands, with target releases |
| [Product](docs/product.md) | The five surfaces, illustrative CLI output, graph specification |
| [Release process](docs/release.md) | Versions, tags, changelog, who does what |
| [Changelog](CHANGELOG.md) | User-visible changes per release |
| [Validation](docs/validation.md) | Developer interviews, competitor review, demo scenario |
| [Note schema](docs/note-schema.md) | The format of a note |
| [Glossary](docs/glossary.md) | What each term means |
| [Architecture](docs/architecture.md) | Layers, data flow, storage |
| [Competitive landscape](docs/competitors.md) | Existing tools and how RepoMagpie differs |
| [Standards](docs/standards.md) | Agent Skills, skills.sh, DESIGN.md, MCP |
| [Marketing](docs/marketing.md) | Launch and growth plan |
| [Seed repositories](docs/seed-repos.md) | The first repositories explored for this project |
| [Decisions](docs/decisions/) | Decision records |

## Contributing

Issues and ideas are welcome. Pull requests are not accepted yet. See [CONTRIBUTING.md](CONTRIBUTING.md).
To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Yusuf Suat Babacan
