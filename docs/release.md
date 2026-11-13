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
| Create tags, on `main` only | maintainer, with `npm run release:tag` |
| Stage the version on npm (package `repomagpie`) | the release workflow, on the tag ([decision 0033](decisions/0033-releases-staged-from-ci.md)) |
| Approve the staged version on npmjs.com, with 2FA | maintainer, by hand |
| Create GitHub releases | maintainer, by hand |
| List a stable version in the MCP Registry (`mcp-publisher`) | maintainer, by hand |
| List a stable version in the plugin's marketplace (`.claude-plugin/marketplace.json`) | agent, on a branch the maintainer creates after the release; the maintainer merges it |

Agents can't tag, release or publish: git-guard and the deny list block those commands, and `npm run release:tag` without `--dry-run` ([CLAUDE.md](../CLAUDE.md), section 1).

## Releasing a version

The example is a pre-release, `0.2.0-beta.2`. For a final release, drop `--tag beta` and `--prerelease`.

### 1. Prepare (agent, on a release branch)

The maintainer creates the branch `release/vX.Y.Z` (or `release/vX.Y.Z-beta.N`) from `main`. On it, the agent:

- [ ] sets the version in `package.json` and in `package-lock.json` (the top-level `version` and `packages[""].version`), in `skills/repomagpie/SKILL.md`'s `metadata.version` (`repomagpie doctor` compares the installed skill's version with the CLI's), in `server.json`'s `version` and `packages[0].version` (the MCP Registry lists the version it names, step 11), and in `.claude-plugin/plugin.json`'s `version` (Claude Code updates an installed plugin only when it changes, [decision 0063](decisions/0063-a-claude-code-plugin.md)). `npm test` fails until they all agree, and the release workflow refuses a tag whose `server.json` or plugin manifest names another version. Not `.claude-plugin/marketplace.json`: it lists a version already on npm, so it changes after the release (step 12);
- [ ] moves the Unreleased entries in `CHANGELOG.md` under `## [X.Y.Z] - YYYY-MM-DD`, with a one-line summary, leaves an empty `## [Unreleased]`, and updates the compare links at the end of the file;
- [ ] checks that the section covers everything merged since the last release (`git log --oneline vPREVIOUS..HEAD`);
- [ ] updates the roadmap's Now and Next (the READMEs name no version: their status line has said "stable" in all six since `0.2.0`);
- [ ] checks that the static Node.js badge in all six READMEs (`README.md` and `docs/readme/README_*.md`) names `package.json`'s `engines.node` floor (`22.12+` for `>=22.12.0`); shields.io doesn't read it;
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
| `npm run check:bundle` | the app is under 200 kB gzipped, and its first files within decision 0048's line, 104.0 kB ([UI](ui.md) §10) |
| `npm run check:links` | 0 broken links |
| `npm run check:commands` | no doc tells someone to run the alias |
| `npm run check:characters` | no file holds a bidi control or a zero-width character |
| `npm run check:fs-calls` | no code in `src/` or `scripts/` calls `fs.rmSync`, `fs.rm`, `rmdirSync` with `recursive`, `fs.cpSync` or `fs.cp` |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/.scratch/ms-playwright" npm run test:e2e` | no flow fails; the graph's 2,000-note timing is under 2 s |
| `npm run bench` | every command within its budget (spec §7) |
| `node dist/cli/main.js --version` | it prints the new version |
| `npm pack --dry-run` | the package is `repomagpie@X.Y.Z` and lists `LICENSE`, `dist/cli/THIRD-PARTY-LICENSES.md`, `dist/ui/THIRD-PARTY-LICENSES.md`, `dist/ui/icons-LICENSE.txt` and `.claude-plugin/plugin.json`; no runtime dependencies |

### 3. Ship (maintainer; CI stages)

Releases are staged from CI and approved by the maintainer ([decision 0033](decisions/0033-releases-staged-from-ci.md)). Nothing becomes installable until the approval.

