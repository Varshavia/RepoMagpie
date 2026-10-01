# 0001 — Plain Markdown storage

**Status:** accepted (2026-10-01)

## Context
Competing tools keep data in an app database or plugin storage. Users can't easily read, edit, version or move it.

## Decision
Every journal entry is a Markdown file with YAML frontmatter (see `docs/note-schema.md`). Any index (search, embeddings) is a derived cache that can be deleted and rebuilt from the files.

## Consequences
- Works with Obsidian, VS Code, or any editor; versionable with git.
- No migrations of a database; schema changes need a small note-upgrade script instead.
- Search must build its own index; that's acceptable.
