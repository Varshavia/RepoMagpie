# RepoMagpie

> A plain-markdown field journal for the repos and agent skills you've actually understood — searchable by you and your coding agent.

**Status:** early development. Nothing is installable yet. Follow the [roadmap](docs/roadmap.md).

## Why

Coding agents now install packages on their own. Security tools tell you whether a package is malicious. Nothing tells you whether it's a mistake you, or your team, already made: what you learned sits in someone's head, an old note or a wiki page nobody finds.

RepoMagpie keeps that knowledge as plain Markdown notes, and shows it to your coding agent before it installs a dependency.

## How it will work

1. You capture a verdict in one line: `magpie note pdfkit "avoid: async streams painful; use puppeteer"`. Or you import a list you already wrote with `magpie import <file>`.
2. Notes live in your **personal journal** (private, outside any repository) or in a project's **project journal** (`.magpie/`, committed with the code, shared with your team through git).
3. When your agent runs `npm install pdfkit`, a hook shows it your verdict first. It informs and never blocks. Claude Code comes first; other agents follow the same instruction through `SKILL.md`.
4. When you start a project, `magpie suggest` shows what you already have that fits, and `magpie adopt` copies a note into the project.

## Principles

- **Plain Markdown.** Notes are files with YAML frontmatter. No database, no lock-in. Open them in Obsidian, VS Code, or anything else, and version them with git.
- **You write the judgment.** AI can draft facts; the verdict stays yours.
- **Skill-level search.** One repository can contain dozens of agent skills. Each skill gets a line in its repository's note, and search returns that line as its own result.
- **Composes with security tools.** RepoMagpie never claims to detect malware. It shows what you and your team recorded.
- **Agent-native.** A CLI plus a `SKILL.md`, following the open [Agent Skills](https://agentskills.io) standard, so any compatible coding agent can query your journals.
- **Your journal stays yours.** The tool is open source. Your personal journal is private; a project journal is as visible as its repository.

## Project docs

| Doc | What's in it |
|---|---|
| [Vision](docs/vision.md) | Problem, audience, positioning, non-goals |
| [Strategy](docs/strategy.md) | Positioning, landscape, v0.1 scope and the reasons behind them |
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
