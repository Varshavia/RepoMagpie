# Ideas

**Status:** Approved for the roadmap. Timing and scope pending validation (step 1.5).

Ten ideas that extend RepoMagpie beyond its first commands. Each one lists its problem, behaviour, surfaces, schema impact, target release and open questions. The [roadmap](roadmap.md) tracks the work; the [glossary](glossary.md) defines the terms.

## Direction

The ideas move the product's category:
- **from:** a better bookmark manager for GitHub repositories
- **to:** the trust and memory layer for tools in the agent era

**Candidate one-liner** (not adopted; validation decides, and [vision.md](vision.md) keeps its current positioning until then):

> The memory of the tools you trust — for you and your coding agent.

## Rules every idea follows

1. Plain Markdown with YAML frontmatter is the only source of truth. Indexes are rebuildable caches ([decision 0001](decisions/0001-plain-markdown-storage.md)).
2. The user writes "When it's useful" ([decision 0005](decisions/0005-human-written-usefulness.md)). Whether AI may *suggest* a draft for the user to confirm is an open question for step 1.5.
3. One note per repository; skills are searchable lines ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).
4. CLI first, `SKILL.md` for agents, MCP later as a thin layer ([decision 0002](decisions/0002-cli-first.md)).
5. The personal vault lives outside this repository ([decision 0003](decisions/0003-vault-outside-repo.md)).
6. Local-first: no accounts, no server, no telemetry by default. Nothing is published unless the user marks it public.

## Overview

| # | Idea | Target release |
|---|---|---|
| 1 | Proactive recall | v0.1 |
| 2 | Vet and drift | v0.2 |
| 3 | Nests and follow | v0.3 |
| 4 | Context-aware suggest | v0.4 |
| 5 | Gap detection | v0.4 |
| 6 | Resurfacing digest | v0.4 |
| 7 | `/uses` page generator | v0.3 |
| 8 | Team journal | after v0.4 |
| 9 | Daily find | v0.4 |
| 10 | Graph views | levels in v0.1, v0.2, v0.3 |

---

## 1. Proactive recall

- **Problem:** The journal only helps if the user remembers to query it.
- **Behaviour:** When a coding agent is about to install a dependency (`npm install`, `pnpm add`, `yarn add`, `pip install`, `uv add`, `cargo add`, …), RepoMagpie checks the journal. If a note matches, it shows the rating, the "When it's useful" lines, gotchas from "My notes", and better-rated alternatives. Recall informs only: it never blocks the install and never asks for confirmation. Example:

  > Note from your journal: left-pad 2/5 — 'abandoned, use String.prototype.padStart'.

  Recall has two modes:
  - **Hook mode:** in clients that support hooks, a hook runs recall before every matching shell command. It runs whether or not the agent remembers to.
  - **Skill mode:** RepoMagpie's `SKILL.md` tells the agent to run `magpie recall <package>` before installing. Best effort: it depends on the agent following the instruction, but works in any client that supports skills.
- **Surfaces:** agent hook (hook mode), `SKILL.md` (skill mode), and `magpie recall <package>` on the CLI.
- **Schema impact:** a tool-owned `packages` field, a list of `ecosystem:name` entries (for example `["npm:@playwright/cli", "pypi:playwright"]`). `magpie add` detects them from manifests such as `package.json`, `pyproject.toml` and `Cargo.toml`, so a package name maps to a note.
- **Target release:** v0.1. This is the headline demo.
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
- **Behaviour:**
  - `magpie vet <repo-or-skill>` reads `SKILL.md` and bundled scripts. It flags shell commands, network calls, file writes outside the project and credential access, and shows a risk summary. When the user approves, it records the reviewed commit.
  - `magpie drift` lists notes whose upstream changed since review and shows the diff, skill files and scripts first.
- **Surfaces:** CLI (`magpie vet`, `magpie drift`); drift status in the graph (idea 10).
- **Schema impact:** a tool-owned `reviewed_commit` field (commit SHA). It joins the schema only when v0.2 work starts.
- **Target release:** v0.2.
- **Open questions:**
  - Is the analysis static only, or optionally LLM-assisted?
  - How far back can drift look when no commit was recorded?

## 3. Nests and follow

