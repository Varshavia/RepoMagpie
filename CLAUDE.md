# CLAUDE.md

Instructions for AI coding agents working in this repository. Read this file completely before doing anything else. It is the rulebook; details live in `docs/`.

## 1. Git rule (non-negotiable)

The maintainer does all staging, commits and pushes by hand. You only write and edit files.

- **The only git commands you may run:** `git status`, `git diff`, `git log`, `git show`, `git blame`, `git ls-files`, `git check-ignore`.
- **Every other git command is forbidden**, including `add`, `rm`, `mv`, `restore`, `clean`, `revert`, `cherry-pick`, `stash`, `config`, `init` and `worktree`.
- This is enforced by a PreToolUse hook (`.claude/hooks/git-guard.mjs`, needs Node.js on `PATH`) and a deny list in `.claude/settings.json`. Never try to work around them.
- Never add a `Co-Authored-By` line or any AI attribution anywhere.

The maintainer prefers **small, frequent commits**. Split work so each piece can be committed on its own, and stop at natural commit points instead of doing everything at once.

## 2. Session routine

**At the start of every session**, before doing anything else:
1. Read the last entry of the most recent `.worklog/` file (section 14).
2. Read `docs/roadmap.md`: which step are we on?
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
| Starting any task | `docs/roadmap.md` (what step are we on?) |
| Using or defining a domain term | `docs/glossary.md` |
| Writing core, CLI, search, or MCP code | `docs/architecture.md` |
| Making a design choice | `docs/vision.md`, `docs/decisions/` |
| Touching the note format, templates, or parsers | `docs/note-schema.md` |
| Writing a SKILL.md, CLI, or MCP code | `docs/standards.md`, `docs/decisions/0002-cli-first.md` |
| Writing README, docs, or anything user-facing | `docs/vision.md`, `docs/marketing.md` |

If a task conflicts with a document, **stop and ask**. Do not silently diverge. If the maintainer approves a change of direction, record it as part of the same task: ordinary docs are updated in place; accepted decision records are superseded by a new record.

**Editorial edit:** fixing typos, broken links, or terminology to match `docs/glossary.md`, without changing what was decided, why, or the consequences. Editorial edits are allowed on accepted records; anything else requires a new superseding record. Every editorial edit appends a line at the bottom of the record: `Editorial (YYYY-MM-DD): <what changed>. Substance unchanged.`

## 4. Repo map

| Path | What it is |
|---|---|
| `.claude/` | Agent config: `settings.json` (git deny list, hook wiring) and `hooks/` (git-guard and its tests). `settings.local.json` is personal and git-ignored. |
| `.scratch/` | Agent scratch space for temporary files. Git-ignored. |
| `.worklog/` | Private agent work log, one file per day. Git-ignored. |
| `docs/` | Vision, roadmap, note schema, glossary, architecture, standards, research, and `decisions/` (decision records). |
| `examples/vault/` | Example vault: the only place notes live in this repo. `_templates/` holds the note template. |
| `.gitignore` | Ignores secrets, build output, the personal vault, `.scratch/` and `.worklog/`. |
| `AGENTS.md` | Points other coding agents to this file. |
| `CLAUDE.md` | This rulebook. |
| `LICENSE` | MIT. |
| `README.md` | Landing page: what RepoMagpie is and how it will work. |

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

## 7. Definition of done

- [ ] The goal is verified, with evidence (command output, test result).
- [ ] Tests pass.
- [ ] Affected docs are updated.
- [ ] Roadmap status is updated if a step changed.
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
- **PowerShell caveat:** git-guard's PowerShell path is only tested with fake input. If the PowerShell tool is ever enabled (`CLAUDE_CODE_USE_POWERSHELL_TOOL`), run a live check before relying on it: `git -C . commit --dry-run -m test` must be blocked.

## 14. Work log

A private log of agent work lives in `.worklog/YYYY-MM-DD.md`, one file per day. It is git-ignored.

- **At the start of every session**, before doing anything else, read the last entry of the most recent `.worklog/` file.
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
