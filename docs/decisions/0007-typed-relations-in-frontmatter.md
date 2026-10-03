# 0007 — Typed relations in frontmatter

**Status:** proposed (2026-10-03). Finalised in roadmap v0.1, together with the [note schema](../note-schema.md).

## Context
Notes link to each other only through untyped `[[wikilinks]]` in the "Related" section. The graph needs to tell kinds of links apart ([product](../product.md#graph-model)): "alternative to" and "works with" are different from "related". Proactive recall also wants to show better-rated alternatives ([ideas](../ideas.md), idea 1).

## Decision
- Add two **human-owned** frontmatter fields, `alternatives` and `works_with`. Each is a list of wikilinks to other notes, quoted as Obsidian requires for links in list properties ([Properties help](https://obsidian.md/help/properties)):

  ```yaml
  alternatives: ["[[microsoft--playwright-mcp]]"]
  works_with: []
  ```
- Both are optional. The tool never writes them (note schema, rule 2).
- Untyped links stay in the "Related" section.
- Until this record is accepted, neither field is part of the active schema or the template.

## Consequences
- The level 2 graph draws alternative-to and works-with edges; recall can list alternatives.
- The schema gains two optional fields.
- If Obsidian doesn't count links inside properties, the level 1 Obsidian graph shows only body links, and the docs must say so.

## Open questions
- **Verify:** do Obsidian's graph view and backlinks count wikilinks inside frontmatter properties, and since which version? The Properties help and the [1.4.0 changelog](https://obsidian.md/changelog/2023-07-26-desktop-v1.4.0) don't say (checked 2026-10-03). Test it in the current Obsidian version before accepting this record.
- Both relations are drawn as two-way. Must both notes list each other, or is one side enough?
