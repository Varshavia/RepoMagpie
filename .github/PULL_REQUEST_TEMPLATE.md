<!--
Thank you for the pull request. Please read CONTRIBUTING.md first.
The title must follow Conventional Commits, for example "fix(core): skip the value of npm's --before flag":
pull requests are squash-merged, so the title becomes the commit on main (decision 0062).
-->

Closes #

## What changed, and why

## How I tested it

<!-- The commands you ran and what they printed. -->

## Checklist

- [ ] The title follows Conventional Commits: `type(scope): summary`.
- [ ] Tests added or updated (a bug fix has a test that fails without it).
- [ ] Docs updated, and the spec when behaviour changed (`docs/spec.md`).
- [ ] A line under `## [Unreleased]` in `CHANGELOG.md`, if users can see the change.
- [ ] `npm test`, `npm run typecheck` and `npm run build` pass.
- [ ] After editing docs: `npm run check:links`, `npm run check:commands` and `npm run check:characters` pass.
- [ ] After changing `ui/`: `npm run check:bundle` and the end-to-end tests pass.
- [ ] No new dependency, or the issue has the maintainer's approval for it.
