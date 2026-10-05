# Roadmap

This file is the single source of truth for project status. It has two parts:
- **Foundation** (steps 0, 1, 1.5, 2): what must exist before any product code.
- **Release milestones** (v0.1 to v0.3, then Later): what each release ships. Scope follows the accepted [strategy](strategy.md) and [decision 0010](decisions/0010-v0-1-scope.md); the v0.1 beta may still change it.

Each task is a checkbox. Tick it when the work is done. A step or milestone is done only when its **Done when** criteria are met. Work is committed in small pieces.

Parts marked *Obsidian extra (optional)* need Obsidian. Notes, the CLI, search and the agent skill must work without it.

## Now / Next / Later

- **Now:** v0.1 Remember, built from the [spec](spec.md). Libraries and the Node floor are approved. Order of the remaining work: UI app → suggest and adopt → agent skill and launch (recall and the UI server are built).
- **Next:** v0.2 Trust.
- **Later:** v0.3 Share.

| Part | Status |
|---|---|
| 0. Repository skeleton | ✅ done |
| 1. Agent instructions | ✅ done |
| 1.5. Validation | ✅ done (desk research) |
| 2. Spec and tech-stack decision | ✅ done |
| v0.1 Remember | ⬜ |
| v0.2 Trust | ⬜ |
| v0.3 Share | ⬜ |
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
- Embeddings for semantic search (local model or API; the default must work offline): to v0.3, with semantic search. v0.1 has no embeddings.

**Done when:** `docs/spec.md` exists and every open question has a decision record.

---

# Release milestones

Scope follows [decision 0010](decisions/0010-v0-1-scope.md) (extended by [0021](decisions/0021-local-ui-server.md) with the local app) and [strategy](strategy.md) §7 and §15; the v0.1 beta may still change it. Each feature is described in [ideas](ideas.md). Each release is also a marketing moment: one headline feature, one GIF, one short post.

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
- [ ] Skill mode: `SKILL.md` tells agents in other clients to run `magpie recall` before installing.

