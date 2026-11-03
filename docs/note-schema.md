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

Cargo names are case-sensitive, so two crates whose names differ only in case (`Inflector`, `inflector`) map to the same file. (npm and PyPI PURLs are lowercased, so they can't clash.) v0.1 rejects the second one with an error that names both PURLs and the file.

## Frontmatter

| Field | Required | Type | Owner | Notes |
|---|---|---|---|---|
| `id` | yes | PURL | tool | The subject: `pkg:github/<owner>/<repo>` or a package PURL, without a version |
| `name` | yes | string | tool | Display name |
| `url` | no | string | tool | Canonical URL: the GitHub repository or the registry page |
| `language` | no | string | tool | Primary language from GitHub |
| `license` | no | string | tool | An SPDX identifier, `mixed` if licensing differs per skill or file, or `unknown` if none was found ([decision 0020](decisions/0020-unknown-license.md)) |
| `topics` | no | list | tool | Raw GitHub topics; the source for drafted tags and tag suggestions ([decision 0030](decisions/0030-github-topics-become-tags.md)) |
| `packages` | no | list of PURLs | tool | Packages this subject publishes, e.g. `["pkg:npm/%40playwright/cli"]`. Recall matches them |
| `explored` | yes | date | tool | Date the note was created (YYYY-MM-DD); set once, never refreshed |
| `adopted` | no | date | tool | Project journal only: the date `repomagpie adopt` copied this note from the personal journal ([spec](spec.md)) |
| `kind` | yes | enum | human (tool drafts at creation) | See below |
| `tags` | yes | list | human (tool drafts at creation) | Lowercase, kebab-case, from the journal's tag list. Drafted from a repository's GitHub topics (rule 5) |
| `domains` | no | list | human | The concerns the subject addresses, that you confirmed: at most 3 of the 16 domains below ([decision 0040](decisions/0040-domains-a-second-axis.md)). Written after `tags`, only when not empty |
| `domains_suggested` | no | list | tool (at creation; `repomagpie domains --suggest`) | Domains RepoMagpie suggested from the topics and tags, at most 3; never written by an agent. Confirming one moves it to `domains`. Search counts it at half weight |
| `tried` | yes | bool | human (default `false`) | Have you actually run it? |
| `rating` | no | 1–5 | human | Leave empty until tried |
| `status` | yes | enum | human (tool sets it at creation) | `inbox` or `reviewed`; see rule 1 |
| `alternatives` | no | list of wikilinks | human | Subjects to use instead, as quoted strings: `alternatives: ["[[npm--puppeteer]]"]`. One side is enough: the other note shows the relation too ([decision 0027](decisions/0027-alternatives-active.md)). A target may have no note yet. A value that isn't a list of strings makes only this field unreadable |

### `kind` values

`skill-pack` · `cli` · `library` · `framework` · `plugin` · `app` · `platform` · `awesome-list` · `template` · `other`

The kind says what the subject is, by how you use it. Each has one deciding question:

| Kind | Deciding question | Examples |
|---|---|---|
| `library` | You import it from your code. An SDK is a library. | zod, axios, pdf-lib |
| `framework` | It calls your code: you build inside it, and it sets the structure your code follows. | nest, vitest, scrapy |
| `app` | You run it and use it, through its own UI or as a server your code calls (a database, a search engine, a web server). | immich, excalidraw, meilisearch |
| `platform` | You deploy or build other things on it, often self-hosted, with users and projects. | supabase, coolify, dify |
| `cli` | Its main use is a command you type. | yt-dlp, trivy, docker compose |
| `skill-pack` | Its main content is agent skills. | mattpocock/skills |
| `plugin` | It extends one named host: an editor, an agent, a build tool. | a VS Code extension |
| `template` | You copy it to start a project. | a starter repository |
| `awesome-list` | It is a curated list of links. | awesome-javascript |
| `other` | None of these. A GitHub Action is `other`: there is no kind for one. | actions/checkout |

When two fit, the first rule below that applies decides:

1. **What it is beats what it's about.** A list of tools is an `awesome-list`, and a starter for a framework is a `template`, whatever their topics say.
2. **Its main content wins.** A plugin whose content is skills is a `skill-pack`; a library or framework that also ships skills for its users stays a `library` or `framework`.
3. **Its main use wins over how it's shipped.** A command published as a package (yt-dlp on PyPI) is a `cli`; a library with a small command next to it stays a `library`.
4. **`framework` over `library` when it runs the main flow** (the server, the test run, the crawl) and you fill in the parts. One you mount inside something else, or call when you need it, stays a `library` (trpc, better-auth).
5. **`platform` over `app` when you build or deploy other things on it**; one you use for its own task stays an `app`, even when it calls itself a platform (grafana, umami).
6. **Its own name decides only when the questions don't.** A CSS framework has no import and calls no code, so its name settles it (tailwindcss is a `framework`). A name the questions contradict loses: a project calling itself a framework that you copy to start is a `template`.

### `domains` values

`kind` says what a thing is; a domain says what concern it addresses. The list is fixed, the same in every journal, and shown to agents with these definitions ([decision 0040](decisions/0040-domains-a-second-axis.md); the last four, and `frontend` for `styling`, from [decision 0055](decisions/0055-four-domains-and-frontend.md)):

| Domain | Covers |
|---|---|
| `architecture` | Structure, patterns, state management and application frameworks |
| `security` | Vulnerabilities, secrets, hardening and input validation |
| `performance` | Speed, caching, bundle size and profiling |
| `frontend` | UI frameworks, components, CSS and design systems |
| `database` | Databases, ORMs, migrations and storage |
| `testing` | Unit tests, end-to-end tests and mocking |
| `auth` | Sign-in, sessions and permissions |
| `api` | HTTP, RPC, API clients and servers |
| `devops` | Build, deploy, CI and containers |
| `observability` | Logging, metrics, tracing and error tracking |
| `ai` | LLMs, agents, embeddings and MCP |
| `tooling` | Developer tools, CLIs, linters, formatters and editors |
| `mobile` | Android, iOS and cross-platform mobile apps |
| `data` | Analytics, data visualization and ETL pipelines (databases are `database`) |
| `docs` | Documentation sites, generators and API references |
| `payments` | Payments, checkout and billing |

```yaml
tags: [supabase, postgresql]
domains: [database, auth]
domains_suggested: [security]
```

- A note may have none. More than 3 means the subject is a platform: pick the 3 that matter to you.
- A value outside the list (a typo, a domain from a later release) is kept in the file. Search and the app ignore it; `repomagpie doctor` reports it as an unknown domain.
- `styling`, the name `frontend` had before [decision 0055](decisions/0055-four-domains-and-frontend.md), still counts as `frontend`: in a note, a flag, a search and a link. RepoMagpie writes `frontend` when it rewrites the list `styling` is in; until then the file keeps `styling`, and `doctor` doesn't report it.
- A domain is in one field only. Removing one deletes it from whichever field holds it; a field left empty stays as `[]`, so `domains --suggest` doesn't fill it again.

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

## Links

A note links to another with a wikilink: `[[target]]`, `[[target|label]]` or `[[target#heading]]` (the heading is ignored for resolving). Links count in every body section and in `alternatives`; links inside code spans and fenced code blocks don't. A link resolves within the same journal, ignoring case:
1. to the note whose file name, without `.md`, is the target: `[[npm--pdfkit]]`;
2. otherwise, to the one note whose `name` is the target: `[[pdfkit]]`;
3. otherwise it is unresolved: no such note (`missing`), or several notes with that name (`ambiguous`). That is allowed: `[[puppeteer]]` can name a subject you have no note on yet.

There are no links across journals. Obsidian resolves a wikilink by file name, so a link by file stem (rule 1, what the app's `[[` autocomplete writes) works there too; a link by `name` (rule 2) resolves in magpie only.

## Rules

1. **Status.** A note is `inbox` until its Verdict has human-written text ([decision 0018](decisions/0018-ai-drafts-humans-decide.md)); then it is `reviewed`. The tool sets `status` when it writes a note. When reading, a note with an empty Verdict counts as `inbox`, whatever its `status` field says.
2. **Ownership.**
   - **Tool-owned:** `id`, `name`, `url`, `language`, `license`, `topics`, `packages`, `explored`, `adopted`, `domains_suggested`. The tool writes `domains_suggested` at creation, and on existing notes only when you run `repomagpie domains --suggest`, which fills it on notes with neither domain field. `explored` and `adopted` are set once; the tool may refresh the others. It never replaces a `license` value with `unknown`, so a licence the user corrected stays.
   - **Human-owned:** `kind`, `tags`, `domains`, `tried`, `rating`, `status`, `alternatives`, and all body sections. The tool never writes `alternatives` on its own; the local app writes it only when you add or remove one, and `repomagpie note --alternative` only when you name one ([decision 0029](decisions/0029-recall-names-alternatives.md)). Either changes only that entry: the others stay exactly as written, labels included.
   - The tool writes `tags` after creation only when you ask: an edit in the local app, or "Add GitHub topics as tags" (`repomagpie tags --from-topics`), which adds topics until the note has 8 tags and never removes or reorders one ([decision 0030](decisions/0030-github-topics-become-tags.md)). Either is a human edit.
   - **At creation only**, the tool may write drafts of `kind` (from GitHub data, [decision 0030](decisions/0030-github-topics-become-tags.md); `library` for a registry package name without it, [decision 0039](decisions/0039-a-registry-package-note-starts-as-library.md)), `tags` (up to 8 from GitHub topics, rule 5), "What it does" and "Use when". From GitHub, the kind follows the deciding questions above as far as the repository's data can say: it reads the topics, the root manifests' keywords, the root's files and folders and the start of the README ([decision 0047](decisions/0047-kind-rules-measured.md)); `domains_suggested` also reads the keywords, the README's start and a root `action.yml`, and "What it does" takes the README's first sentence when the repository has no description; the README and the keywords themselves are never written to the note ([decision 0046](decisions/0046-classification-signals.md)). It writes the Verdict, "Use when" and "Avoid when" only from the user's own input (rule 7). It also writes defaults: `tried: false`, `rating` empty, `status` per rule 1.
   - **After creation**, the tool never modifies human-owned fields or sections on its own, with one exception: it may append a line for a skill not yet listed under "Notable skills" ([decision 0006](decisions/0006-skills-as-searchable-lines.md)). It never edits, reorders or removes existing lines. "Use when" and "Avoid when" items you give later are appended as rule 7 says.
3. **Drafts.** A drafted section starts with the line `<!-- magpie:draft -->`. AI may draft only "What it does" and "Use when". "Avoid when" may also be a draft when it comes from the user's own `avoid:` text in `repomagpie import` (rule 7). The Verdict is never a draft. Deleting the marker accepts the draft. Search, suggest and recall label draft text as a draft.
4. **Notable skills.** The tool writes detected skill names only, as `` - `skill-name` — `` with nothing after the dash. The user completes the ones worth remembering. Lines with nothing after the dash are ignored by search.
5. **Tags** come from the journal's tag list (`<journal>/tags.md`), so the same idea isn't spelled three ways. Across the two journals, tags match by name. The tag list has one list line per tag, optionally with its meaning: ``- `testing` — tests and end-to-end checks``. Other lines are ignored. A new journal starts with a starter list of ten tags ([spec](spec.md), section 3); edit it freely. A journal with notes but no `tags.md` gets the starter list only when you ask for it ("Create tag list" in the local app).
   - **GitHub topics become tags** ([decision 0030](decisions/0030-github-topics-become-tags.md)). When a note for a GitHub repository is created, its topics become its tags: only valid tags, not the repository's own name, not a topic on the stop list (`hacktoberfest`, `hacktoberfest` with a year, `open-source`, `opensource`, `good-first-issue`), at most 8. Topics already in `tags.md` come first, then topics another note in the journal also carries (in its `topics` or `tags`), then the rest; within each group, GitHub's (alphabetical) order. A slot the topics leave may take a root manifest's keyword, only one already in `tags.md` or on another note ([decision 0046](decisions/0046-classification-signals.md)). "Add GitHub topics as tags" uses the same rule for existing notes.
   - Each of these tags not yet in `tags.md` is appended to it as ``- `<tag>` `` in the same save. A journal without `tags.md` gets one with a `# Tags` heading and just those tags. Clicking a "From GitHub topics" chip appends its tag the same way.
   - **Aliases** ([decision 0041](decisions/0041-structured-search.md)): other spellings of a tag, in parentheses after it: ``- `postgresql` (postgres, psql) — the PostgreSQL database``. A topic or a `--tag` spelled as an alias means the tag (`postgres` becomes `postgresql` when a note is created), and a search word that is exactly an alias finds the tag too. A starter list of common spellings ships with RepoMagpie (`nextjs` for `next.js`, `kubernetes` for `k8s`, …); a line in your `tags.md` wins over it. `repomagpie tags --merge postgres postgresql` rewrites the tag in every note and adds the alias.
6. **One note per subject.** A PURL appears in at most one note per journal, as its `id` or in its `packages`. A repository note that lists `pkg:npm/pdfkit` is the note for that package too.
7. **User input.**
   - `repomagpie note <name-or-url> "text"`: the text is the Verdict (human-written).
   - `repomagpie note <name-or-url> --use-when "…" --avoid-when "…"`, the MCP `note` tool's `use_when` and `avoid_when`, and the local app's "Use when" and "Avoid when" fields: each item is one human-written bullet, never a draft. How they meet what a section already holds:
     - an empty section gets the items;
     - a section that holds only a draft (rule 3) is replaced by them: your words win over a draft;
     - a section with your own items keeps every line as written and gets the new items after the last one, with the same bullet marker and line endings; an item already there (ignoring case) isn't added twice.

     ```markdown
     ## Use when
     - filling in an existing PDF form
     - adding a page to a PDF a user uploaded
     ```
   - `repomagpie import` reads one line per item: `- <url-or-name> — verdict: ... | use: ... | avoid: ...`. An explicit `verdict:` counts as human-written. `use:` and `avoid:` become draft "Use when" and "Avoid when" sections (rule 3). Text without a label goes to "My notes".
8. **Lenient read, strict write.**
   - Read hand-written notes even when frontmatter fields or sections are missing, misordered or extra.
   - HTML comments (`<!-- … -->`) aren't note text: the Verdict, search, recall and the items of "Use when" and "Avoid when" leave them out, and a `<!--` that never closes leaves out the rest of its line. The file keeps them.
   - Write notes in the canonical format above.
   - Never rewrite a human section; edits that preserve formatting and comments are required for frontmatter changes.

## Planned fields (not active)

These fields are planned for later releases ([ideas](ideas.md)). They are **not** part of the active schema or the template.

| Field | Owner | Type | For | Target |
|---|---|---|---|---|
| `works_with` | human | list of wikilinks | typed edges | [decision 0007](decisions/0007-typed-relations-in-frontmatter.md), proposed |
| `reviewed_commit` | tool | commit SHA | drift | v0.3 |
| `public` | human | bool, default `false` | nests | v0.4 |
| `last_resurfaced` | tool | date | digest | later |

`packages` moved from this table into the active schema in v1, as a list of PURLs; `alternatives` in v0.2 ([decision 0027](decisions/0027-alternatives-active.md)).

## Example

See [examples/vault/_templates/repo-note.md](../examples/vault/_templates/repo-note.md) for the blank template and [seed-repos.md](seed-repos.md) for content to turn into example notes.
