# 0015 — Language and runtime: TypeScript on Node.js

**Status:** accepted (2026-10-03)

## Context
Roadmap step 2 asked whether to build `magpie` in TypeScript or Python. The agent-skills ecosystem and its installers run on Node.js, and users should be able to try `magpie` without setting up a toolchain.

## Decision
- **TypeScript on Node.js.**
- **Support:** `engines.node >= 22`. CI tests on Node 22, 24 and 26. Support for 22 ends at its end of life, 2027-04-30.
- **Distribution:** the package is published as compiled ESM JavaScript, so `npx repomagpie` works with zero setup.
- **Development:** the source must run under Node's built-in type stripping, so tests need no build step. `tsconfig` sets `erasableSyntaxOnly`: no enums, no namespaces.
- **Tests:** `node:test`, as already used for git-guard. No network in tests; use fixtures.

Release facts this rests on (checked 2026-10-03):
- Node 22 is in maintenance until its end of life on 2027-04-30. Node 24 is Active LTS until 2026-10-20, then maintenance until 2028-04-30. Node 26 enters LTS on 2026-10-28, with end of life on 2029-04-30 ([Node.js release schedule](https://github.com/nodejs/Release/blob/main/schedule.json)).
- Starting with 27.x, Node.js moves from two major releases a year to one ([Node.js blog, 2026-03-10](https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule)).
- Type stripping is enabled by default since Node.js 22.18.0 (2025-07-31). It is still marked experimental ([release notes](https://nodejs.org/en/blog/release/v22.18.0)).

## Consequences
- Users need Node 22 or later. Contributors need Node 22.18.0 or later to run the TypeScript source directly.
- Type stripping is experimental; if it changes, tests fall back to a build step.
- Every library still goes through the dependency policy (CLAUDE.md, section 9).
- The npm name `repomagpie` was free on 2026-10-03; `magpie` is taken. Whether the installed command is still called `magpie` is settled in the spec.
