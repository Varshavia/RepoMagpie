# Glossary

One definition per term. Docs, code and CLI output use these words with these meanings.

## Product terms

| Term | Definition |
|---|---|
| **adopt** | Planned (v0.1): `magpie adopt <name>` copies a note from the personal journal into the project journal and prints the install command. It never installs anything. See [ideas](ideas.md), idea 11. |
| **Agent Skills** | The open standard for agent skills (<https://agentskills.io>). See [standards](standards.md). |
| **completed skill line** | A skill line with text after the dash. Search returns it as its own result ([decision 0006](decisions/0006-skills-as-searchable-lines.md)). |
| **core** | The module that holds all business logic. `magpie` and the MCP server are thin layers over it ([decision 0002](decisions/0002-cli-first.md), [architecture](architecture.md)). |
| **daily find** | Planned (later): `magpie today` suggests one trending repository that matches the user's tags. Optional and quiet. See [ideas](ideas.md), idea 9. |
| **design token** | A named value in [`DESIGN.md`](../DESIGN.md), such as a colour, a type style, a spacing step or a radius. The local app uses the tokens as CSS custom properties, and the terminal theme for the demo GIF takes its colours from them, so every surface shares one visual language. |
| **digest** | Planned (later): a periodic "You saved X three months ago. Still useful?" list that resurfaces old notes. See [ideas](ideas.md), idea 6. |
| **draft** | Content the tool writes once, at note creation, into a human-owned field or section: `kind`, `tags`, "What it does", "Use when", and "Avoid when" from `import`'s `avoid:` text. A drafted section starts with `<!-- magpie:draft -->`; deleting the marker accepts it. The user may change a draft; the tool never touches it again ([decision 0018](decisions/0018-ai-drafts-humans-decide.md)). |
| **drift** | Planned (v0.2): a change upstream since the user reviewed a repository or skill. `magpie drift` lists notes with drift. See [ideas](ideas.md), idea 2. |
| **edit conflict** | A note changed on disk (in Obsidian, another editor or the CLI) after the local app read it. Every read returns the note's version, a SHA-256 hash of the file; a write with an old version gets 409, nothing is written, and the app offers to reload ([decision 0023](decisions/0023-api-is-the-json-contract.md)). |
| **empty skill line** | A skill line with nothing after the dash. Search ignores it. |
| **fail open** | When something goes wrong, do nothing rather than block. The recall hook prints nothing and exits 0 on any error, so an install is never stopped by `magpie` ([spec](spec.md), section 6). |
| **follow** | Planned (v0.3): `magpie follow <nest-url>` adds another user's public notes to your search results, attributed and kept apart from your notes. See [ideas](ideas.md), idea 3. |
| **gap** | Planned (v0.2): a dependency used in a project but missing from the journals, or a tag or kind with no reviewed notes. `magpie gaps` lists them. See [ideas](ideas.md), idea 5. |
| **graph levels** | Three possible graph views, all marketing only and not scheduled: level 1, an Obsidian graph preset for the example vault; level 2, `magpie graph`, an HTML file; level 3, the graph in nest pages. See [ideas](ideas.md), idea 10. |
| **human-owned** | A field or section only the user changes after creation: every frontmatter field that isn't tool-owned, and all body sections. See [note schema](note-schema.md), rule 2. |
| **import** | Planned (v0.1): `magpie import <file>`, the bulk form of `magpie note`, adds many notes at once from a file with one line per item: `- <url> — verdict: ... \| use: ... \| avoid: ...`. An explicit `verdict:` counts as human-written; `use:` and `avoid:` become drafts; text without a label goes to "My notes" ([note schema](note-schema.md), rule 7). |
| **inbox** | The `status` of a note that is not yet reviewed. It is the only such state, whatever created the note (by hand, `magpie note`, `magpie import`, `magpie init`). |
| **init** | Planned (v0.1 if time allows, otherwise v0.2): `magpie init` reads a project's manifests and creates draft notes for the dependencies already in use. See [ideas](ideas.md), idea 5. |
| **journal** | A folder of notes. There are two scopes with one format: the personal journal and the project journal ([decision 0013](decisions/0013-two-journal-scopes.md)). Product copy also calls a note a *journal entry*. |
| **journal discovery** | How `magpie` finds the journals: the personal journal by flag, `MAGPIE_HOME`, config file or default `~/.magpie/`; the project journal by `--project` (the project root) or by walking up from the working directory to the first `.magpie/`, stopping at the git root ([decision 0016](decisions/0016-journal-locations-and-config.md)). |
| **kind** | The frontmatter field that says what a repository is: `skill-pack`, `cli`, `library`, and so on. The list is in the [note schema](note-schema.md). |
| **lenient read, strict write** | `magpie` reads hand-written notes even when fields or sections are missing or out of order, but always writes notes in the canonical format, and never rewrites a human section ([note schema](note-schema.md), rule 8). |
| **live update** | A message from `magpie ui` to the local app, over Server-Sent Events, that notes changed on disk, so the app refreshes what it shows. The server watches both journals' `notes/` folders and also checks them every 5 seconds ([UI](ui.md), "Live updates"). |
| **local app** | Planned (v0.1): the Obsidian-inspired view of the journals in the browser, served by `magpie ui` on `127.0.0.1` only, while the user runs it. It reads and writes the same Markdown notes through the same core as the CLI. No remote server, no accounts ([decision 0021](decisions/0021-local-ui-server.md), [UI](ui.md)). |
| **magpie** | The RepoMagpie command-line tool, e.g. `magpie note pdfkit "avoid: …"`. `magpie note <url> "…"` also fetches the repository's facts from GitHub. Not built yet. |
| **MCP server** | A planned thin layer over the core for agent clients without a shell ([decision 0002](decisions/0002-cli-first.md)). |
| **nest** | Planned (v0.3): a static site built by `magpie publish` from the notes a user marked public. See [ideas](ideas.md), idea 3. |
| **note** | One Markdown file with YAML frontmatter about one subject (a GitHub repository or a registry package), at `<journal>/notes/<file>.md`. Its `id` is a PURL ([note schema](note-schema.md), [decision 0017](decisions/0017-package-identity-purl.md)). |
| **personal journal** | The user's own journal: a folder outside any repository, private by default. It holds anything the user explored and judged: repositories, skills, tools ([decision 0013](decisions/0013-two-journal-scopes.md)). |
| **proactive recall** | Planned (v0.1): when an agent is about to install a package, RepoMagpie shows the user's note on it from both journals. It informs and never blocks. Hook mode runs from an agent hook (Claude Code at launch); skill mode relies on `SKILL.md` and `magpie recall <package>`. See [ideas](ideas.md), idea 1. |
| **project journal** | A journal in `.magpie/` inside a project repository, committed with the code, so the team shares it through git. It is as visible as the repository ([decision 0013](decisions/0013-two-journal-scopes.md)). |
| **PURL** (Package URL) | The standard identifier for a package (ECMA-427): `pkg:npm/pdfkit`, `pkg:pypi/requests`, `pkg:github/owner/repo`. Every note's `id` is a PURL, and its file name derives from it ([decision 0017](decisions/0017-package-identity-purl.md)). |
| **repository** (repo) | A GitHub repository. Each repository has at most one note. |
| **reviewed** | The `status` of a note whose Verdict has human-written text ([decision 0018](decisions/0018-ai-drafts-humans-decide.md)). |
| **search index** | A cache built from the notes to answer searches. It can be deleted and rebuilt from the files at any time ([decision 0001](decisions/0001-plain-markdown-storage.md)). |
| **session token** | A random secret that `magpie ui` creates each time it starts. It is in the URL the command prints, is exchanged once for an `HttpOnly` cookie, and is sent again in a header on every write. Without it, no other page or process can use the local app's API ([UI](ui.md), "Security"). |
| **skill** | A folder with a `SKILL.md` file, following the Agent Skills standard. In RepoMagpie a skill is recorded as a skill line, never as its own note. |
| **skill line** | One line under "Notable skills" in a note: `` - `skill-name` — when it's useful ``. |
| **skill pack** | A repository whose main content is agent skills. Its `kind` is `skill-pack`. |
| **`SKILL.md`** | The file that defines a skill. RepoMagpie detects these files in a repository, and ships its own `SKILL.md` that teaches agents to use `magpie` (roadmap v0.1). |
| **status** | The frontmatter field with the review state of a note: `inbox` or `reviewed`. |
| **suggest** | Planned (v0.1): `magpie suggest` shows notes from both journals that fit a project, from its manifests and README or a free-text description, verdict first. In v0.1 magpie narrows candidates by keyword and tags, and the coding agent makes the final choice. See [ideas](ideas.md), idea 4. |
| **tag** | A lowercase, kebab-case label in a note's `tags` field, chosen by the user from the tag list. |
| **tag list** | The single shared list of allowed tags, in `<vault>/tags.md`. |
| **the tool** | RepoMagpie's own code (`magpie` and the core it calls), as opposed to the user. Used in *tool-owned* and *the tool may draft*. |
| **tool-owned** | A field the tool fills and may refresh: `id`, `name`, `url`, `language`, `license`, `topics`, `packages`, and `explored` and `adopted` (both set once). |
| **topic** | A label the repository's owner set on GitHub. Stored raw in `topics`; the tool uses topics to suggest tags. A topic is not a tag. |
| **typed relation** | Proposed ([decision 0007](decisions/0007-typed-relations-in-frontmatter.md)): a link between two notes with a meaning, stored in the human-owned `alternatives` or `works_with` field. See [ideas](ideas.md), idea 10. |
| **"Use when" / "Avoid when"** | Two body sections: concrete situations where the subject fits, and where it hurt or doesn't fit, one per bullet. "Use when" may start as an AI draft; both are human-owned ([note schema](note-schema.md)). They replace "When it's useful" from schema v0. |
| **vault** | The folder of a journal, as Obsidian calls it. The user's vault is their personal journal and lives outside this repository ([decision 0003](decisions/0003-vault-outside-repo.md)); `examples/vault/` is the example vault. How `magpie` finds journals is TBD (roadmap step 2). |
| **verdict** | The one line in a note that says what the user decided about a package or tool, for example "avoid: async streams painful; use puppeteer". Recall and suggest show it first. Human-written only; a note without one stays `inbox` ([decision 0018](decisions/0018-ai-drafts-humans-decide.md), [note schema](note-schema.md)). |
| **vet** | Planned (v0.2, reduced): recording your own review of a repository or skill, and the commit you reviewed, in the note, with links to existing scanners. RepoMagpie builds no scanner ([decision 0011](decisions/0011-vet-and-drift-reduced.md)). See [ideas](ideas.md), idea 2. |

## Project terms

| Term | Definition |
|---|---|
| **decision record** | A short file in `docs/decisions/` that records one significant decision: status, context, decision, consequences. A record may be revised on its branch until it is merged to `main`; after that it only gets editorial edits, and any other change needs a new record that supersedes it. |
| **editorial edit** | A change to a decision record merged to `main` that fixes typos, broken links or terminology without changing its substance. Defined in [decisions/README.md](decisions/README.md). |
| **example vault** | `examples/vault/`: the vault in this repository that holds sample notes, built from the seed repositories. It is the only place notes live in this repo. |
| **git-guard** | The agent hook in `.claude/hooks/` that lets coding agents run only read-only git and gh commands, and blocks shell commands that write files (in-place edits, `tee`, redirection to a file, PowerShell `Set-Content`/`Add-Content`/`Out-File`), so files are written only with the Edit/Write tools. |
| **Obsidian extras** | Optional parts that need Obsidian (Templater template, Dataview queries, graph preset). Notes, `magpie`, search and the agent skill work without them. |
| **scratch space** | `.scratch/`: the git-ignored folder for temporary files that agents create. |
| **seed repository** (seed repo) | One of the first repositories explored for this project, listed in [seed-repos.md](seed-repos.md). Each becomes a note in the example vault. |
| **work log** | The private, git-ignored log of agent work in `.worklog/`, one file per day. |
