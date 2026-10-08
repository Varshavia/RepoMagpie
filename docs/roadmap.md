# Roadmap

This file is the single source of truth for project status. It has two parts:
- **Foundation** (steps 0, 1, 1.5, 2): what must exist before any product code.
- **Release milestones** (v0.1 to v0.4, then Later): what each release ships. Scope follows the accepted [strategy](strategy.md), [decision 0010](decisions/0010-v0-1-scope.md) and, for v0.2, [decision 0026](decisions/0026-the-app-is-the-workspace.md); the v0.1 beta may still change it.

Each task is a checkbox. Tick it when the work is done. A step or milestone is done only when its **Done when** criteria are met. Work is committed in small pieces.

Parts marked *Obsidian extra (optional)* need Obsidian. Notes, the CLI, search and the agent skill must work without it.

## Now / Next / Later

- **Now:** v0.1 Remember, built from the [spec](spec.md). Libraries and the Node floor are approved. The beta `0.1.0-beta.1` is out (2026-10-07). Remaining: the launch (recall, the UI server, the UI app, suggest, adopt, the agent skill and the pre-launch fixes are built; the logo, the social preview and the README landing page are done).
  Also now: v0.2 Connect, parts 1 (linked notes) and 2 (the graph page) are merged and out in the pre-release `0.2.0-beta.1` (2026-10-08). Part 3 (agent output) is in progress on `feat/agent-output`.
- **Next:** the v0.2 Connect release, once part 3 is merged.
- **Later:** v0.3 Trust, v0.4 Share.

| Part | Status |
|---|---|
| 0. Repository skeleton | ✅ done |
| 1. Agent instructions | ✅ done |
| 1.5. Validation | ✅ done (desk research) |
| 2. Spec and tech-stack decision | ✅ done |
| v0.1 Remember | ⬜ |
| v0.2 Connect | ⬜ |
| v0.3 Trust | ⬜ |
| v0.4 Share | ⬜ |
| Later | ⬜ |

---

# Foundation

## 0. Repository skeleton
- [x] README, LICENSE (MIT), `.gitignore`
- [x] Project docs: vision, note schema, standards, competitors, marketing, seed repositories, decision records
- [x] Glossary and architecture
- [x] Community files: `CONTRIBUTING.md`, `SECURITY.md` (private vulnerability reporting enabled)
- [x] Ideas document: the approved ideas with target releases
- [x] Product document: surfaces and graph specification; decisions 0007 (proposed) and 0008
- [x] [Release process](release.md) and `CHANGELOG.md`
- [x] [Validation](validation.md) template for step 1.5
- [x] [Strategy](strategy.md), accepted, with decisions 0009–0013

**Done when:** the repo explains what RepoMagpie is in under 30 seconds of reading, and the license is detected by GitHub.

## 1. Agent instructions
- [x] `CLAUDE.md` rulebook and `AGENTS.md` pointer
- [x] git-guard hook in `.claude/hooks/`: read-only git allowlist, with tests
- [x] Read-only gh allowlist in git-guard, with tests
- [x] Backup deny list in `.claude/settings.json` for the most damaging git and gh commands
- [x] Private work log in `.worklog/`
- [x] Live check that git-guard blocks commits sent through the PowerShell tool
- [x] git-guard blocks shell commands that write files (in-place edits, `tee`, redirection, PowerShell `Set-Content`/`Add-Content`/`Out-File`), with tests

**Done when:** an agent asked to "commit this" refuses and prints a suggested commit message instead.

## 1.5. Validation
Closed with desk research instead of interviews ([decision 0014](decisions/0014-step-1-5-desk-research.md)). No interviews were run.
- [x] Desk research in place of interviews: findings per question, limits and hypothesis status in [validation.md](validation.md). H1 (note-taking friction) is tested by the v0.1 beta.
- [x] Competitor review, as desk research with sources in [competitors.md](competitors.md). The hands-on review was not done.
- [x] Decide: the v0.1 command set and the release themes ([decision 0010](decisions/0010-v0-1-scope.md)).

Moved out of this step:
- Write the 30-second demo scenario: to v0.1 Launch (the demo GIF).
- Decide: soften decision 0005; import stars as inbox suggestions: to step 2.

