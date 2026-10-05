# RepoMagpie

> RepoMagpie remembers what you and your team learned about every dependency, and tells your coding agent before it installs one.

Starting a project? `magpie suggest` shows what you already have that fits.

**Status:** early development. Nothing is installable yet. Follow the [roadmap](docs/roadmap.md).

## Why

Coding agents now install packages on their own. Security tools tell you whether a package is malicious. Nothing tells you whether it's a mistake you, or your team, already made: what you learned sits in someone's head, an old note or a wiki page nobody finds.

RepoMagpie keeps that knowledge as plain Markdown notes, and shows it to your coding agent before it installs a dependency.

## How it will work

1. You capture a verdict in one line: `magpie note pdfkit "avoid: async streams painful; use puppeteer"`. Give it a GitHub URL instead of a name and it also fetches the repository's facts. Or import a list you already wrote with `magpie import <file>`.
2. Notes live in your **personal journal** (private, outside any repository) or in a project's **project journal** (`.magpie/`, committed with the code, shared with your team through git).
3. When your agent runs `npm install pdfkit`, a hook shows it your verdict first. It never denies an install: if your note says to avoid the package, Claude Code asks you to confirm, with your note on screen; otherwise it only informs. Claude Code comes first; other agents follow the same instruction through `SKILL.md`.
4. When you start a project, `magpie suggest` shows what you already have that fits, and `magpie adopt` copies a note into the project.

## Setup

### More GitHub requests

`magpie note <github-url>` and `magpie import` read repositories from GitHub's API. Without a token, GitHub allows 60 requests an hour. If you use the [GitHub CLI](https://cli.github.com/), hand its token to magpie for the current shell:

```powershell
$env:GITHUB_TOKEN = gh auth token
```

```bash
export GITHUB_TOKEN=$(gh auth token)
```

magpie reads the token only from `GITHUB_TOKEN`, sends it only to `api.github.com`, and never prints it.

### Recall in Claude Code

Add this hook to your user settings (`~/.claude/settings.json`) or to a project's `.claude/settings.json`. magpie never edits a settings file for you.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash|PowerShell",
        "hooks": [ { "type": "command", "command": "magpie hook claude-code" } ] }
    ]
  }
}
```

Before Claude Code runs an install such as `npm install pdfkit`, the hook looks the package up in your journals. A note that says to avoid it makes Claude Code ask you first, with the note in the prompt. Any other note goes to the agent as context. If nothing matches, or anything goes wrong, the hook stays silent and the install runs as usual. `magpie hook claude-code --help` prints the same snippet.

Tested live on 2026-10-04: an install with an avoid note made Claude Code ask first, both in its default permission mode and in auto mode.

For unattended runs (`claude -p`), where nobody can answer a prompt, Claude Code turns a question into a refusal. Use `"command": "magpie hook claude-code --inform-only"` there: avoid notes then reach the agent as context, and the install goes ahead.

## Principles

- **Plain Markdown.** Notes are files with YAML frontmatter. No database, no lock-in. Open them in Obsidian, VS Code, or anything else, and version them with git.
- **You write the judgment.** AI can draft facts; the verdict stays yours.
- **Skill-level search.** One repository can contain dozens of agent skills. Each skill gets a line in its repository's note, and search returns that line as its own result.
- **Composes with security tools.** RepoMagpie never claims to detect malware, and never installs anything. It shows what you and your team recorded. For malware, run a firewall such as [Socket Firewall Free](https://github.com/SocketDev/sfw-free) alongside it.
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
