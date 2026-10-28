# Ideas

**Status:** Statuses and targets follow the accepted [strategy](strategy.md) and [decision 0010](decisions/0010-v0-1-scope.md). The v0.1 beta may still change them.

The ideas that shape RepoMagpie beyond note capture and search. Each one lists its problem, behaviour, surfaces, schema impact, target release and open questions. Ideas 12 to 18, the maintainer's of 2026-10-24, are candidates, so each is an assessment instead: what it is, why it might matter, what already exists, the options, the risks and what would decide it. The [roadmap](roadmap.md) tracks the work; the [glossary](glossary.md) defines the terms.

## Direction

The product's category moved:
- **from:** a better bookmark manager for GitHub repositories
- **to:** the memory of what you and your team learned, shown before your agent installs a dependency

**One-liner** ([decision 0009](decisions/0009-positioning-dependency-memory.md)):

> RepoMagpie remembers what you and your team learned about every dependency, and tells your coding agent before it installs one.

## Rules every idea follows

1. Plain Markdown with YAML frontmatter is the only source of truth. Indexes are rebuildable caches ([decision 0001](decisions/0001-plain-markdown-storage.md)).
2. AI may draft "What it does" and "Use when"; the Verdict is human-only, and a note without one stays `inbox` ([decision 0018](decisions/0018-ai-drafts-humans-decide.md)).
3. One note per repository; skills are searchable lines ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).
4. CLI first, `SKILL.md` for agents, MCP as a thin layer for every agent ([decision 0002](decisions/0002-cli-first.md), [decision 0034](decisions/0034-the-mcp-server.md)).
5. Two journal scopes with one format: a personal journal outside any repository, and a project journal in `.magpie/` ([decision 0013](decisions/0013-two-journal-scopes.md)). This repository holds neither, only the example vault ([decision 0003](decisions/0003-vault-outside-repo.md)).
6. Local-first: no accounts, no server, no telemetry by default. Nothing is published unless the user marks it public.
7. Compose with security tools; never claim to detect malware ([decision 0009](decisions/0009-positioning-dependency-memory.md), [decision 0011](decisions/0011-vet-and-drift-reduced.md)).

## Overview

| # | Idea | Status | Target | Why |
|---|---|---|---|---|
| 1 | Proactive recall | **Core** | v0.1 | The empty square: your verdict before install ([competitors](competitors.md), D) |
| 8 | Team journal | **Core**, as the project journal | v0.1 | Git gives sharing for free |
| 4 | Context-aware suggest | **Core** | v0.1 | Shows what you already have when a project starts |
| 11 | Adopt | **Core** | v0.1 | Moves a note from your personal journal into a project |
| 10 | Graph views | **In the app** | v0.2 (part 2) | The first user asks for it to work in ([decision 0026](decisions/0026-the-app-is-the-workspace.md)) |
| 5 | Gap detection | `repomagpie init --auto` built; plain `init`'s drafts dropped; `repomagpie gaps` planned | `init --auto`: 0.2; `gaps`: v0.3 | Fills an empty journal from real manifests |
| 2 | Vet and drift | **Reduced** | v0.3 | Record your review; integrate existing scanners and lockfiles; no own scanner |
| 3 | Nests and follow | Planned | v0.4 | Needs users first |
| 7 | `/uses` page generator | Planned | v0.4 | Marketing feature |
| 6 | Resurfacing digest | Later | — | Nice to have |
| 9 | Daily find | Later | — | Distraction from the core |
| 12 | Auto-extraction | Candidate; step 1 done | after the tester round | H1: a note must cost almost nothing to write |
| 13 | Taxonomy and semantic search | Approved in part ([RFC 0001](rfcs/0001-domains-tags-and-search.md)) | Phase 0 now; Phases 1–2 next; Phase 3 later | Retrieval; notes stay about packages (D1) |
| 14 | Just-in-time context | Candidate | after the tester round | Token cost per task |
| 15 | Multiplayer and team sync | Visibility built (README, app, doctor); sync stays git | 0.2 | H3: the project journal exists; visibility was the gap |
| 16 | A community hub and registry | Candidate | after the tester round | Sharing journals; prompt-injection risk |
| 17 | Measuring skill compliance | Built for Claude Code (`evals/skill/`); no results yet | 0.2 | Turns "as well as the agent follows the skill" into a number |
| 18 | Hugging Face notes | Candidate | after the tester round | Models and datasets are dependencies too |
| 19 | Discover | **Built** ([decision 0045](decisions/0045-discover.md)); kind accuracy done ([decision 0047](decisions/0047-kind-rules-measured.md)); six follow-ups are candidates | 0.2 | Finding what to note, not only noting what you found |
| 20 | The note view's editors, loaded later | Candidate | when the first files need room | The next way to make the app's first files smaller ([decision 0048](decisions/0048-the-first-load-line-measured.md)) |
| 21 | Graph positions across reloads | Candidate | when a warm open feels slow | A reload drawn at once: 965 → about 450 ms at 2,000 notes ([decision 0049](decisions/0049-the-graph-opens-faster.md)) |