Interview questions (not asked; kept for reference, they structure the desk research):
1. When did you last go back to a repository you starred? How did you find it?
2. Where do you look when you need a new tool or library?
3. When did you last install something your coding agent suggested? Did you check it first? How?
4. Have you ever installed a package again after forgetting it went badly the first time? When was the last time?
5. When did you last check what an installed extension, plugin or skill actually does? What made you check?
6. Whose opinion do you rely on when choosing a tool? Whose recommendation did you last act on?
7. Do you use Obsidian's graph view, or any graph view? What do you actually do with it?
8. Where did you last write something down about a tool you found? Can you show me?

Then, after the eight:

9. Has your team ever adopted a dependency it had already rejected before? How did you find out?
10. Where would someone on your team look to find out why you chose a library?

Only after these may the interviewer show the one-liner and record the reaction.

**Done when** (original): `docs/validation.md` has the interview notes and the competitor review, `vision.md` is updated from the findings, and every decision above has a decision record. **Closed instead by** [decision 0014](decisions/0014-step-1-5-desk-research.md): desk research recorded, open decisions moved to step 2.

## 2. Spec and tech-stack decision
Answer each open question and record the answer as a decision record. The v0.1 command set is decided in step 1.5, not here.
- [x] Implementation language: TypeScript on Node.js ([decision 0015](decisions/0015-typescript-on-node.md)).
- [x] Where the journals live and how the CLI finds them ([decision 0016](decisions/0016-journal-locations-and-config.md)).
- [x] No licence found: record `unknown`, never `none` ([decision 0020](decisions/0020-unknown-license.md)). Reading licence statements from the README or `SKILL.md` files is not part of v0.1.
- [x] Note format and identity: note schema v1 with Verdict, Use when and Avoid when, identified by PURL ([note schema](note-schema.md), [decision 0017](decisions/0017-package-identity-purl.md)). The format stays a hypothesis that the v0.1 beta tests.
- [x] How results from the two journals are labelled and ordered ([spec](spec.md), section 3).
- [x] Soften 0005: AI drafts, humans decide ([decision 0018](decisions/0018-ai-drafts-humans-decide.md), supersedes 0005).
- [x] Star import: not in v0.1 ([decision 0019](decisions/0019-no-star-import-in-v0-1.md)).
- [x] Write [`docs/spec.md`](spec.md): commands, journals, identity, matching, hook contract, performance budgets, output design, stack.

Moved out of this step:
- Embeddings for semantic search (local model or API; the default must work offline): to v0.4 (v0.3 before [decision 0026](decisions/0026-the-app-is-the-workspace.md)), with semantic search. v0.1 has no embeddings.

**Done when:** `docs/spec.md` exists and every open question has a decision record.

---

# Release milestones

Scope follows [decision 0010](decisions/0010-v0-1-scope.md) (extended by [0021](decisions/0021-local-ui-server.md) with the local app) and [strategy](strategy.md) §7 and §15; v0.2 follows [decision 0026](decisions/0026-the-app-is-the-workspace.md); the v0.1 beta may still change it. Each feature is described in [ideas](ideas.md). Each release is also a marketing moment: one headline feature, one GIF, one short post.

## v0.1 Remember
The first public release: capture what you learned, find it again, and see it before your agent installs a dependency. The sections below are in build order from recall on: recall → local app (server, then app) → suggest and adopt → agent skill and launch ([decision 0021](decisions/0021-local-ui-server.md)).

### Journals and example vault
- [x] Finalise [note-schema.md](note-schema.md) with the format from the step 2 spec (v1).
- [x] Personal journal: a folder outside any repository, private by default ([decision 0013](decisions/0013-two-journal-scopes.md)). Resolution in `src/core/journals.ts`.
- [x] Project journal: `.magpie/` inside a project repository, committed with the code. Discovery in `src/core/journals.ts`.
- [x] Core note handling in `src/core/`: identity (PURLs and file names), lenient read and validation, canonical and round-trip-safe writing.
- [x] Write example notes in `examples/vault/` from the [seed repositories](seed-repos.md), with the maintainer's Verdicts.
- [x] Create `examples/vault/tags.md` with a starter tag list.
- [x] *Obsidian extra (optional):* the Templater template in `examples/vault/_templates/` matches the final schema (v1).

