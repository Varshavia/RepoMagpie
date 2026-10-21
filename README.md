<p><img src="docs/assets/logo.svg" width="72" height="72" alt="RepoMagpie logo: a magpie in profile"></p>

# RepoMagpie

> RepoMagpie remembers what you and your team learned about every dependency, and tells your coding agent before it installs one.

```text
$ npm install pdfkit

RepoMagpie: you noted to avoid pdfkit (personal journal)
Verdict: "avoid: async streams painful; use puppeteer"
Alternatives in your personal journal: "puppeteer" (Verdict: "default for PDF rendering")
~/.magpie/notes/npm--pdfkit.md

Do you want to proceed?
```

Claude Code was about to run `npm install pdfkit`; RepoMagpie's hook found an avoid note in the personal journal and asked first.

- **Remember:** write a verdict in one line, `repomagpie note pdfkit "avoid: async streams painful; use puppeteer"`. Notes are Markdown files you own.
- **Recall before install:** when your agent runs `npm install pdfkit`, it sees your note first. A note that says to avoid the package makes your agent ask you before the install.
- **Suggest:** `repomagpie suggest` reads a project's manifests and README, and lists the notes that fit it.

**Status:** pre-release `0.2.0-beta.6`, for early testers. See the [changelog](CHANGELOG.md) and the [roadmap](docs/roadmap.md).

## Quick start

1. Install the `repomagpie` command; you need Node.js 22.12 or later. `magpie` works as a short alias when no other `magpie` command is on your `PATH`. <!-- check:commands allow -->

   ```bash
   npm install -g repomagpie@beta
   ```

2. Set it up in your coding agents, then check it:

   ```bash
   repomagpie setup    # --dry-run only shows the plan; --remove takes it all out
   repomagpie doctor
   ```

   `setup` finds your agents, shows what it will change in which file, asks first, and backs up every file it edits. `doctor` shows what is wired in each agent. See [agents](docs/agents.md), or [setting up by hand](docs/setup-by-hand.md).

3. Write your first note. Give a package name, or a GitHub URL to also fetch the repository's licence, topics and agent skills:

   ```bash
   repomagpie note pdfkit "avoid: async streams painful; use puppeteer"
   repomagpie note https://github.com/microsoft/playwright-cli "use for agent browser tests"
   ```

   Notes go to your personal journal in `~/.magpie`; `--to project` writes to the repository's `.magpie/`, which your team shares through git. The next time your agent runs `npm install pdfkit`, it sees your note first.

## What each agent gets

