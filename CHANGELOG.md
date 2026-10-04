# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). See the [release process](docs/release.md).

## [Unreleased]

### Added

- `magpie --version` and `magpie --help`. Help lists the v0.1 commands (`note`, `import`, `search`, `recall`, `suggest`, `adopt`, `init`); `suggest`, `adopt` and `init` are not implemented yet.
- `magpie search <query>` searches both journals, with prefix and fuzzy matching. Each completed skill line is its own result. Results lead with the Verdict, say which journal they came from, and put reviewed notes before inbox ones. In a terminal the Verdict gets its own wrapped lines and is never cut. Flags: `--tag` (repeatable), `--kind`, `--journal`, `--limit`, `--json`.
- `magpie recall <package...>` shows your notes on packages before an install, from both journals: Verdict, Avoid when and Use when first. It ignores versions and extras (`pdfkit@1.2.0`, `requests[socks]>=2`) and takes PURLs. A match under another package type is labelled "name match only". Flags: `--type`, `--full`, `--json`.
- `magpie hook claude-code`, for a Claude Code `PreToolUse` hook: before an install such as `npm install pdfkit`, a note that says to avoid the package makes Claude Code ask you first; any other note reaches the agent as context. magpie never denies an install, and the hook stays silent when nothing matches or anything fails. `--inform-only` never asks, for unattended `claude -p` runs. `--help` prints the settings snippet.
- The search index and a recall index are cached in `<journal>/.cache/`. They are rebuilt when notes change and are safe to delete.
- `~/.magpie` and the personal journal's own folder are never used as a project journal, and looking for a project journal stops at your home directory.
- A new journal starts with a starter `tags.md` of ten tags. An existing `tags.md` is never overwritten.
- `magpie note <name-or-url> ["text"]` captures a one-line Verdict for a package or repository, for example `magpie note pdfkit "avoid: async streams painful"`.
- `magpie note <github-url>` creates a note from the repository's GitHub metadata: licence, language, topics, packages from root manifests, a drafted kind and "What it does", and one skill line per `SKILL.md`. Run it again to refresh those fields and add new skills; your own text is never changed.
- `magpie import <file>` adds one note per `- <url-or-name> — verdict: ... | use: ... | avoid: ...` line, with `--dry-run` to preview. One bad line never stops the rest.
- Global flags `--json`, `--home <dir>` and `--project <dir>`; `note` and `import` take `--to personal|project`. A project journal is created at the git root on first use.
- `GITHUB_TOKEN`, if set, is used for GitHub requests and never printed.

[Unreleased]: https://github.com/Varshavia/RepoMagpie/commits/main