**Done when:** every note in `examples/vault/` validates against the schema.

### `magpie note <name-or-url> "text"`
- [x] Capture a verdict in one line, for example `magpie note pdfkit "avoid: async streams painful; use puppeteer"`. No template to fill.
- [x] Given a GitHub URL, fetch description, language, license, topics and the file list (no README), and keep the topics already in `tags.md` as tags ([spec](spec.md), section 2).
- [x] Detect `SKILL.md` files and write one skill line per skill. A skill URL creates or updates the parent repository note ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).

**Done when:** a note can be captured with one command in about ten seconds and validates against the schema; running it on every seed repository URL produces valid drafts; and it never overwrites human-owned fields or sections of an existing note.

### `magpie import <file>`
- [x] The bulk form of `magpie note`, one line per item: `- <url> — verdict: ... | use: ... | avoid: ...`.
- [x] `verdict:` becomes the Verdict (the user's own words); `use:` and `avoid:` become draft Use when and Avoid when; other text goes to My notes.

**Done when:** importing a file with one line per seed repository produces one valid note per line.

### `magpie search`
- [x] Keyword search over frontmatter and text, across both journals.
- [x] Each completed skill line is its own result ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).

**Done when:** for a fixed set of 10 test questions, the expected note is in the top 3. (Met: `src/core/search-quality.test.ts`, over the example vault.)

### Proactive recall
- [x] `magpie recall <package>` on the CLI, across both journals.
- [x] Map package names to notes ([spec](spec.md), section 5): exact by PURL, then name-only, including GitHub repository names.
- [x] Hook mode: a Claude Code `PreToolUse` hook that runs recall before a package install. It never denies: an avoid note asks the user to confirm; other notes inform ([decision 0024](decisions/0024-recall-asks-on-avoid-notes.md)).
- [x] Skill mode: `SKILL.md` tells agents in other clients to run `magpie recall` before installing, and to ask first on an avoid note (`skills/repomagpie/SKILL.md`).

