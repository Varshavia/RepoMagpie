# Decision records

Short records of significant decisions. One file per decision: `NNNN-short-title.md`.

Format: **Status** (proposed / accepted / superseded by NNNN), **Context**, **Decision**, **Consequences**.
**When a record can change:** before it is merged to `main`, a record may be revised on its branch. Once merged, it is immutable: only editorial edits are allowed, and any other change needs a new record that supersedes it.

**Editorial edit:** fixing typos, broken links, or terminology to match `docs/glossary.md`, without changing what was decided, why, or the consequences. Editorial edits are allowed on records merged to `main`; anything else requires a new superseding record. Every editorial edit appends a line at the bottom of the record: `Editorial (YYYY-MM-DD): <what changed>. Substance unchanged.`

| # | Decision | Status |
|---|---|---|
| 0001 | [Plain Markdown storage](0001-plain-markdown-storage.md) | accepted |
| 0002 | [CLI first, SKILL.md, MCP later](0002-cli-first.md) | accepted |
| 0003 | [Personal vault lives outside the repo](0003-vault-outside-repo.md) | accepted |
| 0004 | [English everywhere](0004-english-everywhere.md) | accepted |
| 0005 | [Human-written "when it's useful"](0005-human-written-usefulness.md) | superseded by 0018 |
| 0006 | [One note per repository; skills are searchable lines](0006-skills-as-searchable-lines.md) | accepted |
| 0007 | [Typed relations in frontmatter](0007-typed-relations-in-frontmatter.md) | accepted in part by 0027 (`alternatives`); `works_with` stays proposed |
| 0008 | [Machine-readable output for every command](0008-machine-readable-output.md) | accepted |
| 0009 | [Positioning: what you learned, shown before install](0009-positioning-dependency-memory.md) | accepted |
| 0010 | [v0.1 scope](0010-v0-1-scope.md) | accepted (scope extended by 0021; recall's "never blocks" refined by 0024; the graph's status changed by 0026) |
| 0011 | [Vet and drift: record and integrate, no scanner](0011-vet-and-drift-reduced.md) | accepted |
| 0012 | [Branch workflow](0012-branch-workflow.md) | accepted |
| 0013 | [Two journal scopes, one format](0013-two-journal-scopes.md) | accepted |
| 0014 | [Close step 1.5 with desk research instead of interviews](0014-step-1-5-desk-research.md) | accepted |
| 0015 | [Language and runtime: TypeScript on Node.js](0015-typescript-on-node.md) | accepted |
| 0016 | [Journal locations and config resolution](0016-journal-locations-and-config.md) | accepted |
| 0017 | [Package identity with Package URL (PURL)](0017-package-identity-purl.md) | accepted |
| 0018 | [AI drafts, humans decide](0018-ai-drafts-humans-decide.md) | accepted (supersedes 0005) |
| 0019 | [No star import in v0.1](0019-no-star-import-in-v0-1.md) | accepted |
| 0020 | [Unknown licence](0020-unknown-license.md) | accepted |
| 0021 | [Local UI server](0021-local-ui-server.md) | accepted |
| 0022 | [Frontend stack](0022-frontend-stack.md) | accepted |
| 0023 | [The API is the `--json` contract](0023-api-is-the-json-contract.md) | accepted |
| 0024 | [Recall asks on avoid notes](0024-recall-asks-on-avoid-notes.md) | accepted (refines 0010) |
| 0025 | [Bundle the CLI](0025-bundle-the-cli.md) | accepted |
| 0026 | [The app is the workspace; v0.2 is "Connect"](0026-the-app-is-the-workspace.md) | accepted (changes the graph's status in 0010) |
| 0027 | [`alternatives` becomes active; `works_with` stays planned](0027-alternatives-active.md) | accepted (accepts 0007 in part) |
| 0028 | [The graph page](0028-the-graph-page.md) | accepted |
