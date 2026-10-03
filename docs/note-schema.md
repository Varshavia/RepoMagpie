# Note schema (draft, v0)

One Markdown file per repository, with YAML frontmatter. Status: **draft** — finalised in roadmap v0.1 (example vault).

## File location and name

`<vault>/repos/<owner>--<repo>.md` (lowercase). Example: `repos/microsoft--playwright-cli.md`.
The double dash keeps owner and repo distinct and avoids collisions between same-named repos.

## Frontmatter

| Field | Required | Type | Owner | Notes |
|---|---|---|---|---|
| `name` | yes | string | tool | Display name |
| `url` | yes | string | tool | Canonical GitHub URL |
| `kind` | yes | enum | human (tool drafts at creation) | See below |
| `tags` | yes | list | human (tool drafts at creation) | Lowercase, kebab-case, from the shared tag list |
| `topics` | no | list | tool | Raw GitHub topics; the source for tag suggestions |
| `language` | no | string | tool | Primary language from GitHub |
| `license` | no | string | tool | SPDX id, `none` if no license file, or `mixed` if licensing differs per skill or file |
| `install` | no | string | human (tool drafts at creation) | One-line install command |
| `explored` | yes | date | tool | Date the note was created (YYYY-MM-DD); set once, never refreshed |
| `tried` | yes | bool | human (default `false`) | Have you actually run it? |
| `rating` | no | 1–5 | human | Leave empty until tried |
| `status` | yes | enum | human (default `inbox`) | `inbox` (not yet reviewed) or `reviewed` |

### `kind` values

`skill-pack` · `cli` · `library` · `framework` · `plugin` · `app` · `platform` · `awesome-list` · `template` · `other`

## Body sections (in this order)

```markdown
## What it does
<!-- 1–3 factual sentences. The tool may draft this at creation. -->

## When it's useful
<!-- REQUIRED. Your own words. Concrete situations, one per bullet.
     This section is what search matches against. A note without it stays in `inbox`. -->

## Notable skills
<!-- Only for skill packs. The tool lists detected skills with nothing after the dash.
     Complete the ones worth remembering:
     - `skill-name` — when it's useful -->

## How to use
<!-- Install command and the one or two commands you'd actually run. -->

## My notes
<!-- Free-form: what you tried, gotchas, opinions. -->

## Related
<!-- [[wikilinks]] to other notes. -->
```

## Rules

1. A note moves from `inbox` to `reviewed` only when "When it's useful" has at least one bullet written by the user. `inbox` is the single "not yet reviewed" state for every source: manual add, CLI add, or any future import.
2. Ownership:
   - **Tool-owned:** `name`, `url`, `language`, `license`, `topics`, `explored`. `explored` is set once at creation; the tool may refresh the others.
   - **Human-owned:** everything else, including all body sections.
   - **At creation only**, the tool may write a draft of `kind`, `tags`, `install` and "What it does". It also writes fixed defaults: `status: inbox`, `tried: false`, `rating` empty, and the other sections empty apart from detected skill lines (rule 3).
   - **After creation**, the tool never modifies human-owned fields or sections, with one exception: it may append a line for a skill not yet listed under "Notable skills". It never edits, reorders or removes existing lines.
3. "Notable skills": the tool writes detected skill names only, as `` - `skill-name` — `` with nothing after the dash. The user completes the ones worth remembering. Lines with nothing after the dash are ignored by search.
4. Tags come from a single shared list (`<vault>/tags.md`) so the same idea isn't spelled three ways.

## Planned fields (not active)

These fields are planned for later releases ([ideas](ideas.md)). They are **not** part of the active schema or the template. Each joins the frontmatter table above when its release starts.

| Field | Owner | Type | For | Target |
|---|---|---|---|---|
| `packages` | tool | list of `ecosystem:name` | proactive recall | v0.1 |
| `alternatives` | human | list of wikilinks | typed edges, recall alternatives | v0.1 ([decision 0007](decisions/0007-typed-relations-in-frontmatter.md), proposed) |
| `works_with` | human | list of wikilinks | typed edges | v0.1 ([decision 0007](decisions/0007-typed-relations-in-frontmatter.md), proposed) |
| `reviewed_commit` | tool | commit SHA | drift | v0.2 |
| `public` | human | bool, default `false` | nests | v0.3 |
| `last_resurfaced` | tool | date | digest | later |

## Example

See [examples/vault/_templates/repo-note.md](../examples/vault/_templates/repo-note.md) for the blank template and [seed-repos.md](seed-repos.md) for content to turn into example notes.