---

## 1. Proactive recall

- **Problem:** The journal only helps if the user remembers to query it.
- **Behaviour:** When a coding agent is about to install a dependency (`npm install`, `pnpm add`, `yarn add`, `pip install`, `uv add`, `cargo add`, …), RepoMagpie checks the personal and project journals. If a note matches, it shows the verdict first, then when to use or avoid the package, gotchas, and better-rated alternatives. Recall never denies an install. For a note the user marked "avoid" (the Verdict starts with "avoid", or "Avoid when" has content), the Claude Code hook asks the user to confirm, with the note as the reason; every other match informs only ([decision 0024](decisions/0024-recall-asks-on-avoid-notes.md)). Example:

  > Note from your journal: left-pad 2/5 — 'abandoned, use String.prototype.padStart'.

  Recall has two modes:
  - **Hook mode:** in clients that support hooks, a hook runs recall before every matching shell command. It runs whether or not the agent remembers to.
  - **Skill mode:** RepoMagpie's `SKILL.md` tells the agent to run `repomagpie recall <package>` before installing. Best effort: it depends on the agent following the instruction, but works in any client that supports skills.
- **Surfaces:** agent hook (hook mode), `SKILL.md` (skill mode), and `repomagpie recall <package>` on the CLI.
- **Schema impact:** a tool-owned `packages` field, a list of Package URLs (for example `["pkg:npm/%40playwright/cli", "pkg:pypi/playwright"]`, [decision 0017](decisions/0017-package-identity-purl.md)), detected from manifests such as `package.json`, `pyproject.toml` and `Cargo.toml`, so a package name maps to a note. How notes are identified is designed in the step 2 spec ([decision 0010](decisions/0010-v0-1-scope.md)).
- **Target release:** v0.1, with hook mode for Claude Code at launch and skill mode elsewhere. This is the headline demo.
- **Open questions:**
  - Which package managers are in v0.1?
  - How are monorepos with several packages handled?
  - What output format reads well for the agent?
  - An optional "ask" mode (confirm before installing) in a later release?
  - Hook mode in clients whose pre-tool hook can't pass context to the agent on an allowed command (see below): show the note to the user only, use a post-tool hook, or rely on skill mode?

### Hook support in major clients

Checked 2026-10-03 against each client's documentation. Hook support is not universal, and it changes often: re-check before building hook mode. Checked again on 2026-10-14, for more agents, in [agents](agents.md#hooks-what-an-adapter-could-do); where the two differ, that page is current.

