# Ideas

**Status:** Statuses and targets follow the accepted [strategy](strategy.md) and [decision 0010](decisions/0010-v0-1-scope.md). The v0.1 beta may still change them.

The ideas that shape RepoMagpie beyond note capture and search. Each one lists its problem, behaviour, surfaces, schema impact, target release and open questions. The [roadmap](roadmap.md) tracks the work; the [glossary](glossary.md) defines the terms.

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
4. CLI first, `SKILL.md` for agents, MCP later as a thin layer ([decision 0002](decisions/0002-cli-first.md)).
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
| 5 | Gap detection | `magpie init`; `magpie gaps` | `init`: v0.1 if time allows, else v0.2; `gaps`: v0.2 | Fills an empty journal from real manifests |
| 2 | Vet and drift | **Reduced** | v0.2 | Record your review; integrate existing scanners and lockfiles; no own scanner |
| 3 | Nests and follow | Planned | v0.3 | Needs users first |
| 7 | `/uses` page generator | Planned | v0.3 | Marketing feature |
| 6 | Resurfacing digest | Later | — | Nice to have |
| 9 | Daily find | Later | — | Distraction from the core |
| 10 | Graph views | Marketing only | not scheduled | Desk research (Q7, secondhand): widely reported as not useful for real work |

---

## 1. Proactive recall

- **Problem:** The journal only helps if the user remembers to query it.
- **Behaviour:** When a coding agent is about to install a dependency (`npm install`, `pnpm add`, `yarn add`, `pip install`, `uv add`, `cargo add`, …), RepoMagpie checks the personal and project journals. If a note matches, it shows the verdict first, then when to use or avoid the package, gotchas, and better-rated alternatives. Recall never denies an install. For a note the user marked "avoid" (the Verdict starts with "avoid", or "Avoid when" has content), the Claude Code hook asks the user to confirm, with the note as the reason; every other match informs only ([decision 0024](decisions/0024-recall-asks-on-avoid-notes.md)). Example:

  > Note from your journal: left-pad 2/5 — 'abandoned, use String.prototype.padStart'.

  Recall has two modes:
  - **Hook mode:** in clients that support hooks, a hook runs recall before every matching shell command. It runs whether or not the agent remembers to.
  - **Skill mode:** RepoMagpie's `SKILL.md` tells the agent to run `magpie recall <package>` before installing. Best effort: it depends on the agent following the instruction, but works in any client that supports skills.
- **Surfaces:** agent hook (hook mode), `SKILL.md` (skill mode), and `magpie recall <package>` on the CLI.
- **Schema impact:** a tool-owned `packages` field, a list of Package URLs (for example `["pkg:npm/%40playwright/cli", "pkg:pypi/playwright"]`, [decision 0017](decisions/0017-package-identity-purl.md)), detected from manifests such as `package.json`, `pyproject.toml` and `Cargo.toml`, so a package name maps to a note. How notes are identified is designed in the step 2 spec ([decision 0010](decisions/0010-v0-1-scope.md)).
- **Target release:** v0.1, with hook mode for Claude Code at launch and skill mode elsewhere. This is the headline demo.
- **Open questions:**
  - Which package managers are in v0.1?
  - How are monorepos with several packages handled?
  - What output format reads well for the agent?
  - An optional "ask" mode (confirm before installing) in a later release?
  - Hook mode in clients whose pre-tool hook can't pass context to the agent on an allowed command (see below): show the note to the user only, use a post-tool hook, or rely on skill mode?

### Hook support in major clients

Checked 2026-10-03 against each client's documentation. Hook support is not universal, and it changes often: re-check before building hook mode.

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
  - **Drift:** `magpie drift` lists notes whose upstream changed since the reviewed commit, using existing lockfiles where they exist.
- **Surfaces:** CLI (`magpie drift`, and a way to record a review).
- **Schema impact:** a tool-owned `reviewed_commit` field (commit SHA). It joins the schema only when v0.2 work starts.
- **Target release:** v0.2.
- **Open questions:**
  - Which scanners and lockfile formats to integrate first?
  - How far back can drift look when no commit was recorded?

## 3. Nests and follow

- **Problem:** Stars show popularity, not *why* something is useful.
- **Behaviour:**
  - `magpie publish` builds a static "nest" site from notes marked public: a searchable list, the graph (idea 10) and a `/uses` view (idea 7). It can be hosted on GitHub Pages.
  - `magpie follow <nest-url>` imports another user's public verdicts and "Use when" lines into your search results. They are clearly attributed and never mixed into your own notes.
- **Surfaces:** CLI (`magpie publish`, `magpie follow`); the nest site; search results.
- **Schema impact:** a human-owned `public` field, `true` or `false`, default `false`. Private by default.
- **Target release:** v0.3.
- **Open questions:**
  - Nest data format (a JSON export next to the HTML?).
  - Attribution format.
  - How often followed nests are refreshed.

## 4. Context-aware suggest

