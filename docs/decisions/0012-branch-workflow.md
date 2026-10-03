# 0012 — Branch workflow

**Status:** accepted (2026-10-03)

## Context
Until October 2026, all work was committed straight to `main`. Releases need a `main` that is always consistent. Agents can't create branches or pull requests: git-guard blocks those commands ([CLAUDE.md](../../CLAUDE.md), section 1).

## Decision
From [strategy](../strategy.md) §13:
- `main` is always consistent and releasable. Release tags are created on `main` only.
- All work happens on a branch: `docs/...`, `feat/...`, `fix/...`, or `spike/...` for experiments that may be thrown away.
- The maintainer creates branches, opens pull requests on GitHub and merges them.
- The agent reports the current branch at the start of every task (`git status`), and stops if it is on `main` when the task needs a branch.
- Pull requests merge with "Rebase and merge" or a merge commit, not squash, so the small commits stay visible on `main`.
- The agent drafts the pull-request description (summary, files, evidence) at the end of a branch.

## Consequences
- CLAUDE.md gains the agent's branch rules.
- The small-commit habit carries over: each commit on a branch stays reviewable on its own.
