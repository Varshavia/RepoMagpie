# CLAUDE.md

Instructions for AI coding agents working in this repository. Read this file completely before doing anything else. It is the rulebook; details live in `docs/`.

## 1. Git and gh rule (non-negotiable)

The maintainer does all staging, commits and pushes by hand, and every GitHub write (issues, PRs, releases, settings). You only write and edit files.

- **The only git commands you may run:** `git status`, `git diff`, `git log`, `git show`, `git blame`, `git ls-files`, `git check-ignore`.
- **Every other git command is forbidden**, including `add`, `rm`, `mv`, `restore`, `clean`, `revert`, `cherry-pick`, `stash`, `config`, `init` and `worktree`.
- **The only gh commands you may run:** `gh repo view`, `gh issue list`, `gh issue view`, `gh pr list`, `gh pr view`, `gh release list`, `gh release view`, `gh auth status` (without `--show-token`), and `gh api` with GET only: no `-X`/`--method` other than GET, and no `-f`, `-F`, `--field`, `--raw-field` or `--input`. Every other gh command is forbidden. `gh` runs with the maintainer's GitHub credentials.
- This is enforced by a PreToolUse hook (`.claude/hooks/git-guard.mjs`, needs Node.js on `PATH`). The hook is the real guard. The deny list in `.claude/settings.json` is a partial backup layer: it matches only command prefixes and covers only the most damaging git and gh commands, in case the hook can't run (for example, Node.js is missing). Never try to work around either.
- **Write and edit files with the Edit/Write tools**, never from the shell. The hook blocks, in Bash and PowerShell and in chained commands:
  - in-place edits: `sed -i` / `--in-place`, `perl -i` / `-pi`, `ruby -i`, `awk -i inplace`;
  - `tee` writing to a file;
  - redirection to a file: `>`, `>>`, `>|`, `&>`, `2>` and the like. Allowed targets are `/dev/null`, `NUL`, `$null`, and stream forms such as `2>&1` or `>&2`;
  - PowerShell `Set-Content`, `Add-Content` and `Out-File`.

  Read-only commands, `grep` and `sed` without `-i`, `node --test`, npm/npx, and piping to stdout stay allowed. The check is best effort: other ways to write files (for example a script that opens a file) are not detected, and the rule still applies to them.
- git-guard scans heredoc text as commands on purpose: a heredoc fed to an interpreter (`bash <<EOF`) runs its body. Don't change that.
- Never add a `Co-Authored-By` line or any AI attribution anywhere.

The maintainer prefers **small, frequent commits**. Split work so each piece can be committed on its own. Commit splits use **whole files only** (`git add <file>`), never parts of a file, even if that means fewer, larger commits; each commit must pass the tests when applied in order.

### Branches

From [decision 0012](docs/decisions/0012-branch-workflow.md):
- `main` is always consistent and releasable. Release tags are created on `main` only.
- All work happens on a branch: `docs/...`, `feat/...`, `fix/...`, or `spike/...` for experiments that may be thrown away.
- The maintainer creates branches, opens pull requests and merges them, with "Rebase and merge" or a merge commit, not squash. You can't: git-guard blocks `git switch`, `git branch`, `gh pr create` and `gh pr merge`.
- **Report the current branch at the start of every task** (`git status`). If it is `main` and the task changes files that get committed, stop and ask the maintainer to create a branch. Tasks that only change the work log don't need one.
- **At the end of a branch**, draft the pull-request description: summary, decisions, files, evidence. Don't open the pull request.

## 2. Session routine

**At the start of every session**, before doing anything else:
1. Read the Pending section and the last entry of the most recent `.worklog/` file (section 14).
2. Read `docs/roadmap.md`: what is in "Now"?
3. Read the docs relevant to the task (section 3).

**At the start of every task:** run `git status`, report the current branch, and stop if you are on `main` when the task needs a branch (section 1, "Branches").