- **Problem:** Stars show popularity, not *why* something is useful.
- **Behaviour:**
  - `magpie publish` builds a static "nest" site from notes marked public: a searchable list, the graph (idea 10) and a `/uses` view (idea 7). It can be hosted on GitHub Pages.
  - `magpie follow <nest-url>` imports another user's public "When it's useful" lines into your search results. They are clearly attributed and never mixed into your own notes.
- **Surfaces:** CLI (`magpie publish`, `magpie follow`); the nest site; search results.
- **Schema impact:** a human-owned `public` field, `true` or `false`, default `false`. Private by default.
- **Target release:** v0.3.
- **Open questions:**
  - Nest data format (a JSON export next to the HTML?).
  - Attribution format.
  - How often followed nests are refreshed.

## 4. Context-aware suggest

- **Problem:** Starting a project, you don't know which of your notes apply to it.
- **Behaviour:** `magpie suggest` reads the current project (manifests, README, optionally an issue) and recommends notes from the journal that fit it.
- **Surfaces:** CLI (`magpie suggest`).
- **Schema impact:** none planned.
- **Target release:** v0.4.
- **Open questions:**
  - Reading an issue needs the GitHub API. Is that optional, so suggest works offline?
  - Keyword matching, semantic matching, or both?

## 5. Gap detection

- **Problem:** You can't see which tools you rely on but never wrote down, or which areas of the journal are thin.
- **Behaviour:** Reports tools used in the user's projects but missing from the journal, and tags or kinds with no reviewed notes.
- **Surfaces:** CLI (command name not decided); gaps in the graph (idea 10).
- **Schema impact:** none planned; it reads the `packages` field (idea 1).
- **Target release:** v0.4.
- **Open questions:**
  - Which projects are scanned, and how does the user point to them?
  - Command name.

## 6. Resurfacing digest

- **Problem:** Notes go stale, and you forget what you saved.
- **Behaviour:** A periodic digest of the form "You saved X three months ago. Still useful?" It keeps the journal fresh and reinforces what you learned.
- **Surfaces:** CLI (command name not decided).
- **Schema impact:** a tool-owned `last_resurfaced` date.
- **Target release:** v0.4.
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
- **Behaviour:** A shared vault in a team repository: the tools the team has vetted, an onboarding view, and review ownership. It builds on vet and drift (idea 2).
- **Surfaces:** a shared vault in a git repository, used through the CLI.
- **Schema impact:** not designed yet; review ownership likely needs a field.
- **Target release:** after v0.4.
- **Open questions:**
  - How is review ownership recorded?
  - How do personal and team vaults combine in search?

## 9. Daily find

- **Problem:** Finding one repository worth exploring each day takes effort, so the habit breaks.
- **Behaviour:** `magpie today` suggests one trending repository that matches the user's tags, and tracks an exploration streak. It stays optional and quiet: no nagging, no notifications by default.
- **Surfaces:** CLI (`magpie today`).
- **Schema impact:** none planned.
- **Target release:** v0.4.
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
- **Target release:** level 1 in v0.1, level 2 in v0.2, level 3 in v0.3.
- **Open questions:**
  - Does Obsidian's graph view count wikilinks inside frontmatter properties? If not, level 1 shows only body links.
  - Does node size encode connections or rating? Decided in v0.2.
  - Rendering library for level 2. Decided at the start of v0.2.

---

## Planned fields

None of these are in the active schema or the template yet. Each joins the [note schema](note-schema.md) when its release starts.

| Field | Owner | Type | For | Target |
|---|---|---|---|---|
| `packages` | tool | list of `ecosystem:name` | proactive recall | v0.1 |
| `alternatives` | human | list of wikilinks | typed edges, recall alternatives | v0.1 ([decision 0007](decisions/0007-typed-relations-in-frontmatter.md), proposed) |
| `works_with` | human | list of wikilinks | typed edges | v0.1 ([decision 0007](decisions/0007-typed-relations-in-frontmatter.md), proposed) |
| `reviewed_commit` | tool | commit SHA | drift | v0.2 |
| `public` | human | bool, default `false` | nests | v0.3 |
| `last_resurfaced` | tool | date | digest | v0.4 |