| Client | Hook before a shell command | Can it allow the command and still pass the note on? | Source |
|---|---|---|---|
| Claude Code | `PreToolUse` on `Bash` | Yes: `additionalContext` reaches the model; `systemMessage` is shown to the user. | [Claude Code hooks](https://code.claude.com/docs/en/hooks) |
| OpenAI Codex | `PreToolUse` on `Bash` and other tools | Yes: `hookSpecificOutput.additionalContext`. Open question: third-party reports describe hooks as experimental, and an [open issue](https://github.com/openai/codex/issues/24453) reports that shell commands on Windows don't trigger `PreToolUse`. | [Codex hooks](https://learn.chatgpt.com/docs/hooks) |
| Cursor | `beforeShellExecution` | Partly: `agent_message` and `user_message` exist, but the docs say messages are shown mainly when a command is blocked. Open question: are they shown on `allow`? | [Cursor hooks](https://cursor.com/docs/agent/hooks) |
| Gemini CLI | `BeforeTool` | User only: `systemMessage` is shown in the terminal; no field adds model context on an allowed call (`additionalContext` exists on `AfterTool`). | [Gemini CLI hooks reference](https://geminicli.com/docs/hooks/reference/) |
| GitHub Copilot | `preToolUse`, in Copilot CLI and the cloud agent | No: `preToolUse` can't add context on allow; `postToolUse` supports `additionalContext`. Open question: hooks in the VS Code and JetBrains agents (not in this reference). | [Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference) |

## 2. Vet and drift

- **Problem:** Skills run with the user's shell permissions, and authors can change them after the user has reviewed them.
- **Behaviour** (reduced, [decision 0011](decisions/0011-vet-and-drift-reduced.md)): RepoMagpie builds no scanner.
  - **Vet:** the user records their own review and the commit they reviewed in the note, and can link the output of existing scanners ([competitors](competitors.md), C).
  - **Drift:** `repomagpie drift` lists notes whose upstream changed since the reviewed commit, using existing lockfiles where they exist.
- **Surfaces:** CLI (`repomagpie drift`, and a way to record a review).
- **Schema impact:** a tool-owned `reviewed_commit` field (commit SHA). It joins the schema only when v0.3 work starts.
- **Target release:** v0.3.
- **Open questions:**
  - Which scanners and lockfile formats to integrate first?
  - How far back can drift look when no commit was recorded?

## 3. Nests and follow

- **Problem:** Stars show popularity, not *why* something is useful.
- **Behaviour:**
  - `repomagpie publish` builds a static "nest" site from notes marked public: a searchable list, the graph (idea 10) and a `/uses` view (idea 7). It can be hosted on GitHub Pages.
  - `repomagpie follow <nest-url>` imports another user's public verdicts and "Use when" lines into your search results. They are clearly attributed and never mixed into your own notes.
- **Surfaces:** CLI (`repomagpie publish`, `repomagpie follow`); the nest site; search results.
- **Schema impact:** a human-owned `public` field, `true` or `false`, default `false`. Private by default.
- **Target release:** v0.4.
- **Open questions:**
  - Nest data format (a JSON export next to the HTML?).
  - Attribution format.
  - How often followed nests are refreshed.

## 4. Context-aware suggest

- **Problem:** Starting or working on a project, you don't know which of your notes apply to it.
- **Behaviour:** `repomagpie suggest` shows what you already have that fits the project.
  - **Input:** the project's manifests and README, or a free-text description ("a TypeScript CLI with tests").
  - **Output:** matching notes from both journals, verdict first.
  - **In v0.1, no embeddings:** magpie narrows the candidates by keyword and tags, and the coding agent makes the semantic choice, guided by `SKILL.md`.
- **Surfaces:** CLI (`repomagpie suggest`); `SKILL.md`; the local app ("Suggest for this project").
- **Schema impact:** none planned.
- **Target release:** v0.1.
- **Open questions:**
  - How many candidates does magpie hand to the agent? v0.1: 20 by default (`--limit`); the beta tests whether that fits.
  - Semantic matching (v0.4, with semantic search): does it replace the agent's choice or add to it?

## 5. Gap detection

- **Problem:** A new journal is empty, and you can't see which tools you rely on but never wrote down.
- **Behaviour:**
  - `repomagpie init --auto` reads a project's manifests (`package.json`, `pyproject.toml`, `Cargo.toml`), lists the dependencies already in use by what your notes say, and asks for your Verdict on each one without a note, so the journal starts from real decisions instead of stars.
  - `repomagpie gaps` reports dependencies used in a project but missing from the journals, and tags or kinds with no reviewed notes.
- **Surfaces:** CLI (`repomagpie init`, `repomagpie gaps`).
- **Schema impact:** none planned; it reads the `packages` field (idea 1).
- **Target release:** `init` in v0.1 if time allows, otherwise v0.3; `gaps` in v0.3.
- **Status (2026-10-25):** `repomagpie init --auto` is built for 0.2: it lists a project's dependencies as avoid, noted and no note, and in a terminal asks for the user's Verdict on each one without a note (never a draft without one). Plain `init`'s draft notes are dropped (the maintainer, 2026-10-25): plain `init` only says what `--auto` does.
- **Open questions:**
  - Which projects does `gaps` scan, and how does the user point to them?

## 6. Resurfacing digest

- **Problem:** Notes go stale, and you forget what you saved.
- **Behaviour:** A periodic digest of the form "You saved X three months ago. Still useful?" It keeps the journal fresh and reinforces what you learned.
- **Surfaces:** CLI (command name not decided).
- **Schema impact:** a tool-owned `last_resurfaced` date.
- **Target release:** later (not scheduled).
- **Open questions:**
  - How is it delivered without notifications (on demand only)?
  - How often, and who sets the interval?

## 7. `/uses` page generator

- **Problem:** A "tools I use" page is written by hand and goes stale.
- **Behaviour:** Generates a "Tools I trust" page or README section from public, reviewed notes, grouped by tag or kind.
- **Surfaces:** CLI; the nest site (idea 3).
- **Schema impact:** none of its own; it uses `public` (idea 3).
- **Target release:** v0.4, together with nests.
- **Open questions:**
  - Output formats: Markdown section, HTML page, or both?

## 8. Team journal

- **Problem:** Team members vet the same tools again and again, with no shared record.
- **Behaviour:** The project journal: `.magpie/` inside a project repository, committed with the code ([decision 0013](decisions/0013-two-journal-scopes.md)). The team shares it, reviews changes to it and keeps its history through git, with no server. Search, suggest and recall read it alongside each member's personal journal.
- **Surfaces:** `.magpie/` in the project repository, used through the CLI and the agent.
- **Schema impact:** same note format as the personal journal; review ownership may need a field later.
- **Target release:** v0.1, as the project journal.
- **Open questions:**
  - How is review ownership recorded?
  - How are results from the two journals labelled and ranked? (Step 2 spec.)

## 9. Daily find

- **Problem:** Finding one repository worth exploring each day takes effort, so the habit breaks.
- **Behaviour:** `repomagpie today` suggests one trending repository that matches the user's tags, and tracks an exploration streak. It stays optional and quiet: no nagging, no notifications by default.
- **Surfaces:** CLI (`repomagpie today`).
- **Schema impact:** none planned.
- **Target release:** later (not scheduled).
- **Open questions:**
  - Where does trending data come from?
  - Can the streak be computed from `explored` dates, so nothing extra is stored ([decision 0001](decisions/0001-plain-markdown-storage.md))?

## 10. Graph views

- **Problem:** With hundreds of notes, you can't see what you have, how it groups, and what connects to what. You also can't see the state of your journal at a glance (inbox, drift, gaps).
- **Behaviour:** A graph page in the local app ([decision 0026](decisions/0026-the-app-is-the-workspace.md)): every note is a node, tags are hub nodes, and `[[links]]` and `alternatives` are edges. Similarity computed from topics and language is an optional edge source, off by default, with at most 3 neighbours per note. Full specification: [product](product.md#graph-specification).
- **Surfaces:** the local app (`repomagpie ui`). Later, as exports: a standalone HTML file and the graph in nest pages (idea 3).
- **Schema impact:** the human-owned `alternatives` field: a list of wikilinks, for example `alternatives: ["[[microsoft--playwright-mcp]]"]` ([decision 0027](decisions/0027-alternatives-active.md)). `works_with` stays proposed ([decision 0007](decisions/0007-typed-relations-in-frontmatter.md)).
- **Target release:** v0.2. Part 1 (linked notes) stores the links and `alternatives` the graph draws; part 2 builds the graph page.
- **History:** until 2026-10-07 the status was "marketing only, not scheduled": graph views would be built only as a shareable visual, if at all, in three levels (an Obsidian preset, a `repomagpie graph` HTML file, nest pages). That rested on secondhand desk research ([validation](validation.md), Q7). The first user then asked for the graph as a working view, and [decision 0026](decisions/0026-the-app-is-the-workspace.md) moved it into the app.
- **Answered** ([decision 0028](decisions/0028-the-graph-page.md)):
  - Node size encodes the number of connections, on a log scale, not rating.
  - The graph page renders with sigma 3 and graphology.

## 11. Adopt

- **Problem:** What you learned in your personal journal doesn't reach the project, or your team, unless you copy it by hand.
- **Behaviour:** `repomagpie adopt <name>` copies a note from the personal journal into the project's `.magpie/` and prints the install command. It never installs anything itself.
- **Surfaces:** CLI (`repomagpie adopt`); the agent can run it through `SKILL.md`.
- **Schema impact:** none; both journals use the same format ([decision 0013](decisions/0013-two-journal-scopes.md)).
- **Target release:** v0.1.
- **Answered** ([spec](spec.md), section 2):
  - If the project journal already has a note on the same package, adopt changes nothing and says where it is.
  - Adopting into a public repository makes the note public, so adopt says who can read the project journal; the local app says it before it copies anything.

## 12. Auto-extraction

- **What it is:** RepoMagpie proposes notes instead of waiting for the user to write them. `repomagpie init --auto` scans a project on first use (`package.json`, the folder layout) and proposes notes. An LLM notices when a hard error is solved in the terminal, or an architectural comment is made in a pull request, and asks "Save this to RepoMagpie?".
- **Why it might matter:** H1, note-taking friction ([validation](validation.md)). Recall, the hook and suggest only help when the journal holds notes, so writing one must cost almost nothing.
- **What already exists:**
  - the skill's "Recording an opinion": the agent offers once to save an opinion the user states;
  - the skill's "After a dependency decision" (`feat/capture-nudge`): the agent already in the conversation offers once, at the end of a task, to save a dependency decision made in it, with the user's reason as the Verdict;
  - `suggest` reads a project's manifests ([spec](spec.md), section 2); `repomagpie init --auto` is idea 5's first part, built for 0.2.
- **Options,** in order of cost:
  1. **The agent's own LLM, at the end of a task.** No new model, process, network call or hook. Done in `feat/capture-nudge`.
  2. **An end-of-session hook** that reminds the agent to make the offer when it hasn't. Claude Code has Stop and SessionEnd hooks; whether the other agents have one isn't recorded yet ([agents](agents.md) lists only the hooks before a tool call), so checking each agent's docs comes first. No new model: the hook prints text for the agent. Fits rule 6.
  3. **`repomagpie init --auto`:** lists the project's dependencies that have no note ("this project uses 40 packages; your journals have notes on 3") and offers to note the ones the user cares about. It writes nothing without the user and never writes a Verdict (rule 2). Local, no model.
  4. **Opt-in: a local model the user already runs** (such as Ollama) notices solved errors in the terminal and suggests a note. RepoMagpie bundles no model and sends nothing off the machine. It needs shell integration per shell (zsh, bash, fish, PowerShell) and an always-on process. Terminal output can hold secrets, so it reads only what it needs and never stores raw output. Off by default. Fits rule 6 only as an opt-in that stays on the machine.
  5. **Opt-in, for teams: a GitHub Action** with the team's own LLM API key. It reads architectural comments in pull requests and proposes notes to the project journal's inbox, never as Verdicts; a person writes the Verdict. The trade-off: pull-request text goes to the team's chosen provider. Off by default, set up by the team; outside rule 6's "no server" only for the team that chooses it.
- **Risks:** an agent that asks too often becomes noise (the skill offers once, at the end, and never again after a no); a model that writes Verdicts breaks [decision 0018](decisions/0018-ai-drafts-humans-decide.md); terminal capture touches secrets.
- **What decides it:** the maintainer's week of use: how many offers were made, how many were accepted, and how many were annoying ([validation](validation.md), H1).
- **Status:** candidate, after the tester round. Step 1 is done in `feat/capture-nudge`.

## 13. Taxonomy and semantic search

- **What it is:** fixed domain kinds (Architecture, Security, Performance, Styling, Database, Testing), free technology tags (Next.js, Prisma, Tailwind), and fuzzy or vector search, so "how should database security work?" finds the Security and PostgreSQL notes.
- **Why it might matter:** retrieval. Search matches words, so a note that doesn't use the user's words isn't found.
- **What already exists:**
  - search is full-text, with MiniSearch ([spec](spec.md), sections 5 and 9);
  - recall matches a package's identity on purpose: a pdfkit note must not answer for pdf-lib ([decision 0017](decisions/0017-package-identity-purl.md));
  - kinds exist and say what a thing is (`library`, `cli`, `skill-pack`; [note schema](note-schema.md), [decision 0030](decisions/0030-github-topics-become-tags.md)); tags exist, drafted from GitHub topics;
  - for small journals, the agent already makes the semantic choice over `repomagpie catalog` (the skill).
- **The direction question:** domain kinds make a note a rule about a domain instead of a note about a package. That moves RepoMagpie from dependency memory ([decision 0009](decisions/0009-positioning-dependency-memory.md)) into general agent rules and memory, a crowded space: Cursor rules, CLAUDE.md, AGENTS.md, the agents' own memory features, Mem0. It needs a decision record that supersedes or extends 0009, decided with evidence, not as a schema change.
- **Measured so far:** the retrieval baseline (`npm run eval:retrieval`, 2026-10-14) missed the same two needs with every method, and both notes had a vague GitHub description and an empty "Use when" ([roadmap](roadmap.md)). Asking for a one-line "Use when" at capture comes before any search change.
  - With one synthetic "Use when" item per note (2026-10-25, 33 notes, 22 needs; the fixture's `use_when` items, written plainly from each repository's description by someone who had seen the needs, so an upper bound):

    | | recall@5 | recall@10 |
    |---|---|---|
    | search, without | 18/22 (82 %) | 18/22 (82 %) |
    | search, with "Use when" | 20/22 (91 %) | 22/22 (100 %) |
    | suggest, without | 17/22 (77 %) | 18/22 (82 %) |
    | suggest, with "Use when" | 19/22 (86 %) | 20/22 (91 %) |

    The two needs every method missed are found: OpenHands at 4 in search and 2 in suggest, uptime-kuma at 9 in search only. One need ranks lower: the self-hosted Heroku alternative moves from 3 to 5. Suggest still misses "run large language models on my own laptop" and "get alerted when my website goes down".
- **Options:**
  - a local embedding model: a download and a native module or WASM, which breaks "no runtime dependencies";
  - the agent's own semantic choice over `catalog`, which works today for journals of a few hundred notes;
  - an opt-in provider with the user's key, which sends note text off the machine (rule 6: off by default).
- **Risks:** a schema change that moves the product's category without a decision; a dependency that makes the package heavy for a gain not measured.
- **What decides it:** journals that reach thousands of notes, and `eval:retrieval` showing misses that a "Use when" line doesn't fix.
- **Status:** worked out in [RFC 0001](rfcs/0001-domains-tags-and-search.md), and approved in part (2026-10-24). D1 answers the direction question: notes stay about packages and repositories, general project rules stay in CLAUDE.md or AGENTS.md, and domains make package notes findable by concern. D2 approves the 12 domains and the name `domains`. Phase 0, "Use when" and "Avoid when" at capture, shipped in 0.2.0-beta.11. Phase 1 and the structured part of Phase 2 shipped in 0.2.0-beta.12 (branch `feat/next-batch`): domains ([decision 0040](decisions/0040-domains-a-second-axis.md)), tag aliases, structured search with `why`, and the MCP `vocabulary` tool ([decision 0041](decisions/0041-structured-search.md)). Phase 3, semantic search, is decided with those numbers (D3).
- **Measured on the expanded eval** (2026-10-25, 60 notes, 82 needs: concern, technology spelling, use case and Turkish; tuning and held-out splits; the structured forms written with the needs, so an upper bound). Held-out, recall@5: the need as the query 30/41, structured 41/41. MRR over all needs, today → structured: concern 0.26 → 0.97, Turkish 0.39 → 0.95, use case 0.66 → 0.84, technology 0.97 → 0.91. Aliases alone change nothing measurable. The numbers and the weights' grid are in decision 0041.

## 14. Just-in-time context

- **What it is:** the MCP server sends the agent only the notes that fit the file being changed or the question asked, to save tokens and avoid "lost in the middle". The suggested storage is SQLite with a vector extension.
- **Why it might matter:** token cost per task, and answers that stay on point as journals grow.
- **What already exists:**
  - the MCP tools return only matches: recall per package, search ranked and limited, catalog in pages ([decision 0034](decisions/0034-the-mcp-server.md));
  - note text in agent output is capped ([decision 0032](decisions/0032-note-text-is-data.md));
  - nothing sends the whole journal.
- **Options:**
  - context from the changed file's imports: cheap, and needs no model;
  - storage: the caches are JSON files today ([spec](spec.md), section 7, "Caches"). Node has a built-in `node:sqlite` module, still marked experimental; which Node releases have it without a flag must be checked against the `engines` floor (22.12). Weigh it against the caches' design, and against notes being Markdown files and the source of truth ([decision 0001](decisions/0001-plain-markdown-storage.md), rule 1). A vector extension is a native dependency.
- **Risks:** a second store that drifts from the Markdown files; a native dependency.
- **What decides it:** measured token cost per task, and idea 13's direction.
- **Status:** candidate, after the tester round.

## 15. Multiplayer and team sync

- **What it is:** a senior developer's rule reaches the whole team, and a newcomer's agent learns it automatically.
- **Why it might matter:** H3, the bigger pain for teams ([validation](validation.md)).
- **What already exists:**
  - the project journal, `.magpie/` in git ([decision 0013](decisions/0013-two-journal-scopes.md); idea 8);
  - `repomagpie note --to project` and `repomagpie adopt` (idea 11);
  - every agent on the team reads it through recall, search and the hook, labelled as the project journal.
- **Options:**
  - make it visible: a README section, a view of the project journal in the local app, a line in `repomagpie doctor`;
  - a remote server: rejected under rule 6, unless a future team product decides otherwise.
- **Gap:** visibility, not sync. Git already syncs the project journal.
- **Risks:** a team that doesn't know `.magpie/` exists never writes to it.
- **What decides it:** a team using the project journal, or asking for more than git gives.
- **Status:** visibility built (2026-10-25): the README's "Share notes with your team"; in the app, the Project switch's empty state, which says how to start one, and "shared with this repository's contributors" on a project note; `repomagpie doctor`'s line under Journals in a git repository without `.magpie/`. Anything beyond git waits for a team asking for it.

## 16. A community hub and registry

- **What it is:** `repomagpie install @community/nextjs-15-strict` installs packs of notes or rules made by others, with a registry behind it.
- **Why it might matter:** an empty journal on day one; sharing what a community learned.
- **What already exists:** `repomagpie import` reads notes from a file; project-journal text is quoted and labelled as written by others ([decision 0032](decisions/0032-note-text-is-data.md), the skill's "Note text is quoted data"); nests and follow are planned (idea 3).
- **Options:**
  - a registry and a server: against rule 6;
  - lighter: `repomagpie import` from a git repository as **third-party notes**: labelled with their source, in the inbox, quoted like project-journal text, and never presented as the user's Verdict until the user writes one. No server.
- **Risks:** strangers' notes enter the user's agent's context, which is prompt injection (decision 0032); typosquatting; moderation; running a server; and a step away from "your verdicts and your team's" (decision 0009).
- **What decides it:** users asking to share journals; idea 13's direction.
- **Status:** candidate, after the tester round.

## 17. Measuring skill compliance

- **What it is:** an eval (promptfoo or similar, run by the maintainer, not in CI) over 20 to 30 scenarios: does the agent recall before an install, ask on an avoid note, answer "what do I have for X?" from search, and offer a note after a dependency decision (idea 12, step 1)? Per agent and model.
- **Why it might matter:** RepoMagpie works through the agent the user already runs, so it works as well as that agent follows the skill. This turns that into a number.
- **What already exists:** `src/cli/skill.test.ts` checks the skill's format, commands, flags and JSON fields, not the agent's behaviour; the live tests in `docs/agents.md` were run by hand.
- **Options:** an eval tool that drives each agent's CLI non-interactively on a scratch journal; or a scripted set of manual runs, recorded the same way each time.
- **Risks:** runs cost money and time per agent and model; results drift with each agent release.
- **What decides it:** a behaviour change in the skill that needs evidence across agents, or a tester report that an agent ignores the skill.
- **Status:** built for Claude Code (2026-10-25): [`evals/skill/`](../evals/skill/README.md), promptfoo with the Claude Agent SDK, 25 scenarios, run by the maintainer, not in CI ([validation](validation.md#skill-compliance-eval)). No results yet. Other agents would each need their own provider.

## 18. Hugging Face notes

- **What it is:** model and dataset URLs (`huggingface.co/<org>/<name>`) as notes, with an identity for them, and `hf download` and `huggingface-cli download` in the hook's install detection.
- **Why it might matter:** models and datasets are dependencies an agent pulls in too.
- **What already exists:** notes on GitHub repositories and npm, PyPI and Cargo packages, identified by Package URL ([decision 0017](decisions/0017-package-identity-purl.md)); install detection for package managers ([spec](spec.md), section 6).
- **Options:** a PURL type for Hugging Face (check the PURL spec's list of types first); a name in RepoMagpie's own form if there is none.
- **Risks:** an identity that differs from what other tools use.
- **What decides it:** users noting models and datasets by hand already.
- **Status:** candidate, after the tester round.

## 19. Discover

- **What it is:** `repomagpie discover` and the app's Discover page search GitHub's repositories by words, a domain, a kind, a language, stars and activity, show stars, forks, the last push, the licence, an estimated kind and domains and whether a journal has a note, and add the chosen ones to the inbox through `repomagpie note <url>` ([decision 0045](decisions/0045-discover.md), [spec](spec.md), [UI](ui.md), §7). New notes are classified with the README's start, manifest keywords and an Action file too ([decision 0046](decisions/0046-classification-signals.md)).
- **Status:** built (2026-10-26, `feat/discover`), released in `0.2.0-beta.14` (2026-10-27). The follow-ups below are candidates, after the tester round:
  - **A Discover MCP tool:** only with a decision that changes [decision 0034](decisions/0034-the-mcp-server.md)'s promise that the MCP server never opens a network connection. Until then an agent runs `repomagpie discover --json`.
  - **The agent proposing kind and domains from the README:** the user's agent reads the README and suggests both, the user confirms; RepoMagpie itself still calls no model.
  - **Learning from the user's corrections:** a kind or domain the user changed after a draft as a signal for the next drafts, kept on the user's machine.
  - **skills.sh as a source:** search the skills directory too, for skill packs.
  - **Kind accuracy: done** (2026-10-27, `fix/kind-accuracy`, [decision 0047](decisions/0047-kind-rules-measured.md); released in `0.2.0-beta.15`). Each kind got a deciding question, a held-out set of 30 repositories was labelled before any rule changed, rule 10 needs a skills-only layout, and an Action is `other`. Three topics and seven README phrases name a kind. The kind is right for 37 of 69 repositories instead of 24, and for 15 of the 30 held out instead of 14, with none turned wrong. The bar on the held-out set (17 of 30) was missed: 11 of the 12 new rules fired on none of the 30.
  - **`repomagpie kinds --suggest`:** for existing notes made from GitHub, show the kind the current rules would draft, so the user can accept it; never automatic. Kinds are drafts at creation only ([decision 0030](decisions/0030-github-topics-become-tags.md), [decision 0018](decisions/0018-ai-drafts-humans-decide.md)), so a better rule reaches only new notes. A read-only dry run on the maintainer's journal (2026-10-27: the notes read, never written; each repository fetched again) found 37 notes from GitHub: the current rules would draft another kind than the note's for 22 of them, and decision 0047's rules change the draft for 3. Most of the 22 differ because the user corrected the kind or an older rule drafted it, so the command shows each one and changes nothing without a yes.
  - **Kind signals from files, the next round:** for repositories without telling topics or phrases, read what the file list and the root manifests already show: Cargo's `[[bin]]` or `src/main.rs`, pyproject's `[project.scripts]`, a Go `main` package at the root, and a monorepo's published `packages/*`. It targets the held-out set's misses: jellyfin, zed, date-fns, TanStack/query and fzf. Measured on a new held-out set of 30, labelled before any rule changes: the set decision 0047 used has been seen.

## 20. The note view's editors, loaded later

- **What it is:** the parts of the note view you only see while editing, the section editors and their `[[` autocomplete (`LinkTextarea`), loaded in a chunk of their own when you first press Edit, or prefetched like the pages in `ui/src/components/later.ts`.
- **Why it might matter:** the app's first files are 103.0 kB against a line of 104.0 kB ([decision 0048](decisions/0048-the-first-load-line-measured.md)), so the next feature on the first screen has 1 kB of room. The pages the first screen doesn't show are already lazy.
- **What already exists:** `npm run build:analyze` shows the first script by source: `NotePane.tsx` is 22.0 kB raw, `LinkTextarea.tsx` 2.2 kB, `logic/edits.ts` 2.4 kB. The inbox's review form (`ReviewForm.tsx`, 6.6 kB) and the Alternatives row are on the first screen and stay. Inside the first script, code compresses to about a fifth of its raw size, so moving these may free 1 to 1.5 kB gzipped.
- **Options:** split the section editor out of `NotePane.tsx` into its own component and load it lazily; or keep it and accept the line.
- **Risks:** the first Edit on a cold load waits for the chunk (a prefetch covers most cases); `NotePane.tsx` is the app's largest component, and splitting it touches its editing flows and their tests.
- **What decides it:** a first-screen feature that doesn't fit in the 1 kB.
- **Status:** candidate, measured on `perf/app-first-load` (2026-10-28).

## 21. Graph positions across reloads

- **What it is:** the graph's settled positions written to a cache file, `<journal>/.cache/graph-layout.json`, so a reload draws the graph at once, as a reopen in the same session already does ([decision 0049](decisions/0049-the-graph-opens-faster.md)).
- **Why it might matter:** at 2,000 notes the first frame after a reload takes 965 ms: the data (344 ms, shared with the app's other first requests) and a layout of 120 iterations. With kept positions it would take about 450 ms. A reopen without a reload already takes 241 ms.
- **What already exists:** the session's positions (`ui/src/logic/graph-session.ts`): kept in memory by journal, nodes that are new join next to a neighbour, and the rest stays pinned.
- **Cost:** a file of about 80 kB at 2,000 notes (2,030 positions), and a new write path: the page has to send the positions to the server, which writes the cache.
- **Risks:** the picture after a reload would depend on what happened in earlier sessions, not only on the journal. [Decision 0028](decisions/0028-the-graph-page.md) says no positions are stored, so this needs a decision that changes it. As a cache, the file can be rebuilt, which [decision 0001](decisions/0001-plain-markdown-storage.md) allows.
- **What decides it:** a warm open, after a reload, that feels slow in use. Today's 965 ms is within its 2 s budget.
- **Status:** candidate. The maintainer declined it for now (2026-10-28), after `perf/graph-open`.

---

## Planned fields

None of these are in the active schema or the template yet. Each joins the [note schema](note-schema.md) when its release starts. `packages` joined the active schema in v1, as a list of PURLs; `alternatives` in v0.2 ([decision 0027](decisions/0027-alternatives-active.md)).

| Field | Owner | Type | For | Target |
|---|---|---|---|---|
| `works_with` | human | list of wikilinks | typed edges | not scheduled ([decision 0007](decisions/0007-typed-relations-in-frontmatter.md), proposed) |
| `reviewed_commit` | tool | commit SHA | drift | v0.3 |
| `public` | human | bool, default `false` | nests | v0.4 |
| `last_resurfaced` | tool | date | digest | later |
