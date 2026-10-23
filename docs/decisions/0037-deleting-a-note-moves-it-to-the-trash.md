# 0037 — Deleting a note moves it to the trash

**Status:** accepted (2026-10-23, decided by the maintainer). Builds on [0013](0013-two-journal-scopes.md) (two journals), [0023](0023-api-is-the-json-contract.md) (the API is the JSON contract; a write sends the version it read), [0027](0027-alternatives-active.md) (links and alternatives) and [0032](0032-note-text-is-data.md), rule 5 (never write through a link). The command and its document: [spec](../spec.md), sections 2 and 3; the app: [UI](../ui.md), sections 6 and 7.

## Context
There is no way to delete a note: no command, no button. Testers will write test notes on their first day and want them gone, and "delete the Markdown file by hand" is a poor first impression.

A note deleted by hand already works: the caches rebuild, the app says "Another program deleted this note's file", and links to it show as unresolved. What is missing is a safe way to do it from the CLI and the app.

A note is the person's own judgment, often written once and never again. A delete that can't be taken back, or that an agent runs on its own, loses something the person can't fetch from anywhere.

## Decision

### 1. A delete moves the note to the journal's trash
- The trash is `<journal>/.trash/`. The file keeps its name, with a UTC stamp before the extension: `npm--pdfkit.20261023-093900Z.md`. A second delete of the same note in the same second gets `-2`, `-3` and so on after the stamp, so two deletes never collide.
- Nothing reads `.trash/` as notes. Notes are read from `notes/` only, so search, recall, the hook, catalog, suggest, the graph, the note list and `doctor`'s counts leave the trash out; a test proves it for each.
- A project journal's `.trash/` is git-ignored. `.magpie/.gitignore` holds `.cache/` and `.trash/`; a `.gitignore` written before this decision gets `.trash/` appended on the first delete, with the file's own line endings.
- Nothing empties the trash. The docs say where it is, and that deleting a file there removes it for good.

### 2. Only the person deletes
- The MCP server gets no delete tool.
- The skill says: never run `repomagpie delete` unless the user asked to delete that note, by name, in this conversation.
- Hooks never delete.
- `repomagpie delete` asks "Move it to the trash? [y/N]" in a terminal; without one, it needs `--yes`. The app asks in a dialog whose default button is Cancel.

### 3. Delete the version you saw
The app sends the note's version (`noteVersion`, [0023](0023-api-is-the-json-contract.md)), and the CLI the version its prompt showed. If the file changed since it was read, nothing moves: the delete gets the same "changed on disk" answer a PATCH gets (409 in the API), and the app shows its conflict banner. The version is checked again just before the move.

### 4. Say what points to it, and leave it pointing
Before the move, the CLI and the app show the notes that link to it and the notes that list it as an alternative, from the link index. The delete goes ahead anyway: those links show as unresolved, as for a note deleted by hand. The other notes are never edited.

### 5. Only a note file in `notes/`
- The note is resolved by its id or its file name, as `GET /api/note` resolves one. No path from a request is joined to a folder.
- A note that is a link, or anything outside `notes/`, is refused (`journalPathProblem`). So is a `.trash` that is a link.
- The move uses the rename the caches use, tried again while another program (a virus scan on Windows) holds the file (`EPERM`, `EACCES`, `EBUSY`).

### Undo, for the session
The app's toast offers Undo: `POST /api/note/restore` moves the file back to `notes/` under its original name. It takes only a name listed in that journal's `.trash/` with a stamp. When a note has that name again, the file stays in the trash and the app says so, with its path. There is no Undo in the CLI: the command prints the trash path, and moving the file back is a rename.

## Consequences
- A deleted note can always be got back from `.trash/`, until the person deletes the file there.
- The trash grows until the person empties it. It holds whole notes, so a personal journal's trash is as private as its notes, and a project journal's stays out of git.
- An agent can't delete a note through MCP, and the skill forbids the CLI command unless the user asked for that note by name. An agent that ignores the skill can still run the command with `--yes`; the note then sits in the trash, not gone.
- Links to a deleted note become unresolved, and the person fixes them, or not, by hand.
- Out of scope for now: emptying the trash, a trash view in the app, restoring after the session, deleting several notes at once, deleting from the graph page, and renaming notes.
