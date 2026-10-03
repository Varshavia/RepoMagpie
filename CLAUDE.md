# CLAUDE.md

Instructions for AI coding agents working in this repository. Read this file completely before doing anything else. It is the rulebook; details live in `docs/`.

## 1. Git and gh rule (non-negotiable)

The maintainer does all staging, commits and pushes by hand, and every GitHub write (issues, PRs, releases, settings). You only write and edit files.

- **The only git commands you may run:** `git status`, `git diff`, `git log`, `git show`, `git blame`, `git ls-files`, `git check-ignore`.
- **Every other git command is forbidden**, including `add`, `rm`, `mv`, `restore`, `clean`, `revert`, `cherry-pick`, `stash`, `config`, `init` and `worktree`.
- **The only gh commands you may run:** `gh repo view`, `gh issue list`, `gh issue view`, `gh pr list`, `gh pr view`, `gh release list`, `gh release view`, `gh auth status` (without `--show-token`), and `gh api` with GET only: no `-X`/`--method` other than GET, and no `-f`, `-F`, `--field`, `--raw-field` or `--input`. Every other gh command is forbidden. `gh` runs with the maintainer's GitHub credentials.
- This is enforced by a PreToolUse hook (`.claude/hooks/git-guard.mjs`, needs Node.js on `PATH`). The hook is the real guard. The deny list in `.claude/settings.json` is a partial backup layer: it matches only command prefixes and covers only the most damaging git and gh commands, in case the hook can't run (for example, Node.js is missing). Never try to work around either.
- **Write and edit files with the Edit/Write tools**, never with shell heredocs or echo redirection. git-guard scans heredoc text as commands on purpose: a heredoc fed to an interpreter (`bash <<EOF`) runs its body. Don't change that.
- Never add a `Co-Authored-By` line or any AI attribution anywhere.

The maintainer prefers **small, frequent commits**. Split work so each piece can be committed on its own, and stop at natural commit points instead of doing everything at once.

## 2. Session routine

**At the start of every session**, before doing anything else:
1. Read the Pending section and the last entry of the most recent `.worklog/` file (section 14).
2. Read `docs/roadmap.md`: what is in "Now"?
3. Read the docs relevant to the task (section 3).

**At the end of every task:**
1. Go through the definition of done (section 7).
2. Append an entry to today's work log (section 14).
3. Print the list of files you created, changed or deleted.
4. Print a suggested commit message in Conventional Commits format (section 11).
5. Stop and wait for the maintainer.

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

If a task conflicts with a document, **stop and ask**. Do not silently diverge. If the maintainer approves a change of direction, record it as part of the same task: ordinary docs are updated in place; accepted decision records are superseded by a new record.

**Editorial edit:** fixing typos, broken links, or terminology to match `docs/glossary.md`, without changing what was decided, why, or the consequences. Editorial edits are allowed on accepted records; anything else requires a new superseding record. Every editorial edit appends a line at the bottom of the record: `Editorial (YYYY-MM-DD): <what changed>. Substance unchanged.`

## 4. Repo map

| Path | What it is |
|---|---|
| `.claude/` | Agent config: `settings.json` (backup deny list, hook wiring) and `hooks/` (git-guard and its tests). `settings.local.json` is personal and git-ignored. |
| `.scratch/` | Agent scratch space for temporary files. Git-ignored. |
| `.worklog/` | Private agent work log, one file per day; `briefs/` holds the maintainer's briefs. Git-ignored. |
| `docs/` | Vision, roadmap, ideas, product, release process, validation, note schema, glossary, architecture, standards, research, and `decisions/` (decision records). |
| `examples/vault/` | Example vault: the only place notes live in this repo. `_templates/` holds the note template. |
| `.gitignore` | Ignores secrets, build output, the personal vault, `.scratch/` and `.worklog/`. |
| `AGENTS.md` | Points other coding agents to this file. |
| `CHANGELOG.md` | User-visible changes per release (Keep a Changelog). |
| `CLAUDE.md` | This rulebook. |
| `CONTRIBUTING.md` | How to contribute while the project is early: issues and ideas yes, pull requests not yet. |
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
- **Stop and ask only for:** product decisions, anything that changes the meaning of a decision record, security-related changes beyond what the piece asked, scope expansion beyond the current piece, or anything irreversible.
- Either way, still stop after every piece with the file list and a commit message.

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
- **Status:** the tech stack is not chosen yet (see roadmap step 2). Do not introduce a language, framework, or package manager until the decision record exists in `docs/decisions/`.
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

- **Hook tests:** `node --test ".claude/hooks/*.test.mjs"` from the repo root. Node 21+ needs the glob form; a bare directory is not searched. Run it whenever `.claude/hooks/` changes.
- **PowerShell live check:** passed on 2026-10-03. `git -C . commit --dry-run -m test` through the PowerShell tool was blocked by git-guard, not by the deny list (its prefix rules don't match the `-C .` form). Run it again if the hook's tokenizer changes.

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
