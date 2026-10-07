# Product

What RepoMagpie looks like to its users. Nothing is built yet. The v0.1 command set is in [decision 0010](decisions/0010-v0-1-scope.md); final command names and flags are decided in step 2 ([roadmap](roadmap.md)). The features come from [ideas](ideas.md); terms are defined in the [glossary](glossary.md).

## Surfaces

There is no desktop app and no remote server. RepoMagpie has six surfaces:

| Surface | What it is | Release |
|---|---|---|
| CLI | `magpie`, the primary interface | v0.1 |
| Local app | `magpie ui`: an Obsidian-inspired app in the browser, served from your machine on `127.0.0.1` ([UI](ui.md), [decision 0021](decisions/0021-local-ui-server.md)) | v0.1 |
| Agent layer | RepoMagpie's `SKILL.md`, plus a hook for proactive recall (Claude Code first) | v0.1 |
| Journals | A personal journal and project journals: Markdown files, used in Obsidian or any editor | v0.1 |
| Nest | A static site of public notes, built by `magpie publish` | v0.4 |
| Graph | A page in the local app: notes, tags and the links between them ([decision 0026](decisions/0026-the-app-is-the-workspace.md)) | v0.2 |

### CLI

The current output, in a project whose `package.json` depends on pdfkit (2026-10-06; paths shortened, the GitHub URL from the spec's format):

```
$ magpie note pdfkit "avoid: async streams painful; use puppeteer"
✔ Saved to your personal journal: pdfkit
~/.magpie/notes/npm--pdfkit.md

$ magpie note https://github.com/microsoft/playwright-cli "let my agent test a web UI end to end"
✔ Saved to your personal journal: microsoft/playwright-cli
~/.magpie/notes/github--microsoft--playwright-cli.md

$ magpie suggest "a TypeScript CLI with tests"
1  commander  npm  personal  Verdict: fine for small CLIs

Already in use, you noted to avoid:
  pdfkit  npm  personal  Verdict: avoid: async streams painful; use puppeteer
1 candidate. Your coding agent picks the fit.

$ magpie adopt commander
Created the project journal: ~/code/app/.magpie
✔ Copied to the project journal: commander
~/code/app/.magpie/notes/npm--commander.md
Install with: npm install commander
The project journal is committed with the code; anyone who can read this repository can read this note.

$ magpie search pdf
1  puppeteer  npm  personal  Verdict: default for PDF rendering in new projects
2  pdfkit     npm  personal  Verdict: avoid: async streams painful; use puppeteer
```

What the agent sees when it runs `npm install pdfkit` in Claude Code (the hook's `additionalContext`; Claude Code also asks you first, because the note says to avoid it):

```
Note from your journal: pdfkit — avoid: async streams painful; use puppeteer (personal journal, ~/.magpie/notes/npm--pdfkit.md)
```

Every command also offers a machine-readable mode, for example `--json`, for agents ([decision 0008](decisions/0008-machine-readable-output.md)).

### Agent layer

- RepoMagpie's `SKILL.md` teaches agents to use the CLI: note, search, suggest, adopt and recall. For `suggest`, magpie narrows the candidates by keyword and tags, and the agent makes the final choice.
- Proactive recall shows the user's note before an agent installs a package. It never denies an install: for an avoid note, Claude Code asks the user to confirm, with the note as the reason; other notes only inform ([decision 0024](decisions/0024-recall-asks-on-avoid-notes.md)). Example of what the agent shows the user:

  > Note from your journal: left-pad 2/5 — 'abandoned, use String.prototype.padStart'.

- Recall has two modes. **Hook mode** runs from an agent hook, in clients that support hooks; v0.1 ships it for Claude Code. **Skill mode** relies on `SKILL.md` telling the agent to run `magpie recall <package>` first; it is best effort and works in any client that supports skills. Hook support differs per client: see [ideas, idea 1](ideas.md#1-proactive-recall).

### Journals

Two scopes, one format ([decision 0013](decisions/0013-two-journal-scopes.md)):

```
<personal journal>/      a folder outside any repository, private by default
<project>/.magpie/       the project journal, committed with the code
```

Inside a journal:

```
notes/                 one note per subject, named from its PURL (npm--pdfkit.md, github--owner--repo.md)
tags.md                the journal's tag list
_templates/            Templater template (Obsidian extra, example vault)
```

Journals are fully usable without Obsidian. Obsidian extras only add comfort. Note format: [note schema](note-schema.md).

### Nest

A static site built by `magpie publish`. It contains public notes only (`public: true`, default `false`): a searchable list and a `/uses` view. It can be hosted on GitHub Pages. See [ideas, idea 3](ideas.md#3-nests-and-follow).

### Graph

A page in the local app, v0.2 part 2 ([decision 0026](decisions/0026-the-app-is-the-workspace.md)). A standalone HTML file is possible later, as an export. See [Graph specification](#graph-specification).

## Visual identity

- Obsidian-inspired, dark-first, calm, information-dense.
- [`DESIGN.md`](../DESIGN.md) is written before any UI code (for the local app) and before the logo, social preview, landing page and demo GIF, so they share one visual language. [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) is a reference for its structure only. See [standards](standards.md).
- The logo is a magpie, legible at 16 px.

## Graph specification

**Status:** a page in the local app, v0.2 part 2 ([decision 0026](decisions/0026-the-app-is-the-workspace.md); [ideas](ideas.md), idea 10). Part 1 (linked notes) stores the links and `alternatives` it draws. The library, the layout and the visual encoding are settled by [decision 0028](decisions/0028-the-graph-page.md).

The graph is a working view: it shows what you have, how it groups by tag, and what connects to what. It also shows status at a glance (inbox now; drift and gaps once they exist). It answers questions such as "What do I have for PDF?", "What did I say to use instead of X?" and "What's still in my inbox around this topic?"

### Levels (superseded)

*History. Superseded by [decision 0026](decisions/0026-the-app-is-the-workspace.md) on 2026-10-07: the in-app page replaces level 2; levels 2 and 3 remain possible later as exports.*

| Level | What | Release |
|---|---|---|
| 1 | A preconfigured Obsidian graph for the example vault. No code. | not scheduled |
| 2 | `magpie graph`: a self-contained, interactive HTML file with typed edges and status encoding. | not scheduled |
| 3 | The graph embedded in nest pages. | not scheduled |

The status was "marketing only": graph views are often admired but rarely used, so ours had to earn its place by (a) showing status at a glance (drift, inbox, gaps) and (b) being a visual people can share.

### Graph model

**Node types**

| Node | Source | Notes | In the app (v0.2) |
|---|---|---|---|
| repo | each note in `notes/` | main node; unreadable notes are left out | yes |
| tag | each tag in use, listed in `tags.md` or not | hub node, labelled `#tag` | yes |
| missing note | an unresolved link or `alternatives` target | a ghost node | yes, off by default |
| skill | each completed skill line | attached to its repo | later |
| magpie (v0.4) | each followed nest | other people | later |

**Edge types**

| Edge | Direction | Source | Style | In the app (v0.2) |
|---|---|---|---|---|
| tagged | repo → tag | `tags` | thin, faint | on |
| related | repo ↔ repo | untyped `[[links]]` in any body section; one edge per pair, either direction | solid | on |
| alternative-to | repo ↔ repo | human-owned `alternatives`; one side is enough, drawn once | its own colour, thicker | on |
| similar-to | repo ↔ repo | computed from `topics` and `language`, at most 3 per note; none between notes already linked | faint | off |
| part-of | skill → repo | skill lines | short solid | later |
| works-with | repo ↔ repo | human-owned `works_with` (proposed, not scheduled) | solid | later |
| recommended-by (v0.4) | magpie → repo | followed nests | thin | later |

A link and an alternative between the same two notes are two edges of different types. Edge sources on by default: tags, `[[links]]` and `alternatives` ([decision 0026](decisions/0026-the-app-is-the-workspace.md)).

### Typed relations

`alternatives` is active ([decision 0027](decisions/0027-alternatives-active.md)): a human-owned list of wikilinks, for example `alternatives: ["[[microsoft--playwright-mcp]]"]`. `works_with` stays proposed ([decision 0007](decisions/0007-typed-relations-in-frontmatter.md)).

### Visual encoding

Settled by [decision 0028](decisions/0028-the-graph-page.md):

| Property | Encodes | In the app (v0.2) |
|---|---|---|
| fill colour | `kind`, in 4 groups: skill pack; tool (cli, library, framework, plugin); resource (awesome-list, template, platform, app); other | yes |
| size | number of connections, on a log scale (not rating: most notes have none) | yes |
| faded | `status: inbox` | yes |
| tag nodes | smaller, neutral, labelled `#tag` | yes |
| edges | tag edges thin and faint; links solid; alternatives in their own colour and thicker; similarity faint | yes |
| hollow vs. solid | `tried: false` vs. `tried: true` | later: needs a node program we don't have |
| ring | drift: a red ring when upstream changed since review | later: drift doesn't exist yet, and it needs a node program |

The colours are tokens in [`DESIGN.md`](../DESIGN.md), dark and light, checked for 3:1 against the canvas. A legend is always visible. Colour is never the only carrier of meaning: every fact the graph shows by colour is also in words, in the side panel and the legend.

### Layout

- ForceAtlas2, in a web worker built with the app, so the page never freezes. The package's own worker starts from a `blob:` URL, which the app's CSP blocks ([decision 0028](decisions/0028-the-graph-page.md)).
- Deterministic: starting positions are seeded from each node's id, and the layout runs a fixed number of iterations, then stops. The same journal gives the same picture every time. "Re-run layout" runs it again.
- No positions are stored.
- Under `prefers-reduced-motion`, the layout is shown only once it has settled, and zoom and centre jump instead of gliding.

### Interactions

- Search box: type a name, pick from up to 8 matches, and the graph centres on that node and selects it.
- Click a note node to open the note in a pane beside the graph, where you can read and edit it. Click a tag node to highlight its notes. Click a missing note to add it.
- Hover: the node and its neighbours stand out; everything else is dimmed.
- Local graph: depth 1 or 2 around the selected node, with a toggle to show everything again.
- Filters: kind group, tags, status (inbox or reviewed), tried only. Drift only waits for drift.
- Edge toggles: tags, links, alternatives, similarity, missing notes.
- "Show in graph" in the note view opens the graph centred on that note, in local mode.
- Keyboard and screen readers: the canvas is hidden from assistive technology. The search box, the filters, a status line ("Showing 214 notes, 31 tags and 486 connections") and a list of the selected node's neighbours are how you use the page without a mouse or a screen.
- Later: export the current view as PNG and SVG, for sharing.

### Technical constraints

- The graph page gets its nodes and edges from the API (`GET /api/graph`); core builds them from the notes and the link index (`src/core/graph.ts`).
- Rendering: sigma 3 with graphology (WebGL), chosen in [decision 0028](decisions/0028-the-graph-page.md) under the dependency policy, against the app's 200 kB budget, performance at 2,000 nodes, and an MIT-compatible licence. The graph is its own lazy-loaded chunk; other screens don't load it.
- Performance target: smooth interaction with 2,000 nodes on a mid-range laptop; data fetched, layout settled and first frame drawn in under 2 s.
- The graph is generated from notes only ([decision 0001](decisions/0001-plain-markdown-storage.md)). Nothing is stored that can't be rebuilt.
- Superseded (level 2): one self-contained `.html` file with the data embedded as JSON, opened offline without a server. Possible later as an export.

### Obsidian preset (level 1, not scheduled)

- Ship `examples/vault/.obsidian/graph.json` with one colour group per `kind` group.
- Colour groups take an Obsidian search query ([Graph view help](https://obsidian.md/help/plugins/graph)), and search matches a property value with `[property:value]`, with `OR` between values ([Search help](https://obsidian.md/help/plugins/search)). So the four groups would be:
  - `[kind:skill-pack]`
  - `[kind:cli OR library OR framework OR plugin]`
  - `[kind:awesome-list OR template OR platform OR app]`
  - `[kind:other]`

  Checked against the docs on 2026-10-03; confirm in Obsidian when the preset is built.
- Commit only `graph.json` and the minimum other config. Never commit `workspace*` or cache files: `.gitignore` ignores them in every vault, and `git check-ignore` must confirm that `graph.json` is not ignored.

## Open questions

- **Links in properties:** moot ([decision 0027](decisions/0027-alternatives-active.md)). The in-app graph reads `alternatives` itself, so it doesn't matter whether Obsidian's graph view and backlinks count wikilinks inside frontmatter properties. (Obsidian's [Properties help](https://obsidian.md/help/properties) and the [1.4.0 changelog](https://obsidian.md/changelog/2023-07-26-desktop-v1.4.0) don't say; checked 2026-10-03.)
- **Node size:** answered by [decision 0028](decisions/0028-the-graph-page.md): the number of connections, on a log scale.
- **Rendering library** for the graph page: answered by [decision 0028](decisions/0028-the-graph-page.md): sigma 3 with graphology.
- Recall, vet, nest and other feature questions: see [ideas](ideas.md).
