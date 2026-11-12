# Contributing

Thank you for helping with RepoMagpie. This guide is for anyone who wants to fix a bug, add a test, improve the docs or translate the README. You need a GitHub account and some TypeScript or Markdown; you don't need to know the whole codebase.

Ideas, questions and bug reports are welcome too: [open an issue](https://github.com/Varshavia/RepoMagpie/issues/new/choose).

Everyone who takes part follows the [code of conduct](CODE_OF_CONDUCT.md). Don't report vulnerabilities in public issues: see [SECURITY.md](SECURITY.md).

## Set up in five minutes

You need:
- **Node.js 22.18 or later.** The published package runs on 22.12, but the tests, the typecheck and the build run the TypeScript source directly, which needs 22.18. Check with `node --version`.
- git, on Linux, macOS or Windows.

Fork the repository on GitHub, then:

```bash
git clone https://github.com/<your-user>/RepoMagpie.git
cd RepoMagpie
npm ci
npm test
```

On a Windows dev machine, `npm ci` took 4 seconds with npm's cache already filled, and `npm test` about 40 seconds for 2,000 tests. If a test fails on a clean checkout of `main`, open an issue with its output.

Run the CLI from the source:

```bash
node src/cli/main.ts --help
```

Commands that write notes write to your real journal, `~/.magpie`, unless you point them elsewhere. Use a scratch journal inside the repository, and delete it afterwards:

```bash
MAGPIE_HOME="$PWD/.scratch/journal" node src/cli/main.ts note pdfkit "avoid: test note" --type npm
```

In PowerShell, set the variable first: `$env:MAGPIE_HOME = "$PWD\.scratch\journal"`. `.scratch/` is git-ignored; put every temporary file there.

## Tests and checks

Run these before you open a pull request. CI runs them too, on Linux, Windows and macOS.

| Command | What it checks | When |
|---|---|---|
| `npm test` | The unit and integration tests | Always |
| `npm run typecheck` | TypeScript, for `src/`, `scripts/` and `ui/` | Always |
| `npm run build` | The CLI bundle and the local app, into `dist/` | Always |
| `npm run check:links` | Every relative link and `#anchor` in the Markdown files | After editing docs |
| `npm run check:commands` | No doc tells people to run the short alias instead of `repomagpie` | After editing docs |
| `npm run check:characters` | No hidden characters (bidi controls, zero-width characters) in text files | After editing any file |
| `npm run check:fs-calls` | No `fs.rm`, `fs.cp` and the like in `src/` or `scripts/` | After code that copies or removes files |
| `npm run check:build` | The built CLI answers as the source does | After `npm run build`, when the build or the CLI's imports change |
| `npm run test:hooks` | The agent hooks in `.claude/hooks/` | When `.claude/hooks/` changes |
| `npm run check:bundle` | The app's size budget | After `npm run build`, when `ui/` changes |

Three things that can surprise you:

- **`npm test` fails if your real `~/.magpie` changes while it runs.** It takes a snapshot of that folder before and after, so a test that writes to your real journal is caught: "The real personal journal … changed during the tests". RepoMagpie itself writes there too, through its hook, `repomagpie ui` or an agent's MCP server. If you use RepoMagpie, don't let it run while the tests do, or run them again.
- **Changes to the local app (`ui/`) need the end-to-end tests, and those need Playwright's Chromium.** Install it once, inside the repository, then build and run the tests:

  ```bash
  PLAYWRIGHT_BROWSERS_PATH="$PWD/.scratch/ms-playwright" npx playwright install chromium
  npm run build
  PLAYWRIGHT_BROWSERS_PATH="$PWD/.scratch/ms-playwright" npm run test:e2e
  ```

- **Tests make no network calls.** Use fixtures, and keep test folders in `.scratch/tests/`, never the system's temp folder.

## Pick an issue

1. Look for issues labelled [`good first issue`](https://github.com/Varshavia/RepoMagpie/labels/good%20first%20issue) (small, with the files to touch) or [`help wanted`](https://github.com/Varshavia/RepoMagpie/labels/help%20wanted).
2. **Claim it with a comment**, for example "I'd like to work on this". The maintainer assigns it to you.
3. **If no pull request arrives within 7 days** of the assignment, the issue is free again for someone else. Say so in a comment if you need more time.

For something no issue covers yet, open an issue first and wait for a reply. This matters most for new behaviour, a new coding agent, or a new dependency: every dependency needs the maintainer's approval and an MIT-compatible licence, and the standard library comes first.

## Make the change

- **Read the docs for the part you change.** [architecture](docs/architecture.md) for the code's layout, the [spec](docs/spec.md) for every command, flag and JSON document, the [glossary](docs/glossary.md) for the terms. When behaviour changes, the spec changes in the same pull request.
- **Tests sit next to the code**, as `*.test.ts`. A bug fix comes with a test that fails without it.
- **Everything is in English:** code, comments, docs and CLI output. Write short sentences in the active voice, with concrete examples.
- **A change users can see** gets a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) ([release process](docs/release.md)). Docs-only changes don't need one.
- **Keep it small.** One issue per pull request; touch only what the issue needs.

### Translating the README

The translations live in [`docs/readme/`](docs/readme/). The English README is the reference. Each translation says, near its top, the date of the English README it was translated from, and the language line at the top of every README lists them all. A translation needs a native or fluent speaker.

### If you use a coding agent

[AGENTS.md](AGENTS.md) points every agent to [CLAUDE.md](CLAUDE.md), and its rules apply to your agent too. Two things to know:

- **Your agent can't commit, push or create branches here.** A hook in `.claude/` (git-guard, which needs Node.js on `PATH`) blocks every git and gh command that writes. That is on purpose: you review the changes, then commit and push yourself.
- **Skip CLAUDE.md's maintainer routine:** the `.worklog/` entries, the commit split and the pull-request draft in `.scratch/`. They are for the maintainer's own agent.

## Open a pull request

Open it from your fork against `main`. The [pull-request template](.github/PULL_REQUEST_TEMPLATE.md) asks for each of these:

- **A title in [Conventional Commits](https://www.conventionalcommits.org/) form:** `type(scope): summary`, for example `fix(core): skip the value of npm's --before flag`. Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`. Scopes, optional: `core`, `cli`, `schema`, `skill`, `mcp`, `docs`, `agents`, `examples`. Outside pull requests are squash-merged ([decision 0062](docs/decisions/0062-outside-pull-requests-are-squash-merged.md)), so the title becomes the one commit on `main`; your branch's own commits can be anything.
- **The issue it closes:** `Closes #123`.
- **What changed, and why.**
- **How you tested it:** the commands you ran and what they printed.
- **The checklist:** tests added or updated, docs and spec updated, a CHANGELOG line for a user-visible change, and the checks above passing.

**Your first pull request's CI run waits for the maintainer's approval.** GitHub holds workflow runs from first-time contributors until a maintainer approves them. That is normal; you don't need to do anything.

## Reviews

- **You get a first response within 3 days:** a review, a question, or a merge.
- If 3 days pass without one, comment on the pull request.
- When the review asks for changes, push them to the same branch. The maintainer squash-merges the pull request once it is ready.

## Licence

RepoMagpie is [MIT-licensed](LICENSE). By contributing, you agree that your contribution is licensed under the same licence.
