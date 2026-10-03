# Architecture

How RepoMagpie fits together. Nothing is built yet; v0.1 is built from the [spec](spec.md). Terms are defined in the [glossary](glossary.md).

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
| **core** | Reads and writes notes in both journals ([decision 0013](decisions/0013-two-journal-scopes.md)), applies the ownership rules of the [note schema](note-schema.md), fetches repository data from GitHub, builds and queries the search index, and answers recall. | v0.1 |
| **cli** | `magpie`: parses arguments, calls the core, prints short, parseable output, plus a machine-readable mode such as `--json` on every command ([decision 0008](decisions/0008-machine-readable-output.md)). | v0.1 |
| **skill** | RepoMagpie's own `SKILL.md`: teaches agents to call `magpie`. Contains no logic. | v0.1 |
| **hook** | The Claude Code adapter (`magpie hook claude-code`): reads the hook's JSON, finds package installs, asks the core for recall, and prints the hook's JSON. It never blocks and fails open ([spec](spec.md), section 6). | v0.1 |
| **mcp** | Optional MCP server over the same core, for clients without a shell. | later |

Decision 0002 calls the CLI the primary interface and uses *core* for the business-logic module, as this document does.

Implementation: TypeScript on Node.js, ESM ([decision 0015](decisions/0015-typescript-on-node.md)); libraries in the [spec](spec.md), section 9.

### Module layout

```
src/
  core/        journals: discovery and config (decision 0016)
               notes: lenient read, strict write, round-trip-safe frontmatter edits
               identity: PURL resolution and file names (decision 0017)
               index: build, cache and query (MiniSearch)
               match: recall and suggest rules
               github: repository metadata and SKILL.md detection
  cli/         one module per command; human and --json output
  hook/        claude-code.ts: stdin JSON → install detection → recall → stdout JSON
skill/
  SKILL.md     no code
test/          node:test; fixture journals; no network
```

`cli/` and `hook/` import from `core/` only. `core/` never prints and never reads `process.argv`.

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
- **Journals:** a personal journal outside any repository, and a project journal in `.magpie/` inside a project repository, with the same format ([decision 0013](decisions/0013-two-journal-scopes.md)). Layout: `<journal>/notes/<file>.md` for notes, with the file name derived from the note's PURL (`npm--pdfkit.md`, `github--owner--repo.md`), and `<journal>/tags.md` for the tag list ([note schema](note-schema.md), [decision 0017](decisions/0017-package-identity-purl.md)).
- **Search index:** a derived cache in `<journal>/.cache/`, one per journal, git-ignored (the project journal gets a `.magpie/.gitignore` with `.cache/`). It is rebuilt when a note file is newer than the index, and can be deleted at any time (decision 0001).
- **Embeddings:** not in v0.1 ([spec](spec.md), section 10). Semantic search is planned for v0.3; the default must work offline.

## Data flow: recall before an install

1. **The hook fires.** In Claude Code, a `PreToolUse` hook on the `Bash` or `PowerShell` tool runs `magpie hook claude-code` with the tool call as JSON on stdin.
2. **Find installs.** The hook splits the command line the way git-guard does and picks out install commands and their package names ([spec](spec.md), section 6).
3. **Look up notes** for those packages in the project and personal journals: an exact PURL match first, then a name-only match, marked as lower confidence ([spec](spec.md), section 5).
4. **Inform, never block.** If a note matches, the hook returns its Verdict as `additionalContext` for the agent and `systemMessage` for the user, and sets no permission decision. If nothing matches, or anything fails, it prints nothing and exits 0.
5. **Skill mode** in other clients: `SKILL.md` tells the agent to run `magpie recall <package>` itself before installing.

## Data flow: `magpie note <name-or-url> "text"`

`magpie import <file>` runs the same flow once per line ([decision 0010](decisions/0010-v0-1-scope.md)).

1. **Resolve the target** to a PURL: a URL, a PURL, or a bare name typed by the nearest manifest ([spec](spec.md), section 4). A skill URL resolves to its parent repository ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).
2. **URL only, fetch from GitHub:** description, language, license, topics and README. Detect `SKILL.md` files. A token, if any, comes from the `GITHUB_TOKEN` environment variable. No licence found: record `unknown` ([decision 0020](decisions/0020-unknown-license.md)). If the network fails, write the note without metadata and warn.
3. **No note yet:** write a new note with:
   - the user's text, as the Verdict (note schema, rule 7);
   - for a URL: tool-owned fields, drafts of `kind`, `tags` (suggested from topics), "What it does" and "Use when" ([decision 0018](decisions/0018-ai-drafts-humans-decide.md)), and one empty skill line per detected skill;
   - defaults: `tried: false`, and `status` per note schema rule 1 (`reviewed` once the user gave a Verdict, otherwise `inbox`).
4. **Note exists:** append skill lines for skills not listed yet, and refresh tool-owned fields. Write the Verdict only if it is empty; never overwrite one ([spec](spec.md), section 2). Never change other human-owned fields or sections (note schema, rule 2).
5. **Search index:** marked stale; the next command that needs it rebuilds it.

## Data flow: `magpie search "<query>"`

1. **Get the index:** reuse the cached index of each journal if it is newer than every note; otherwise rebuild it.
2. **Match**, across both journals:
   - keyword search over frontmatter and text (roadmap v0.1);
   - semantic search over the note text (roadmap v0.3).
3. **Results** are notes and completed skill lines (decision 0006). Empty skill lines are ignored (note schema, rule 4). Notes in `inbox` rank below `reviewed` notes ([decision 0018](decisions/0018-ai-drafts-humans-decide.md)).
4. **Output:** short and parseable, like every `magpie` command (decision 0002), with a machine-readable mode (decision 0008).

## Config resolution

([Decision 0016](decisions/0016-journal-locations-and-config.md), [spec](spec.md) section 3.)
- **Personal journal:** `--home <dir>` > `MAGPIE_HOME` > `personal_journal` in `~/.magpie/config.yaml` > `~/.magpie/` (Windows: `%USERPROFILE%\.magpie`).
- **Project journal:** `--project <dir>`, or the first `.magpie/` found walking up from the working directory, stopping at the git root or the filesystem root. The personal journal's folder is never taken as a project journal.
- **Secrets** such as a GitHub token come only from environment variables (`GITHUB_TOKEN`). Agents working on this repository must read secrets from environment variables only (CLAUDE.md, section 10).
