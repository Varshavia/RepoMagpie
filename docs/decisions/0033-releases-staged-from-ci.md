# 0033 — Releases are staged from CI

**Status:** accepted (2026-10-13). Answers "Release automation" under "Later decisions" in the [release process](../release.md). Changes how a version reaches npm; versioning, the changelog and the check list are unchanged.

## Context
Until now the maintainer publishes from their own machine: `npm login`, then `npm publish --tag beta`, then approves the staged version on npmjs.com ([release process](../release.md), "Ship").
- The package carries no provenance, so nobody can check which commit and which build made it.
- The publish runs with a login session on a personal machine, which also runs other tools.
- Popular projects attract impostors. `rea-tools/rea`, for example, copied REA's README, shows 0 stars while claiming 60,000, and points to a Windows `rea.exe`. Provenance on npm is one way a user can tell our package from a copy.

npm now offers two features that fit together:
- **[Trusted publishing](https://docs.npmjs.com/trusted-publishers/)** (OIDC): a GitHub Actions workflow publishes without a stored token. It needs npm CLI 11.5.1 or later, Node 22.14.0 or later, a cloud-hosted runner and `id-token: write`. From a public repository, for a public package, npm adds provenance on its own.
- **[Staged publishing](https://www.infoq.com/news/2026/08/npm-stage-available/)**: `npm stage publish` puts a version in a queue, and a maintainer releases it with 2FA. It needs npm CLI 11.15.0 or later and a package that already exists. A trusted publisher can be limited to `npm stage publish`, so CI can never make a version installable on its own.

Both were checked against npm's documentation on 2026-10-13.

## Decision
- **CI stages, the maintainer approves.** `.github/workflows/release.yml` runs when the maintainer pushes a `v*` tag. It:
  1. runs the full checks;
  2. fails unless the tag equals `v` plus the `version` in `package.json`;
  3. runs `npm stage publish` through trusted publishing, with `--tag beta` for a prerelease (a version with `-`) and `latest` otherwise.

  The maintainer then approves the staged version on npmjs.com with 2FA, as today.
- **The publishing job** runs on a GitHub-hosted runner, with npm CLI 11.15.0 or later and Node 22.14 or later, pinned in the workflow. Only that job gets `id-token: write`. It uses no dependency cache: a poisoned cache must not reach a release.
- **The trusted publisher** on npmjs.com names this repository and `release.yml`, and allows `npm stage publish` only, not `npm publish`.
- **After the first release from CI,** the package is set to "Require two-factor authentication and disallow tokens". Trusted publishing doesn't use tokens, so CI keeps working.
- **Fallback:** if CI can't publish, the maintainer runs `npm stage publish` from their machine with 2FA, then approves as usual. The release process documents it. Such a version has no provenance, and its release notes say so.
- **The approval step:** approve the staged version, check it with `npm view repomagpie@<version>`, then install that exact version and run `repomagpie --version`. On the package's npm page, the provenance points to the tagged commit and `release.yml`.
- The workflow's dry path can be run without publishing: the version check, the checks and `npm pack`. The OIDC step can only be tested by a real release.

## Consequences
- Every release from CI carries provenance: the npm page links the version to this repository, the tagged commit and the workflow run.
- No npm token exists for CI to leak. After "disallow tokens", a stolen token from the maintainer's machine can't publish either; a publish needs 2FA.
- A release needs a green CI run on the tag. A flaky test delays a release; the fallback covers an outage, not a red build.
- A new trusted publisher must publish within 2 days, or it expires and has to be created again. The maintainer creates it only when a release is ready.
- Moving a dist-tag (`npm dist-tag add … latest` while there are only betas) stays a manual step with 2FA.
- `docs/release.md`'s "Ship" steps are rewritten for this flow, with the approval step and the provenance check. `SECURITY.md` names the npm package with provenance as an official channel.
