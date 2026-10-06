# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). See the [release process](docs/release.md).

## [Unreleased]

### Added

- `magpie ui` starts a local server on `127.0.0.1` and opens your journals in the browser. The server reads and writes notes through the same code as the CLI, and its API returns the same JSON as `--json`. It answers only requests with the session token from the printed URL, refuses writes from other pages, never sends `GITHUB_TOKEN` to the browser, and reports notes changed in another editor. Flags: `--port`, `--no-open`, `--json`. Ctrl+C stops it.
- The local app in `magpie ui`, dark or light, keyboard first:
  - **Inbox review:** press Enter, write the Verdict, press Ctrl+Enter; the next inbox note opens. Kind, tags, tried and rating sit next to the Verdict, with "What it does" and "Use when" above it.
  - **Note view:** the Verdict first, then Use when and Avoid when. Accept or edit drafts, edit sections, and open the note in your editor or Obsidian.
  - **Search:** with filters for journal, status, kind and tag. A command palette on Ctrl/Cmd+K shows what `magpie search` finds and runs every action. It says "Searching…" until the search answers.
  - **Add and Import:** preview a note before you save it; check import lines before you import them.
  - **Check a package:** shows what the Claude Code hook would say before an install.
  - **Settings:** the journals, whether `GITHUB_TOKEN` is set, the version and the theme.
  - **Safe edits:** a note changed in another editor shows a banner with "Reload", and your unsaved text stays; nothing is overwritten.
- "Edit tag list" opens the journal's `tags.md` in your editor. A journal without `tags.md` shows "Create tag list" instead, which writes the starter list when you click it. A `tags.md` without tags says so in the sidebar, with "Edit tag list".
- Package URLs are shown decoded, for example `pkg:npm/@playwright/cli` and the package `@playwright/cli`, in the app and in `magpie import` output. `--json`, the files and a copied PURL keep the encoded form.
- A third cache, `<journal>/.cache/note-list.json`, keeps the app's note list fast: 2,000 notes load in about 40 ms instead of 500 ms.

- `magpie suggest ["description"]` shows the notes from both journals that fit this project, Verdict first, from its manifests and README or from a description. Packages the project already uses are never suggested; those you noted to avoid are listed apart, under "Already in use, you noted to avoid". It narrows by keyword and tags; your coding agent picks the fit. Flags: `--limit`, `--journal`, `--json`.
- `magpie adopt <name-or-purl>` copies a note from your personal journal into the project journal, with the date as `adopted`, and prints the install command for the project's package manager (`npm`, `pnpm`, `yarn`, `bun`, `pip`, `uv`, `cargo`). For a repository that publishes several packages, it prints one command per package for you to choose from. It never installs anything, and never overwrites a note the project already has. Flags: `--type`, `--json`.
- In the local app: **Suggest for this project**, with the same candidates as `magpie suggest` and a box for a description; and **Adopt to project** on a personal note, which says who can read the project journal before it copies anything.
- An agent skill for any coding agent that supports Agent Skills, installed with `npx skills add Varshavia/RepoMagpie`. It teaches the agent to run `magpie recall` before it adds a dependency and to ask you first when your note says to avoid it (skill mode, for agents without the Claude Code hook); to answer "what do I have for X?" with `magpie search`; to pick what fits a project from `magpie suggest` and say why; and to offer `magpie note` when you form an opinion on a tool. It never writes a Verdict you didn't say, and runs `magpie adopt` or writes to a project journal only with your OK.
- `magpie --version` and `magpie --help`. Help lists the v0.1 commands (`note`, `import`, `search`, `recall`, `ui`, `suggest`, `adopt`, `init`); `init` is not implemented yet.
- `magpie search <query>` searches both journals, with prefix and fuzzy matching. Each completed skill line is its own result. Results lead with the Verdict, say which journal they came from, and put reviewed notes before inbox ones. In a terminal the Verdict gets its own wrapped lines and is never cut. Flags: `--tag` (repeatable), `--kind`, `--journal`, `--limit`, `--json`.
- `magpie recall <package...>` shows your notes on packages before an install, from both journals: Verdict, Avoid when and Use when first. It ignores versions and extras (`pdfkit@1.2.0`, `requests[socks]>=2`) and takes PURLs. A match under another package type is labelled "name match only". Flags: `--type`, `--full`, `--json`.
- `magpie hook claude-code`, for a Claude Code `PreToolUse` hook: before an install such as `npm install pdfkit`, a note that says to avoid the package makes Claude Code ask you first; any other note reaches the agent as context. magpie never denies an install, and the hook stays silent when nothing matches or anything fails. `--inform-only` never asks, for unattended `claude -p` runs. `--help` prints the settings snippet.
- The search index and a recall index are cached in `<journal>/.cache/`. They are rebuilt when notes change and are safe to delete.
- `~/.magpie` and the personal journal's own folder are never used as a project journal, and looking for a project journal stops at your home directory.
- A new journal starts with a starter `tags.md` of ten tags. An existing `tags.md` is never overwritten.
- `magpie note <name-or-url> ["text"]` captures a one-line Verdict for a package or repository, for example `magpie note pdfkit "avoid: async streams painful"`.
- `magpie note <github-url>` creates a note from the repository's GitHub metadata: licence, language, topics, packages from root manifests, a drafted kind and "What it does", and one skill line per `SKILL.md`. Run it again to refresh those fields and add new skills; your own text is never changed.
- `magpie import <file>` adds one note per `- <url-or-name> — verdict: ... | use: ... | avoid: ...` line, with `--dry-run` to preview. One bad line never stops the rest. A list copied out of a chat works too: items may also start with `* `, `+ ` or `\- `. A file without items gets a hint that says what its first line starts with.
- Global flags `--json`, `--home <dir>` and `--project <dir>`; `note` and `import` take `--to personal|project`. A project journal is created at the git root on first use.
- `GITHUB_TOKEN`, if set, is used for GitHub requests and never printed.
- A package name never holds `\`, `:` or `%`, or starts with a dot, so `magpie note` and `magpie import` refuse a file path given as a name.

[Unreleased]: https://github.com/Varshavia/RepoMagpie/commits/main
