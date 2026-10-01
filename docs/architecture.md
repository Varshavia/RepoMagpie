# Architecture

How RepoMagpie fits together. Nothing is built yet. Anything not decided is marked **TBD (roadmap step 2)**. Terms are defined in the [glossary](glossary.md).

## Layers

From [decision 0002](decisions/0002-cli-first.md): business logic lives in one core module; every interface is a thin layer over it.

```
human ─────────────────────► magpie (CLI) ──┐
agent with a shell ─► SKILL.md ─► magpie ───┤
agent without a shell ─► MCP server ────────┴─► core ─┬─► vault (Markdown files)
                                                      └─► search index (cache)
```

| Layer | Job | When |
|---|---|---|
| **core** | Reads and writes notes, applies the ownership rules of the [note schema](note-schema.md), fetches repository data from GitHub, builds and queries the search index. | Steps 5–6 |
| **cli** | `magpie`: parses arguments, calls the core, prints short, parseable output. A `--json` flag is under consideration (decision 0002). | Steps 5–6 |
| **skill** | RepoMagpie's own `SKILL.md`: teaches agents to call `magpie`. Contains no logic. | Step 7 |
| **mcp** | Optional MCP server over the same core, for clients without a shell. | Step 7 (optional) |

Decision 0002 also says "the core is a CLI". This document uses *core* only for the business-logic module.

Implementation language: **TBD (roadmap step 2)**.

## Storage

- **Notes** are the only source of truth: plain Markdown with YAML frontmatter ([decision 0001](decisions/0001-plain-markdown-storage.md)).
- **Vault layout:** `<vault>/repos/<owner>--<repo>.md` for notes, `<vault>/tags.md` for the tag list ([note schema](note-schema.md)).
- **Search index:** a derived cache. It can be deleted and rebuilt from the notes at any time (decision 0001). Where it is stored and in what format: **TBD (roadmap step 2)**.
- **Embeddings** for semantic search: local model or API is **TBD (roadmap step 2)**. The default must work offline.

## Data flow: `magpie add <url>`

1. **Resolve the URL.** A repository URL names the repository. A skill URL resolves to its parent repository ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).
2. **Fetch from GitHub:** description, language, license, topics and README. Detect `SKILL.md` files (roadmap step 5). How the GitHub token, if any, is supplied: **TBD (roadmap step 2)**. What to record when GitHub reports no license: **TBD (roadmap step 2)**.
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
2. **Match** (roadmap step 6):
   - first, keyword search over frontmatter and text;
   - then, semantic search over "What it does" and "When it's useful".
3. **Results** are notes and completed skill lines (decision 0006). Empty skill lines are ignored (note schema, rule 3). Notes in `inbox` rank below `reviewed` notes ([decision 0005](decisions/0005-human-written-usefulness.md)).
4. **Output:** short and parseable, like every `magpie` command (decision 0002).

## Config resolution

- **Vault location:** how `magpie` finds the vault (config file, environment variable, flag) and in which order: **TBD (roadmap step 2)**.
- **Secrets** such as a GitHub token: **TBD (roadmap step 2)**. Agents working on this repository must read secrets from environment variables only (CLAUDE.md, section 10).
