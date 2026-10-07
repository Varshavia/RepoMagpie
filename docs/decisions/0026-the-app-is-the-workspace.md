# 0026 — The app is the workspace; v0.2 is "Connect"

**Status:** accepted (2026-10-07). Changes the graph's status in [0010](0010-v0-1-scope.md) ("marketing material, not scheduled") and in [ideas](../ideas.md), idea 10. [0001](0001-plain-markdown-storage.md) and [0021](0021-local-ui-server.md) are unchanged.

## Context
The maintainer is the first user. Every day they add the GitHub repositories they reviewed; in three months that could be 800 notes. What they want from that:

1. One place to work, inside `magpie ui`: notes written by hand, links between notes, and a graph of everything. It should not hand off to Obsidian.
2. A graph of all repositories, grouped by tags and connected by links.
3. Coding agents in other projects that know what they have and what they decided. The skill already does this through `search`, `suggest` and `recall`.

Graph views were "marketing only, not scheduled" ([ideas](../ideas.md), idea 10; [product](../product.md#graph-specification); [UI](../ui.md) §13). That status rested on secondhand desk research ([validation](../validation.md), Q7). The primary user now asks for the graph directly, as a working view and not as a shareable visual.

The app also offers "Open in Obsidian", which sends the user out of the app to write. The [vision](../vision.md) says Obsidian is optional.

## Decision
- **The app is the workspace.** Hand-written notes, `[[wikilinks]]`, backlinks and a graph are built into `magpie ui`.
- **"Open in Obsidian" is removed.** Notes stay plain Markdown that Obsidian, or any other editor, can open ([0001](0001-plain-markdown-storage.md)). "Open in editor" stays.
- **The graph is a page in the app** (v0.2 part 2). It replaces the level 2 plan, a standalone HTML file written by `magpie graph`. A standalone file and the graph in nest pages remain possible later, as exports.
- **v0.2 is "Connect"**, in three parts, each on its own branch:
  1. Linked notes: links, backlinks, the `alternatives` relation ([0027](0027-alternatives-active.md)), tags from GitHub topics, and the app as the place where you write.
  2. The graph page.
  3. Agent output: alternatives and neighbours in what `recall` and `suggest` print.
- **Renumbering:** the former v0.2 Trust becomes v0.3, and v0.3 Share becomes v0.4.
- **The graph's edge sources** are fixed now, so part 1 stores what part 2 needs:

  | Source | Default | Notes |
  |---|---|---|
  | Tags, as hub nodes | on | each tag in use is a node; a note links to its tags |
  | `[[links]]` in the body | on | resolved within the same journal |
  | `alternatives` | on | its own colour; drawn once per pair ([0027](0027-alternatives-active.md)) |
  | Similarity from `topics` and `language` | off | computed, at most 3 neighbours per note |

## Consequences
- The roadmap gains a v0.2 Connect section; Trust and Share move to v0.3 and v0.4.
- Idea 10 and the product's graph specification change status: in the app, v0.2 part 2. The level table stays as history, marked superseded.
- The question in [UI](../ui.md) §13 ("Graph tab") is answered.
- The app grows: an editor for "My notes", link rendering and autocomplete, "Linked from", and later the graph page. The CLI stays the primary interface for agents ([0002](0002-cli-first.md)); every new read is also a core function.
- The graph's rendering library is chosen on the part 2 branch, under the dependency policy and the app's 200 kB budget.
- [0010](0010-v0-1-scope.md) stays as written (it is merged); its index row points here.
