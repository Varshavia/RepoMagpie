# Glossary

One definition per term. Docs, code and CLI output use these words with these meanings.

## Product terms

| Term | Definition |
|---|---|
| **Agent Skills** | The open standard for agent skills (<https://agentskills.io>). See [standards](standards.md). |
| **completed skill line** | A skill line with text after the dash. Search returns it as its own result ([decision 0006](decisions/0006-skills-as-searchable-lines.md)). |
| **core** | The module that holds all business logic. `magpie` and the MCP server are thin layers over it ([decision 0002](decisions/0002-cli-first.md), [architecture](architecture.md)). |
| **draft** | Content the tool writes once, at note creation, into a human-owned field or section: `kind`, `tags`, `install`, "What it does". The user may change it; the tool never touches it again. |
| **empty skill line** | A skill line with nothing after the dash. Search ignores it. |
| **human-owned** | A field or section only the user changes after creation: every frontmatter field that isn't tool-owned, and all body sections. See [note schema](note-schema.md), rule 2. |
| **inbox** | The `status` of a note that is not yet reviewed. It is the only such state, whatever created the note (manual add, `magpie add`, any future import). |
| **journal** | All of a user's notes, taken together. Product copy also calls a note a *journal entry*. |
| **kind** | The frontmatter field that says what a repository is: `skill-pack`, `cli`, `library`, and so on. The list is in the [note schema](note-schema.md). |
| **magpie** | The RepoMagpie command-line tool, e.g. `magpie add <url>`. Not built yet. |
| **MCP server** | A planned thin layer over the core for agent clients without a shell ([decision 0002](decisions/0002-cli-first.md)). |
| **note** | One Markdown file with YAML frontmatter that describes one repository, at `<vault>/repos/<owner>--<repo>.md`. |
| **repository** (repo) | A GitHub repository. Each repository has at most one note. |
| **reviewed** | The `status` of a note whose "When it's useful" section has at least one bullet written by the user. |
| **search index** | A cache built from the notes to answer searches. It can be deleted and rebuilt from the files at any time ([decision 0001](decisions/0001-plain-markdown-storage.md)). |
| **skill** | A folder with a `SKILL.md` file, following the Agent Skills standard. In RepoMagpie a skill is recorded as a skill line, never as its own note. |
| **skill line** | One line under "Notable skills" in a note: `` - `skill-name` — when it's useful ``. |
| **skill pack** | A repository whose main content is agent skills. Its `kind` is `skill-pack`. |
| **`SKILL.md`** | The file that defines a skill. RepoMagpie detects these files in a repository, and ships its own `SKILL.md` that teaches agents to use `magpie` (roadmap step 7). |
| **status** | The frontmatter field with the review state of a note: `inbox` or `reviewed`. |
| **tag** | A lowercase, kebab-case label in a note's `tags` field, chosen by the user from the tag list. |
| **tag list** | The single shared list of allowed tags, in `<vault>/tags.md`. |
| **the tool** | RepoMagpie's own code (`magpie` and the core it calls), as opposed to the user. Used in *tool-owned* and *the tool may draft*. |
| **tool-owned** | A field the tool fills and may refresh: `name`, `url`, `language`, `license`, `topics`, and `explored` (set once). |
| **topic** | A label the repository's owner set on GitHub. Stored raw in `topics`; the tool uses topics to suggest tags. A topic is not a tag. |
| **vault** | The folder that holds a user's notes and tag list. It lives outside this repository ([decision 0003](decisions/0003-vault-outside-repo.md)). How `magpie` finds it is TBD (roadmap step 2). |
| **"When it's useful"** | The body section the user writes in their own words: one concrete situation per bullet. The tool never writes it ([decision 0005](decisions/0005-human-written-usefulness.md)). |

## Project terms

| Term | Definition |
|---|---|
| **decision record** | A short file in `docs/decisions/` that records one significant decision: status, context, decision, consequences. An accepted record only gets editorial edits; any other change needs a new record that supersedes it. |
| **editorial edit** | A change to an accepted decision record that fixes typos, broken links or terminology without changing its substance. Defined in [decisions/README.md](decisions/README.md). |
| **example vault** | `examples/vault/`: the vault in this repository that holds sample notes, built from the seed repositories. It is the only place notes live in this repo. |
| **git-guard** | The agent hook in `.claude/hooks/` that lets coding agents run only read-only git and gh commands. |
| **Obsidian extras** | Optional roadmap parts that need Obsidian (Templater template, Dataview queries). Notes, `magpie`, search and the agent skill work without them. |
| **scratch space** | `.scratch/`: the git-ignored folder for temporary files that agents create. |
| **seed repository** (seed repo) | One of the first repositories explored for this project, listed in [seed-repos.md](seed-repos.md). Each becomes a note in the example vault. |
| **work log** | The private, git-ignored log of agent work in `.worklog/`, one file per day. |
