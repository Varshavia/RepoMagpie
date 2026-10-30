# 0051 — No project journal outside a git repository

**Status:** accepted (2026-10-30). Supersedes [0016](0016-journal-locations-and-config.md)'s walk "to the git root or the filesystem root" for the project journal; 0016's personal journal and precedence stand.

## Context
[Decision 0016](0016-journal-locations-and-config.md) finds the project journal by walking up from the working directory, the way git finds `.git`, and stops at the git root or the filesystem root. Outside a git repository, the walk goes on to the filesystem root and takes the first `.magpie/` it meets. On a machine with other users, a `.magpie/` in a shared parent folder (another user's folder, `C:\`, `/tmp`) then becomes "the project journal". The hook, `recall`, `search` and `suggest` read it as the team's notes, and an agent is told what it says.

[Decision 0013](0013-two-journal-scopes.md) defines the project journal as `.magpie/` inside a project repository, committed with the code. A folder outside any repository has no such journal.

## Decision
- **Outside a git repository, no project journal is looked for.** It is used only when `--project <path>` names it.
- **Inside a repository, unchanged:** walk up from the working directory to the git root (the nearest folder containing `.git`) and take the first `.magpie/`. One above the git root is never taken. The walk for the git root stops at the home directory, as before, so a repository at home (dotfiles) is not a project.
- **One function decides it** (`findProjectJournal`, with `gitRoot` in `src/core/journals.ts`) for every command: the hooks, `recall`, `search`, `suggest`, `catalog`, `init --auto`, `adopt`, the MCP server's `project`, `doctor` and `ui`. `doctor`'s "in a git repository" uses the same `gitRoot`.
- **Writing:** `repomagpie note --to project` and `adopt` outside a repository fail (exit 1) without `--project`: `No project journal here: outside a git repository, use --project <path>.` They no longer create `.magpie/` in the working directory.
- **`doctor`'s project line,** outside a repository: `none here; outside a git repository, use --project <path>`.

## Consequences
- A folder that isn't a repository but was used as a project (notes written with `--to project` outside git) needs `--project` from now on. The CHANGELOG says so.
- The spec's section 3 ("Finding the project journal") and section 2 (`note`, `adopt`, `doctor`) describe this rule. The glossary's "journal discovery" and [architecture](../architecture.md) follow.
