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
- An entry describes a user-visible change in one line, for example: `Added: repomagpie import reads one note per line from a file.`
- Docs-only changes don't need entries.

## Who does what

| Task | Who |
|---|---|
| Draft changelog entries under Unreleased during normal work | agent |
| Draft release notes, on request | agent |
| Create tags, on `main` only | maintainer, by hand |
| Stage the version on npm (package `repomagpie`) | the release workflow, on the tag ([decision 0033](decisions/0033-releases-staged-from-ci.md)) |
| Approve the staged version on npmjs.com, with 2FA | maintainer, by hand |
| Create GitHub releases | maintainer, by hand |

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
| `npm run check:build` | the built CLI gives the same output as the source, and the packed package runs as `repomagpie`, as its alias and through `npx` (exit 0) |
| `npm run check:bundle` | the app is under 200 kB gzipped |
| `npm run check:links` | 0 broken links |
| `npm run check:commands` | no doc tells someone to run the alias |
| `npm run check:characters` | no file holds a bidi control or a zero-width character |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/.scratch/ms-playwright" npm run test:e2e` | no flow fails; the graph's 2,000-note timing is under 2 s |
| `npm run bench` | every command within its budget (spec §7) |
| `node dist/cli/main.js --version` | it prints the new version |
| `npm pack --dry-run` | the package is `repomagpie@X.Y.Z` and lists `LICENSE`, `dist/cli/THIRD-PARTY-LICENSES.md`, `dist/ui/THIRD-PARTY-LICENSES.md` and `dist/ui/icons-LICENSE.txt`; no runtime dependencies |

### 3. Ship (maintainer; CI stages)

Releases are staged from CI and approved by the maintainer ([decision 0033](decisions/0033-releases-staged-from-ci.md)). Nothing becomes installable until the approval.

1. Commit the release branch, push it, and open a pull request to `main`.
2. Merge it once CI is green ("Rebase and merge" or a merge commit, not squash).
3. Tag the merge on `main`: `git switch main`, `git pull`, `git tag v0.2.0-beta.2`, `git push origin v0.2.0-beta.2`.
4. The tag starts `.github/workflows/release.yml`. Its first job:
   - refuses a tag that isn't `v` plus `package.json`'s version, or whose commit isn't on `main`'s history (`scripts/release-check.ts`);
   - runs every check in step 2 except the benchmarks, and the end-to-end tests;
   - refuses a version npm already has, and lists what the package will hold (`npm pack --dry-run`).

   Its second job, the only one with `id-token: write`, builds and runs `npm stage publish --tag beta` (`--tag latest` for a final version) through trusted publishing: no token, provenance included. One run per tag at a time; a run is never cancelled halfway.
5. **Approve:** on npmjs.com, open the package's staged versions, check that the staged one is `0.2.0-beta.2` from the expected workflow run, and approve it with 2FA. (`npm stage list repomagpie` and `npm stage approve <stage-id>` do the same from a terminal logged in with 2FA.)
6. **Check what was released:** `npm view repomagpie@0.2.0-beta.2 version dist.tarball` answers, and `npm view repomagpie dist-tags` shows `beta` on it (`latest` on a final release). `--tag beta` leaves `latest` where it was. Until there is a final release, `latest` can follow the betas: `npm dist-tag add repomagpie@0.2.0-beta.2 latest` (with 2FA).
7. **Check the provenance:** the version's page on npmjs.com shows "Built and signed on GitHub Actions", linked to this repository, the tagged commit and the `release.yml` run. `npm audit signatures` in a project that installed it checks the same signatures.
8. Create the GitHub release from the drafted notes: `gh release create v0.2.0-beta.2 --prerelease --title "RepoMagpie 0.2.0-beta.2" --notes-file <notes>`.
9. Install the exact version and check it: `npm install -g repomagpie@0.2.0-beta.2`, then `repomagpie --version` prints `0.2.0-beta.2`.

**If the release workflow can't stage** (an npm or GitHub outage, not a red check: fix that and tag again with a new version): from the tagged commit, `npm ci`, `npm run build`, `npm login`, then `npm stage publish --tag beta` with 2FA, and approve as in step 5. That version has no provenance; the release notes say so.

**Setting up trusted publishing** (once, when the first release from CI is ready; an unused trusted publisher expires after 2 days): on npmjs.com, the package's settings, "Trusted publishing", GitHub Actions: owner `Varshavia`, repository `RepoMagpie`, workflow file `release.yml`, no environment; under "Allowed actions", leave `npm publish` off, so the publisher can only stage. After the first release from CI, set "Publishing access" to "Require two-factor authentication and disallow tokens".

**What can't be tested before the first real run:** the OIDC exchange, staging, the approval and the provenance. The dry path is tested: the tag check (`scripts/release-check.test.ts`), the workflow's shape (`scripts/workflows.test.ts`), and every check and `npm pack` the first job runs, which CI runs on every pull request.

## Before the public launch

A `v0.1.0-beta.N` pre-release goes to early testers before v0.1 is announced. It is the first contact with users, and it tests H1 ([decision 0014](decisions/0014-step-1-5-desk-research.md)).

## Open questions

- Before 1.0, does a breaking change bump the minor version?
- What counts as a breaking change? The machine-readable output is a public interface ([decision 0008](decisions/0008-machine-readable-output.md)).
