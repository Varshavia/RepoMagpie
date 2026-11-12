# 0062 — Outside pull requests are squash-merged

**Status:** accepted (2026-11-12, from the maintainer's brief for `docs/contributing`). Supersedes [0012](0012-branch-workflow.md)'s merge method for pull requests from outside contributors. 0012 still holds for the maintainer's own branches.

## Context
[0012](0012-branch-workflow.md) merges every pull request with "Rebase and merge" or a merge commit, so the maintainer's small commits stay visible on `main`. Each of those commits follows Conventional Commits and passes the tests on its own ([CLAUDE.md](../../CLAUDE.md), sections 1 and 11).

The project now takes pull requests from outside contributors ([CONTRIBUTING.md](../../CONTRIBUTING.md)). Their branches often hold commits such as "fix typo" or "address review", and asking each contributor to rewrite their history is a barrier for a first pull request.

## Decision
- A pull request from an outside contributor is merged with **"Squash and merge"**: its commits become one commit on `main`.
- The pull request's title becomes that commit's message, so **the title must follow Conventional Commits** (`type(scope): summary`, CLAUDE.md section 11). The branch's own commits can be anything.
- The maintainer's own branches keep 0012's rule: "Rebase and merge" or a merge commit, never squash.

## Consequences
- CONTRIBUTING.md and the pull-request template ask for a Conventional Commits title, not for clean commits.
- CLAUDE.md section 1 names this exception next to 0012's rule.
- The maintainer checks the title, and edits it if needed, before squashing.
- One outside pull request is one commit on `main`, so it can be reverted in one step.