**Done when:** in Claude Code, installing a package that has a note shows that note to the agent and the user; a note that says to avoid it makes Claude Code ask the user first; and magpie never denies an install. (Built and tested on `feat/recall`. Live check in a Claude Code session on 2026-10-04: an avoid note made Claude Code ask, in the default permission mode and in auto mode. Budget of 150 ms, median on a Windows dev machine: recall 149–155 ms, at the limit; the hook 140–144 ms with a note and 100–104 ms without an install. The CI runner's numbers are reported by the "Links and benchmarks" job.)

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
- [ ] The maintainer approves [decision 0022](decisions/0022-frontend-stack.md)'s dependencies.
- [ ] The build: a static bundle in `dist/ui/`, served by `magpie ui`, with a bundle-size check (at most 200 kB gzipped).
- [ ] The layout and components from `DESIGN.md`: three panes, the command palette, dark and light themes.
- [ ] Inbox review, search, the note view, add and import, read-only settings, and the "Check a package" box ([UI](ui.md), "Screens and flows").
- [ ] Every state, the keyboard map and the accessibility rules ([UI](ui.md), "States", "Accessibility").
- [ ] End-to-end tests with `@playwright/test` in one CI job, Chromium only; screenshots in light and dark for the pull request.
- [ ] Before the pull request: `web-design-guidelines` and `writing-guidelines` passes, findings fixed or listed.

**Done when:** an inbox note can be reviewed in under 15 seconds; the first render with 2,000 notes takes under 1 s; the bundle is at most 200 kB gzipped; and the end-to-end flows pass in CI.

### `magpie suggest`
- [ ] Input: a project's manifests and README, or a free-text description.
- [ ] Narrow candidates from both journals by keyword and tags; no embeddings.
- [ ] Output: matching notes, verdict first. The coding agent makes the semantic choice, guided by `SKILL.md`.

**Done when:** for three sample projects, the notes the maintainer expects are among the candidates.

### `magpie adopt <name>`
- [ ] Copy a note from the personal journal into the project's `.magpie/`.
- [ ] Print the install command. Never install anything.

**Done when:** after `adopt`, the project journal holds the note and nothing was installed.

### Agent skill
- [ ] Ship a `SKILL.md` that teaches agents to use the CLI: note, search, suggest, adopt, recall.
- [ ] Publish it to skills.sh and add the badge to the README.

**Done when:** in a fresh Claude Code session, "what do I have for browser testing?" triggers the skill and returns the right notes.

### `magpie init` (if time allows; otherwise v0.2)
- [ ] Read `package.json`, `pyproject.toml` and `Cargo.toml`, and create draft notes for the dependencies already in use. Offline by default; `--fetch` also fetches repository metadata ([spec](spec.md), section 2).

### Development practice
- [x] Before any package file: the maintainer approves the libraries in [spec](spec.md) section 9 and the Node floor. Approved 2026-10-03: commander, MiniSearch, yaml, packageurl-js, typescript (dev), @types/node (dev); `engines.node >=22.12.0`.
- [x] Scaffold: `package.json` with the approved libraries, TypeScript settings, the `src/` layout (`core/`, `cli/`, `hook/`), a minimal CLI (`magpie --version`, `magpie --help` listing the v0.1 commands as not implemented yet), and CI on Node 22, 24 and 26 × Linux and Windows.
- [ ] Use `tdd` from `mattpocock/skills` while implementing v0.1, and its `code-review` before each pull request.
- [ ] Once v0.1 code exists, map the codebase with `Egonex-AI/Understand-Anything`, and use the map to onboard contributors.

### Launch
See [marketing.md](marketing.md).
- [x] Write `DESIGN.md` (Obsidian-inspired, dark-first) before the logo, social preview, landing page and demo GIF, so they share one visual language. Use `VoltAgent/awesome-design-md` as reference only; copy no brand. (Written on `docs/ui`; the local app uses it too.)
- [ ] Landing page and README hero, with `Leonxlnx/taste-skill`. Not for the CLI or data-dense views; its own scope excludes dashboards.
- [ ] Review the landing page with `web-design-guidelines` from `vercel-labs/agent-skills`.
- [ ] End-to-end check and screenshots of the landing page, and screenshots for the README, with `microsoft/playwright-cli`.
- [ ] README rewrite for the accepted positioning, with one line about suggest; edit README and docs copy with `writing-guidelines` from `vercel-labs/agent-skills`.
- [ ] `v0.1.0-beta.N` pre-release for early testers ([release process](release.md)); it also tests H1 ([decision 0014](decisions/0014-step-1-5-desk-research.md))
- [ ] Write the 30-second demo scenario (moved from step 1.5)
- [ ] 30-second demo GIF: the "pdfkit moment", in the terminal theme from `DESIGN.md`
- [ ] Social preview image, with `taste-skill`
- [ ] Logo: a magpie, legible at 16 px; direction with `taste-skill`
- [ ] Five "good first issue" issues
- [ ] Add `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) with a private contact.
- [ ] Soft launch in niche communities
- [ ] Show HN
- [ ] Product Hunt

## v0.2 Trust
- [ ] `magpie init`, if it missed v0.1.
- [ ] Vet, reduced ([decision 0011](decisions/0011-vet-and-drift-reduced.md)): record your review and the reviewed commit in the note; link the output of existing scanners.
- [ ] `magpie drift`: lists notes whose upstream changed since the reviewed commit, using existing lockfiles where they exist.
- [ ] `magpie gaps`: dependencies used in a project but missing from the journals.

## v0.3 Share
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

## Not scheduled
- Graph views: marketing only ([ideas](ideas.md), idea 10). The Obsidian graph preset and `magpie graph` are built only as a shareable visual, if at all. If built: review with `web-design-guidelines`, check and screenshot with `playwright-cli`.
