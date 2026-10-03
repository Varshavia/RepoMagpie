# Note schema (v1)

One Markdown file per subject, with YAML frontmatter. A subject is a GitHub repository or a registry package. Status: **v1**, settled in roadmap step 2; the [spec](spec.md) describes the commands that read and write notes.

## File location and name

`<journal>/notes/<file>.md`, in the personal journal or a project journal ([decision 0013](decisions/0013-two-journal-scopes.md), [decision 0016](decisions/0016-journal-locations-and-config.md)).

The file name derives from the note's `id`, a Package URL ([decision 0017](decisions/0017-package-identity-purl.md)):
- Join the PURL type, the namespace (if any, without a leading `@`) and the name with `--`, lowercase.
- Replace every character other than `a–z`, `0–9`, `.`, `_` and `-` with `-`.

| `id` | File |
|---|---|
| `pkg:github/microsoft/playwright-cli` | `notes/github--microsoft--playwright-cli.md` |
| `pkg:npm/pdfkit` | `notes/npm--pdfkit.md` |
| `pkg:npm/%40playwright/cli` | `notes/npm--playwright--cli.md` |
| `pkg:pypi/requests` | `notes/pypi--requests.md` |

The double dash keeps the parts distinct. v0.1 supports GitHub repositories and registry packages (npm, PyPI, Cargo) only.

npm and Cargo names are case-sensitive, so two packages whose names differ only in case (`JSONStream`, `jsonstream`) map to the same file. v0.1 rejects the second one with an error that names both PURLs and the file.

## Frontmatter

| Field | Required | Type | Owner | Notes |
|---|---|---|---|---|
| `id` | yes | PURL | tool | The subject: `pkg:github/<owner>/<repo>` or a package PURL, without a version |
| `name` | yes | string | tool | Display name |
| `url` | no | string | tool | Canonical URL: the GitHub repository or the registry page |
| `language` | no | string | tool | Primary language from GitHub |
| `license` | no | string | tool | An SPDX identifier, `mixed` if licensing differs per skill or file, or `unknown` if none was found ([decision 0020](decisions/0020-unknown-license.md)) |
| `topics` | no | list | tool | Raw GitHub topics; the source for tag suggestions |
| `packages` | no | list of PURLs | tool | Packages this subject publishes, e.g. `["pkg:npm/%40playwright/cli"]`. Recall matches them |
| `explored` | yes | date | tool | Date the note was created (YYYY-MM-DD); set once, never refreshed |
| `adopted` | no | date | tool | Project journal only: the date `magpie adopt` copied this note from the personal journal ([spec](spec.md)) |
| `kind` | yes | enum | human (tool drafts at creation) | See below |
| `tags` | yes | list | human (tool drafts at creation) | Lowercase, kebab-case, from the journal's tag list |
| `tried` | yes | bool | human (default `false`) | Have you actually run it? |
| `rating` | no | 1–5 | human | Leave empty until tried |
| `status` | yes | enum | human (tool sets it at creation) | `inbox` or `reviewed`; see rule 1 |

### `kind` values

`skill-pack` · `cli` · `library` · `framework` · `plugin` · `app` · `platform` · `awesome-list` · `template` · `other`

## Body sections (in this order)

```markdown
## Verdict
<!-- One line, human-written only: what you decided. Recall and suggest show it first.
     Example: avoid: async streams painful; use puppeteer -->

## Use when
<!-- Concrete situations, one per bullet. May start as an AI draft (rule 3). -->

## Avoid when
<!-- Situations where it hurt or doesn't fit, one per bullet. -->

## What it does
<!-- 1–3 factual sentences. May start as an AI draft (rule 3). -->

## How to use
<!-- The one or two commands you'd actually run. -->

## Notable skills
<!-- Only for skill packs. The tool lists detected skills with nothing after the dash.
     Complete the ones worth remembering:
     - `skill-name` — when it's useful -->

## My notes
<!-- Free-form: what you tried, gotchas, opinions. -->

## Related
<!-- [[wikilinks]] to other notes. -->
```

