# Roadmap

This file is the single source of truth for project status. It has two parts:
- **Foundation** (steps 0, 1, 1.5, 2): what must exist before any product code.
- **Release milestones** (v0.1 to v0.4, then Later): what each release ships. Scope follows the accepted [strategy](strategy.md), [decision 0010](decisions/0010-v0-1-scope.md) and, for v0.2, [decision 0026](decisions/0026-the-app-is-the-workspace.md); the v0.1 beta may still change it.

Each task is a checkbox. Tick it when the work is done. A step or milestone is done only when its **Done when** criteria are met. Work is committed in small pieces.

Parts marked *Obsidian extra (optional)* need Obsidian. Notes, the CLI, search and the agent skill must work without it.

## Now / Next / Later

- **Now:** v0.1 Remember, built from the [spec](spec.md). Libraries and the Node floor are approved. The beta `0.1.0-beta.1` is out (2026-10-07). Remaining: the launch (recall, the UI server, the UI app, suggest, adopt, the agent skill and the pre-launch fixes are built; the logo, the social preview and the README landing page are done).
  Also now: v0.2 Connect, parts 1 to 3 are built, merged and released in beta: parts 1 (linked notes) and 2 (the graph page) in `0.2.0-beta.1`, part 3 (agent output) and its follow-ups in `0.2.0-beta.2` (both 2026-10-08). What is left for v0.2 is its open follow-ups. The topics-as-tags follow-up and the pre-launch hardening (the command name, note text from other people, releases from CI) are merged and released in `0.2.0-beta.3` (2026-10-14), the first version staged from CI; next is the tester round.
  Also now: [agents everywhere](#agents-everywhere-mcp-setup-and-doctor-featmcp-setup) (`repomagpie mcp`, `catalog`, `setup` and `doctor`; [decision 0034](decisions/0034-the-mcp-server.md), [decision 0035](decisions/0035-setup-and-doctor.md)) is merged (#33, after a live test on Windows) and released in `0.2.0-beta.4` (2026-10-15); next is the tester round with `repomagpie setup`.
  Also now: [the hook in every agent](#the-hook-in-every-agent-that-has-one-featagent-hooks) (`feat/agent-hooks`): hook adapters for Codex CLI, Gemini CLI, Antigravity CLI, Copilot CLI and Cursor ([decision 0036](decisions/0036-hooks-in-other-agents.md)), and Antigravity CLI and Copilot CLI in `setup` and `doctor`. Merged (#36, with the fixes from the maintainer's live test on Windows) and released in `0.2.0-beta.5` (2026-10-21); next is the tester round with the hooks.
  Also now: `0.2.0-beta.6` (2026-10-21), the build for the tester round: `setup` on a Windows home folder with letters outside ASCII and `doctor` on Claude Code settings without hooks are fixed (#39), and Check a package and the README say what the hook does in each agent (#40, #41).
  Also now: [deleting a note](#deleting-a-note-featdelete-note) (`feat/delete-note`, [decision 0037](decisions/0037-deleting-a-note-moves-it-to-the-trash.md)): `repomagpie delete` and Delete note in the app move a note to the journal's `.trash/`, with Undo in the app. Merged (#44) and released in `0.2.0-beta.7` (2026-10-23), with the README rework (#43); next is the tester round.
  Also now: `0.2.0-beta.8` (2026-10-23), the build for the tester round: `setup --remove` on a Windows home folder with letters outside ASCII and suggest's single-letter keywords are fixed, and a check keeps the fs calls that broke out of the code (#47); the tester guide and the feedback form are in (#46).
  Also now: `0.2.0-beta.9` (2026-10-24), the fixes from the maintainer's macOS test (#49, [decision 0038](decisions/0038-setup-chooses-found-agents-and-deletes-backups-on-request.md), [decision 0039](decisions/0039-a-registry-package-note-starts-as-library.md)): `setup` chooses agents found by their command or app, `repomagpie setup --delete-backups`, `doctor` to-dos that name a working action, the note-tool line, "nothing to remove", `library` for a registry package note, and the app following the system theme.
  Also now: [the capture offer](#the-capture-offer-featcapture-nudge) (`feat/capture-nudge`): at the end of a task, the agent offers once to save a dependency decision made in it, with the user's reason as the Verdict; `doctor`'s to-do for entries left in an agent found by its folder only names both ways out; the maintainer's ideas of 2026-10-24 assessed in [ideas](ideas.md). Merged (#51) and released in `0.2.0-beta.10` (2026-10-24); next, the maintainer runs the live scenarios on macOS with the real install and a scratch journal.
  Also now: [Use when at capture](#use-when-at-capture-featuse-when-at-capture) (`feat/use-when-at-capture`), [RFC 0001](rfcs/0001-domains-tags-and-search.md) Phase 0: `repomagpie note --use-when` and `--avoid-when`, the MCP `note` tool, the skill and the app; with the fix for nested and unclosed HTML comments. Merged (#53) and released in `0.2.0-beta.11` (2026-10-25); next is RFC 0001 Phase 1.
  Also now: [the next batch](#the-next-batch-featnext-batch) (`feat/next-batch`): RFC 0001 Phase 1 (domains, tag aliases, structured search), the Stop reminder, `repomagpie init --auto`, colour by domain in the graph, graph labels that never overlap, the skill-compliance eval and the project journal made visible. Merged (#55) and released in `0.2.0-beta.12` (2026-10-26); next, the maintainer runs the eval's dry scenario and the manual checks for `0.2.0-beta.12`.
  Also now: `0.2.0-beta.13` (2026-10-26): domain suggestions follow what a package is for, from the maintainer's run of `repomagpie domains --suggest` on a real journal (#58).
  Also now: [Discover](#discover-featdiscover) (`feat/discover`, [decision 0045](decisions/0045-discover.md), [decision 0046](decisions/0046-classification-signals.md)): `repomagpie discover` and the app's Discover page search GitHub and add the chosen repositories to the inbox; new notes are classified with the README, manifest keywords and an Action file too. Merged (#61) and released in `0.2.0-beta.14` (2026-10-27), with removing a suggested domain in the app, with Undo (#62); next, the maintainer runs the manual checks for Discover.
  Also now: the tester round on `0.2.0-beta.15`: two people, one on macOS and one on Windows, for a week. They follow [TESTING.md](../TESTING.md) and answer the "Beta feedback" issue form; [validation](validation.md#beta-tester-round) maps each question to the hypothesis it tests.
  Also now: the [manual checks](testing/manual-checks.md) only a person can run on a real machine, pending before the launch, one table per platform.
  Also now: optimising what exists, from `0.2.0-beta.14`: no new features until it is done, only fixes. Each optimisation is one branch, measured before and after with `npm run measure` (CLAUDE.md §5, "Optimisations"). First `chore/baseline-and-tag-guard`: the baseline, `npm run check:bundle` checking the other screens' first files against decision 0028's line, and `npm run release:tag`, which tags only a merged release. Then the kind of a new note (`fix/kind-accuracy`, [decision 0047](decisions/0047-kind-rules-measured.md): each kind's deciding question, a held-out set, rule 10 and three new rules; 37 of 69 right instead of 24, and 15 of 30 held out instead of 14, short of its bar of 17), the app's first files (`perf/app-first-load`, [decision 0048](decisions/0048-the-first-load-line-measured.md): the pages the first screen doesn't show in one chunk, prefetched; 109.4 → 103.0 kB, short of 0028's 102.4 kB, so the line is now 104.0 kB with no allowance), the graph's open (`perf/graph-open`, [decision 0049](decisions/0049-the-graph-opens-faster.md): the layout stops when the nodes settle, a reopen draws where it was, and the three caches parse each note once; at 2,000 notes the cold first frame 1,892 → 949 ms, a reopen 1,326 → 241 ms), what every agent waits for (`perf/agent-path`, [decision 0050](decisions/0050-the-agents-path.md): recall's cache per note file; the compile cache and lazy MCP tools tried and dropped; at 2,000 notes recall right after one note changed 673 → 144 ms, the hook 664 → 135 ms; `SKILL.md`'s length stays, since its effect can't be measured without the paid skill eval), and the README (`docs/readme-trim`: 2,500 → 1,884 words, Quick start in three short steps, the moved details in `docs/`, the screenshots retaken from the showcase journal). The plan is done. The first three are merged (#64, #65, #66) and released in `0.2.0-beta.15` (2026-10-28); the graph's open and the agent's path are merged (#69, #70).
- **Next:** the v0.2 Connect release, `0.2.0`, after the testers' feedback on the betas and the open v0.2 follow-ups.
  Also next: the rest of [RFC 0001](rfcs/0001-domains-tags-and-search.md) Phase 2 (the field boosts, fuzzy and prefix limits, optional `files`), with its decision record. Then follow-ups from `feat/next-batch`: the graph's cold first open (each note parsed once for both caches; now `perf/graph-open`, above).
- **Later:** v0.3 Trust, v0.4 Share. Also later: [RFC 0001](rfcs/0001-domains-tags-and-search.md) Phase 3, opt-in semantic search, decided after Phase 2's eval (D3).

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

### `repomagpie note <name-or-url> "text"`
- [x] Capture a verdict in one line, for example `repomagpie note pdfkit "avoid: async streams painful; use puppeteer"`. No template to fill.
- [x] Given a GitHub URL, fetch description, language, license, topics and the file list (no README), and keep the topics already in `tags.md` as tags ([spec](spec.md), section 2).
- [x] Detect `SKILL.md` files and write one skill line per skill. A skill URL creates or updates the parent repository note ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).

**Done when:** a note can be captured with one command in about ten seconds and validates against the schema; running it on every seed repository URL produces valid drafts; and it never overwrites human-owned fields or sections of an existing note.

### `repomagpie import <file>`
- [x] The bulk form of `repomagpie note`, one line per item: `- <url> — verdict: ... | use: ... | avoid: ...`.
- [x] `verdict:` becomes the Verdict (the user's own words); `use:` and `avoid:` become draft Use when and Avoid when; other text goes to My notes.

**Done when:** importing a file with one line per seed repository produces one valid note per line.

### `repomagpie search`
- [x] Keyword search over frontmatter and text, across both journals.
- [x] Each completed skill line is its own result ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).

**Done when:** for a fixed set of 10 test questions, the expected note is in the top 3. (Met: `src/core/search-quality.test.ts`, over the example vault.)

### Proactive recall
- [x] `repomagpie recall <package>` on the CLI, across both journals.
- [x] Map package names to notes ([spec](spec.md), section 5): exact by PURL, then name-only, including GitHub repository names.
- [x] Hook mode: a Claude Code `PreToolUse` hook that runs recall before a package install. It never denies: an avoid note asks the user to confirm; other notes inform ([decision 0024](decisions/0024-recall-asks-on-avoid-notes.md)).
- [x] Skill mode: `SKILL.md` tells agents in other clients to run `repomagpie recall` before installing, and to ask first on an avoid note (`skills/repomagpie/SKILL.md`).

**Done when:** in Claude Code, installing a package that has a note shows that note to the agent and the user; a note that says to avoid it makes Claude Code ask the user first; and magpie never denies an install. (Built and tested on `feat/recall`. Live check in a Claude Code session on 2026-10-04: an avoid note made Claude Code ask, in the default permission mode and in auto mode. Budget of 150 ms, median on a Windows dev machine: recall 149–155 ms, at the limit; the hook 140–144 ms with a note and 100–104 ms without an install. With the bundled CLI ([decision 0025](decisions/0025-bundle-the-cli.md), 2026-10-06): recall 113–115 ms; the hook 108 ms with a note and 64–65 ms without an install. The CI runner's numbers are reported by the "Links and benchmarks" job.)

### Local app
`repomagpie ui`: an Obsidian-inspired app in the browser, served from the user's machine over the same core ([decision 0021](decisions/0021-local-ui-server.md), [UI](ui.md)). Visual language: [`DESIGN.md`](../DESIGN.md).

UI server (`feat/ui-server`, after `feat/recall`):
- [x] Core: `setSection`, edits of the human-owned keys (`kind`, `tags`, `tried`, `rating`) and note versions (`sha256`), with round-trip tests ([decision 0023](decisions/0023-api-is-the-json-contract.md)).
- [x] Core: the shared JSON documents: Settings, Tag list, Note list, Note, Note preview ([spec](spec.md), section 2).
- [x] `repomagpie ui [--port <n>] [--no-open]`: loopback only, the URL with a session token, opens the browser, stops on Ctrl+C ([spec](spec.md), section 2).
- [x] The API endpoints ([UI](ui.md), "API"); each response equals the CLI's `--json` for the same input.
- [x] Every security rule in [UI](ui.md), "Security", each with a test.
- [x] Live updates: `fs.watch` on both `notes/` folders, a signature check every 5 s, Server-Sent Events.
- [x] A placeholder page until the app: lists notes through the API and proves the token flow.

**Done when:** the server tests cover every endpoint and every security rule; a note edited in another editor reaches an open events stream within 5 seconds; and a write with an old version gets 409 and changes nothing. (Met on `feat/ui-server`: `src/server/security.test.ts`, `api.test.ts` and `live.test.ts`; the 5-second check runs with the default timings. Also checked by hand on 2026-10-05 against the built CLI with curl: an outside edit reached the events stream, and a stale write got 409.)

UI app (`feat/ui-app`, after `feat/ui-server`):
- [x] The maintainer approves [decision 0022](decisions/0022-frontend-stack.md)'s dependencies (2026-10-04; installed on `feat/ui-app`).
- [x] The build: a static bundle in `dist/ui/`, served by `repomagpie ui`, with a bundle-size check (at most 200 kB gzipped).
- [x] The layout and components from `DESIGN.md`: three panes, the command palette, dark and light themes.
- [x] Inbox review, search, the note view, add and import, read-only settings, and the "Check a package" box ([UI](ui.md), "Screens and flows").
- [x] Every state, the keyboard map and the accessibility rules ([UI](ui.md), "States", "Accessibility").
- [x] End-to-end tests with `@playwright/test` in one CI job, Chromium only; screenshots in light and dark for the pull request.
- [x] Before the pull request: `web-design-guidelines` and `writing-guidelines` passes, findings fixed or listed.
- [x] Fixes from the maintainer's first use (`fix/ui-polish`): the palette shows what `repomagpie search` finds, PURLs shown decoded, "Create tag list" for a journal without `tags.md`, and a lenient read of import lists copied out of a chat.

**Done when:** an inbox note can be reviewed in under 15 seconds; the first render with 2,000 notes takes under 1 s; the bundle is at most 200 kB gzipped; and the end-to-end flows pass in CI. (On `feat/ui-app`, 2026-10-06, Windows dev machine: the inbox review end-to-end test reviews a note by keyboard in under a second of test time; first render with 2,000 notes 417 ms with a warm cache, 944 ms cold; the bundle 91.8 kB gzipped. CI runs the end-to-end flows in the "App build and end-to-end tests" job; not yet seen green in CI.)

### `repomagpie suggest`
- [x] Input: a project's manifests and README, or a free-text description.
- [x] Narrow candidates from both journals by keyword and tags; no embeddings.
- [x] Output: matching notes, verdict first. The coding agent makes the semantic choice, guided by `SKILL.md`.
- [x] The project's own dependencies are never suggested; those with an avoid note are listed apart ([spec](spec.md), section 2).
- [x] In the local app: "Suggest for this project" ([UI](ui.md), section 7).
- [x] Benchmark against the 500 ms budget (`scripts/bench-suggest.ts`; report only in CI).

**Done when:** for three sample projects, the notes the maintainer expects are among the candidates. (Two of three met on `feat/suggest-adopt`, in `src/core/suggest-quality.test.ts` over the example vault: "a React landing page with a strong visual design" has taste-skill, awesome-design-md and vercel-labs/agent-skills in the top 5; "let my coding agent test a web app in a browser" has playwright-cli first. The third, RepoMagpie itself, is a quality test over the example vault since `fix/pre-launch` (playwright-cli first, vercel-labs/agent-skills and karpathy-skills, not open-lakehouse; since `feat/launch-prep` not mattpocock/skills, which matched only through words any project has); still open: the maintainer's check on the real journal, where 8 of 9 notes were suggested before the cutoff. Benchmark on a Windows dev machine, 2026-10-06, three runs: 349–437 ms median from 25 dependencies and a README, 292–365 ms with a description; search measured 247–318 ms in the same runs.)

### `repomagpie adopt <name>`
- [x] Copy a note from the personal journal into the project's `.magpie/`.
- [x] Print the install command. Never install anything. A repository note with one package gets that package's command; with several, one command per package to choose from.
- [x] In the local app: "Adopt to project" on a personal note ([UI](ui.md), section 7).

**Done when:** after `adopt`, the project journal holds the note and nothing was installed. (Met on `feat/suggest-adopt`: `src/core/adopt.test.ts` checks that only `.magpie/` appears in the project; the end-to-end test checks the same through the app.)

### Agent skill
- [x] Ship a `SKILL.md` that teaches agents to use the CLI: note, search, suggest, adopt, recall (`skills/repomagpie/`, installed with `npx skills add Varshavia/RepoMagpie`). Tests check its frontmatter against the Agent Skills format, and every command, flag and `--json` field it names against `repomagpie --help` and the spec.
- [x] Publish it to skills.sh and add the badge to the README. (Listed at <https://skills.sh/varshavia/repomagpie>, linked from the README's callout and FAQ. The badge was in the hero on `docs/readme-hero`, then taken out: its install count, 3 on 2026-10-21, reads as "nobody uses it".)
- [ ] Bring the skills.sh badge back to the README hero (both READMEs) once its install count is worth showing.

**Done when:** in a fresh Claude Code session, "what do I have for browser testing?" triggers the skill and returns the right notes. (Met on 2026-10-06, checked live by the maintainer: a fresh Claude Code session asked "what do I have for browser testing?" loaded the skill on its own, ran `repomagpie search` and returned the maintainer's playwright-cli note.)

### `repomagpie init` (if time allows; otherwise v0.3)
- [x] ~~Read `package.json`, `pyproject.toml` and `Cargo.toml`, and create draft notes for the dependencies already in use.~~ Replaced by `repomagpie init --auto` (0.2, `feat/next-batch`): it reads the manifests, lists the dependencies by what your notes say, and asks for your Verdict on each one without a note. The draft notes are dropped (the maintainer, 2026-10-25).

### Development practice
- [x] Before any package file: the maintainer approves the libraries in [spec](spec.md) section 9 and the Node floor. Approved 2026-10-03: commander, MiniSearch, yaml, packageurl-js, typescript (dev), @types/node (dev); `engines.node >=22.12.0`.
- [x] Scaffold: `package.json` with the approved libraries, TypeScript settings, the `src/` layout (`core/`, `cli/`, `hook/`), a minimal CLI (`repomagpie --version`, `repomagpie --help` listing the v0.1 commands as not implemented yet), and CI on Node 22, 24 and 26 × Linux and Windows.
- [ ] Use `tdd` from `mattpocock/skills` while implementing v0.1, and its `code-review` before each pull request.
- [ ] Once v0.1 code exists, map the codebase with `Egonex-AI/Understand-Anything`, and use the map to onboard contributors.

### Pre-launch
Before the launch work (`fix/pre-launch`):
- [x] `repomagpie suggest`: a relevance cutoff relative to the top score, and a "why" line per candidate (the keywords it matched). Candidates under a fifth of the best score are left out; prefix matching only, no fuzzy ([spec](spec.md), section 5). On RepoMagpie itself, with the example vault: 5 candidates instead of 8, open-lakehouse out, playwright-cli first through `@playwright/test`.
- [x] Startup time of the hook and `repomagpie recall` on Windows; consider bundling `dist/` into one file. Bundled with Vite into `dist/cli/`, an entry and chunks loaded on demand ([decision 0025](decisions/0025-bundle-the-cli.md)). Windows dev machine, 2,000 notes, median: recall 154 → 113 ms; the hook 152 → 108 ms with a note, 110 → 64 ms without an install.
- [x] Fresh screenshots of every screen, dark and light, on a journal of real-looking notes, for the final design review (`SCREENS=1`, `ui/e2e/screens.spec.ts`).

### Pre-launch hardening (`feat/hardening`)
Before the tester round and the launch: the command name, note text from other people, and the supply chain. Decisions: [0031](decisions/0031-the-command-is-repomagpie.md), [0032](decisions/0032-note-text-is-data.md), [0033](decisions/0033-releases-staged-from-ci.md).
- [x] Decisions 0031 (the command is `repomagpie`), 0032 (note text is data) and 0033 (releases are staged from CI).
- [x] The command name: `bin` has `repomagpie` and the short alias; every machine-facing string and doc uses `repomagpie`; the `RepoMagpie:` and `repomagpie:` prefixes; a check that no doc tells someone to run the alias (`npm run check:commands`); tests against a packed tarball.
- [x] The text module: control characters shown as markers such as `<U+202E>` (after the live test, also in the app's read views), agent-facing fields capped with `truncated`, note text quoted and labelled with its source; the skill's two rules.
- [x] The file rules: links never followed and never written through; files over 256 KB skipped; the YAML alias limit.
- [x] The app: links from notes only for `http:` and `https:`; no note text as HTML; GitHub fields cleaned at write time.
- [x] A red-team pass as the author of a cloned repository, of a GitHub repository, and of a web page open next to `repomagpie ui`; every finding a test, or a follow-up below.
- [x] CI and hygiene: least-privilege workflows with pinned actions, Dependabot, a macOS job, a check of what `npm pack` ships, and a check script that fails when a source file holds bidi controls or zero-width characters.
- [x] The release workflow (`release.yml`): checks, the tag against the version, `npm stage publish` through trusted publishing; `docs/release.md` rewritten.
- [x] Socket's alerts fixed or explained; `SECURITY.md` and the README name the official channels.

**Done when:** a machine always runs `repomagpie`, the short alias still works, and the skill is named `repomagpie`; the hostile tests pass (no control character reaches an agent, a terminal or the app's read views except as a visible marker; agent-facing text is capped, quoted and labelled; links are never followed; huge files and alias bombs are bounded; app links are `http(s)` only); recall and the hook stay under 150 ms, and the hook's chunk imports only `note`, `note-cache`, `recall` and the text module; CI is least-privilege and pinned, with Dependabot and a green macOS job; `release.yml` is ready; every Socket alert is fixed or explained; all checks and end-to-end tests pass. (On `feat/hardening`, 2026-10-13, Windows dev machine, Node 24.13: 975 tests (972 pass, 3 skipped), 147 hook tests, 70 end-to-end flows; every check of the [release process](release.md) passes. Recall 120–127 ms and the hook 113–118 ms with a note, 64 ms without an install (`0.2.0-beta.2`: 130 and 123 ms); CI's Linux runner 73–80 and 72–76 ms. The hook loads `note`, `note-cache`, `journals`, `recall`, the shared `wikilinks` rule and `text`, as before plus `text`. Socket's audit of the skill on skills.sh is answered in `SKILL.md`; socket.dev's one alert on the npm package, "URL strings" (low; no dependency alerts, 0 dependencies), is explained in `SECURITY.md`, URL by URL: the package contacts only `api.github.com` and listens only on `127.0.0.1`.)

Follow-ups from the red-team pass (2026-10-13; the fixed findings are tests in `src/core/red-team.test.ts`, `src/server/red-team.test.ts` and `ui/e2e/hostile.spec.ts`):
- [ ] Low: the opening URL with `?token=` can stay in the browser's history. The token is valid for that run only, and the address bar drops it at once.

Accepted, not scheduled:
- Look-alike names in plain ASCII (`pupeteer` for `puppeteer`) can't be told from real ones without asking the registry. The hook and the skill ask the user to confirm the exact name of a project journal's alternative (decision 0032, rule 4).
- A hard link inside a journal can't be told from a note. A clone can't contain one (git doesn't create hard links), so only the user can make one.

### Launch
See [marketing.md](marketing.md).
- [x] Small fixes before the beta (`feat/launch-prep`): `repomagpie suggest` leaves out words common to any project (`code`, `install`, `js`) from its keywords and why line; the note view shows whether you tried a package and your rating under the title.
- [x] Move `commander`, `minisearch`, `packageurl-js` and `yaml` to `devDependencies`: the CLI bundles them ([decision 0025](decisions/0025-bundle-the-cli.md)). Checked on `feat/launch-prep`: a clean install of the `npm pack` tarball adds one package, and every command runs from it.
- [x] Write `DESIGN.md` (Obsidian-inspired, dark-first) before the logo, social preview, landing page and demo GIF, so they share one visual language. Use `VoltAgent/awesome-design-md` as reference only; copy no brand. (Written on `docs/ui`; the local app uses it too.)
- [x] Landing page and README hero, with `Leonxlnx/taste-skill`. Not for the CLI or data-dense views; its own scope excludes dashboards. (The README is the landing page, on `feat/launch-prep`: the logo, the one-liner, three bullets, a quick start and three dark screenshots of the app. No separate site.)
- [x] Review the landing page with `web-design-guidelines` from `vercel-labs/agent-skills`. (On `docs/readme-pass`, 2026-10-21: the README and its screenshots.)
- [x] End-to-end check and screenshots of the landing page, and screenshots for the README, with `microsoft/playwright-cli`. (On `docs/readme-pass`: the four screenshots retaken from a showcase journal with `@playwright/test`, as before (`README_SHOTS=1`, `ui/e2e/readme-shots.spec.ts`), not `playwright-cli`. The README is the landing page.)
- [x] README rewrite for the accepted positioning, with one line about suggest; edit README and docs copy with `writing-guidelines` from `vercel-labs/agent-skills`.
- [x] README hero (`docs/readme-hero`, 2026-10-21): a centred hero (the language line, the logo, the tagline, badges for npm, the MCP server, Node.js, CI and the licence, quick links, the two-line install), the official channels as a callout, a "How it works" figure (`docs/assets/how-it-works.svg`), "Ask your agent" and an FAQ; Privacy and the scanner paragraph moved into the FAQ.
- [x] Turkish README (`docs/readme/README_tr.md`), a full translation; the English README is the reference. Other languages after launch ([marketing](marketing.md)).
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
The app becomes the place where you write and connect notes: links, backlinks, the `alternatives` relation and a graph, built into `repomagpie ui` ([decision 0026](decisions/0026-the-app-is-the-workspace.md)). Three parts, each on its own branch. Released in beta: parts 1 and 2 in `0.2.0-beta.1`, part 3 in `0.2.0-beta.2` (2026-10-08).

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
- [x] Unresolved links: an ambiguous link opens Search with its name; a missing link whose target is a file stem (`npm--pdfkit`, `github--owner--repo`) opens Add with the PURL it stands for. npm scopes can't be recovered from a stem; those stay as written. (Done on `fix/alternatives-followups`, 2026-10-08, for alternatives too: Check a package, Suggest and the graph's missing notes; `recall --json` and `suggest --json` give an unresolved alternative's `reason`, as links have.)

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
- [ ] Port the graph page to sigma 4 and decide on the bundle size. Dependabot's PR #31 (2026-10-14) showed sigma 4.0.0 fails the typecheck in `GraphPage.tsx` (`NodeHoverDrawingFunction`, `NodeLabelDrawingFunction` and the `labelFont` setting are gone) and grows the graph's chunk from about 40 kB to 112 kB gzipped, the app to 219 kB of its 200 kB budget. Until then `dependabot.yml` ignores sigma's major updates (and `@types/node`'s, which stays on the Node floor's major).
- [ ] Arrow keys in segmented buttons, app-wide: ←/→ move the choice within the group, which is one Tab stop, as in the WAI-ARIA radio group pattern.

Not doing, from the `web-design-guidelines` review of `feat/graph`:
- Keyboard pan and zoom on the graph's canvas: the canvas is a visual aid; the search box, the filters and the neighbours list are the keyboard path ([decision 0028](decisions/0028-the-graph-page.md)).
- Title Case for buttons and headings: every label and heading in the app is in sentence case, as the examples in [`DESIGN.md`](../DESIGN.md) (Writing) are; one page in Title Case would break that.

### Part 3: agent output (`feat/agent-output`)
- [x] Decision: recall names alternatives ([0029](decisions/0029-recall-names-alternatives.md)).
- [x] `repomagpie recall`, the hook, `repomagpie suggest` and "Check a package" in the app show a note's alternatives; `repomagpie note --alternative` records one; the skill explains them. Neighbours means alternatives only: same-tag notes and `[[links]]` are not shown at install time, because they add noise and no decision. (Also the app's Suggest page: an "Instead:" line under "In use, avoid", the maintainer, 2026-10-08.)

**Done when:** the hook's prompt for an avoid note names its alternatives, and the agent's context says to offer them; `recall`, `suggest` and the app show alternatives; `repomagpie note --alternative` records one without changing anything else in the file; recall, the hook and suggest stay within their budgets, and the hook's chunk imports nothing beyond the shared wikilink rule; all checks and end-to-end tests pass. (Met on `feat/agent-output`, 2026-10-08, Windows dev machine, Node 24.13: 841 tests (839 pass, 2 skipped), 147 hook tests and 62 end-to-end flows pass. Recall 130 ms, the hook 123 / 73 ms; on a journal where one note in five has alternatives, 134 ms and 128 / 72 ms. Suggest 332 / 281 ms, and 356 / 294 ms with alternatives. The app 148.4 kB gzipped; the other screens' first files 101.6 kB (+0.3). The hook loads `note`, `note-cache`, `recall` and the new `wikilinks` (1.8 kB). Not yet seen green in CI.)

Follow-up, watch (the maintainer, 2026-10-08):
- [ ] Recall's margin. `repomagpie recall` and the hook take about 145 ms at 2,000 notes on a Windows dev machine (budget 150). Most of it is Node's startup and loading the chunks (about 75 ms: the hook with no install) and reading 2,000 file times for the cache signature (30–35 ms); the cache read and its shape check take about 10 ms, alternatives 1–2 ms. Act when CI's Linux median passes 120 ms, or when a change adds more than 5 ms. Options for headroom:
  - ~~Node's compile cache (`module.enableCompileCache()`, Node 22.1+) for the built CLI, so the chunks aren't parsed and compiled on every run.~~ Tried on `perf/agent-path`: 3–6% faster, slower on a first run; dropped ([decision 0050](decisions/0050-the-agents-path.md)).
  - Load `yaml` only when the cache is rebuilt: a warm run never parses a note, but the hook's chunk carries the YAML parser (part of the 268 kB `note` chunk).
  - Read the file times in parallel (`fs.promises.stat` through libuv's thread pool) instead of 2,000 synchronous `statSync` calls.
  - Compare the cache's signature file by file instead of `JSON.stringify` of both, and make the shape check cheaper (one pass, no closures).
  - A smaller recall cache: keep only the fields the hook reads, and the alternatives already resolved, so a run parses and resolves less.

### Follow-up: topics become tags, a better kind guess (`feat/topic-tags`)
From the maintainer's first day of real use (2026-10-09): ten GitHub repositories gave 4 tags in total, and 9 of 20 notes were `other`. Decision: [0030](decisions/0030-github-topics-become-tags.md).
- [x] Decision 0030, and note-schema rules 2 and 5.
- [x] At creation (`repomagpie note`, `repomagpie import`, Add), a repository's GitHub topics become its tags: ranked (in `tags.md`, then carried by other notes, then the rest), without its own name or the stop list, at most 8; new tags are appended to `tags.md`. Add's preview shows them, each removable.
- [x] "Add GitHub topics as tags" for existing notes: `repomagpie tags --from-topics`, `POST /api/tags/from-topics` and a button in All notes; a dry run first, never a tag removed or reordered, a second run adds nothing.
- [x] A better kind guess: `app`, `platform`, `framework`, `library` and `template`; a skill pack by its name, a topic, or 3 or more skill folders outside hidden folders. Recorded on 13 real repositories (`src/core/fixtures/kinds.json`).
- [x] The sidebar shows the 15 tags with the most notes, then "Show all N tags".

**Done when:** a new GitHub repository note arrives with up to 8 tags from its topics; one action tags the existing notes, and a second run adds nothing; coolify and browser-use are no longer guessed as skill packs, and dify isn't `other` (langflow is a `library`, supabase stays `other`: accepted in 0030); the sidebar stays usable with hundreds of tags; all checks pass. (Met on `feat/topic-tags`, 2026-10-09, Windows dev machine, Node 24.13: 896 tests (894 pass, 2 skipped), 147 hook tests and 66 end-to-end flows. The dev machine was loaded that day: the local benchmarks ran 2–4× slower than at `0.2.0-beta.2`, and the graph's 2,000-note timing missed its 2 s in 4 of 8 runs. CI's report shows no regression: the graph's warm first frame 2,153 and 2,325 ms on this branch, 1,618–2,436 ms over `main`'s last five runs; every benchmark equal or faster than on `main`.)

Follow-up, later (the maintainer, 2026-10-09):
- [x] Ask for a one-line "Use when" at capture, in `repomagpie note` and the app's Add; never required ([Use when at capture](#use-when-at-capture-featuse-when-at-capture)). The retrieval baseline (2026-10-14) missed the same two needs with every method, and both notes had a vague GitHub description ("A fancy self-hosted monitoring tool", "AI-Driven Development"): one line in the user's words fixes that without embeddings.
- [ ] Tag synonyms: topics give near-duplicate tags (`llm` and `llms`, `no-code` and `nocode`, `web-scraping`, `webscraping` and `web-scraper`, `self-hosted` and `self-hosting`). Decide whether magpie merges or suggests one spelling; renaming and merging tags are out of scope until then. Proposed in [RFC 0001](rfcs/0001-domains-tags-and-search.md#43-tag-aliases), Phase 1: aliases in `tags.md` and `repomagpie tags --merge`.

### Agents everywhere: MCP, setup and doctor (`feat/mcp-setup`)
Any coding agent can ask "what do I have for X?" and check a package before installing it, without the user wiring anything by hand. RepoMagpie narrows candidates deterministically and offline and never calls a model; the agent makes the semantic choice. Decisions: [0034](decisions/0034-the-mcp-server.md) (the MCP server), [0035](decisions/0035-setup-and-doctor.md) (`setup` and `doctor`). Agent facts, with sources: [agents](agents.md).
- [x] Decisions 0034 and 0035; [agents](agents.md): MCP registration, skills folders and hooks for 12 agents, with sources (checked 2026-10-14); the launch path (absolute `node` and entry file, never `PATH` or `npx`).
- [x] `repomagpie catalog`: the journal at a glance, one compact row per note, in pages; and the `search` and `suggest` flags MCP needs (none: `search` has its filters, and MCP's `project` is the working folder of the call, which also moves where `suggest` reads the manifests). (2026-10-14, Windows dev machine: a 1,000-row page of 2,000 notes in 392 ms median, p95 436 ms; search 331 ms in the same run. `--json` was about 330 characters a row on generated notes and 400 on the example vault's; after the maintainer's review, compact rows by default (name, kind, journal, avoid, summary to 100, Verdict to 60): about 185 and 200 a row, 100 notes about 18,500–20,000 characters and 800 notes about 147,000–160,000; `--full` keeps the long rows. CI's Linux runner on #33: catalog 174 ms, recall 83 ms, the hook 81 ms.)
- [x] `repomagpie mcp`: a stdio server for the 2025-11-25 and 2026-07-28 protocol revisions; `recall`, `search`, `suggest`, `catalog`, and `note` with `--allow-write`; each tool's document equal to the CLI's `--json`. (2026-10-14: `@modelcontextprotocol/server` 2.3.1, Apache-2.0, bundled into a 673 kB chunk only `mcp` loads, with the `@cfworker/json-schema` validator instead of ajv and zod `jitless`, so it generates no code; the package 319 → 480 kB packed. 14 tests, over real stdio for both revisions, with code generation from strings disallowed. The hook's chunk is byte-identical. Timings on a busy Windows dev machine: cold start to the first answer 324 ms; per call recall 114 ms, search 200, suggest 320, catalog 287 (1,000 rows); CI's numbers to come.)
- [x] `repomagpie doctor`: what is wired, read-only, with `--json`. (2026-10-14: 11 tests on a scratch home with fake commands on `PATH`: nothing set up, the old hook entry, a broken MCP path, a foreign `magpie`, JSON with comments, Codex's TOML, a skill link, journals with skipped and unreadable notes; a test proves it writes nothing.) <!-- check:commands allow -->
- [x] The MCP server generates no code: the `@cfworker/json-schema` validator instead of ajv, zod `jitless`, tests with code generation disallowed; no NOTICE file to ship (the maintainer's review, 2026-10-14).
- [x] `repomagpie setup`, part 1: detection, the plan, the prompts, MCP registration for Claude Code, Codex CLI, Cursor, Gemini CLI and VS Code, backups, `--dry-run`, `--remove`; every entry starts node with `--disallow-code-generation-from-strings`, and `doctor` reports it. (2026-10-14: fake agent CLIs on `PATH` record their arguments; arguments pass a Windows `.cmd` shim exactly; VS Code's user `mcp.json` path checked on a real install with a scratch profile. `--project` moves to part 2.)
- [x] `repomagpie setup`, part 2: the skill shipped in the package and installed in `~/.agents/skills/` with a link from `~/.claude/skills/`, as `npx skills` lays it out; the Claude Code hook, with the old `magpie` entry migrated; `--project` for the skill and the hook. (2026-10-14. The user's hook in Claude Code's exec form, node started directly with code generation off: 86 ms on Windows, against 281 ms through Git Bash and npm's shell shim; older entries migrated, flags kept. `--project` writes the skill and the shell-form hook, never an MCP entry.) <!-- check:commands allow -->
- [x] Retrieval baseline: recall@5 and recall@10 for `search` and `suggest` on about 20 needs over a fixture journal of public GitHub metadata (`npm run eval:retrieval`; not in CI). (2026-10-14: 33 notes as `repomagpie note <url>` writes them, no Verdicts, 22 needs in plain words. search: recall@5 18/22 (82 %), recall@10 18/22; suggest: recall@5 17/22 (77 %), recall@10 18/22 (82 %). Missed by both: "get alerted when my website goes down" (uptime-kuma: "A fancy self-hosted monitoring tool") and "an AI that writes code and fixes issues in my repo" (OpenHands: "AI-Driven Development"); by one: a chat interface for local models, an agent that clicks through websites, local LLMs, end-to-end browser tests. The catalog for 33 notes: 4,341 characters compact (132 a row), 11,226 with `--full`.)
- [x] Red-team pass for agent config files, MCP arguments and MCP outputs. (2026-10-14: `src/core/red-team-setup.test.ts` S1–S10, `src/mcp/red-team.test.ts` M1–M4, `src/core/redact.test.ts`. Fixed: config files over 64 MB read whole; `hooks` of the wrong type failing half-way; relative `PATH` entries searched; secrets in `doctor`'s and `setup`'s output (arguments, hook commands, JSON errors that quote the file); the skill's update writing through a link inside its folder; edited files losing their permissions.)

Accepted, not scheduled (from the same pass):
- A `project` argument that is a link to another folder is read as that project. The server reads only what the user's account can, and that folder's journal is labelled as written by its contributors (test M4).
- A `repomagpie` on `PATH` whose shim points to a package named `repomagpie` counts as ours in `doctor`: it is what runs. Agents never start RepoMagpie by name; `setup` writes absolute paths.
- On Windows, the edited config file takes its folder's access rules, not the old file's: a rename replaces the file. Its contents and attributes are the same.
- [x] The skill, README, SECURITY.md and spec; the release check list. (2026-10-15: the skill prefers the MCP tools and reads `catalog` when search finds little; the README installs with `repomagpie setup`, the steps by hand in [setting up by hand](setup-by-hand.md); Antigravity CLI researched in [agents](agents.md#antigravity-cli), by hand for now. Agent CLIs and `cmd.exe` run only by absolute path, in the home folder; so do the app's `cmd.exe`, `/usr/bin/open` and `xdg-open`. Gemini CLI is detected by its `settings.json` or its command, not by `~/.gemini`, which Antigravity CLI makes too. Release check list passed except the local benchmarks on a loaded machine; CI's are within budget.)
- [x] Fixes from the Windows live test (2026-10-15, Windows 11, Node 24, Claude Code and VS Code): `setup` keeps each entry's note-tool setting unless `--allow-write`, the new `--no-allow-write` or an answer changes it, and the question says what it is now; the plan's first line has full paths, to copy; `Restart your agents` only after a change; backup stamps end in `Z` (UTC); VS Code is `VS Code (GitHub Copilot)`; `doctor` lists `setup`'s backups (copies of `~/.claude.json` can hold tokens) and `setup` counts them. CI: the CodeQL alert on a hand-escaped regex in a test, and an end-to-end test that read `tags.md` before the app's write had finished. Release check list passed, the local benchmarks within budget too.

**Done when:** `repomagpie mcp` serves both protocol revisions over stdio, and its five tools answer exactly as the CLI's `--json` does, with note text marked, capped and labelled; `note` exists only with `--allow-write`; `repomagpie setup` wires the first set (MCP, skill, Claude Code hook) with backups, a plan and a prompt, is idempotent, and `--remove` is clean; `repomagpie doctor` explains what's wired, including a foreign `magpie` on `PATH`; the retrieval baseline is reported; the hook's chunk is unchanged and the budgets hold; all checks and end-to-end tests pass. <!-- check:commands allow -->

### The hook in every agent that has one (`feat/agent-hooks`)
The hook is the backstop when an agent skips the check before an install. Today only Claude Code has it; Codex CLI, Gemini CLI, Cursor, Antigravity CLI and Copilot CLI have hooks too. Where an agent can ask, the hook asks; where it can't, it denies the first try and lets the same install through for the next 10 minutes ([decision 0036](decisions/0036-hooks-in-other-agents.md)). Agent facts: [agents](agents.md#hooks-what-an-adapter-could-do).
- [x] Research and decision 0036: the five agents' hooks re-checked with sources (2026-10-15), reading Codex's and Gemini CLI's source where their docs are silent: Codex keeps hook trust in `config.toml` and runs a hook through the session shell or `%COMSPEC% /C`; Gemini CLI runs it through PowerShell on Windows and blocks on every non-zero exit but 1; Copilot CLI denies on any non-zero exit; VS Code reads Copilot CLI's hook folder.
- [x] The pre-check on real agents (the maintainer, on Windows, 2026-10-15): each agent's input, whether an empty or informing answer leaves the agent's own prompt as it is, and what each does with a deny. Codex CLI, Antigravity CLI, Copilot CLI and Cursor; Gemini CLI couldn't sign in. Copilot CLI 1.0.98 runs a call unasked when a hook answers `ask`, so it gets the deny and the retry too; the retry is by install, not command text ([agents](agents.md#the-pre-check-on-real-agents-windows-2026-10-15)).
- [x] The hook's core split from Claude Code's adapter, Claude Code's output byte for byte the same (golden tests); the retry record. `repomagpie hook claude-code` stays silent on Cursor's input (2026-10-16).
- [x] `repomagpie hook codex`, `gemini-cli`, `antigravity`, `copilot`, and `cursor` if it never approves. (2026-10-16: `codex` is built, from the pre-check's inputs; its fields stay under 5,000 characters for Codex's 2,500-token limit. `gemini-cli` is built from Gemini CLI's source, which supports `ask`, so it asks. `antigravity` answers `force_ask` on an avoid note and nothing else. `copilot` denies the first try and prints nothing else; VS Code runs its hook file with its own input, which it leaves alone, so a VS Code hook waits for a capture of its terminal tool. `cursor` denies the first try and prints nothing else; the pre-check showed it never approves. Each adapter is its own chunk.)
- [x] `setup` and `doctor`: the hook entries with their Windows launch timings; Antigravity CLI and Copilot CLI in the first set. (2026-10-20: each entry starts node directly only when node and the entry file exist, so a moved node turns the hook off instead of failing; through Windows PowerShell an entry takes 340–390 ms, of which about 255 ms is PowerShell's own start; `doctor` reads Codex CLI's trust from `config.toml`.)
- [x] Red-team pass (2026-10-20: `src/hook/red-team-hooks.test.ts` H1–H8, `src/core/red-team-setup.test.ts` S11–S13. Fixed: a folder of 60,000 parts in an agent's input held the hook for minutes; on Windows a folder on another machine named in the input (Antigravity's `Cwd`, Gemini CLI's `dir_path`, chosen by the model) would have sent that machine the user's sign-in hash; installs hidden in `powershell -EncodedCommand`, `call`, `start`, `.`, `wsl`, `npx`, `corepack`, `iex`, `Invoke-Expression` and `Start-Process`; a retry record others could write was trusted; `setup` edited the copy of a key written twice that the agent ignores; a hook file with a byte-order mark failed. Held: 20 MB and deeply nested input, wrong types, note text faking JSON or the hook's advice, a folder through a link, hook files that are folders or links.)
- [x] Docs and the release check list (2026-10-20: spec §6 is the hook contract for every agent; the skill says what to do when a hook stops an install, and to use `repomagpie.cmd` when PowerShell blocks `repomagpie`; the README names the agents and the Windows cost of their hooks).
- [x] A live test with all five agents (the maintainer, on Windows, 2026-10-20 and 2026-10-21: passed in Claude Code (unchanged), Codex CLI, Cursor, Gemini CLI (with an API key; the ask held after "allow this session"), Antigravity CLI (after the launcher fix) and Copilot CLI (the deny, then the agent asked through `ask_user`). Fixed on the branch from it: an empty `mcp_config.json`, Gemini CLI's `mcp add` arguments, Antigravity CLI's launcher on Windows, and the Codex retry's let-through line.)

**Done when:** every agent with a hook gets `repomagpie hook <agent>` from `setup`, which asks where the agent can and denies the first try where it can't, never approves and never blocks on its own errors; `doctor` reports each hook; the hook's chunk grows by the adapters only and keeps the recall budget; all checks pass, and the live test passes in all five agents.

### Deleting a note (`feat/delete-note`)
Testers will write test notes on their first day and want them gone. A delete moves the note to the journal's `.trash/`, only the person deletes, and only the version they saw ([decision 0037](decisions/0037-deleting-a-note-moves-it-to-the-trash.md)).
- [x] Core: `deleteNote` (by id or file name, with a dry run, the version check and the notes that link to it), the Undo's `restoreNote`, and `.trash/` in a project journal's `.gitignore`, old ones included. A test proves nothing reads `.trash/` as notes.
- [x] `repomagpie delete <name> [--journal] [--yes] [--json]`: shows the note and what links to it, then asks; without a terminal it needs `--yes`.
- [x] The app: "Delete note" in the note view, a dialog with the notes that link to it, and a toast with Undo (`POST /api/note/delete`, `POST /api/note/restore`), with end-to-end tests.
- [x] Docs: decision 0037, the spec, the UI doc, the skill (never delete unless the user asked for that note by name) and the READMEs. No MCP tool deletes.

**Done when:** a note can be moved to the trash from the CLI and from the app, disappears from everything that reads notes, and comes back with Undo in the app; no agent tool can delete; all checks pass.

### The capture offer (`feat/capture-nudge`)
H1 asks whether people will write notes ([validation](validation.md)). The commonest moment for a note is a dependency decision made during a task, which nobody phrases as an opinion. The agent already in the conversation saw it, so it offers once, at the end of the task, to save it; the Verdict stays the user's words ([decision 0018](decisions/0018-ai-drafts-humans-decide.md)). No new model, process, network call or hook ([ideas](ideas.md), idea 12, step 1).
- [x] The skill's "After a dependency decision": when it offers (the task is done, a decision involving the user, not already noted), when it doesn't, what the offer says, and what it saves (the user's reason as the Verdict, the chosen package as the alternative, "avoid" only from the user). `src/cli/skill.test.ts` checks the section.
- [x] `repomagpie doctor`: for an agent found by its folder only, one to-do per agent that names both ways out (fix the entries, or `repomagpie setup --remove --agents <id>`); an agent that isn't installed names the file to edit by hand.
- [x] [Ideas](ideas.md) 12 to 18, the maintainer's of 2026-10-24, assessed: auto-extraction, taxonomy and semantic search, just-in-time context, team sync, a community hub, measuring skill compliance, Hugging Face notes.
- [x] Docs: the spec, the changelog, validation (H1), the tester guides, and the READMEs ("Remember", no extra model, "Does RepoMagpie use AI?").
- [ ] The five live scenarios in Claude Code on a scratch journal, run by the maintainer on macOS after `0.2.0-beta.10`, with the real install (the script is in the pull request).

**Done when:** the skill offers once, at the end, when a dependency decision happened, and never writes the Verdict; the five live scenarios behave as expected; `doctor` names both ways out for a folder-only agent's entries; all checks pass.

### Use when at capture (`feat/use-when-at-capture`)
[RFC 0001](rfcs/0001-domains-tags-and-search.md) Phase 0: before any search change, notes say in the user's words when they'd use or avoid a package, so they are found by need, not only by name ([idea 13](ideas.md#13-taxonomy-and-semantic-search)).
- [x] `repomagpie note --use-when` and `--avoid-when`, one item each, repeatable: the user's items are kept, new ones go after them, a draft gives way, an "Avoid when" item says the hook will ask; `--json` names the sections changed.
- [x] The MCP `note` tool's `use_when` and `avoid_when`, only with the user's words.
- [x] The skill asks in the same question as the reason, never fills them, and never asks a second question.
- [x] The app: "Use when" and "Avoid when" fields in the inbox review and on Add, saved in one request.
- [x] `npm run eval:retrieval` with and without one synthetic "Use when" item per note; the numbers are in [idea 13](ideas.md#13-taxonomy-and-semantic-search).
- [x] Docs: the spec, the note schema, the app's doc, the READMEs, the tester guides and the changelog.

**Done when:** "Use when" and "Avoid when" can be given from the CLI, the MCP tool, the review form and Add, without ever losing human text; the skill asks once and never fills them; the eval shows recall with and without; all checks pass.

### The next batch (`feat/next-batch`)
[RFC 0001](rfcs/0001-domains-tags-and-search.md) Phase 1, two ways to get notes written, the graph, a way to measure the skill, and the project journal made visible.
- [x] Domains on notes, tag aliases and structured search: `domains` and `domains_suggested`, `repomagpie domains --suggest`, `note --domain`, spellings in `tags.md` and `tags --merge`, `search --domain --tag --match` with `why`, the MCP `vocabulary` tool, the app's domain chips and filters, and the expanded retrieval eval ([decision 0040](decisions/0040-domains-a-second-axis.md), [decision 0041](decisions/0041-structured-search.md)).
- [x] The Stop reminder for Claude Code, opt-in: `repomagpie setup --capture-reminder` ([decision 0042](decisions/0042-the-stop-reminder.md)).
- [x] `repomagpie init --auto`: a project's dependencies by what your notes say, then your Verdict on each one without a note; plain `init`'s draft notes dropped.
- [x] The graph: "Colour by domain" in Draw, and its data fetched while its code loads ([decision 0043](decisions/0043-the-graph-colours-by-domain.md)).
- [x] The graph's labels never overlap, at any size; tags on one note hidden by default, with a Draw option to show them; tag labels quieter ([decision 0044](decisions/0044-graph-labels-never-overlap.md)).
- [x] The skill-compliance eval, [`evals/skill/`](../evals/skill/README.md): 25 scenarios for Claude Code, run by the maintainer ([idea 17](ideas.md#17-measuring-skill-compliance)).
- [ ] The eval's dry scenario, then the full set, run by the maintainer; the README's "as well as that agent follows the skill" line points to the numbers once there are some.
- [x] The project journal made visible: the README's "Share notes with your team", the app's empty state and its line on a project note, and `doctor`'s line ([idea 15](ideas.md#15-multiplayer-and-team-sync)).
- [ ] The [manual checks](testing/manual-checks.md) added for `0.2.0-beta.12`, run by the maintainer.

**Done when:** each part's tests and checks pass; the eval's dry scenario shows the install checks can see a denied install; the manual checks for `0.2.0-beta.12` pass.

### Discover (`feat/discover`)
Find repositories worth a note, not only note the ones you found ([idea 19](ideas.md#19-discover)).
- [x] `repomagpie discover`: GitHub's search by words, a domain, a kind, topics, a language, stars and activity, with stars, forks, the last push, the licence, an estimated kind and domains, and whether a journal has a note; `--json`, a 10-minute cache, the skill's paragraph ([decision 0045](decisions/0045-discover.md)).
- [x] Sturdier classification of new notes: the README's start, manifest keywords and an Action file, measured by `npm run eval:classification` on 69 repositories ([decision 0046](decisions/0046-classification-signals.md)).
- [x] The app's Discover page: filters, result cards, Add to inbox, Add with a Verdict, several at once, the states, More results ([UI](ui.md), §7).
- [x] Docs: the READMEs, SECURITY.md, the spec, the app's doc, the glossary, ideas, the changelog and the manual checks.
- [x] Released in `0.2.0-beta.14` (2026-10-27), with removing a suggested domain in the app, with Undo (#62).
- [ ] The [manual checks](testing/manual-checks.md) for Discover, run by the maintainer.

**Done when:** `repomagpie discover` and the Discover page search GitHub and add to the inbox through `repomagpie note <url>`; nothing calls GitHub unless the user searches or adds, and the MCP server stays offline; `eval:classification` shows the numbers before and after; every check passes.

## v0.3 Trust
- [ ] Vet, reduced ([decision 0011](decisions/0011-vet-and-drift-reduced.md)): record your review and the reviewed commit in the note; link the output of existing scanners.
- [ ] `repomagpie drift`: lists notes whose upstream changed since the reviewed commit, using existing lockfiles where they exist.
- [ ] `repomagpie gaps`: dependencies used in a project but missing from the journals.
- [ ] `--project <dir>` also moves where `repomagpie suggest` reads the manifests and README, like `git -C`. In v0.1 they come from the working directory ([spec](spec.md), section 2), so `repomagpie --project ../app suggest` reads the current folder's manifests.

## v0.4 Share
- [ ] `repomagpie publish`: a static "nest" site from notes marked public, following `DESIGN.md`. Review it with `web-design-guidelines` and check it with `playwright-cli`.
- [ ] `repomagpie follow <nest-url>`: another user's public notes in your search results, attributed.
- [ ] `/uses` page generator.
- [ ] Semantic search, also for `suggest`. First decide embeddings: local model or API; the default must work offline (moved from step 2). Orama is the candidate library ([spec](spec.md), section 9).

## Later
- [ ] Resurfacing digest.
- [ ] `repomagpie today`: one optional daily find.
- Moved: the MCP server is now [agents everywhere](#agents-everywhere-mcp-setup-and-doctor-featmcp-setup), for every agent ([decision 0034](decisions/0034-the-mcp-server.md)).
- [ ] Recall for installs without package names (`npm install`, `pip install -r requirements.txt`): check the whole manifest. Ignored in v0.1 ([spec](spec.md), section 6).
- [ ] Hook mode for clients other than Claude Code, as their hooks allow passing context on an allowed command ([ideas](ideas.md#hook-support-in-major-clients)). v0.1 uses skill mode there. Next for Codex, Gemini CLI and Cursor: their hooks, checked on 2026-10-14, are in [agents](agents.md#hooks-what-an-adapter-could-do). To research with them: Antigravity CLI.
- [ ] *Obsidian extra (optional):* ready-made Dataview queries in `examples/vault/`.
- [ ] The graph as an export: a standalone HTML file, and the graph in nest pages ([decision 0026](decisions/0026-the-app-is-the-workspace.md)).

## Not scheduled
- *Obsidian extra (optional):* the Obsidian graph preset for the example vault (level 1 in the [product](product.md#graph-specification) history). The in-app graph is the working view ([decision 0026](decisions/0026-the-app-is-the-workspace.md)).