**Branch workflow:** a brief covers a whole branch. Work through all its pieces without stopping between them. Stop early only for a real question (section 6). Append a work log entry after each piece, so the log stays current.

**At the end of the branch (or of a task that is not a branch brief):**
1. Go through the definition of done (section 7).
2. Append an entry to today's work log (section 14).
3. Give one report: what changed, evidence, decisions you made, open questions.
4. Print the list of files you created, changed or deleted.
5. Print a commit split: whole files only, in order, each with a Conventional Commits message (section 11), each passing the tests.
6. Draft the pull-request description in `.scratch/pr-<branch-name>.md` (section 1, "Branches").
7. Stop and wait for the maintainer.

## 3. Read the docs first

Before starting any task, read the documents relevant to it:

| When you are… | Read |
|---|---|
| Starting any task | `docs/roadmap.md` (what is in "Now"?) |
| Using or defining a domain term | `docs/glossary.md` |
| Writing core, CLI, search, or MCP code | `docs/architecture.md` |
| Making a design choice | `docs/vision.md`, `docs/decisions/` |
| Working on an approved idea (recall, vet, drift, nests, graph, …) | `docs/ideas.md` |
| Designing a surface (CLI output, agent layer, vault layout, graph, nest) | `docs/product.md` |
| Writing a changelog entry or release notes | `docs/release.md`, `CHANGELOG.md` |
| Working with interview or competitor findings | `docs/validation.md` |
| Touching the note format, templates, or parsers | `docs/note-schema.md` |
| Writing a SKILL.md, CLI, or MCP code | `docs/standards.md`, `docs/decisions/0002-cli-first.md` |
| Writing README, docs, or anything user-facing | `docs/vision.md`, `docs/marketing.md` |
| Working on the local app (`magpie ui`, `src/server/`, `ui/`) or any visual surface | `docs/ui.md`, `DESIGN.md` |

If a task conflicts with a document, **stop and ask**. Do not silently diverge. If the maintainer approves a change of direction, record it as part of the same task: ordinary docs are updated in place; decision records merged to `main` are superseded by a new record (before the merge, they may be revised on their branch).

**Editorial edit:** fixing typos, broken links, or terminology to match `docs/glossary.md`, without changing what was decided, why, or the consequences. Editorial edits are allowed on records merged to `main`; anything else requires a new superseding record. Every editorial edit appends a line at the bottom of the record: `Editorial (YYYY-MM-DD): <what changed>. Substance unchanged.`

## 4. Repo map

