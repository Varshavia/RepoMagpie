# Architecture

How RepoMagpie fits together. Nothing is built yet. Anything not decided is marked **TBD (roadmap step 2)**. Terms are defined in the [glossary](glossary.md).

## Layers

From [decision 0002](decisions/0002-cli-first.md): business logic lives in one core module; every interface is a thin layer over it.

```
human ─────────────────────► magpie (CLI) ──┐
agent with a shell ─► SKILL.md ─► magpie ───┤
agent hook (recall) ─► magpie ──────────────┤
agent without a shell ─► MCP server ────────┴─► core ─┬─► personal journal (Markdown files)
                                                      ├─► project journal (.magpie/)
                                                      └─► search index (cache)
```

| Layer | Job | When |
|---|---|---|
| **core** | Reads and writes notes in both journals ([decision 0013](decisions/0013-two-journal-scopes.md)), applies the ownership rules of the [note schema](note-schema.md), builds and queries the search index, and answers recall. | v0.1 |
| **cli** | `magpie`: parses arguments, calls the core, prints short, parseable output, plus a machine-readable mode such as `--json` on every command ([decision 0008](decisions/0008-machine-readable-output.md)). | v0.1 |
| **skill** | RepoMagpie's own `SKILL.md`: teaches agents to call `magpie`. Contains no logic. | v0.1 |
| **hook** | An agent hook that calls `magpie recall` before a package install. Contains no logic. Claude Code first ([ideas](ideas.md), idea 1). | v0.1 |
| **mcp** | Optional MCP server over the same core, for clients without a shell. | later |

Decision 0002 calls the CLI the primary interface and uses *core* for the business-logic module, as this document does.

Implementation language: **TBD (roadmap step 2)**.

### Future components

Planned parts of the core and cli layers, by target release. Details: [product](product.md) and [ideas](ideas.md).

| Component | Layer | Job | Release |
|---|---|---|---|
| **graph generator** | core | Builds nodes and edges from the notes (repos, completed skill lines, tags, typed relations), with status, drift and `tried` for each node. Nothing is stored that can't be rebuilt (decision 0001). | not scheduled (marketing only) |
| `magpie graph` | cli | Writes the graph as one self-contained HTML file with the data embedded as JSON. | not scheduled (marketing only) |
| **publish pipeline** | core | Selects notes with `public: true` only, and builds the nest data: note list, graph and `/uses` view. | v0.3 |
| `magpie publish` | cli | Writes the nest as a static site. | v0.3 |

## Storage

- **Notes** are the only source of truth: plain Markdown with YAML frontmatter ([decision 0001](decisions/0001-plain-markdown-storage.md)).
- **Journals:** a personal journal outside any repository, and a project journal in `.magpie/` inside a project repository, with the same format ([decision 0013](decisions/0013-two-journal-scopes.md)). The current draft layout is `<journal>/repos/<owner>--<repo>.md` for notes and `<journal>/tags.md` for the tag list ([note schema](note-schema.md)). How notes are identified (by package or by repository) is redesigned in the step 2 spec ([decision 0010](decisions/0010-v0-1-scope.md)).
- **Search index:** a derived cache. It can be deleted and rebuilt from the notes at any time (decision 0001). Where it is stored and in what format: **TBD (roadmap step 2)**.
- **Embeddings** for semantic search: local model or API is **TBD (roadmap step 2)**. The default must work offline.

## Data flow: recall before an install

1. **The hook fires.** In Claude Code, a `PreToolUse` hook sees a shell command such as `npm install pdfkit` and calls `magpie recall` with the package names.
2. **Look up notes** for those packages in the personal and project journals.
3. **Inform, never block.** If a note matches, the hook passes its verdict to the agent and the user and lets the command run. If nothing matches, it stays silent.
4. **Skill mode** in other clients: `SKILL.md` tells the agent to run `magpie recall <package>` itself before installing.

How package names map to notes, and the output format: **TBD (roadmap step 2)**.

## Data flow: `magpie add <url>` (not scheduled)

`magpie add` is not in the v0.1 scope ([decision 0010](decisions/0010-v0-1-scope.md)); whether it is dropped, folded into `import` or scheduled later is open ([roadmap](roadmap.md), "Not scheduled"). The flow below is kept for reference.

1. **Resolve the URL.** A repository URL names the repository. A skill URL resolves to its parent repository ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).
2. **Fetch from GitHub:** description, language, license, topics and README. Detect `SKILL.md` files (roadmap v0.1). How the GitHub token, if any, is supplied: **TBD (roadmap step 2)**. What to record when GitHub reports no license: **TBD (roadmap step 2)**.
3. **No note yet:** write a new note with:
   - tool-owned fields;
   - drafts of `kind`, `tags` (suggested from topics), `install` and "What it does";
   - defaults: `status: inbox`, `tried: false`;
   - one empty skill line per detected skill;
   - an empty "When it's useful" section.
4. **Note exists:** append skill lines for skills not listed yet. Never change human-owned fields or sections (note schema, rule 2). Whether `add` also refreshes tool-owned fields: **TBD (roadmap step 2)**.
5. **Search index:** whether `add` updates it right away or search rebuilds it on demand: **TBD (roadmap step 2)**.

## Data flow: `magpie search "<query>"`

1. **Get the index:** build it from the notes, or reuse a fresh one (strategy **TBD (roadmap step 2)**).
2. **Match**, across both journals:
   - keyword search over frontmatter and text (roadmap v0.1);
   - semantic search over the note text (roadmap v0.3).
3. **Results** are notes and completed skill lines (decision 0006). Empty skill lines are ignored (note schema, rule 3). Notes in `inbox` rank below `reviewed` notes ([decision 0005](decisions/0005-human-written-usefulness.md)).
4. **Output:** short and parseable, like every `magpie` command (decision 0002), with a machine-readable mode (decision 0008).

## Config resolution

- **Journal locations:** how `magpie` finds the personal journal and the project journal (config file, environment variable, flag, current directory) and in which order: **TBD (roadmap step 2)**.
- **Secrets** such as a GitHub token: **TBD (roadmap step 2)**. Agents working on this repository must read secrets from environment variables only (CLAUDE.md, section 10).
