# 0013 — Two journal scopes, one format

**Status:** accepted (2026-10-03)

## Context
So far RepoMagpie had one journal: the user's vault, outside any repository ([decision 0003](0003-vault-outside-repo.md)). A team journal was planned for after v0.4 ([ideas](../ideas.md), idea 8). [Strategy](../strategy.md) §6 and §15 A move team sharing into the core: a journal committed with a project gets sharing, history and review through git, with no server.

## Decision
There are two journal scopes, with the same note format:
- **Personal journal:** a folder outside any repository. It holds anything the user explored and judged (repositories, skills, tools), not only the dependencies they use. Private by default. It is what decision 0003 calls the vault.
- **Project journal:** `.magpie/` inside a project repository, committed with the code.

Both are first-class. Search, suggest and recall work across both. `magpie adopt` copies a note from the personal journal into the project journal ([0010](0010-v0-1-scope.md)).

How `magpie` finds both journals, and how it labels which journal a result came from, is decided in the step 2 spec.

## Consequences
- The team journal (idea 8) is part of v0.1, as the project journal.
- A project journal is as visible as its repository: in a public repository, it is public. `adopt` is the explicit step from private to shared.
- Decision 0003 still holds: this repository holds only the example vault, and nobody's personal journal.
