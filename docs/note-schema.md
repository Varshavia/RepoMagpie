# Note schema (draft, v0)

One Markdown file per repository, with YAML frontmatter. Status: **draft** — finalised in roadmap step 3.

## File location and name

`<vault>/repos/<owner>--<repo>.md` (lowercase). Example: `repos/microsoft--playwright-cli.md`.
The double dash keeps owner and repo distinct and avoids collisions between same-named repos.

## Frontmatter

| Field | Required | Type | Filled by | Notes |
|---|---|---|---|---|
| `name` | yes | string | tool | Display name |
| `url` | yes | string | tool | Canonical GitHub URL |
| `kind` | yes | enum | human (tool may suggest) | See below |
| `tags` | yes | list | human (tool may suggest) | Lowercase, kebab-case, from the shared tag list |
| `language` | no | string | tool | Primary language from GitHub |
| `license` | no | string | tool | SPDX id, or `none` if no license file |
| `install` | no | string | tool/human | One-line install command |
| `explored` | yes | date | tool | Date the note was created (YYYY-MM-DD) |
| `tried` | yes | bool | human | Have you actually run it? |
| `rating` | no | 1–5 | human | Leave empty until tried |
| `status` | yes | enum | human | `inbox` (draft, not reviewed) or `reviewed` |

### `kind` values

`skill-pack` · `cli` · `library` · `framework` · `plugin` · `app` · `platform` · `awesome-list` · `template` · `other`

## Body sections (in this order)

```markdown
## What it does
<!-- 1–3 factual sentences. The tool may draft this. -->

## When it's useful
<!-- REQUIRED. Your own words. Concrete situations, one per bullet.
     This section is what search matches against. A note without it stays in `inbox`. -->

## Notable skills
<!-- Only for skill-packs. One line per skill worth remembering:
     - `skill-name` — when it's useful -->

## How to use
<!-- Install command and the one or two commands you'd actually run. -->

## My notes
<!-- Free-form: what you tried, gotchas, opinions. -->

## Related
<!-- [[wikilinks]] to other notes. -->
```

## Rules

1. A note moves from `inbox` to `reviewed` only when "When it's useful" has at least one bullet written by the user.
2. The tool may fill or refresh **tool**-owned fields; it must never overwrite human-owned fields or body sections other than "What it does" in a fresh draft.
3. Tags come from a single shared list (`<vault>/tags.md`) so the same idea isn't spelled three ways.

## Example

See [templates/repo-note.md](../templates/repo-note.md) for the blank template and [seed-repos.md](seed-repos.md) for content to turn into example notes.