| Path | What it is |
|---|---|
| `.claude/` | Agent config: `settings.json` (backup deny list, hook wiring) and `hooks/` (git-guard and its tests). `settings.local.json` is personal and git-ignored. |
| `.github/workflows/` | CI: `ci.yml` runs tests, typecheck and hook tests (section 13). |
| `.scratch/` | Agent scratch space for temporary files. Git-ignored. The tests use `.scratch/tests/` and the benchmarks `.scratch/bench/`. |
| `.worklog/` | Private agent work log, one file per day; `briefs/` holds the maintainer's briefs. Git-ignored. |
| `docs/` | Vision, roadmap, ideas, product, release process, validation, note schema, glossary, architecture, standards, the local app (`ui.md`), research, `decisions/` (decision records), and `assets/` (the logo, also the app's favicon; the social preview; the README's screenshots). |
| `examples/vault/` | Example vault: the only place notes live in this repo. `_templates/` holds the note template. |
| `src/` | Product code (TypeScript): `core/`, `cli/`, `hook/`, `server/` (`magpie ui`), with `*.test.ts` next to the code they test ([architecture](docs/architecture.md)). |
| `ui/` | The local app (React, Vite): `src/` (components, the API client, and `logic/` with unit tests), `e2e/` (Playwright), its `tsconfig.json`, `vite.config.ts` and `playwright.config.ts`. Built into `dist/ui/`, which `magpie ui` serves ([UI](docs/ui.md)). |
| `scripts/` | The test runner with its `~/.magpie` canary (`npm test`), the CLI's build and its check (`build-cli.ts`, `npm run check:build`), benchmarks (`npm run bench`), the link check (`npm run check:links`) and the app's size check (`npm run check:bundle`). Typechecked (the `.ts` files), not built or published. |
| `skills/repomagpie/` | The agent skill: `SKILL.md` and `references/` (Agent Skills format; the folder name is the skill's name). No code; `src/cli/skill.test.ts` checks it ([standards](docs/standards.md)). |
| `dist/` | Build output from `npm run build`. Git-ignored. |
| `package.json`, `package-lock.json` | Package `repomagpie`, scripts, and the approved dependencies. |
| `tsconfig.json` | TypeScript settings for the typecheck. |
| `.gitattributes` | Every text file is stored and checked out with LF line endings. |
| `.gitignore` | Ignores secrets, build output, the personal vault, `.scratch/` and `.worklog/`. |
| `AGENTS.md` | Points other coding agents to this file. |
| `CHANGELOG.md` | User-visible changes per release (Keep a Changelog). |
| `CLAUDE.md` | This rulebook. |
| `CONTRIBUTING.md` | How to contribute while the project is early: issues and ideas yes, pull requests not yet. |
| `DESIGN.md` | The visual language: design tokens (colour, type, spacing, radius), components and writing tone, for the local app, the landing page and the demo GIF. |
| `LICENSE` | MIT. |
| `README.md` | Landing page: what RepoMagpie is and how it will work. |
| `SECURITY.md` | How to report a vulnerability privately (GitHub private vulnerability reporting). |

## 5. Working principles

### Think before coding
- State your assumptions explicitly before you implement.
- If the request has more than one reasonable interpretation, list them and ask. Don't pick one silently.
- If something is unclear or contradictory, say exactly what is unclear and stop.
- If a simpler approach exists than the one requested, say so before proceeding.

### Simplicity first
- Write the minimum that solves the stated problem.
- No features, options, or configurability that weren't asked for.
- No abstractions for code used once.
- No error handling for situations that cannot happen.
- If it could be half as long and just as clear, rewrite it.

### Surgical changes
- Touch only what the task requires.
- Don't reformat, rename, or "clean up" unrelated code or comments.
- Don't delete code or comments you don't fully understand.

### Goal-driven execution
- Before coding, write down how we'll know the task is done (a test, a command, an observable result).
- Prefer a failing test first when the behaviour is testable.
- Finish by showing the evidence that the goal is met.

### When stuck
After two failed attempts at the same problem, stop. Report what you tried, what you observed, and your best hypothesis.

## 6. Asking protocol

- Batch your questions into one message and number them.
- For each question, give the options and your recommendation.
- Never ask what the docs already answer. Point to the doc instead.
- **Minor questions** (wording, file placement, test details, small consistency fixes inside the current piece's scope): apply your own recommendation and keep going. List each one under "Decisions I made" in your report, and in the work log entry's "Decisions & assumptions" line.
- **Stop and ask only for a real question:** the spec or docs are silent or ambiguous on a behaviour, a new dependency, a security-related change, a product decision, anything that changes the meaning of a decision record, scope expansion beyond the brief, or anything irreversible. Batch them: do the pieces that don't depend on the answer first, then ask.
- Otherwise don't stop between pieces; report everything once, at the end of the branch (section 2).

## 7. Definition of done

- [ ] The goal is verified, with evidence (command output, test result).
- [ ] Tests pass.
- [ ] Affected docs are updated.
- [ ] CHANGELOG entries are drafted under Unreleased for user-visible changes ([release process](docs/release.md)). This applies from the first product code; docs-only changes don't need entries.
- [ ] Roadmap checkboxes are ticked for completed work, and the status table and "Now / Next / Later" are updated if they changed.
- [ ] The work log entry is written.
- [ ] The file list and a commit message are printed.

## 8. Project conventions

- **Language:** everything in English — code, comments, docs, commit messages, CLI output, note templates.
- **Status:** the language is TypeScript on Node.js, ESM ([decision 0015](docs/decisions/0015-typescript-on-node.md)). Product code lives in `src/` (layout in `docs/architecture.md`) and is written on `feat/...` branches. Every new library still needs approval (section 9); the approved ones are in `docs/spec.md`, section 9.
  - **Exception:** agent dev tooling under `.claude/` (e.g. hook scripts in `.claude/hooks/`) is not part of the product and may use a runtime without a decision record.
- **Docs are part of the product.** When behaviour changes, update the relevant doc in the same task.
- **Decision records:** significant choices go in `docs/decisions/NNNN-short-title.md` using the format of the existing records.

## 9. Dependency policy

- Ask before adding any dependency, and justify it.
- Prefer the standard library.
- The dependency's license must be MIT-compatible.
- Record every added dependency in the work log.

## 10. Security and privacy

- Never read or write outside the repository unless the maintainer asks.
- All temporary files you create go in `.scratch/`. Never write to the OS temp dir, the home directory or anywhere else outside the repo unless the maintainer asks. Files a tool writes to temp on its own (not at your request) are outside this rule.
- At the end of a task, delete the `.scratch/` files you no longer need.
- Never touch the maintainer's real vault. The maintainer's own vault never enters this repository; only `examples/vault/` holds sample notes.
- Secrets come only from environment variables. Never put them in files or logs.
- Tests make no network calls. Use fixtures.

## 11. Commit convention

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`.

- **Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
- **Scopes:** `core`, `cli`, `schema`, `skill`, `mcp`, `docs`, `agents`, `examples`. The scope is optional.
- Example: `docs(schema): add topics field`.

## 12. Writing style

For docs and CLI output: short sentences, active voice, concrete examples, no marketing adjectives.

## 13. Commands

Run from the repo root. Node 22.18 or later runs the TypeScript source directly (type stripping).

| Command | What it does |
|---|---|
| `npm ci` | Install exactly what `package-lock.json` lists. Use it instead of `npm install` unless a dependency was approved and is being added (section 9). |
| `npm test` | Product tests and the scripts' tests (`node --test "src/**/*.test.ts" "ui/src/**/*.test.ts" "scripts/**/*.test.ts"`, through `scripts/test.ts`). Fails if the real `~/.magpie` changed while they ran (section 10). Test folders live in `.scratch/tests/`, never the OS temp folder. |
| `npm run typecheck` | `tsc --noEmit` over `src/` and `scripts/`, then over `ui/` (its own `tsconfig.json`). |
| `npm run build` | Bundle the CLI from `src/cli/main.ts` into `dist/cli/` with Vite ([decision 0025](docs/decisions/0025-bundle-the-cli.md)), then build the local app from `ui/` into `dist/ui/`. `dist/` is git-ignored. |
| `npm run check:build` | The built CLI against the source: the same output for the same commands on a scratch journal (exit 1 if any differs). Run after `npm run build` when the build or the CLI's imports change. |
| `npm run check:bundle` | The app's size in `dist/ui/`, gzipped, against its 200 kB budget (exit 1 over). Run after `npm run build` when `ui/` changes. |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/.scratch/ms-playwright" npm run test:e2e` | The app's end-to-end tests (Chromium) against `magpie ui` on journals in `.scratch/e2e/`. Run `npm run build` first. Install the browser once with the same variable and `npx playwright install chromium`, so it stays inside the repo (section 10). `SCREENS=1` also writes screenshots of every screen to `.scratch/screens/`. The graph page's 2,000-note timing (`ui/e2e/graph-timing.spec.ts`) runs last, alone, in its own project; `-- --project=timing --no-deps` runs only it. It asserts the 2 s budget locally and only reports in CI. |
| `MAGPIE_UI_URL=<printed URL> npm run dev:ui` | Vite's dev server for `ui/`, forwarding `/api` to a running `magpie ui --no-open` (the row below). No CSP there; `magpie ui` always sends one. |
| `npm run bench` | Build, then time `magpie search`, `magpie suggest`, `magpie recall`, the hook, the link index, the graph's data and opening a note by id on 2,000 generated notes against the budgets in spec §7 (median and p95; exit 1 over budget). Run it when search, suggest, recall, the hook, the links, the graph, opening a note or the caches change. `node scripts/bench-*.ts --report-only` never fails on timing (CI uses it). |
| `npm run check:links` | Check every relative link and `#anchor` in the Markdown files. Run it after editing docs. |
| `npm run test:hooks` | Hook tests: `node --test ".claude/hooks/*.test.mjs"`. Node 21+ needs the glob form; a bare directory is not searched. Run it whenever `.claude/hooks/` changes. |
| `node src/cli/main.ts --help` | Run the CLI from source; `node dist/cli/main.js` runs the build. |
| `MAGPIE_HOME="$PWD/.scratch/journal" node src/cli/main.ts note ...` | Try a command that writes notes. Without `MAGPIE_HOME` (or `--home`), `note` and `import` write to `~/.magpie`, the maintainer's real journal (section 10). Delete the scratch journal afterwards. Unauthenticated GitHub requests are limited to 60 an hour. |
| `MAGPIE_HOME="$PWD/.scratch/journal" node src/cli/main.ts ui --no-open` | Start the local app's server on a scratch journal and print its URL; Ctrl+C stops it. It serves the app from `dist/ui/`, so run `npm run build` first. Without `MAGPIE_HOME`, the app reads and edits the real `~/.magpie`. Run it in the background and stop it when done. |

CI (`.github/workflows/ci.yml`) runs `npm test`, `npm run typecheck`, `npm run test:hooks`, `npm run build` and `npm run check:build` on Node 22, 24 and 26, on Linux and Windows; one job with `npm run check:links` and the benchmarks (report only); and one job that builds, runs `npm run check:bundle` and the end-to-end tests (Chromium). When `npm test` fails, the job keeps a TAP report of it for 7 days (artifact `test-report-<os>-node-<version>`): it has each failing test file's exit code, signal and stderr, which the spec output leaves out.
- **PowerShell live check:** passed on 2026-10-03, and again after the tokenizer learned redirections (same day). `git -C . commit --dry-run -m test` through the PowerShell tool was blocked by git-guard, not by the deny list (its prefix rules don't match the `-C .` form). Run it again if the hook's tokenizer changes.

## 14. Work log

A private log of agent work lives in `.worklog/YYYY-MM-DD.md`, one file per day. It is git-ignored.

`docs/roadmap.md` is the single source of truth for project status. The work log's Pending section is agent memory only: it tracks which parts of a brief are left, never project status.

- **At the start of every session**, before doing anything else, read the `## Pending` section and the last entry of the most recent `.worklog/` file.
- **Multi-part briefs:** when the maintainer gives a brief with several parts, copy every part not yet done **verbatim** into a `## Pending` section at the top of today's file. Remove a part from Pending when it is completed. When you start a new day's file, move the Pending section into it. If the brief is stored as a file in `.worklog/briefs/`, that file is the verbatim copy: Pending may list piece names with a pointer to the brief instead. Read a brief file when Pending points to it.
- **At the end of every task**, append an entry to today's file:

  ```markdown
  ## HH:MM: <short task title>
  - Request: one line summarising what the maintainer asked
  - Done: what changed and why
  - Files: created / changed / deleted
  - Commands: notable commands run and their results
  - Decisions & assumptions
  - Unrequested changes: anything done beyond the request
  - Open questions / follow-ups
  - Suggested commit message
  ```
- Never reference or copy `.worklog/` content into committed files.

## 15. Acknowledgements

The working principles above are written in our own words and inspired by:
- [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
- [mattpocock/skills](https://github.com/mattpocock/skills)
