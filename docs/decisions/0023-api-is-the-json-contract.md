# 0023 — The API is the `--json` contract

**Status:** accepted (2026-10-04)

## Context
The local app ([0021](0021-local-ui-server.md)) reads and writes notes through a JSON API. The CLI already has a public JSON contract: every command's `--json` document ([0008](0008-machine-readable-output.md), [spec](../spec.md) sections 1 and 2). Two contracts for the same data would drift.

The app also lets people edit notes. The [note schema](../note-schema.md)'s rule 2 limits what the *tool does on its own*: it never overwrites human-owned content. Edits a person makes in the app are human edits, and they need their own rules so they can never damage a note.

## Decision

### One contract
- Every API response uses the same document shapes as the CLI's `--json` output. `GET /api/search` returns exactly what `magpie search --json` prints; `POST /api/note` returns what `magpie note --json` prints; and so on.
- When an endpoint needs a shape the CLI doesn't have yet (a full note, a note list, the journals), it is defined once, in the [spec](../spec.md) ("Shared JSON documents"), for both the API and any future CLI command.
- Errors follow the spec's failure rule: the success document plus an `"error"` field ([spec](../spec.md), section 1). The HTTP status says what kind of error it was; endpoint list and statuses: [UI](../ui.md), "API".

### Editing rules
- **Human edits, through core.** The app writes only through round-trip-safe core functions:
  - `setSection`: replaces the body of one section and nothing else;
  - `setVerdict` (exists), and `setSection` for the Verdict when the person changes it;
  - frontmatter edits of human-owned keys only: `kind`, `tags`, `tried`, `rating`. `status` follows the Verdict (schema rule 1), so it is never set by hand.
- **Byte for byte.** Everything outside the edited part stays as it was, proven by round-trip tests like those for `setToolFields`.
- **Tool-owned fields are never edited by hand** in the app (`id`, `name`, `url`, `language`, `license`, `topics`, `packages`, `explored`, `adopted`).
- **Drafts.** Saving a drafted section the person edited removes its draft marker: they accepted it (schema rule 3). An "Accept draft" action removes the marker without changing the text.
- **Unparseable notes** (frontmatter that can't be read) are shown read-only, with a warning and an "Open in editor" action. Nothing writes to them.

### Versions and conflicts
- Every note read returns a `version`: a SHA-256 hash of the file's bytes, as `sha256:<hex>`.
- Every write sends the `version` it read. If the file changed since (in Obsidian, another editor, or the CLI), the server answers `409 Conflict` with the current version, and writes nothing. The app offers to reload. A note is never overwritten blindly.

## Consequences
- The UI, the CLI and agents read the same data in the same form; a change to a shape is a breaking change for all of them ([release process](../release.md)).
- `src/core` gains `setSection` and human-field edits, with round-trip tests, on `feat/ui-server`.
- The version check costs one hash of the file per write; notes are small.
- Edits made outside the app are never lost: the worst case is a 409 and a reload.
