# Product

What RepoMagpie looks like to its users. Nothing is built yet. Which commands ship in v0.1 is decided in step 1.5; final command names and flags are decided in step 2 ([roadmap](roadmap.md)). The features come from [ideas](ideas.md); terms are defined in the [glossary](glossary.md).

## Surfaces

There is no desktop app and no server. RepoMagpie has five surfaces:

| Surface | What it is | Release |
|---|---|---|
| CLI | `magpie`, the primary interface | v0.1 |
| Agent layer | RepoMagpie's `SKILL.md`, plus hooks for proactive recall | v0.1 |
| Vault | Markdown files, used in Obsidian or any editor | v0.1 |
| `magpie graph` | One self-contained HTML file | v0.2 |
| Nest | A static site of public notes, built by `magpie publish` | v0.3 |

### CLI

Illustrative only:

```
$ magpie add https://github.com/microsoft/playwright-cli
✔ Draft created: repos/microsoft--playwright-cli.md (status: inbox)
  Detected: 1 skill · packages: npm:@playwright/cli · license: Apache-2.0
  Next: write "When it's useful", then run `magpie review playwright-cli`

$ magpie search "test a web ui with my agent"
1. microsoft/playwright-cli  cli · 4/5 · tried
   When it's useful: letting my agent test a web UI end to end…
2. vercel-labs/agent-skills › web-design-guidelines  skill line
   …

$ magpie drift
⚠ microsoft/playwright-cli changed since review (3 files, including skills/playwright-cli/SKILL.md)
```

Every command also offers a machine-readable mode, for example `--json`, for agents ([decision 0008](decisions/0008-machine-readable-output.md)).

### Agent layer

- RepoMagpie's `SKILL.md` teaches agents to use the CLI: search, recall, and add drafts.
- Proactive recall shows the user's note before an agent installs a package. It informs and never blocks. Example of what the agent shows the user:

  > Note from your journal: left-pad 2/5 — 'abandoned, use String.prototype.padStart'.

