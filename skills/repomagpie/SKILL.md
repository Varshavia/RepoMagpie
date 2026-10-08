---
name: repomagpie
description: Reads and records the user's own notes on dependencies and tools with the magpie CLI (RepoMagpie). Use before adding or installing any package (npm, pnpm, yarn, bun, pip, uv, cargo), when the user asks what they have or know for a task ("what do I have for browser testing?"), when choosing libraries or tools for a project, and when the user gives an opinion on a tool worth remembering.
license: MIT
compatibility: Needs a shell and the magpie command (npm package repomagpie, Node.js 22.12 or later).
---

# RepoMagpie

The user keeps one Markdown note per dependency or tool, in two journals:
- the **personal journal**: private, outside any repository;
- the **project journal**: `.magpie/` in the repository, committed and shared with the team.

Each note leads with the user's **Verdict**: one line, in their own words, of what they decided ("avoid: async streams painful; use puppeteer"). A note without a Verdict is in the inbox. The `magpie` command reads and writes the journals. You show the user what their notes say; the decisions stay theirs.

## Rules

- **Always pass `--json`** and read the fields listed in [references/json.md](references/json.md). Under `--json`, magpie never prompts. Exit 0 includes "no matches". On exit 1 (failed) or 2 (usage error) the document has an `error` field with the message; a mistyped flag or a missing argument prints its message on stderr only.
- **Never write a Verdict or an alternative the user didn't say.** Not a summary, not a polished version.
- **Never run `magpie adopt`, `--to project`, or edit a file under `.magpie/` without the user's explicit OK** for that note. The project journal is committed: anyone who can read the repository can read it.
- If `magpie` is not installed, say so once and carry on without it. Don't install it yourself.

## Before adding a dependency

Before you install or add a package (an install command, or a new entry in a manifest), look it up. Put every package of the install in one call:

```
magpie recall <package>... --json
```

- No match: go ahead. Say nothing about magpie.
- A match: tell the user in one or two lines what their note says: the name, the journal, the `verdict` (or that the note is in the inbox), and `avoid_when` when it has items. A match with `confidence` `"name-only"` is a note on a package of the same name under another type; say so.
- **An avoid note asks first.** When an `"exact"` match's `verdict` starts with "avoid", or its `avoid_when` has items, show the note and ask the user before installing. Install only if they say yes. A `"name-only"` match never asks; it only informs.
- **Name the alternatives.** When an avoid match has `alternatives`, name each one with its `verdict`: say when it is in the inbox, when `avoid` is `true` (the user noted to avoid it too), and when `path` is `null` (no note on it). Then ask whether to install an alternative instead. Never pick one for the user.
- Before you install an alternative, recall it too, as above.
- In Claude Code, the magpie hook may already check the install and ask (its messages start with `magpie:`). When it has, don't ask a second time. If the user declines the install, offer the alternatives the hook named.

## "What do I have for X?"

```
magpie search "<words>" --json
```

Filters: `--tag <tag>`, `--kind <kind>`, `--journal personal|project`, `--limit <n>`. Answer from the results only, in their order (reviewed notes come first): the name, the `verdict`, and the `journal`. A result whose `type` is `"skill"` is one skill inside a repository note: name the skill and its repository. No results: say the journals have nothing on it.

## Which of my tools fit this project?

```
magpie suggest --json
magpie suggest "<what the project does>" --json
```

Without a description, suggest reads the project's manifests and README. Its candidates are keyword matches, not answers: you make the semantic choice. Pick the candidates that fit what the project needs, and give one line per pick on why (from its `verdict`, its `tags`, `why` and the project). Leave out the ones that don't fit, and say so when none does. Mention every item of `in_use_avoid`: a package the project already uses that the user noted to avoid, with its `alternatives` when it has any. Exit 2 means there was nothing to go on: ask the user for a one-line description. Install or adopt nothing from the list without asking.

## Recording an opinion

When the user forms an opinion on a tool ("pdfkit was painful for streaming", "playwright-cli is the one for this"), offer once to save it:

```
magpie note <name-or-url> "<the user's words>" --json
```

- The text becomes the Verdict, so use the user's own words. If they haven't said a verdict, ask for one, or save the note without text: it goes to the inbox.
- A GitHub URL instead of a name also fetches the repository's facts.
- The note goes to the personal journal. `--to project` only with the user's explicit OK.
- Exit 1 with "already has a Verdict": magpie never overwrites one. Give the user the note's path; they edit it themselves.
- With the user's OK, you may draft "What it does" and "Use when" in the note's file (its `path`), when that section is empty. Make `<!-- magpie:draft -->` the first line of the section, then your text; the user accepts a draft by deleting that line. Never draft the Verdict or "Avoid when", and don't change other sections or the frontmatter.

## When the user names an alternative

When the user says to use B instead of A ("use puppeteer instead of pdfkit"), offer once to record it:

```
magpie note <A> --alternative <B> --json
```

- Record it only with the user's OK, and only the names they said. Repeat `--alternative` for each.
- Without text, it adds the alternative and changes nothing else. If A has no note yet, it creates one in the inbox; say so.
- B already in `alternatives_present`: it was recorded before; say so.
- `--to project` only with the user's explicit OK, as for any note.

## Adopting a note into the project

Only when the user explicitly asks for that note:

```
magpie adopt <name-or-purl> --json
```

It copies the note from the personal journal into the project journal and returns the install command in `install` (or several in `install_choices`, for the user to choose from). When the note's Verdict says to avoid the package, it copies the note but names no command: tell the user what the Verdict says. It never installs anything; run the install only if the user asks, and look the package up first as above.
