# CLAUDE.md

Instructions for AI coding agents working in this repository. Read this file completely before doing anything else.

## 1. Git rule (non-negotiable)

The maintainer does all staging, commits and pushes by hand. You only write and edit files.

- **The only git commands you may run:** `git status`, `git diff`, `git log`, `git show`, `git blame`, `git ls-files`, `git check-ignore`.
- **Every other git command is forbidden**, including `add`, `rm`, `mv`, `restore`, `clean`, `revert`, `cherry-pick`, `stash`, `config`, `init` and `worktree`.
- This is enforced by a PreToolUse hook (`.claude/hooks/git-guard.mjs`, needs Node.js on `PATH`) and a deny list in `.claude/settings.json`. Never try to work around them.
- Never add a `Co-Authored-By` line or any AI attribution anywhere.
- **At the end of every task**, print:
  1. the list of files you created or changed, and
  2. a suggested commit message in Conventional Commits format (e.g. `docs: add note schema`).

The maintainer prefers **small, frequent commits**. Split work so each piece can be committed on its own, and stop at natural commit points instead of doing everything at once.

## 2. Read the docs first

Before starting any task, read the documents relevant to it:

| When you are… | Read |
|---|---|
| Starting any task | `docs/roadmap.md` (what step are we on?) |
| Making a design choice | `docs/vision.md`, `docs/decisions/` |
| Touching the note format, templates, or parsers | `docs/note-schema.md` |
| Writing a SKILL.md, CLI, or MCP code | `docs/standards.md`, `docs/decisions/0002-cli-first.md` |
| Writing README, docs, or anything user-facing | `docs/vision.md`, `docs/marketing.md` |

If a task conflicts with a document, **stop and ask**. Do not silently diverge. If the maintainer approves a change of direction, update the document (or add a new decision record) as part of the same task.

## 3. Working principles

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

## 4. Project conventions

- **Language:** everything in English — code, comments, docs, commit messages, CLI output, note templates.
- **Status:** the tech stack is not chosen yet (see roadmap step 2). Do not introduce a language, framework, or package manager until the decision record exists in `docs/decisions/`.
  - **Exception:** agent dev tooling under `.claude/` (e.g. hook scripts in `.claude/hooks/`) is not part of the product and may use a runtime without a decision record.
- **Personal data:** the maintainer's own vault never enters this repository. Only `examples/vault/` holds sample notes.
- **Docs are part of the product.** When behaviour changes, update the relevant doc in the same task.
- **Decision records:** significant choices go in `docs/decisions/NNNN-short-title.md` using the format of the existing records.

## 5. Work log

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

## 6. Acknowledgements

The working principles above are written in our own words and inspired by:
- [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
- [mattpocock/skills](https://github.com/mattpocock/skills)