The MCP server lets your agent check your notes before an install and answer "what do I have for browser testing?"; the skill tells it when to. The hook checks each install command against your notes before it runs. Without a hook, the check works as well as the agent follows the skill. Other agents with MCP can use the MCP server, and agents with [Agent Skills](https://agentskills.io) the skill ([agents](docs/agents.md)).

| Agent | MCP | Skill | Hook | When a note says to avoid a package |
|---|---|---|---|---|
| Claude Code | yes | yes | yes | the hook asks you |
| Codex CLI | yes | yes | yes | the hook stops the first try; your agent asks you |
| Cursor | yes | yes | yes | the hook stops the first try; your agent asks you |
| Gemini CLI | yes | yes | yes | the hook asks you |
| VS Code (GitHub Copilot) | yes | yes | no | no hook; the MCP server and the skill check it |
| Antigravity CLI | yes | yes | yes | the hook asks you |
| Copilot CLI | yes | yes | yes | the hook stops the first try; your agent asks you |

- Where the hook stops the first try, the same install then goes through for 10 minutes.
- Codex CLI runs a new hook only after you trust it in `/hooks`.
- The hook never blocks an install for good, and never approves one.

## The local app

`repomagpie ui` opens your journals in the browser. Review an inbox note: write the Verdict, set kind, tags and rating, and press Ctrl+Enter.

![The inbox review in repomagpie ui: a GitHub repository's description and Use when drafts above the Verdict being typed, with tags to pick below](docs/assets/screen-inbox-review.png)

Check a package: what your journals say before an install, and what the hook does in each agent.

![Check a package in repomagpie ui: pdfkit's avoid note says the hook asks first or stops the first try, depending on the agent; left-pad has no note, so the hook stays silent](docs/assets/screen-check-package.png)

Suggest for this project: the notes that fit, and why each one is a candidate.

![Suggest in repomagpie ui: microsoft/playwright first, matched on the @playwright/test dependency; pdfkit listed apart as in use with an avoid note, with pdf-lib and puppeteer instead](docs/assets/screen-suggest.png)

See a journal as a graph: notes, their tags, `[[links]]` and alternatives. Click a note to read and edit it beside the graph.

![The graph page in repomagpie ui: 42 notes around tags such as #self-hosting, #ai-agents and #pdf, with pdfkit linked to its alternatives pdf-lib and puppeteer, and the most connected tags listed beside the graph](docs/assets/screen-graph.png)

## How it compares

| Tool | What it knows | When you see it |
|---|---|---|
| Star managers, such as [Starcat](https://github.com/starcat-app/Starcat) and [GithubStarsManager](https://github.com/AmintaCCCP/GithubStarsManager) | The repositories you starred, with tags and notes | When you search them later |
| Supply-chain scanners, such as [Socket Firewall Free](https://github.com/SocketDev/sfw-free) | Malware, vulnerabilities and popularity, from global data | Before an install |
| RepoMagpie | Your verdicts and your team's | Before an install, when you search, and when you start a project |

RepoMagpie doesn't replace a scanner: it never claims to detect malware, and it never installs anything. Run a scanner such as Socket Firewall Free next to it. A line like "avoid pdfkit" in `CLAUDE.md` covers one project. A RepoMagpie note works across projects, shows up in search, and the hook checks it on every install.

## Privacy

RepoMagpie never sends your notes anywhere. The personal journal is a folder of Markdown files on your machine, and a project journal is as visible as its repository. `repomagpie ui` listens on `127.0.0.1` only.

The only network requests are to GitHub's API, when you give `repomagpie note`, `repomagpie import` or the app's Add page a GitHub repository: they read its metadata, file list and root manifests. They send `GITHUB_TOKEN` if you set it, and nothing from your journals. There is no telemetry. Without a token, GitHub allows 60 requests an hour. If you use the [GitHub CLI](https://cli.github.com/), give RepoMagpie its token for the current shell to raise the limit: `export GITHUB_TOKEN=$(gh auth token)`, or in PowerShell `$env:GITHUB_TOKEN = gh auth token`.

## Platforms

- Node.js 22.12 or later; the package has no runtime dependencies (the MCP server's libraries are bundled in it). CI runs on Linux, Windows and macOS, with Node 22, 24 and 26.
- On Windows, Codex CLI, Copilot CLI, Gemini CLI and Cursor start the hook through Windows PowerShell, which adds about 350 ms each time; Antigravity CLI's `cmd` adds about 90 ms. Copilot CLI runs the hook before every tool call, the others before each shell command.
- Paths with letters outside ASCII, such as a home folder named `C:\Users\Şuat`, are supported.

## Documentation

- [Spec](docs/spec.md): every command (`search`, `recall`, `catalog`, `adopt`, `import` and the rest; `repomagpie --help` lists them), flag and `--json` document
- [Agents](docs/agents.md): what each coding agent supports, and [setting up by hand](docs/setup-by-hand.md)
- [Note schema](docs/note-schema.md): the format of a note
- [The local app](docs/ui.md): screens, API and security rules
- [Roadmap](docs/roadmap.md) and [changelog](CHANGELOG.md)
- [Vision](docs/vision.md), [competitors](docs/competitors.md) and [decisions](docs/decisions/)

Open an issue for bugs and ideas. The project doesn't take pull requests yet ([CONTRIBUTING.md](CONTRIBUTING.md)). To report a vulnerability, see [SECURITY.md](SECURITY.md).

**Official channels:** this repository, the npm package `repomagpie` and its skills.sh listing. There are no installers or `.exe` downloads; anything else is not ours ([SECURITY.md](SECURITY.md#official-channels)).

## Licence

[MIT](LICENSE) © 2026 Yusuf Suat Babacan
