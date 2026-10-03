# Release process

How RepoMagpie versions, records and ships releases. Nothing has been released yet. What each release contains is in the [roadmap](roadmap.md).

## Versions

- [Semantic Versioning](https://semver.org/spec/v2.0.0.html), starting at `0.x`.
- Minor versions for features, patch versions for fixes.
- Tags use the format `vX.Y.Z`, for example `v0.1.0`, and are created on `main` only ([decision 0012](decisions/0012-branch-workflow.md)).
- Pre-releases use `vX.Y.Z-beta.N`, for example `v0.1.0-beta.1`.

## Changelog

[`CHANGELOG.md`](../CHANGELOG.md) follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

- New entries go under `## [Unreleased]`, grouped as Added, Changed, Deprecated, Removed, Fixed and Security.
- An entry describes a user-visible change in one line, for example: `Added: magpie import reads one note per line from a file.`
- Docs-only changes don't need entries.

## Who does what

| Task | Who |
|---|---|
| Draft changelog entries under Unreleased during normal work | agent |
| Draft release notes, on request | agent |
| Create tags, on `main` only | maintainer, by hand |
| Create GitHub releases | maintainer, by hand |
| Publish to the package registry chosen in step 2 | maintainer, by hand |

Agents can't tag, release or publish: git-guard and the deny list block those commands ([CLAUDE.md](../CLAUDE.md), section 1).

## Releasing a version

1. The agent drafts release notes from the Unreleased entries, on request.
2. The maintainer moves the entries under a new `## [X.Y.Z] - YYYY-MM-DD` heading.
3. The maintainer tags `vX.Y.Z`, creates the GitHub release, and publishes to the package registry.

## Before the public launch

A `v0.1.0-beta.N` pre-release goes to early testers before v0.1 is announced. It is the first contact with users, and it tests H1 ([decision 0014](decisions/0014-step-1-5-desk-research.md)).

## Later decisions

- Release automation, for example a GitHub Action on tag push.

## Open questions

- Before 1.0, does a breaking change bump the minor version?
- What counts as a breaking change? The machine-readable output is a public interface ([decision 0008](decisions/0008-machine-readable-output.md)).
