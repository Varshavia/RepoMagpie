# 0027 — `alternatives` becomes active; `works_with` stays planned

**Status:** accepted (2026-10-07). Accepts the `alternatives` half of [0007](0007-typed-relations-in-frontmatter.md) and answers its open questions. `works_with` stays proposed.

## Context
[0007](0007-typed-relations-in-frontmatter.md) proposed two human-owned frontmatter fields, `alternatives` and `works_with`, and left two questions open:
1. Do Obsidian's graph view and backlinks count wikilinks inside frontmatter properties?
2. Both relations are two-way. Must both notes list each other, or is one side enough?

v0.2 Connect builds links, backlinks and a graph into the app ([0026](0026-the-app-is-the-workspace.md)). The graph draws `alternatives` as its own kind of edge, and part 3 lets recall and suggest show alternatives. No current need asks for `works_with`.

## Decision
- **`alternatives` is part of the active schema.** Human-owned and optional: a list of wikilinks written as quoted strings, as in 0007:

  ```yaml
  alternatives: ["[[npm--puppeteer]]"]
  ```

  The tool never writes it on its own ([note schema](../note-schema.md), rule 2). The app writes it only when the user adds or removes an alternative.
- **One side is enough.** A note that lists B as an alternative makes A and B alternatives of each other. The app shows the relation on both notes ("Alternative to: …" on the other one), and the graph draws it once.
- **A target may have no note yet.** `[[puppeteer]]` is allowed when there is no puppeteer note; the link is shown as unresolved. The same holds for links in the body.
- **Question 1 is moot.** The in-app graph reads `alternatives` itself, so it no longer matters whether Obsidian's graph counts links in properties. Nothing waits on the answer.
- **`works_with` stays proposed**, as in 0007, until a feature needs it.

## Consequences
- The note schema moves `alternatives` from "Planned fields" to the active frontmatter table, with a paragraph on how links resolve.
- `src/core/note.ts` reads `alternatives` as a list of strings. A malformed value makes the field unreadable, not the note (lenient read).
- `PATCH /api/note` can set `alternatives`, through the round-trip-safe frontmatter edit.
- Because one side is enough, the reverse relation is computed from backlinks, never written to the other note.
- [0007](0007-typed-relations-in-frontmatter.md)'s status line points here.