- **Problem:** Starting or working on a project, you don't know which of your notes apply to it.
- **Behaviour:** `magpie suggest` shows what you already have that fits the project.
  - **Input:** the project's manifests and README, or a free-text description ("a TypeScript CLI with tests").
  - **Output:** matching notes from both journals, verdict first.
  - **In v0.1, no embeddings:** magpie narrows the candidates by keyword and tags, and the coding agent makes the semantic choice, guided by `SKILL.md`.
- **Surfaces:** CLI (`magpie suggest`); `SKILL.md`; the local app ("Suggest for this project").
- **Schema impact:** none planned.
- **Target release:** v0.1.
- **Open questions:**
  - How many candidates does magpie hand to the agent? v0.1: 20 by default (`--limit`); the beta tests whether that fits.
  - Semantic matching (v0.3, with semantic search): does it replace the agent's choice or add to it?

## 5. Gap detection

- **Problem:** A new journal is empty, and you can't see which tools you rely on but never wrote down.
- **Behaviour:**
  - `magpie init` reads a project's manifests (`package.json`, `pyproject.toml`, `Cargo.toml`) and creates draft notes for the dependencies already in use, so the journal starts from real decisions instead of stars.
  - `magpie gaps` reports dependencies used in a project but missing from the journals, and tags or kinds with no reviewed notes.
- **Surfaces:** CLI (`magpie init`, `magpie gaps`).
- **Schema impact:** none planned; it reads the `packages` field (idea 1).
- **Target release:** `init` in v0.1 if time allows, otherwise v0.2; `gaps` in v0.2.
- **Open questions:**
  - Does `init` write drafts into the project journal, the personal journal, or ask?
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
- **Target release:** v0.3, together with nests.
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
- **Behaviour:** `magpie today` suggests one trending repository that matches the user's tags, and tracks an exploration streak. It stays optional and quiet: no nagging, no notifications by default.
- **Surfaces:** CLI (`magpie today`).
- **Schema impact:** none planned.
- **Target release:** later (not scheduled).
- **Open questions:**
  - Where does trending data come from?
  - Can the streak be computed from `explored` dates, so nothing extra is stored ([decision 0001](decisions/0001-plain-markdown-storage.md))?

## 10. Graph views

- **Problem:** You can't see the state of your journal at a glance (drift, inbox, gaps), and you can't easily show it to others.
- **Behaviour:** Three levels:
  - **Level 1:** a preconfigured Obsidian graph for the example vault, with zero code.
  - **Level 2:** `magpie graph`, a self-contained interactive HTML file with typed edges and status encoding.
  - **Level 3:** the graph embedded in nest pages (idea 3).

  Graph views are often admired but rarely used. Ours must earn its place by showing status at a glance (drift, inbox, gaps) and by being a visual people can share. It is not decoration. Full specification: [product](product.md#graph-specification).
- **Surfaces:** Obsidian graph view (level 1); an HTML file (level 2); nest pages (level 3).
- **Schema impact:** two human-owned fields for typed relations, `alternatives` and `works_with`: lists of wikilinks, for example `alternatives: ["[[microsoft--playwright-mcp]]"]`. Proposed in [decision 0007](decisions/0007-typed-relations-in-frontmatter.md).
- **Target release:** marketing only, not scheduled. Graph views are built only as a shareable visual, if at all. Desk research ([validation](validation.md), Q7) found graph views widely reported as not useful for real work; that is secondhand evidence.
- **Open questions:**
  - Does Obsidian's graph view count wikilinks inside frontmatter properties? If not, level 1 shows only body links.
  - Does node size encode connections or rating?
  - Rendering library for level 2.

## 11. Adopt

- **Problem:** What you learned in your personal journal doesn't reach the project, or your team, unless you copy it by hand.
- **Behaviour:** `magpie adopt <name>` copies a note from the personal journal into the project's `.magpie/` and prints the install command. It never installs anything itself.
- **Surfaces:** CLI (`magpie adopt`); the agent can run it through `SKILL.md`.
- **Schema impact:** none; both journals use the same format ([decision 0013](decisions/0013-two-journal-scopes.md)).
- **Target release:** v0.1.
- **Answered** ([spec](spec.md), section 2):
  - If the project journal already has a note on the same package, adopt changes nothing and says where it is.
  - Adopting into a public repository makes the note public, so adopt says who can read the project journal; the local app says it before it copies anything.

---

## Planned fields

None of these are in the active schema or the template yet. Each joins the [note schema](note-schema.md) when its release starts. `packages` joined the active schema in v1, as a list of PURLs.

| Field | Owner | Type | For | Target |
|---|---|---|---|---|
| `alternatives` | human | list of wikilinks | typed edges, recall alternatives | v0.1 ([decision 0007](decisions/0007-typed-relations-in-frontmatter.md), proposed) |
| `works_with` | human | list of wikilinks | typed edges | v0.1 ([decision 0007](decisions/0007-typed-relations-in-frontmatter.md), proposed) |
| `reviewed_commit` | tool | commit SHA | drift | v0.2 |
| `public` | human | bool, default `false` | nests | v0.3 |
| `last_resurfaced` | tool | date | digest | later |
