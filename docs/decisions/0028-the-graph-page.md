# 0028 — The graph page

**Status:** accepted (2026-10-07). The maintainer approved the dependencies below on 2026-10-07 (CLAUDE.md, section 9). Settles the open questions in the [product](../product.md#graph-specification) graph specification and in [ideas](../ideas.md), idea 10.

## Context
[0026](0026-the-app-is-the-workspace.md) makes the graph a page in the local app (v0.2 part 2) and fixes its edge sources: tags as hub nodes, `[[links]]` and `alternatives` on by default, similarity from `topics` and `language` off by default, at most 3 neighbours per note. Part 1 built the data: the link index (`src/core/links.ts`), tags from GitHub topics, and `kind`, `status`, `tried` and `rating` on every note.

The maintainer expects about 800 repository notes in three months. The page must stay smooth at 2,000. It must answer real questions: "What do I have for PDF?", "What did I say to use instead of X?", "What's still in my inbox around this topic?"

Constraints: the app's bundle budget of 200 kB gzipped, of which the app used 99.4 kB on 2026-10-07 ([UI](../ui.md) §10); the app's Content-Security-Policy (`script-src 'self'`, no `blob:`; [UI](../ui.md) §3); and "never colour alone" ([UI](../ui.md) §9).

## Decision

### Library
**sigma 3 with graphology, and the ForceAtlas2 layout from `graphology-layout-forceatlas2`, run in a web worker.** WebGL rendering keeps hover and zoom smooth at 2,000 nodes, and the layout never blocks the page.

Measured on 2026-10-07: each option bundled with esbuild (minified, ESM) and gzipped at level 9.

| Option | Adds (gzipped) | At 2,000 nodes | Licence, activity | Verdict |
|---|---|---|---|---|
| **sigma 3 + graphology + graphology-layout-forceatlas2** | **42.8 kB** | WebGL rendering; layout in a web worker, so the page doesn't freeze | MIT; sigma 3.0.3 released 2026-04-30, 4.0 in beta (4.0.0-beta.8, 2026-10-05) | **Chosen** |
| force-graph | 58.9 kB | Canvas 2D, heavier at this size; 15 runtime dependencies | MIT, active | Rejected |
| Cytoscape.js | 141.5 kB | Canvas, slow on large graphs | MIT, active | Rejected: over the budget |
| d3-force alone | 5.5 kB | Layout on the main thread. Rendering, zoom and picking would all be ours to write | ISC, last release 2022 | Rejected |

**Dependencies, approved by the maintainer on 2026-10-07** (figures from the npm registry, checked 2026-10-07). All are devDependencies, bundled into the app, pinned to these exact versions. The npm package's runtime dependencies stay empty.

| Package | Version | Released | Licence | Runtime deps | Why |
|---|---|---|---|---|---|
| `sigma` | 3.0.3 | 2026-04-30 | MIT | `events` 3.3.0, `graphology-utils` 2.5.2 | WebGL renderer |
| `graphology` | 0.26.0 | 2025-01-26 | MIT | `events` 3.3.0 | Graph data structure |
| `graphology-layout-forceatlas2` | 0.10.1 | 2022-10-17 | MIT | `graphology-utils` 2.5.2 | ForceAtlas2 layout |
| `graphology-types` | 0.24.8 | 2024-11-22 | MIT | none | Types; a peer dependency of graphology |

`events` and `graphology-utils` (both MIT, no runtime dependencies) come in through the packages above. Not approved, and not needed now: the `@sigma/*` add-ons (node borders, image export, curved edges) and `graphology-communities-louvain`.

**Licence notices:** the app's build writes the notices of every bundled library to `dist/ui/THIRD-PARTY-LICENSES.md` (Vite's `build.license`, as the CLI's build does since [0025](0025-bundle-the-cli.md)), and copies the icons' notice to `dist/ui/icons-LICENSE.txt`. Both ship in the npm package.

### Loading
The graph page is its own lazy-loaded chunk. Other screens don't load it, and their first render doesn't change: their initial chunk stays within ±2 kB of its size before the graph. The budget still counts every script and style in `dist/ui/`, the graph's chunks included, so the total stays under 200 kB.

### Layout
- **ForceAtlas2, in a web worker of our own.** The package's own worker (`graphology-layout-forceatlas2/worker`) starts from a `blob:` URL, which the app's CSP blocks. Instead, Vite builds a worker module into `dist/ui/`, served from `'self'`, that runs the package's synchronous layout. The CSP stays as it is.
- **Deterministic.** Starting positions are seeded from each node's id. The layout runs a fixed number of iterations, then stops. The same journal gives the same picture every time.
- **"Re-run layout"** runs it again.
- **No positions are stored** ([0001](0001-plain-markdown-storage.md): nothing that can't be rebuilt).

### Visual encoding

| Property | Encodes |
|---|---|
| Fill colour | `kind`, in the four groups of the [product](../product.md#visual-encoding) specification: skill pack; tool; resource; other. A legend is always visible |
| Size | Number of connections, on a log scale. Not rating: most notes have none |
| Faded | `status: inbox` |
| Tag nodes | Smaller, neutral, labelled `#tag` |
| Edges | Tag edges thin and faint; links solid; alternatives in their own colour and thicker; similarity faint |

Colours are tokens in [`DESIGN.md`](../../DESIGN.md), dark and light, each checked against the canvas for 3:1 (non-text contrast).

**Waits for a later release:** "hollow vs. solid" for `tried`, and a red ring for drift. Both need node programs we don't have (the `@sigma/*` add-ons are not approved), and drift doesn't exist yet.

### Missing notes
An unresolved link or alternative target (`[[puppeteer]]` with no puppeteer note) can be drawn as a ghost node. Off by default, behind its own toggle.

### Never colour alone
The graph is a visual aid. The accessible path is the search box, the status line ("Showing 214 notes, 31 tags and 486 connections") and the neighbours list beside the graph. The canvas is `aria-hidden` and has no tab stop. Every fact the graph shows by colour is also in words, in the side panel and the legend.

### Alternatives
- **Positions stored in the journal or a cache:** rejected. A deterministic layout gives the same picture without storing anything.
- **The package's `blob:` worker, with `worker-src blob:` added to the CSP:** rejected. It loosens a security header for a convenience.
- **Size by rating:** rejected. Most notes have no rating, so most nodes would be the same size.

## Consequences
- Four devDependencies are added. The package's runtime dependencies stay empty.
- `dist/ui/` gains `THIRD-PARTY-LICENSES.md` and `icons-LICENSE.txt`. Before this record the app's notices didn't ship: the bundler strips licence comments, and the icons' notice stayed in `ui/src/`.
- Core gains `graphData` (`src/core/graph.ts`) and the API gains `GET /api/graph`. No CLI command in this part.
- The similarity threshold and the layout's iteration count are set when they are built and documented in the [spec](../spec.md) and [UI](../ui.md).
- `DESIGN.md` gains graph tokens: four kind-group colours, a tag-node colour, one colour per edge type.
- The open questions in the [product](../product.md#graph-specification) specification and [ideas](../ideas.md), idea 10, are answered.
- If sigma 4 becomes stable during v0.2, upgrading is a new approval, not part of this record.