1. Commit the release branch, push it, and open a pull request to `main`.
2. Merge it once CI is green ("Rebase and merge" or a merge commit, not squash).
3. Tag the merge: `git switch main`, `git pull`, then `npm run release:tag`. It checks, in order: on `main` with a clean tree; after `git fetch origin main --tags`, `main` is `origin/main` (not behind, not ahead); `package.json`'s version isn't tagged yet, here or on GitHub; `HEAD` is the merge of `release/v<version>` (or, after "Rebase and merge", that branch's last commit, patch for patch); and the release workflow's own check (`scripts/release-check.ts`, which also wants `server.json`'s two versions and the plugin manifest's version to be the release's). It stops at the first that fails and says what to do. Then it asks you to type the tag (`v0.2.0-beta.2`), creates it with `git tag -a`, pushes it, and prints steps 4 to 12 filled in with the version. `npm run release:tag -- --dry-run` runs the checks only. It needs a terminal to tag, and agents can run only the dry run ([CLAUDE.md](../CLAUDE.md), section 1).

   By hand, if the script can't run, in this order (three releases were tagged before their merge):
   1. Merge the release pull request (step 2).
   2. `git switch main`, then `git pull`.
   3. `git log -1` shows that merge, and `package.json`'s `version` is the release's (`0.2.0-beta.2`). If either isn't so, stop: the pull hasn't brought the merge yet.
   4. `git tag v0.2.0-beta.2`, then `git push origin v0.2.0-beta.2`.
4. The tag starts `.github/workflows/release.yml`. Its first job:
   - checks out with the whole history, then refuses a tag that isn't `v` plus `package.json`'s version, a `server.json` or `.claude-plugin/plugin.json` that names another version, or a commit that isn't on `main`'s history (`scripts/release-check.ts`; it also refuses a shallow checkout);
   - runs every check in step 2 except the benchmarks, and the end-to-end tests;
   - refuses a version npm already has;
   - packs the package once, prints the tarball's name and SHA-256, and uploads it as the artifact `package`.

   Its second job, the only one with `id-token: write`, runs no code from the repository or its dependencies: it downloads that tarball, checks its SHA-256, and runs `npm stage publish ./<tarball> --tag beta --ignore-scripts` (`--tag latest` for a final version) through trusted publishing: no token, provenance included. One run per tag at a time; a run is never cancelled halfway.
5. **Approve:** on npmjs.com, open the package's staged versions, check that the staged one is `0.2.0-beta.2` from the expected workflow run, and approve it with 2FA. (`npm stage list repomagpie` and `npm stage approve <stage-id>` do the same from a terminal logged in with 2FA.) Approving can first fail with E409 while npm's automated review runs: `npm stage list` shows the version as `validating`. Wait until it shows another status, then approve again.
6. **Check what was released.** Right after a publish, npm's cache can still answer with the old version, so every `npm view` here has `--prefer-online`. `npm view repomagpie@0.2.0-beta.2 version dist.tarball --prefer-online` answers, and `npm view repomagpie dist-tags --prefer-online` shows `beta` on it (`latest` on a final release).

   The workflow stages a pre-release with `--tag beta` only, which leaves `latest` where it was, and a final release with `--tag latest`; the trusted publisher can only stage, so it can't move a tag. The README's install command, `npm install -g repomagpie`, follows `latest`, as do `npx repomagpie` and an agent that installs the package by name. Until the first stable version, `0.2.0`, each beta was also moved to `latest` by hand (`npm dist-tag add repomagpie@<version> latest`); from `0.2.0` on, betas stay off `latest`.
7. **Check that the released tarball is the one the run packed.** The tarball can be fetched only after the approval. From the repository's folder: `npm pack repomagpie@0.2.0-beta.2 --prefer-online --pack-destination .scratch`, then compare the first 8 characters of its SHA-256 with the line the run's first job printed (`gh run view <run> --log`). `npm run release:tag` prints these lines filled in, for PowerShell and for bash.
8. **Check the provenance:** the version's page on npmjs.com shows "Built and signed on GitHub Actions", linked to this repository, the tagged commit and the `release.yml` run. `npm audit signatures` in a project that installed it checks the same signatures.
9. Create the GitHub release from the drafted notes: `gh release create v0.2.0-beta.2 --prerelease --title "RepoMagpie 0.2.0-beta.2" --notes-file <notes>`.
10. Install the exact version and check it: `npm install -g repomagpie@0.2.0-beta.2`, then `repomagpie --version` prints `0.2.0-beta.2`.
11. **List a stable version in the [MCP Registry](https://registry.modelcontextprotocol.io)** (in preview), after step 10. A pre-release is never listed: the registry's entry is what clients run, so it stays on the last stable version. The registry holds metadata only: `server.json` at the repository's root, whose `name`, `io.github.Varshavia/repomagpie`, must equal `package.json`'s `mcpName` in the published package, case and all (GitHub sign-in allows only names under `io.github.<your GitHub login>/`). A client runs `npx -y repomagpie@<version> mcp`: the read-only tools, without `--allow-write`. From the repository's folder, on `main` at the tag:
    1. Install `mcp-publisher` once ([quickstart](https://modelcontextprotocol.io/registry/quickstart)): `brew install mcp-publisher` on macOS; on Linux, its release archive from `https://github.com/modelcontextprotocol/registry/releases/latest`; on Windows, `mcp-publisher_windows_amd64.tar.gz` (or `_arm64`) from the same page, unpacked with `tar xf` and `mcp-publisher.exe` moved to a folder on `PATH`. `mcp-publisher --help` answers.
    2. `mcp-publisher login github`: it prints a code to enter at `https://github.com/login/device`. Sign in as `Varshavia`. A later "Invalid or expired Registry JWT token" means logging in again.
    3. `mcp-publisher publish`: it reads `server.json` and answers "Successfully published". The registry checks that the npm package at that version has the `mcpName`; "Registry validation failed for package" means the version on npm hasn't it (`0.2.0` hasn't; `0.2.1` is the first that can be listed).
    4. Check it: open `https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.Varshavia/repomagpie` (or `curl` it). It lists the server with the new `version`.

    `npx` runs the server from a clean machine, with no global install: checked on 2026-11-05 with an empty npm cache and prefix, `npx -y repomagpie@0.2.0 mcp` answered `initialize` and listed its five read-only tools. Publishing from CI (GitHub's OIDC sign-in) isn't set up yet ([roadmap](roadmap.md#launch)).
12. **List a stable version in the plugin's marketplace**, after step 10. `.claude-plugin/marketplace.json` lists the `repomagpie` package from npm at one exact version, and Claude Code installs the plugin from there (`repomagpie@repomagpie`, [README](../README.md#the-claude-code-plugin)). Only a version already on npm can be installed, so the marketplace changes after the release, in its own commit. A pre-release is never listed: everyone who installed the plugin would get it. Testers of a pre-release use a local marketplace that lists it, as in the plugin's [manual checks](testing/manual-checks.md#windows).
    1. The maintainer creates a branch from `main`, `fix/marketplace-v0.3.1` for example. On it, the agent sets `plugins[0].source.version` in `.claude-plugin/marketplace.json` to the release's version.
    2. `npm test`: `scripts/plugin.test.ts` wants an exact, stable version that the changelog has a section for, no newer than `package.json`'s. Then `claude plugin validate .claude-plugin/marketplace.json --strict` answers "✔ Validation passed".
    3. One commit, `chore: the plugin marketplace lists 0.3.1`; the maintainer opens the pull request and merges it.
    4. Check it, with the plugin installed from the marketplace: `claude plugin marketplace update repomagpie`, then `claude plugin update repomagpie@repomagpie`, then `repomagpie doctor` shows `installed: repomagpie@repomagpie 0.3.1`.

    Claude Code doesn't update a third-party marketplace on its own unless the user turned on its auto-update (`/plugin`, Marketplaces, "Enable auto-update"; [discover plugins](https://code.claude.com/docs/en/discover-plugins), read on 2026-11-13). Other users get the version with the same two commands, which the README gives.

**If the release workflow can't stage** (an npm or GitHub outage, not a red check: fix that and tag again with a new version): from the tagged commit, `npm ci`, `npm run build`, `npm login`, then `npm stage publish --tag beta` with 2FA, and approve as in step 5. That version has no provenance; the release notes say so.

**Setting up trusted publishing** (once, when the first release from CI is ready; an unused trusted publisher expires after 2 days): on npmjs.com, the package's settings, "Trusted publishing", GitHub Actions: owner `Varshavia`, repository `RepoMagpie`, workflow file `release.yml`, no environment; under "Allowed actions", leave `npm publish` off, so the publisher can only stage. After the first release from CI, set "Publishing access" to "Require two-factor authentication and disallow tokens".

**What can't be tested before the first real run:** the OIDC exchange, staging, the approval and the provenance. The dry path is tested: the tag check (`scripts/release-check.test.ts`), the workflow's shape (`scripts/workflows.test.ts`: the stage job runs no repository code and checks the SHA-256; the first job's checkout isn't shallow), and every check and `npm pack` the first job runs, which CI runs on every pull request.

## Before the public launch

A `v0.1.0-beta.N` pre-release goes to early testers before v0.1 is announced. It is the first contact with users, and it tests H1 ([decision 0014](decisions/0014-step-1-5-desk-research.md)).

## Open questions

- Before 1.0, does a breaking change bump the minor version?
- What counts as a breaking change? The machine-readable output is a public interface ([decision 0008](decisions/0008-machine-readable-output.md)).
