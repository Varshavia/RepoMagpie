# Release process

How RepoMagpie versions, records and ships releases. What each release contains is in the [roadmap](roadmap.md); what has shipped is in the [changelog](../CHANGELOG.md).

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
| Publish to npm (package `repomagpie`) | maintainer, by hand |

Agents can't tag, release or publish: git-guard and the deny list block those commands ([CLAUDE.md](../CLAUDE.md), section 1).

## Releasing a version

The example is a pre-release, `0.2.0-beta.2`. For a final release, drop `--tag beta` and `--prerelease`.

### 1. Prepare (agent, on a release branch)

The maintainer creates the branch `release/vX.Y.Z` (or `release/vX.Y.Z-beta.N`) from `main`. On it, the agent:

- [ ] sets the version in `package.json` and in `package-lock.json` (the top-level `version` and `packages[""].version`);
- [ ] moves the Unreleased entries in `CHANGELOG.md` under `## [X.Y.Z] - YYYY-MM-DD`, with a one-line summary, leaves an empty `## [Unreleased]`, and updates the compare links at the end of the file;
- [ ] checks that the section covers everything merged since the last release (`git log --oneline vPREVIOUS..HEAD`);
- [ ] updates the README's status line and the roadmap's Now and Next;
- [ ] drafts the GitHub release notes and the pull request's description in `.scratch/`.

### 2. Check (agent, on the release branch)

Run from the repository root, in this order. Every command must pass; report each result in the pull request.

| Command | Passes when |
|---|---|
| `npm ci` | it installs what `package-lock.json` lists |
| `npm test` | no test fails |
| `npm run typecheck` | no errors |
| `npm run test:hooks` | no test fails |
| `npm run build` | exit 0 |
| `npm run check:build` | the built CLI gives the same output as the source (exit 0) |
| `npm run check:bundle` | the app is under 200 kB gzipped |
| `npm run check:links` | 0 broken links |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/.scratch/ms-playwright" npm run test:e2e` | no flow fails; the graph's 2,000-note timing is under 2 s |
| `npm run bench` | every command within its budget (spec §7) |
| `node dist/cli/main.js --version` | it prints the new version |
| `npm pack --dry-run` | the package is `repomagpie@X.Y.Z` and lists `LICENSE`, `dist/cli/THIRD-PARTY-LICENSES.md`, `dist/ui/THIRD-PARTY-LICENSES.md` and `dist/ui/icons-LICENSE.txt`; no runtime dependencies |

### 3. Ship (maintainer, by hand)

1. Commit the release branch, push it, and open a pull request to `main`.
2. Merge it once CI is green ("Rebase and merge" or a merge commit, not squash).
3. Tag the merge on `main`: `git switch main`, `git pull`, `git tag v0.2.0-beta.2`, `git push origin v0.2.0-beta.2`.
4. Publish from that commit: `npm ci`, `npm login`, then `npm publish --tag beta` (its `prepublishOnly` script builds `dist/` first). A final release uses `npm publish`.
5. Approve the staged package on npmjs.com, so the version goes live.
6. Check the dist-tags: `npm view repomagpie dist-tags` shows `beta` on the new version (`latest` on a final release). `--tag beta` leaves `latest` where it was. Until there is a final release, `latest` can follow the betas, so a plain `npm install -g repomagpie` gets the new one: `npm dist-tag add repomagpie@0.2.0-beta.2 latest`.
7. Create the GitHub release from the drafted notes: `gh release create v0.2.0-beta.2 --prerelease --title "RepoMagpie 0.2.0-beta.2" --notes-file <notes>`.
8. Install it and check the version: `npm install -g repomagpie@beta`, then `magpie --version` prints `0.2.0-beta.2`.

## Before the public launch

A `v0.1.0-beta.N` pre-release goes to early testers before v0.1 is announced. It is the first contact with users, and it tests H1 ([decision 0014](decisions/0014-step-1-5-desk-research.md)).

## Later decisions

- Release automation, for example a GitHub Action on tag push.

## Open questions

- Before 1.0, does a breaking change bump the minor version?
- What counts as a breaking change? The machine-readable output is a public interface ([decision 0008](decisions/0008-machine-readable-output.md)).
