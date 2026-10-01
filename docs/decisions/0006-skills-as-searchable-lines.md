# 0006 — One note per repository; skills are searchable lines

**Status:** accepted (2026-10-01)

## Context
A skill pack can hold dozens of independent skills, and users search for a skill, not a repository ([vision](../vision.md)). A separate note per skill would multiply files and repeat repository facts (URL, license, install). A plain list of skill names inside the repo note would lose the skill-level search that sets RepoMagpie apart.

## Decision
- A skill is a line under "Notable skills" in its repository's note, not its own file (see `docs/note-schema.md`).
- Search indexes each completed skill line as its own result, linked to its parent note.
- `magpie add <skill-url>` creates the parent repository note if it doesn't exist, or updates it, and adds the skill line (append-only, schema rule 2).
- Separate skill notes may be revisited later, by a new record that supersedes this one.

## Consequences
- The vault has one note type; the schema stays small.
- Search returns two kinds of result: a note, or a skill line inside a note.
- Skills have no fields of their own (rating, tried); if those become necessary, revisit this decision.
- `magpie add` must resolve a skill URL to its repository.
