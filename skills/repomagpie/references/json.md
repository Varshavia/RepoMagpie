# magpie --json fields

The fields this skill reads, per command. Every command prints one JSON document on stdout. On failure (exit 1 or 2) the document has the same fields plus `error`, the message; unknown values are `null` and lists are empty. Paths and ids are as stored: a package id is a Package URL (PURL) such as `pkg:npm/pdfkit`, with an npm scope encoded (`pkg:npm/%40playwright/cli` is `@playwright/cli`).

## `magpie recall <package>... --json`

- `matches[]`: one per note found; empty when there is none. Project journal first.
- `matches[].query`: the package you asked about.
- `matches[].id`: the note's PURL.
- `matches[].journal`: `"personal"` or `"project"`.
- `matches[].confidence`: `"exact"` (same type and name) or `"name-only"` (same name, another type, or a GitHub repository of that name).
- `matches[].verdict`: the user's Verdict, or `null` when the note is in the inbox.
- `matches[].avoid_when`: the "Avoid when" bullets; `[]` when none.
- `matches[].use_when`: the "Use when" bullets; `[]` when none.
- `matches[].drafts`: which of `"avoid_when"` and `"use_when"` are still drafts, not yet accepted by the user. Say "(draft)" when you quote them.
- `matches[].status`: `"reviewed"` or `"inbox"`.
- `matches[].path`: the note's file.
- `matches[].alternatives[]`: what the user noted to use instead, from the note's own alternatives field and from notes that list this one; `[]` when none. Reviewed ones first, then inbox ones, then avoid ones, then names without a note.
- `matches[].alternatives[].name`: the alternative's name.
- `matches[].alternatives[].verdict`: its Verdict, or `null` (in the inbox, or no note).
- `matches[].alternatives[].avoid`: `true` when the user also noted to avoid it.
- `matches[].alternatives[].path`: its note's file, or `null` when the journal has no note on it.
- `matches[].alternatives[].reason`: only for an alternative without a note: `"missing"` (no note on it) or `"ambiguous"` (several notes have that name; `magpie search <name> --json` lists them).
An avoid note: `matches[].verdict` starts with the word "avoid" (any case), or `matches[].avoid_when` has items.

## `magpie search <query> --json`

- `results[]`: in rank order; reviewed notes before inbox ones.
- `results[].type`: `"note"`, or `"skill"` for one skill line inside a repository note.
- `results[].skill`: the skill's name for a skill result; `null` otherwise.
- `results[].name`: the note's name (for a skill, its repository's).
- `results[].id`: the note's PURL.
- `results[].journal`: `"personal"` or `"project"`.
- `results[].verdict`: the Verdict (for a skill, the skill line's text), or `null` for an inbox note.
- `results[].status`: `"reviewed"` or `"inbox"`.
- `results[].path`: the note's file; read it for the full note.

## `magpie suggest ["description"] --json`

- `source`: `"manifests"` (read from the project) or `"description"`.
- `keywords`: the words it looked for.
- `candidates[]`: notes that match the keywords, reviewed first. Never a package the project already uses. Notes that score under a fifth of the best candidate are left out.
- `candidates[].name`, `candidates[].id`, `candidates[].journal`: which note.
- `candidates[].verdict`: the Verdict, or `null` for an inbox note.
- `candidates[].tags`: the note's tags.
- `candidates[].why.keywords`: the keywords the note matched. One or two common words ("agent", "app") is a weak reason.
- `candidates[].why.dependencies`: the project's dependencies the note matched by name, such as `@playwright/test`; `[]` for a description.
- `candidates[].status`: `"reviewed"` or `"inbox"`.
- `candidates[].path`: the note's file; read it when the Verdict and tags aren't enough to judge the fit.
- `candidates[].alternatives[]`: the note's alternatives, with the same fields as in recall.
- `in_use_avoid[]`: packages the project already uses that have an avoid note, each shaped like a recall match.
- `in_use_avoid[].query`: the dependency's name.
- `in_use_avoid[].verdict`, `in_use_avoid[].avoid_when`: what the note says.
- `in_use_avoid[].alternatives[]`: what the user noted to use instead, as in recall.

## `magpie note <name-or-url> ["text"] --json`

- `id`: the note's PURL.
- `journal`: where it was written.
- `path`: the note's file.
- `created`: `true` for a new note, `false` for an existing one.
- `status`: `"reviewed"` with a Verdict, `"inbox"` without.
- `warnings`: things that went wrong without stopping it, such as no network for a GitHub URL.
- `alternatives_added`: the `--alternative` names written to the note; `[]` without the flag.
- `alternatives_present`: the `--alternative` names the note already had; nothing was written for them.
- `tags_md_added`: tags from a new GitHub repository note's topics that were added to the journal's tag list (tags.md); `[]` otherwise.

## `magpie adopt <name-or-purl> --json`

- `id`: the note's PURL.
- `from`: the note's file in the personal journal.
- `to`: the copy in the project journal.
- `install`: the install command for this project's package manager, or `null` when there is none or several, or when the note's Verdict says to avoid the package.
- `install_choices`: the commands to choose from when the repository publishes several packages; `[]` otherwise.