- Recall has two modes. **Hook mode** runs from an agent hook, in clients that support hooks. **Skill mode** relies on `SKILL.md` telling the agent to run `magpie recall <package>` first; it is best effort and works in any client that supports skills. Hook support differs per client: see [ideas, idea 1](ideas.md#1-proactive-recall).

### Vault

```
<vault>/
  repos/                 one note per repository
  _templates/            Templater template (Obsidian extra)
  tags.md                shared tag list
  Home.md                Dataview dashboards (Obsidian extra)
  .obsidian/graph.json   graph colour groups (Obsidian extra, example vault only)
```

The vault is fully usable without Obsidian. Obsidian extras only add comfort. Note format: [note schema](note-schema.md).

### `magpie graph`

A single self-contained HTML file. See [Graph specification](#graph-specification).

### Nest

A static site built by `magpie publish`. It contains public notes only (`public: true`, default `false`): a searchable list, the graph and a `/uses` view. It can be hosted on GitHub Pages. See [ideas, idea 3](ideas.md#3-nests-and-follow).

## Visual identity

- Obsidian-inspired, dark-first, calm, information-dense.
- A `DESIGN.md` is written before any HTML surface is built, at the start of v0.2. [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) is a reference only. See [standards](standards.md).
- The logo is a magpie, legible at 16 px.

## Graph specification

### Levels

| Level | What | Release |
|---|---|---|
| 1 | A preconfigured Obsidian graph for the example vault. No code. | v0.1 |
| 2 | `magpie graph`: a self-contained, interactive HTML file with typed edges and status encoding. | v0.2 |
| 3 | The graph embedded in nest pages. | v0.3 |

Graph views are often admired but rarely used. Ours must earn its place by (a) showing status at a glance (drift, inbox, gaps) and (b) being a visual people can share. It is not decoration.

### Graph model

**Node types**

| Node | Source | Notes |
|---|---|---|
| repo | each note in `repos/` | main node |
| skill | each completed skill line | attached to its repo |
| tag | each tag in use | hub node |
| magpie (v0.3) | each followed nest | other people |

**Edge types**

| Edge | Direction | Source | Style |
|---|---|---|---|
| part-of | skill → repo | skill lines | short solid |
| tagged | repo → tag | `tags` | thin dotted |
| alternative-to | repo ↔ repo | human-owned `alternatives` | dashed, accent colour |
| works-with | repo ↔ repo | human-owned `works_with` | solid |
| related | repo ↔ repo | untyped `[[links]]` in "Related" | thin solid |
| similar-to | repo ↔ repo | computed from semantic search, above a threshold | faint, dashed, toggleable |
| recommended-by (v0.3) | magpie → repo | followed nests | thin |

### Typed relations

Typed edges need two human-owned frontmatter fields, `alternatives` and `works_with`: lists of wikilinks, for example `alternatives: ["[[microsoft--playwright-mcp]]"]`. Proposed in [decision 0007](decisions/0007-typed-relations-in-frontmatter.md); finalised with the note schema in v0.1.

### Visual encoding

| Property | Encodes |
|---|---|
| fill colour | `kind`, in at most 4 groups: skill pack; tool (cli, library, framework, plugin); resource (awesome-list, template, platform, app); other |
| size | number of connections, or rating (decided in v0.2) |
| opacity | `status`: inbox notes are faded |
| ring | drift: a red ring when upstream changed since review |
| hollow vs. solid | `tried: false` vs. `tried: true` |

A legend is always visible. Colour is never the only carrier of meaning: shapes and labels must work in greyscale.

### Interactions (level 2)

- Search box: focus and highlight matching nodes.
- Filters: kind, tag, status (inbox or reviewed), drift only, tried only.
- Click a node to open a side panel: "What it does", "When it's useful", notable skills, rating, and links to the note file and the repository.
- Local graph: depth 1 or 2 around the selected node.
- Toggle similar-to edges.
- Export the current view as PNG and SVG, for sharing.
- Keyboard accessible; respects `prefers-color-scheme` and `prefers-reduced-motion`.

### Technical constraints (level 2)

- One self-contained `.html` file with the data embedded as JSON. It opens offline by double-clicking and needs no server.
- The rendering library is chosen at the start of v0.2. Candidates: d3-force, Cytoscape.js, sigma.js with graphology. Criteria: offline bundle size, performance at 2,000 nodes, MIT-compatible license.
- Performance target: smooth interaction with 2,000 nodes on a mid-range laptop.
- The graph is generated from notes only ([decision 0001](decisions/0001-plain-markdown-storage.md)). Nothing is stored that can't be rebuilt.

### Obsidian preset (level 1)

- Ship `examples/vault/.obsidian/graph.json` with one colour group per `kind` group.
- Colour groups take an Obsidian search query ([Graph view help](https://obsidian.md/help/plugins/graph)), and search matches a property value with `[property:value]`, with `OR` between values ([Search help](https://obsidian.md/help/plugins/search)). So the four groups would be:
  - `[kind:skill-pack]`
  - `[kind:cli OR library OR framework OR plugin]`
  - `[kind:awesome-list OR template OR platform OR app]`
  - `[kind:other]`

  Checked against the docs on 2026-10-03; confirm in Obsidian when the preset is built.
- Commit only `graph.json` and the minimum other config. Never commit `workspace*` or cache files: `.gitignore` ignores them in every vault, and `git check-ignore` must confirm that `graph.json` is not ignored.

## Open questions

- **Links in properties:** do Obsidian's graph view and backlinks count wikilinks inside frontmatter properties, and since which version? Obsidian's [Properties help](https://obsidian.md/help/properties) and the [1.4.0 changelog](https://obsidian.md/changelog/2023-07-26-desktop-v1.4.0) say properties can hold internal links (quoted: `"[[Link]]"`), but not whether the graph or backlinks use them (checked 2026-10-03). Test it in the current Obsidian version. If they don't, the level 1 graph shows only body links, and typed edges appear only in level 2.
- **Node size:** connections or rating? Decided in v0.2.
- **Rendering library** for level 2. Decided at the start of v0.2.
- Recall, vet, nest and other feature questions: see [ideas](ideas.md).
