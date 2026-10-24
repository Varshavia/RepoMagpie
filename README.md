<div align="center">

**English** · [Türkçe](docs/readme/README_tr.md)

<img src="docs/assets/logo.svg" width="96" height="96" alt="RepoMagpie logo: a magpie in profile">

# RepoMagpie

### Your dependency notes, checked before your coding agent installs anything.

**Write down why you dropped a package. Your agent reads it before it installs that package again.**

[![npm version](https://img.shields.io/npm/v/repomagpie?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/repomagpie)
[![MCP server](https://img.shields.io/badge/MCP-server-5c4ee5?style=flat-square&logo=modelcontextprotocol&logoColor=white)](docs/spec.md#repomagpie-mcp)
[![Node.js 22.12 or later](https://img.shields.io/badge/Node.js-22.12%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#platforms)
[![CI status](https://img.shields.io/github/actions/workflow/status/Varshavia/RepoMagpie/ci.yml?branch=main&style=flat-square&label=CI&logo=githubactions&logoColor=white)](https://github.com/Varshavia/RepoMagpie/actions/workflows/ci.yml?query=branch%3Amain)
[![MIT licence](https://img.shields.io/badge/licence-MIT-f4c430?style=flat-square)](LICENSE)

[Quick start](#quick-start) · [How it works](#how-it-works) · [What each agent gets](#what-each-agent-gets) · [FAQ](#faq) · [Documentation](#documentation)

<code>npm install -g repomagpie@beta</code><br>
<code>repomagpie setup</code>

</div>

Months ago you tried pdfkit and gave up on it. Today your agent is about to install it again, and RepoMagpie asks you first, with your own note:

```text
$ npm install pdfkit

RepoMagpie: you noted to avoid pdfkit (personal journal)
Verdict: "avoid: async streams painful; use puppeteer"
Alternatives in your personal journal: "puppeteer" (Verdict: "default for PDF rendering")
~/.magpie/notes/npm--pdfkit.md

Do you want to proceed?
```

In Claude Code: RepoMagpie's hook asked first, before the install ran.

- **Remember:** write a verdict in one line, `repomagpie note pdfkit "avoid: async streams painful; use puppeteer"`. Notes are Markdown files you own.
- **Recall before install:** when your agent runs `npm install pdfkit`, it sees your note first.
- **Suggest:** `repomagpie suggest` reads a project's manifests and README, and lists the notes that fit it.

**Status:** pre-release `0.2.0-beta.8`, for early testers. See the [changelog](CHANGELOG.md) and the [roadmap](docs/roadmap.md).

## Quick start

1. Install the `repomagpie` command and set it up in your coding agents. You need Node.js 22.12 or later. `magpie` works as a short alias when no other `magpie` command is on your `PATH`. <!-- check:commands allow -->

   ```bash
   npm install -g repomagpie@beta
   repomagpie setup
   ```

   `setup` finds your agents by their command or app (an agent whose folder is all that's left is listed, not chosen), shows what it will change in which file, asks first, and backs up every file it edits; `repomagpie setup --dry-run` only shows the plan. See [agents](docs/agents.md), or [setting up by hand](docs/setup-by-hand.md).

2. Check what is wired in each agent:

   ```bash
   repomagpie doctor
   ```

   `doctor` also lists `setup`'s backups. Each is a whole copy of its file, and copies of `~/.claude.json` can hold sign-in tokens and MCP servers' secrets. `repomagpie setup --delete-backups` deletes them after asking; `--keep-latest` keeps the newest of each file.

3. Write your first note. Give a package name, or a GitHub URL to also fetch the repository's licence, topics and agent skills:

   ```bash
   repomagpie note pdfkit "avoid: async streams painful; use puppeteer" --type npm
   repomagpie note https://github.com/microsoft/playwright-cli "use for agent browser tests"
   ```

   `--type npm` says the name is an npm package. Inside a project, RepoMagpie reads that from its manifest; elsewhere it asks.

   Without a token, GitHub allows 60 requests an hour. If you use the [GitHub CLI](https://cli.github.com/), give RepoMagpie its token for the current shell to raise the limit: `export GITHUB_TOKEN=$(gh auth token)`, or in PowerShell `$env:GITHUB_TOKEN = gh auth token`.

> [!IMPORTANT]
> RepoMagpie comes only from [this repository](https://github.com/Varshavia/RepoMagpie), the npm package [`repomagpie`](https://www.npmjs.com/package/repomagpie) and the agent skill on [skills.sh](https://skills.sh/varshavia/repomagpie). There are no installers, no `.exe` or other downloads, no other packages and no other website: anything else that calls itself RepoMagpie is not ours ([SECURITY.md](SECURITY.md#official-channels)).

## How it works

![How RepoMagpie works: your agent is about to run npm install pdfkit; the skill or the MCP tool recall checks first, and the hook checks the install command as a backstop; both read your personal journal in ~/.magpie and the project journal in .magpie/; your Verdict, "avoid: async streams painful; use puppeteer", comes back, and your agent asks you before the install.](docs/assets/how-it-works.svg)

Before an install, the skill tells your agent to look the package up with the MCP server's `recall` tool, or the `repomagpie recall` command. RepoMagpie reads both journals on your machine and returns your notes; when one says to avoid the package, your agent shows it to you and asks first. The hook checks the install command itself, in case the agent skips that step. Without a hook, the check works as well as the agent follows the skill.

## Ask your agent

- **What do I have for browser testing?** Your agent searches your journals and answers with the notes it finds, Verdict first; on a small journal it can read every note in one list.
- **Install pdfkit.** Your agent recalls pdfkit before the install. Your avoid note comes back with its alternatives, and your agent asks you before it installs anything.
- **Which of my tools fit this project?** `suggest` reads the project's manifests and README and returns the notes that match; your agent picks the ones that fit, says why, and names any dependency in use that you noted to avoid.

## What each agent gets

What `repomagpie setup` sets up in each agent ([agents](docs/agents.md)):

| Agent | MCP | Skill | Hook | When a note says to avoid a package |
|---|---|---|---|---|
| Claude Code | yes | yes | yes | the hook asks you |
| Codex CLI | yes | yes | yes | the hook stops the first try; your agent asks you |
| Cursor | yes | yes | yes | the hook stops the first try; your agent asks you |
| Gemini CLI | yes | yes | yes | the hook asks you |
| VS Code (GitHub Copilot) | yes | yes | no | no hook; the MCP server and the skill check it |
| Antigravity CLI | yes | yes | yes | the hook asks you |
| Copilot CLI | yes | yes | yes | the hook stops the first try; your agent asks you |

Codex CLI runs a new hook only after you trust it in `/hooks`.

## The local app

`repomagpie ui` opens your journals in the browser. Review an inbox note: write the Verdict, set kind, tags and rating, and press Ctrl+Enter.

![The inbox review in repomagpie ui: a GitHub repository's description and Use when drafts above the Verdict being typed, with tags to pick below](docs/assets/screen-inbox-review.png)

Check a package: what your journals say before an install, and what the hook does in each agent.

![Check a package in repomagpie ui: pdfkit's avoid note says the hook asks first or stops the first try, depending on the agent; left-pad has no note, so the hook stays silent](docs/assets/screen-check-package.png)

Suggest for this project: the notes that fit, and why each one is a candidate.

![Suggest in repomagpie ui: microsoft/playwright first, matched on the @playwright/test dependency; pdfkit listed apart as in use with an avoid note, with pdf-lib and puppeteer instead](docs/assets/screen-suggest.png)

See a journal as a graph: notes, their tags, `[[links]]` and alternatives. Click a note to read and edit it beside the graph.

![The graph page in repomagpie ui on the maintainer's own journal: 39 notes, 67 tags and 157 connections, with the most connected tags and notes, such as #llm, #ai, #mcp and #claude-code, listed beside the graph](docs/assets/screen-graph.png)

## How it compares

| Tool | What it knows | When you see it |
|---|---|---|
| Star managers, such as [Starcat](https://github.com/starcat-app/Starcat) and [GithubStarsManager](https://github.com/AmintaCCCP/GithubStarsManager) | The repositories you starred, with tags and notes | When you search them later |
| Supply-chain scanners, such as [Socket Firewall Free](https://github.com/SocketDev/sfw-free) | Malware, vulnerabilities and popularity, from global data | Before an install |
| RepoMagpie | Your verdicts and your team's | Before an install, when you search, and when you start a project |

A line like "avoid pdfkit" in `CLAUDE.md` covers one project. A RepoMagpie note works across projects, shows up in search, and the hook checks it on every install.

## Platforms

- Node.js 22.12 or later; the package has no runtime dependencies (the MCP server's libraries are bundled in it). CI runs on Linux, Windows and macOS, with Node 22, 24 and 26.
- On Windows, Codex CLI, Copilot CLI, Gemini CLI and Cursor start the hook through Windows PowerShell, which adds about 350 ms each time; Antigravity CLI's `cmd` adds about 90 ms. Copilot CLI runs the hook before every tool call, the others before each shell command.
- Paths with letters outside ASCII, such as a home folder named `C:\Users\Şuat`, are supported.

## FAQ

<details>
<summary><strong>Does RepoMagpie send my notes anywhere?</strong></summary>

No. Your personal journal is a folder of Markdown files on your machine, a project journal is as visible as its repository, and there is no telemetry. The only network requests go to GitHub's API, when you give `repomagpie note`, `repomagpie import` or the app's Add page a GitHub repository: they read its metadata, file list and root manifests, and send `GITHUB_TOKEN` if you set it, never anything from your journals. `repomagpie ui` listens on `127.0.0.1` only, and `repomagpie mcp` never opens a network connection or a port: it talks to your agent over stdio. Your agent sees the notes it reads, and its model provider gets them as part of the conversation. See [SECURITY.md](SECURITY.md#what-repomagpie-reads-writes-and-sends).

</details>

<details>
<summary><strong>Does the hook block installs?</strong></summary>

Never for good, and it never approves one. When a note says to avoid the package, the hook asks you in Claude Code, Gemini CLI and Antigravity CLI; in Codex CLI, Cursor and Copilot CLI it stops the first try, your agent asks you, and the same install then goes through for 10 minutes. A note that doesn't say to avoid the package never stops an install, and neither does an error in RepoMagpie: the hook then does nothing. See the [hook contract](docs/spec.md#6-hook-contract) and [decision 0036](docs/decisions/0036-hooks-in-other-agents.md).

</details>

<details>
<summary><strong>Is it a security scanner?</strong></summary>

No. RepoMagpie shows what you and your team wrote down: it never claims to detect malware or vulnerabilities, and it never installs anything. Run a scanner such as [Socket Firewall Free](https://github.com/SocketDev/sfw-free) next to it ([vision](docs/vision.md#non-goals), [competitors](docs/competitors.md)).

</details>

<details>
<summary><strong>Which agents does it work with?</strong></summary>

`repomagpie setup` sets up the seven in [What each agent gets](#what-each-agent-gets). Other agents with MCP can use the MCP server, and agents with [Agent Skills](https://agentskills.io) the skill: [setting up by hand](docs/setup-by-hand.md) has the entries to write, and [agents](docs/agents.md) what each agent supports.

</details>

<details>
<summary><strong>How do I remove it?</strong></summary>

Run `repomagpie setup --remove`. It takes out only RepoMagpie's own MCP entries, hooks and skill folders, and never restores a backup over your later changes. It leaves your journals (`~/.magpie` and any project's `.magpie/`) and `setup`'s backups: run `repomagpie setup --delete-backups` to delete the backups after asking, then `npm uninstall -g repomagpie`. Antigravity CLI can keep listing a removed entry until you clear `~/.gemini/antigravity-cli/mcp/` ([agents](docs/agents.md#antigravity-cli)).

</details>

<details>
<summary><strong>Where are my notes, and can I edit them by hand?</strong></summary>

Each note is one Markdown file with YAML frontmatter: in `~/.magpie/notes/` for your personal journal, and in `.magpie/notes/` for a project's ([note schema](docs/note-schema.md)). Edit them in any editor: RepoMagpie reads hand-written notes even with fields or sections missing, and never rewrites your sections. `repomagpie ui` edits the same files in the browser. To keep the personal journal elsewhere, set `MAGPIE_HOME` or pass `--home`.

`repomagpie delete <name>`, or Delete in the app, moves a note to the journal's `.trash/`.

</details>

<details>
<summary><strong>How do I share notes with my team?</strong></summary>

Write a note with `--to project`, or copy one from your personal journal with `repomagpie adopt <name>`: both go to the repository's `.magpie/`. Commit it, and your teammates' agents see the note when they recall, search and suggest, as yours do. A project journal is as visible as its repository: anyone who can read the repository can read its notes ([decision 0013](docs/decisions/0013-two-journal-scopes.md)).

</details>

## Documentation

- [Spec](docs/spec.md): every command (`search`, `recall`, `catalog`, `adopt`, `import`, `delete` and the rest; `repomagpie --help` lists them), flag and `--json` document
- [Agents](docs/agents.md): what each coding agent supports, and [setting up by hand](docs/setup-by-hand.md)
- [Note schema](docs/note-schema.md): the format of a note
- [The local app](docs/ui.md): screens, API and security rules
- [Roadmap](docs/roadmap.md) and [changelog](CHANGELOG.md)
- [Testing the beta](TESTING.md): the steps for a week with the beta, and how to send feedback
- [Vision](docs/vision.md), [competitors](docs/competitors.md) and [decisions](docs/decisions/)

Open an issue for bugs and ideas. The project doesn't take pull requests yet ([CONTRIBUTING.md](CONTRIBUTING.md)). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE) © 2026 Yusuf Suat Babacan