Notes may be written in any language ([decision 0004](decisions/0004-english-everywhere.md)).

## Rules

1. **Status.** A note is `inbox` until its Verdict has human-written text ([decision 0018](decisions/0018-ai-drafts-humans-decide.md)); then it is `reviewed`. The tool sets `status` when it writes a note. When reading, a note with an empty Verdict counts as `inbox`, whatever its `status` field says.
2. **Ownership.**
   - **Tool-owned:** `id`, `name`, `url`, `language`, `license`, `topics`, `packages`, `explored`, `adopted`. `explored` and `adopted` are set once; the tool may refresh the others. It never replaces a `license` value with `unknown`, so a licence the user corrected stays.
   - **Human-owned:** `kind`, `tags`, `tried`, `rating`, `status`, and all body sections.
   - **At creation only**, the tool may write drafts of `kind`, `tags` (from topics), "What it does" and "Use when". It writes the Verdict, "Use when" and "Avoid when" only from the user's own input (rule 7). It also writes defaults: `tried: false`, `rating` empty, `status` per rule 1.
   - **After creation**, the tool never modifies human-owned fields or sections, with one exception: it may append a line for a skill not yet listed under "Notable skills" ([decision 0006](decisions/0006-skills-as-searchable-lines.md)). It never edits, reorders or removes existing lines.
3. **Drafts.** A drafted section starts with the line `<!-- magpie:draft -->`. AI may draft only "What it does" and "Use when". "Avoid when" may also be a draft when it comes from the user's own `avoid:` text in `magpie import` (rule 7). The Verdict is never a draft. Deleting the marker accepts the draft. Search, suggest and recall label draft text as a draft.
4. **Notable skills.** The tool writes detected skill names only, as `` - `skill-name` — `` with nothing after the dash. The user completes the ones worth remembering. Lines with nothing after the dash are ignored by search.
5. **Tags** come from the journal's tag list (`<journal>/tags.md`), so the same idea isn't spelled three ways. Across the two journals, tags match by name.
6. **One note per subject.** A PURL appears in at most one note per journal, as its `id` or in its `packages`. A repository note that lists `pkg:npm/pdfkit` is the note for that package too.
7. **User input.**
   - `magpie note <name-or-url> "text"`: the text is the Verdict (human-written).
   - `magpie import` reads one line per item: `- <url-or-name> — verdict: ... | use: ... | avoid: ...`. An explicit `verdict:` counts as human-written. `use:` and `avoid:` become draft "Use when" and "Avoid when" sections (rule 3). Text without a label goes to "My notes".
8. **Lenient read, strict write.**
   - Read hand-written notes even when frontmatter fields or sections are missing, misordered or extra.
   - Write notes in the canonical format above.
   - Never rewrite a human section; edits that preserve formatting and comments are required for frontmatter changes.

## Planned fields (not active)

These fields are planned for later releases ([ideas](ideas.md)). They are **not** part of the active schema or the template.

| Field | Owner | Type | For | Target |
|---|---|---|---|---|
| `alternatives` | human | list of wikilinks | typed edges, recall alternatives | [decision 0007](decisions/0007-typed-relations-in-frontmatter.md), proposed |
| `works_with` | human | list of wikilinks | typed edges | [decision 0007](decisions/0007-typed-relations-in-frontmatter.md), proposed |
| `reviewed_commit` | tool | commit SHA | drift | v0.2 |
| `public` | human | bool, default `false` | nests | v0.3 |
| `last_resurfaced` | tool | date | digest | later |

`packages` moved from this table into the active schema in v1, as a list of PURLs.

## Example

See [examples/vault/_templates/repo-note.md](../examples/vault/_templates/repo-note.md) for the blank template and [seed-repos.md](seed-repos.md) for content to turn into example notes.