**Done when:** in Claude Code, installing a package that has a note shows that note to the agent and the user; a note that says to avoid it makes Claude Code ask the user first; and magpie never denies an install. (Built and tested on `feat/recall`. Live check in a Claude Code session on 2026-10-04: an avoid note made Claude Code ask, in the default permission mode and in auto mode. Budget of 150 ms, median on a Windows dev machine: recall 149–155 ms, at the limit; the hook 140–144 ms with a note and 100–104 ms without an install. With the bundled CLI ([decision 0025](decisions/0025-bundle-the-cli.md), 2026-10-06): recall 113–115 ms; the hook 108 ms with a note and 64–65 ms without an install. The CI runner's numbers are reported by the "Links and benchmarks" job.)

### Local app
`magpie ui`: an Obsidian-inspired app in the browser, served from the user's machine over the same core ([decision 0021](decisions/0021-local-ui-server.md), [UI](ui.md)). Visual language: [`DESIGN.md`](../DESIGN.md).

UI server (`feat/ui-server`, after `feat/recall`):
- [x] Core: `setSection`, edits of the human-owned keys (`kind`, `tags`, `tried`, `rating`) and note versions (`sha256`), with round-trip tests ([decision 0023](decisions/0023-api-is-the-json-contract.md)).
- [x] Core: the shared JSON documents: Settings, Tag list, Note list, Note, Note preview ([spec](spec.md), section 2).
- [x] `magpie ui [--port <n>] [--no-open]`: loopback only, the URL with a session token, opens the browser, stops on Ctrl+C ([spec](spec.md), section 2).
- [x] The API endpoints ([UI](ui.md), "API"); each response equals the CLI's `--json` for the same input.
- [x] Every security rule in [UI](ui.md), "Security", each with a test.
- [x] Live updates: `fs.watch` on both `notes/` folders, a signature check every 5 s, Server-Sent Events.
- [x] A placeholder page until the app: lists notes through the API and proves the token flow.

**Done when:** the server tests cover every endpoint and every security rule; a note edited in another editor reaches an open events stream within 5 seconds; and a write with an old version gets 409 and changes nothing. (Met on `feat/ui-server`: `src/server/security.test.ts`, `api.test.ts` and `live.test.ts`; the 5-second check runs with the default timings. Also checked by hand on 2026-10-05 against the built CLI with curl: an outside edit reached the events stream, and a stale write got 409.)

UI app (`feat/ui-app`, after `feat/ui-server`):
- [x] The maintainer approves [decision 0022](decisions/0022-frontend-stack.md)'s dependencies (2026-10-04; installed on `feat/ui-app`).
- [x] The build: a static bundle in `dist/ui/`, served by `magpie ui`, with a bundle-size check (at most 200 kB gzipped).
- [x] The layout and components from `DESIGN.md`: three panes, the command palette, dark and light themes.
- [x] Inbox review, search, the note view, add and import, read-only settings, and the "Check a package" box ([UI](ui.md), "Screens and flows").
- [x] Every state, the keyboard map and the accessibility rules ([UI](ui.md), "States", "Accessibility").
- [x] End-to-end tests with `@playwright/test` in one CI job, Chromium only; screenshots in light and dark for the pull request.
- [x] Before the pull request: `web-design-guidelines` and `writing-guidelines` passes, findings fixed or listed.
- [x] Fixes from the maintainer's first use (`fix/ui-polish`): the palette shows what `magpie search` finds, PURLs shown decoded, "Create tag list" for a journal without `tags.md`, and a lenient read of import lists copied out of a chat.

**Done when:** an inbox note can be reviewed in under 15 seconds; the first render with 2,000 notes takes under 1 s; the bundle is at most 200 kB gzipped; and the end-to-end flows pass in CI. (On `feat/ui-app`, 2026-10-06, Windows dev machine: the inbox review end-to-end test reviews a note by keyboard in under a second of test time; first render with 2,000 notes 417 ms with a warm cache, 944 ms cold; the bundle 91.8 kB gzipped. CI runs the end-to-end flows in the "App build and end-to-end tests" job; not yet seen green in CI.)

### `magpie suggest`
- [x] Input: a project's manifests and README, or a free-text description.
- [x] Narrow candidates from both journals by keyword and tags; no embeddings.
- [x] Output: matching notes, verdict first. The coding agent makes the semantic choice, guided by `SKILL.md`.
- [x] The project's own dependencies are never suggested; those with an avoid note are listed apart ([spec](spec.md), section 2).
- [x] In the local app: "Suggest for this project" ([UI](ui.md), section 7).
- [x] Benchmark against the 500 ms budget (`scripts/bench-suggest.ts`; report only in CI).

**Done when:** for three sample projects, the notes the maintainer expects are among the candidates. (Two of three met on `feat/suggest-adopt`, in `src/core/suggest-quality.test.ts` over the example vault: "a React landing page with a strong visual design" has taste-skill, awesome-design-md and vercel-labs/agent-skills in the top 5; "let my coding agent test a web app in a browser" has playwright-cli first. The third, RepoMagpie itself, is a quality test over the example vault since `fix/pre-launch` (playwright-cli first, vercel-labs/agent-skills and karpathy-skills, not open-lakehouse; since `feat/launch-prep` not mattpocock/skills, which matched only through words any project has); still open: the maintainer's check on the real journal, where 8 of 9 notes were suggested before the cutoff. Benchmark on a Windows dev machine, 2026-10-06, three runs: 349–437 ms median from 25 dependencies and a README, 292–365 ms with a description; search measured 247–318 ms in the same runs.)

### `magpie adopt <name>`
- [x] Copy a note from the personal journal into the project's `.magpie/`.
- [x] Print the install command. Never install anything. A repository note with one package gets that package's command; with several, one command per package to choose from.
- [x] In the local app: "Adopt to project" on a personal note ([UI](ui.md), section 7).

**Done when:** after `adopt`, the project journal holds the note and nothing was installed. (Met on `feat/suggest-adopt`: `src/core/adopt.test.ts` checks that only `.magpie/` appears in the project; the end-to-end test checks the same through the app.)

### Agent skill
- [x] Ship a `SKILL.md` that teaches agents to use the CLI: note, search, suggest, adopt, recall (`skills/repomagpie/`, installed with `npx skills add Varshavia/RepoMagpie`). Tests check its frontmatter against the Agent Skills format, and every command, flag and `--json` field it names against `magpie --help` and the spec.
- [ ] Publish it to skills.sh and add the badge to the README.

**Done when:** in a fresh Claude Code session, "what do I have for browser testing?" triggers the skill and returns the right notes. (Met on 2026-10-06, checked live by the maintainer: a fresh Claude Code session asked "what do I have for browser testing?" loaded the skill on its own, ran `magpie search` and returned the maintainer's playwright-cli note.)

### `magpie init` (if time allows; otherwise v0.3)
- [ ] Read `package.json`, `pyproject.toml` and `Cargo.toml`, and create draft notes for the dependencies already in use. Offline by default; `--fetch` also fetches repository metadata ([spec](spec.md), section 2).

### Development practice
- [x] Before any package file: the maintainer approves the libraries in [spec](spec.md) section 9 and the Node floor. Approved 2026-10-03: commander, MiniSearch, yaml, packageurl-js, typescript (dev), @types/node (dev); `engines.node >=22.12.0`.
- [x] Scaffold: `package.json` with the approved libraries, TypeScript settings, the `src/` layout (`core/`, `cli/`, `hook/`), a minimal CLI (`magpie --version`, `magpie --help` listing the v0.1 commands as not implemented yet), and CI on Node 22, 24 and 26 × Linux and Windows.
- [ ] Use `tdd` from `mattpocock/skills` while implementing v0.1, and its `code-review` before each pull request.
- [ ] Once v0.1 code exists, map the codebase with `Egonex-AI/Understand-Anything`, and use the map to onboard contributors.

### Pre-launch
Before the launch work (`fix/pre-launch`):
- [x] `magpie suggest`: a relevance cutoff relative to the top score, and a "why" line per candidate (the keywords it matched). Candidates under a fifth of the best score are left out; prefix matching only, no fuzzy ([spec](spec.md), section 5). On RepoMagpie itself, with the example vault: 5 candidates instead of 8, open-lakehouse out, playwright-cli first through `@playwright/test`.
- [x] Startup time of the hook and `magpie recall` on Windows; consider bundling `dist/` into one file. Bundled with Vite into `dist/cli/`, an entry and chunks loaded on demand ([decision 0025](decisions/0025-bundle-the-cli.md)). Windows dev machine, 2,000 notes, median: recall 154 → 113 ms; the hook 152 → 108 ms with a note, 110 → 64 ms without an install.
- [x] Fresh screenshots of every screen, dark and light, on a journal of real-looking notes, for the final design review (`SCREENS=1`, `ui/e2e/screens.spec.ts`).

### Launch
See [marketing.md](marketing.md).
- [x] Small fixes before the beta (`feat/launch-prep`): `magpie suggest` leaves out words common to any project (`code`, `install`, `js`) from its keywords and why line; the note view shows whether you tried a package and your rating under the title.
- [x] Move `commander`, `minisearch`, `packageurl-js` and `yaml` to `devDependencies`: the CLI bundles them ([decision 0025](decisions/0025-bundle-the-cli.md)). Checked on `feat/launch-prep`: a clean install of the `npm pack` tarball adds one package, and every command runs from it.
- [x] Write `DESIGN.md` (Obsidian-inspired, dark-first) before the logo, social preview, landing page and demo GIF, so they share one visual language. Use `VoltAgent/awesome-design-md` as reference only; copy no brand. (Written on `docs/ui`; the local app uses it too.)
- [x] Landing page and README hero, with `Leonxlnx/taste-skill`. Not for the CLI or data-dense views; its own scope excludes dashboards. (The README is the landing page, on `feat/launch-prep`: the logo, the one-liner, three bullets, a quick start and three dark screenshots of the app. No separate site.)
- [ ] Review the landing page with `web-design-guidelines` from `vercel-labs/agent-skills`.
- [ ] End-to-end check and screenshots of the landing page, and screenshots for the README, with `microsoft/playwright-cli`.
- [x] README rewrite for the accepted positioning, with one line about suggest; edit README and docs copy with `writing-guidelines` from `vercel-labs/agent-skills`.
- [x] `v0.1.0-beta.N` pre-release for early testers ([release process](release.md)); it also tests H1 ([decision 0014](decisions/0014-step-1-5-desk-research.md)). Prepared on `feat/launch-prep`: version `0.1.0-beta.1`, its CHANGELOG section, and the npm name `repomagpie` checked free on 2026-10-06. Published 2026-10-07: the GitHub pre-release `v0.1.0-beta.1` and `repomagpie@0.1.0-beta.1` on npm.
- [ ] Write the 30-second demo scenario (moved from step 1.5)
- [ ] 30-second demo GIF: the "pdfkit moment", in the terminal theme from `DESIGN.md`
- [x] Social preview image, with `taste-skill` (`docs/assets/social-preview.png`, 1280×640; the maintainer sets it in the repository settings)
- [x] Logo: a magpie, legible at 16 px; direction with `taste-skill` (`docs/assets/logo.svg`, also the app's favicon)
- [ ] Five "good first issue" issues
- [ ] Add `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) with a private contact.
- [ ] Soft launch in niche communities
- [ ] Show HN
- [ ] Product Hunt

## v0.2 Connect
The app becomes the place where you write and connect notes: links, backlinks, the `alternatives` relation and a graph, built into `magpie ui` ([decision 0026](decisions/0026-the-app-is-the-workspace.md)). Three parts, each on its own branch.

### Part 1: linked notes (`feat/linked-notes`)
- [x] Decisions: the app is the workspace ([0026](decisions/0026-the-app-is-the-workspace.md)); `alternatives` becomes active, one side is enough ([0027](decisions/0027-alternatives-active.md)).
- [x] Remove "Open in Obsidian" from the app. "Open in editor" stays.
- [x] "My notes" and "Related" are always shown in the note view, so you can start them from the app. Saving a section the file doesn't have inserts it at its canonical position.
- [x] Links in core: `[[target]]`, `[[target|label]]`, `[[target#heading]]`, resolved within the journal by file stem, then by a unique name; otherwise unresolved (missing or ambiguous). A link index with outgoing and incoming links, warm in under 150 ms for 2,000 notes. (`src/core/links.ts`, 2026-10-07: 41–44 ms median, p95 47–55 ms, on a Windows dev machine, `scripts/bench-links.ts`.)
- [x] Links in the API and the app: `links` and `backlinks` in the Note document, in-app links, unresolved links that open Add, `[[` autocomplete, "Linked from", and live refresh.
- [x] `alternatives`: in the schema, core, `PATCH /api/note`, and the note view (chips, "+ Add", "Alternative to: …" on the other note).
- [x] Tags from GitHub topics: "From GitHub topics" chips in Add, the inbox review and the note view; a chip adds the tag and appends it to `tags.md` (`POST /api/tags` with `add`).

**Done when:** every item works in the app and has tests; every new write keeps the rest of the file byte for byte; the link index meets its budget and the existing budgets still hold; all checks and end-to-end tests pass. (Met on `feat/linked-notes`, 2026-10-07, Windows dev machine, Node 24.13: 749 tests and 40 end-to-end flows pass; byte-for-byte tests for a new section, `alternatives` (entries written by hand stay as written) and appending to `tags.md`. Link index warm 46 ms median for 2,000 notes. The other budgets hold: search 267 ms, suggest 387 / 300 ms, recall 139 ms, the hook 136 / 79 ms; recall and the hook are close to their 150 ms on this machine today, with or without this branch's changes. Not yet seen green in CI.)

Follow-up, small, after `feat/linked-notes` (the maintainer, 2026-10-07):
- [ ] Unresolved links: an ambiguous link opens Search with its name; a missing link whose target is a file stem (`npm--pdfkit`, `github--owner--repo`) opens Add with the PURL it stands for. npm scopes can't be recovered from a stem; those stay as written.

### Part 2: the graph page (`feat/graph`)
A graph page in the app: notes as nodes, tags as hub nodes, `[[links]]` and `alternatives` as edges (on by default), similarity from topics and language (off by default, at most 3 neighbours per note). Specification: [product](product.md#graph-specification); library, layout and encoding: [decision 0028](decisions/0028-the-graph-page.md).
- [x] Decision 0028 and the rendering library: sigma 3, graphology and graphology-layout-forceatlas2, approved 2026-10-07; their licence notices ship in `dist/ui/`.
- [x] Core: `graphData` (`src/core/graph.ts`): note, tag and ghost nodes; tagged, link, alternative and similar edges; warm in under 300 ms for 2,000 notes. (2026-10-08: 146 ms median, p95 162 ms, missing notes included, on a Windows dev machine, `scripts/bench-graph.ts`.)
- [x] API: `GET /api/graph` (the Graph document), with security tests.
- [x] Page skeleton: a lazy-loaded route, the sidebar item, the palette entry and `g g`; rendering with the `DESIGN.md` tokens; the layout worker; the status line; the empty and WebGL states. (2026-10-08: the app 142.8 kB of 200 kB gzipped; the graph's chunk 39.9 kB and its worker 1.8 kB load only on the graph page; the other screens' first files 101.1 kB, 1.7 kB more than before.)
- [x] Interactions: hover, click to the note pane, the search box, local mode, Esc, and "Show in graph" from the note view.
- [x] Filters, edge toggles and the neighbours list, with ghost nodes behind their toggle.
- [x] Live updates; performance at 2,000 notes (data, layout and first frame in under 2 s). (2026-10-08, a Windows dev machine, headless Chromium with SwiftShader: warm 1.25–1.55 s, cold 1.9–2.2 s while the graph cache is built; on the machine's GPU warm 1.03 s and every hover and zoom frame at 17 ms.)
- [x] Docs, end-to-end flows, screenshots in dark and light at 800 notes; review with `web-design-guidelines`; check and screenshot with `playwright-cli`. (`playwright-cli` isn't installed on the agent's machine; the screenshots came from a script with the repository's `@playwright/test`, as on `feat/ui-app`.)

**Done when:** every item works and has tests; the budgets hold (`graphData` under 300 ms, the page under 2 s at 2,000 notes, the bundle under 200 kB with other screens' first files at most 3 kB over 99.4 kB, the existing budgets unchanged); all checks, end-to-end tests and benchmarks pass.

Follow-up, small, after `feat/graph` (the maintainer, 2026-10-08):
- [x] Opening a note by id (`GET /api/note`, and `PATCH`, which reads through it) finds the file through the link cache instead of reading every note; a miss or a stale hit reads every note. Budget 50 ms at 2,000 notes, warm (spec §7, `scripts/bench-note.ts`). (2026-10-08: 431 ms → 31 ms median, p95 465 → 35 ms.)
- [ ] A flaky test file: `src/hook/claude-code.test.ts` failed once on windows-latest, Node 24.21.0 (CI run 37696988052, commit 66e43f0) with "test failed" and no failing test: all 8 passed, then the file's process exited non-zero without an error. Not reproduced locally (Node 24.13 and 24.21, 60 full runs). CI now keeps a TAP report when `npm test` fails, with the file's exit code, signal and stderr; read it the next time this happens, then fix the cause.
- [ ] `search-index.json`: a shape check, as `recall-index.json`, `links.json`, `note-list.json` and `graph.json` have. A cache that is valid JSON with the expected version and signature but a damaged index is rebuilt from the notes, not used; a failing test first, and the search benchmark before and after.
- [ ] The graph's neighbours list: virtualise a large group. A tag on hundreds of notes renders every row; keep the listbox, its groups and its keys.
- [ ] URL state: the graph's filters, toggles and selection in the URL, so Back and a reload keep them, as the note view's `#note/<journal>/<id>` does.
- [ ] Thousands separators in counts, app-wide ("2,000 notes", not "2000 notes"): the sidebar, the lists and the graph's status line.
- [ ] Arrow keys in segmented buttons, app-wide: ←/→ move the choice within the group, which is one Tab stop, as in the WAI-ARIA radio group pattern.

Not doing, from the `web-design-guidelines` review of `feat/graph`:
- Keyboard pan and zoom on the graph's canvas: the canvas is a visual aid; the search box, the filters and the neighbours list are the keyboard path ([decision 0028](decisions/0028-the-graph-page.md)).
- Title Case for buttons and headings: every label and heading in the app is in sentence case, as the examples in [`DESIGN.md`](../DESIGN.md) (Writing) are; one page in Title Case would break that.

### Part 3: agent output (`feat/agent-output`)
- [x] Decision: recall names alternatives ([0029](decisions/0029-recall-names-alternatives.md)).
- [ ] `magpie recall`, the hook, `magpie suggest` and "Check a package" in the app show a note's alternatives; `magpie note --alternative` records one; the skill explains them. Neighbours means alternatives only: same-tag notes and `[[links]]` are not shown at install time, because they add noise and no decision.

Follow-up, watch (the maintainer, 2026-10-08):
- [ ] Recall's margin. `magpie recall` and the hook take about 145 ms at 2,000 notes on a Windows dev machine (budget 150). Most of it is Node's startup and loading the chunks (about 75 ms: the hook with no install) and reading 2,000 file times for the cache signature (30–35 ms); the cache read and its shape check take about 10 ms, alternatives 1–2 ms. Act when CI's Linux median passes 120 ms, or when a change adds more than 5 ms. Options for headroom:
  - Node's compile cache (`module.enableCompileCache()`, Node 22.1+) for the built CLI, so the chunks aren't parsed and compiled on every run.
  - Load `yaml` only when the cache is rebuilt: a warm run never parses a note, but the hook's chunk carries the YAML parser (part of the 268 kB `note` chunk).
  - Read the file times in parallel (`fs.promises.stat` through libuv's thread pool) instead of 2,000 synchronous `statSync` calls.
  - Compare the cache's signature file by file instead of `JSON.stringify` of both, and make the shape check cheaper (one pass, no closures).
  - A smaller recall cache: keep only the fields the hook reads, and the alternatives already resolved, so a run parses and resolves less.

## v0.3 Trust
- [ ] `magpie init`, if it missed v0.1.
- [ ] Vet, reduced ([decision 0011](decisions/0011-vet-and-drift-reduced.md)): record your review and the reviewed commit in the note; link the output of existing scanners.
- [ ] `magpie drift`: lists notes whose upstream changed since the reviewed commit, using existing lockfiles where they exist.
- [ ] `magpie gaps`: dependencies used in a project but missing from the journals.
- [ ] `--project <dir>` also moves where `magpie suggest` reads the manifests and README, like `git -C`. In v0.1 they come from the working directory ([spec](spec.md), section 2), so `magpie --project ../app suggest` reads the current folder's manifests.

## v0.4 Share
- [ ] `magpie publish`: a static "nest" site from notes marked public, following `DESIGN.md`. Review it with `web-design-guidelines` and check it with `playwright-cli`.
- [ ] `magpie follow <nest-url>`: another user's public notes in your search results, attributed.
- [ ] `/uses` page generator.
- [ ] Semantic search, also for `suggest`. First decide embeddings: local model or API; the default must work offline (moved from step 2). Orama is the candidate library ([spec](spec.md), section 9).

## Later
- [ ] Resurfacing digest.
- [ ] `magpie today`: one optional daily find.
- [ ] A thin MCP server for clients without a shell ([decision 0002](decisions/0002-cli-first.md)).
- [ ] Recall for installs without package names (`npm install`, `pip install -r requirements.txt`): check the whole manifest. Ignored in v0.1 ([spec](spec.md), section 6).
- [ ] Hook mode for clients other than Claude Code, as their hooks allow passing context on an allowed command ([ideas](ideas.md#hook-support-in-major-clients)). v0.1 uses skill mode there.
- [ ] *Obsidian extra (optional):* ready-made Dataview queries in `examples/vault/`.
- [ ] The graph as an export: a standalone HTML file, and the graph in nest pages ([decision 0026](decisions/0026-the-app-is-the-workspace.md)).

## Not scheduled
- *Obsidian extra (optional):* the Obsidian graph preset for the example vault (level 1 in the [product](product.md#graph-specification) history). The in-app graph is the working view ([decision 0026](decisions/0026-the-app-is-the-workspace.md)).
