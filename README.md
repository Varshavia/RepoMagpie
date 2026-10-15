<p><img src="docs/assets/logo.svg" width="72" height="72" alt="RepoMagpie logo: a magpie in profile"></p>

# RepoMagpie

> RepoMagpie remembers what you and your team learned about every dependency, and tells your coding agent before it installs one.

- **Remember:** write a verdict in one line, `repomagpie note pdfkit "avoid: async streams painful; use puppeteer"`. Notes are Markdown files you own.
- **Recall before install:** when your agent runs `npm install pdfkit`, it sees your note first. A note that says to avoid the package makes Claude Code ask you.
- **Suggest:** `repomagpie suggest` reads a project's manifests and README, and lists the notes that fit it.

**Status:** pre-release `0.2.0-beta.4`, for early testers. See the [changelog](CHANGELOG.md) and the [roadmap](docs/roadmap.md).

## Quick start

You need Node.js 22.12 or later.

1. Install the `repomagpie` command:

   ```bash
   npm install -g repomagpie@beta
   ```

   `magpie` works as a short alias when no other `magpie` command is on your `PATH`. <!-- check:commands allow -->

2. Set it up in your coding agents:

   ```bash
   repomagpie setup
   ```

   It finds Claude Code, Codex CLI, Cursor, Gemini CLI and VS Code, lets you choose, shows what it will change in which file, and asks first. Each agent gets RepoMagpie's MCP server, so it can check your notes before an install and answer "what do I have for browser testing?"; and the agent skill, which tells it when to. Claude Code also gets the hook. Every file is backed up first. `--dry-run` only shows the plan; `--remove` takes it all out. For other agents, or to write the entries yourself, see [setting up by hand](docs/setup-by-hand.md).

   Then run `repomagpie doctor`: it shows what is wired in each agent, and what to do when something isn't.

3. Write your first note. Give a package name, or a GitHub URL to also fetch the repository's licence, topics and agent skills:

   ```bash
   repomagpie note pdfkit "avoid: async streams painful; use puppeteer"
   repomagpie note https://github.com/microsoft/playwright-cli "use for agent browser tests"
   ```

   Notes go to your personal journal in `~/.magpie`. Add `--to project` to write to the project journal, `.magpie/` in the repository, which your team shares through git.

   Now when your agent runs `npm install pdfkit`, it sees your note first. In Claude Code, the hook asks you before the install and names the alternatives you noted; it never blocks one. Other agents check through the MCP server and the skill, which work as well as the agent follows them.

4. Open your journals in the browser to review inbox notes, search, edit, link notes and see them as a graph:

   ```bash
   repomagpie ui
   ```

More commands: `repomagpie search`, `repomagpie recall`, `repomagpie catalog`, `repomagpie adopt` and `repomagpie import`. Run `repomagpie --help`, or read the [spec](docs/spec.md).

## The local app

Review an inbox note: write the Verdict, set kind, tags and rating, and press Ctrl+Enter.

![The inbox review in repomagpie ui: the note's description and Use when above the Verdict editor](docs/assets/screen-inbox-review.png)

Check a package: what your journals say before an install, and what the Claude Code hook would do.

![Check a package in repomagpie ui: pdfkit has an avoid note, so Claude Code asks first; puppeteer has a note; left-pad has none](docs/assets/screen-check-package.png)

Suggest for this project: the notes that fit, and why each one is a candidate.

![Suggest in repomagpie ui: candidates with a why line, and pdfkit listed apart as in use with an avoid note](docs/assets/screen-suggest.png)

Link notes: write `[[puppeteer]]` in any section to link to that note, and add alternatives under the Verdict. "Linked from" at the end of a note lists the notes that link to it. A repository's GitHub topics show as tags you can add with one click.

See a journal as a graph: notes, the tags they carry, their links and alternatives. Click a note to read and edit it beside the graph, or filter by kind, tag and status.

![The graph page in repomagpie ui: 800 notes around their tags, with the most connected tags listed beside the graph](docs/assets/screen-graph.png)

## How it compares

| Tool | What it knows | When you see it |
|---|---|---|
| Star managers, such as [Starcat](https://github.com/starcat-app/Starcat) and [GithubStarsManager](https://github.com/AmintaCCCP/GithubStarsManager) | The repositories you starred, with tags and notes | When you search them later |
| Supply-chain scanners, such as [Socket Firewall Free](https://github.com/SocketDev/sfw-free) | Malware, vulnerabilities and popularity, from global data | Before an install |
| RepoMagpie | Your verdicts and your team's | Before an install, when you search, and when you start a project |

RepoMagpie doesn't replace a scanner: it never claims to detect malware, and it never installs anything. Run a scanner such as Socket Firewall Free next to it.

A line like "avoid pdfkit" in `CLAUDE.md` covers one project. A RepoMagpie note works across projects, shows up in search, and the hook checks it on every install.

## Privacy

RepoMagpie never sends your notes anywhere. The personal journal is a folder of Markdown files on your machine, and a project journal is as visible as its repository. `repomagpie ui` listens on `127.0.0.1` only.

The only network requests are to GitHub's API, when you give `repomagpie note`, `repomagpie import` or the app's Add page a GitHub repository: they read its metadata, file list and root manifests. They send `GITHUB_TOKEN` if you set it, and nothing from your journals. There is no telemetry.

Without a token, GitHub allows 60 requests an hour. If you use the [GitHub CLI](https://cli.github.com/), give RepoMagpie its token for the current shell to raise the limit:

```bash
export GITHUB_TOKEN=$(gh auth token)
```

```powershell
$env:GITHUB_TOKEN = gh auth token
```

## Platforms

- Node.js 22.12 or later. CI runs on Linux, Windows and macOS, with Node 22, 24 and 26.
- The hook works in Claude Code. Every agent with MCP can use the MCP server, and agents with [Agent Skills](https://agentskills.io) the skill ([agents](docs/agents.md)).
- The package has no runtime dependencies: the MCP server's libraries are bundled in it.

## Documentation

- [Spec](docs/spec.md): every command, flag and `--json` document
- [Agents](docs/agents.md): what each coding agent supports, and [setting up by hand](docs/setup-by-hand.md)
- [Note schema](docs/note-schema.md): the format of a note
- [The local app](docs/ui.md): screens, API and security rules
- [Roadmap](docs/roadmap.md) and [changelog](CHANGELOG.md)
- [Vision](docs/vision.md), [competitors](docs/competitors.md) and [decisions](docs/decisions/)

Open an issue for bugs and ideas. The project doesn't take pull requests yet ([CONTRIBUTING.md](CONTRIBUTING.md)). To report a vulnerability, see [SECURITY.md](SECURITY.md).

**Official channels:** this repository, the npm package `repomagpie` and its skills.sh listing. There are no installers or `.exe` downloads; anything else is not ours ([SECURITY.md](SECURITY.md#official-channels)).

## Licence

[MIT](LICENSE) © 2026 Yusuf Suat Babacan
