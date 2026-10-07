# Architecture

How RepoMagpie fits together. v0.1 is being built from the [spec](spec.md); the [roadmap](roadmap.md) says which parts exist. Terms are defined in the [glossary](glossary.md).

## Layers

From [decision 0002](decisions/0002-cli-first.md): business logic lives in one core module; every interface is a thin layer over it.

```
human ─────────────────────► magpie (CLI) ──┐
agent with a shell ─► SKILL.md ─► magpie ───┤
agent hook (recall) ─► magpie ──────────────┤
browser (local app) ─► magpie ui (server) ──┤
agent without a shell ─► MCP server ────────┴─► core ─┬─► personal journal (Markdown files)
                                                      ├─► project journal (.magpie/)
                                                      └─► search index (cache)
```

| Layer | Job | When |
|---|---|---|
| **core** | Reads and writes notes in both journals ([decision 0013](decisions/0013-two-journal-scopes.md)), applies the ownership rules of the [note schema](note-schema.md), fetches repository data from GitHub, builds and queries the search index, and answers recall. | v0.1 |
| **cli** | `magpie`: parses arguments, calls the core, prints short, parseable output, plus a machine-readable mode such as `--json` on every command ([decision 0008](decisions/0008-machine-readable-output.md)). | v0.1 |
| **skill** | RepoMagpie's own `SKILL.md` (`skills/repomagpie/`): teaches agents to call `magpie` with `--json`. Contains no logic. | v0.1 |
| **hook** | The Claude Code adapter (`magpie hook claude-code`): reads the hook's JSON, finds package installs, asks the core for recall, and prints the hook's JSON. It never denies (an avoid note asks the user; [decision 0024](decisions/0024-recall-asks-on-avoid-notes.md)) and fails open ([spec](spec.md), section 6). | v0.1 |
| **server** | `magpie ui`: a loopback-only HTTP server that serves the local app and a JSON API. It parses requests, calls the core and returns the same JSON documents as the CLI's `--json`; it has no logic of its own ([decision 0021](decisions/0021-local-ui-server.md), [decision 0023](decisions/0023-api-is-the-json-contract.md), [UI](ui.md)). | v0.1 |
| **app** | The local app: a static bundle in the browser that talks only to the server's API ([decision 0022](decisions/0022-frontend-stack.md)). | v0.1 |
| **mcp** | Optional MCP server over the same core, for clients without a shell. | later |

Decision 0002 calls the CLI the primary interface and uses *core* for the business-logic module, as this document does.

Implementation: TypeScript on Node.js, ESM ([decision 0015](decisions/0015-typescript-on-node.md)); libraries in the [spec](spec.md), section 9.

### Module layout

```
src/
  core/        journals: discovery and config (decision 0016)
               notes: lenient read, strict write, round-trip-safe frontmatter edits
               identity: PURL resolution and file names (decision 0017)
               note-cache: the caches in <journal>/.cache/ and their file signature (search, recall, note list, links)
               links: [[wikilinks]] and alternatives, resolved within a journal; the link index (decision 0026)
               graph: the graph's nodes and edges (tags, links, alternatives, similarity, missing notes) (decision 0028)
               search-index: one journal's index and its cache (MiniSearch)
               search: filters, ranking and results across journals
               install-detect: package installs in a shell command line
               recall: recall's matching rules, the journals it reads, its cache
               manifests: what a project's manifests and README say (dependencies, keywords, descriptions)
               suggest: suggest's keywords, scoring and the project's dependencies left out
               adopt: copying a personal note into the project journal; the install command
               github: repository metadata and SKILL.md detection
               capture: what note and import write for one item
               save: the journal to write to, saving one item; note and import runs with their --json documents
               documents: the shared JSON documents (Settings, Tag list, Note list, Note, Note preview) and editing a note
               edit: a person's edit of one note, checked and applied all or nothing; note versions (sha256)
               outcome: how a run ended, as an exit code (CLI) or an HTTP status (server)
  cli/         one module per command, loaded only when it runs; human and --json output
  hook/        claude-code.ts: tool call JSON → install detection → recall → ask or inform JSON
  server/      magpie ui, node:http only: server (security checks, routing, events stream), api (endpoints →
               core), live (fs.watch + signature check), open (the platform's open command)
ui/            the local app (decision 0022): React and Vite, built into dist/ui/ (npm run build)
  src/         App.tsx, components/ (one per pane and screen), api.ts (the only way to the journals),
               logic/ (pure, unit-tested: windowing, keys, text, edits, import labels, palette)
  e2e/         @playwright/test against magpie ui on a temporary journal; screenshots with SCREENS=1
skills/
  repomagpie/  the agent skill (Agent Skills format; the folder name is the skill's name), no code:
               SKILL.md, and references/json.md (the --json fields it reads); src/cli/skill.test.ts
               checks it against magpie --help and the spec's --json shapes
scripts/       the test runner with the ~/.magpie canary, the CLI's build (build-cli.ts: Vite bundles src/cli/main.ts
               into dist/cli/, decision 0025) and its check, benchmarks, the link check; not part of the package
```

Tests (`node:test`) sit next to the code they test as `*.test.ts`, with fixture journals in scratch folders under `.scratch/tests/` (each with its own `.git`, so no walk leaves it) and no network. `npm test` fails if the real `~/.magpie` changed during the run. The app's logic tests (`ui/src/logic/*.test.ts`) run in `npm test` too. Its end-to-end tests use `@playwright/test` against `magpie ui` on a journal in `.scratch/e2e/` ([decision 0022](decisions/0022-frontend-stack.md)) ([UI](ui.md), "Design process and testing").

`cli/`, `hook/` and `server/` import from `core/` only; the one exception is `cli/ui.ts`, which starts the server. A command's `--json` document is built in core, so the CLI prints and the server returns the same one. `core/` never prints and never reads `process.argv`. `ui/` reaches the journals only through the server's API. It imports only types from `core/` (the API's documents); what it needs at run time is mirrored, and tests keep each mirror equal to core's: the kinds, the draft marker, the avoid rule and the readable PURL in `ui/src/logic/schema.ts`, the import item rule and its no-items hint in `ui/src/logic/importing.ts`, and suggest's why line (as `magpie suggest` prints it) in `ui/src/logic/suggest.ts`.

### Future components

Planned parts of the core and cli layers, by target release. Details: [product](product.md) and [ideas](ideas.md).

| Component | Layer | Job | Release |
|---|---|---|---|
| **graph generator** | core | Builds nodes and edges from the notes (repos, completed skill lines, tags, links, `alternatives`), with status, drift and `tried` for each node. Nothing is stored that can't be rebuilt (decision 0001). The app's graph page reads it through the API. | v0.2 part 2 ([decision 0026](decisions/0026-the-app-is-the-workspace.md)) |
| `magpie graph` | cli | Writes the graph as one self-contained HTML file with the data embedded as JSON. | later, as an export ([decision 0026](decisions/0026-the-app-is-the-workspace.md)) |
| **publish pipeline** | core | Selects notes with `public: true` only, and builds the nest data: note list, graph and `/uses` view. | v0.4 |
| `magpie publish` | cli | Writes the nest as a static site. | v0.4 |

## Storage

- **Notes** are the only source of truth: plain Markdown with YAML frontmatter ([decision 0001](decisions/0001-plain-markdown-storage.md)).
- **Journals:** a personal journal outside any repository, and a project journal in `.magpie/` inside a project repository, with the same format ([decision 0013](decisions/0013-two-journal-scopes.md)). Layout: `<journal>/notes/<file>.md` for notes, with the file name derived from the note's PURL (`npm--pdfkit.md`, `github--owner--repo.md`), and `<journal>/tags.md` for the tag list ([note schema](note-schema.md), [decision 0017](decisions/0017-package-identity-purl.md)).
- **Search index:** a derived cache in `<journal>/.cache/`, one per journal, git-ignored (the project journal gets a `.magpie/.gitignore` with `.cache/`). It is rebuilt when a note file is newer than the index, and can be deleted at any time (decision 0001).
- **Embeddings:** not in v0.1 ([spec](spec.md), section 10). Semantic search is planned for v0.4; the default must work offline.

## Data flow: recall before an install

1. **The hook fires.** In Claude Code, a `PreToolUse` hook on the `Bash` or `PowerShell` tool runs `magpie hook claude-code` with the tool call as JSON on stdin.
2. **Find installs.** The hook splits the command line the way git-guard does and picks out install commands and their package names ([spec](spec.md), section 6).
3. **Look up notes** for those packages in the project and personal journals: an exact PURL match first, then a name-only match, marked as lower confidence ([spec](spec.md), section 5).
4. **Ask or inform, never deny.** If an avoid note matches, the hook returns `permissionDecision: "ask"` with the note as the reason, and the user decides. Any other match returns the Verdict as `additionalContext` for the agent and `systemMessage` for the user, with no permission decision ([decision 0024](decisions/0024-recall-asks-on-avoid-notes.md)). If nothing matches, or anything fails, it prints nothing and exits 0.
5. **Skill mode** in other clients: `SKILL.md` tells the agent to run `magpie recall <package> --json` itself before installing, and to ask the user first on an exact match with an avoid note, by the same rule as the hook.

## Data flow: `magpie note <name-or-url> "text"`

`magpie import <file>` runs the same flow once per line ([decision 0010](decisions/0010-v0-1-scope.md)).

1. **Resolve the target** to a PURL: a URL, a PURL, or a bare name typed by the nearest manifest ([spec](spec.md), section 4). A skill URL resolves to its parent repository ([decision 0006](decisions/0006-skills-as-searchable-lines.md)).
2. **URL only, fetch from GitHub:** description, language, license, topics and the file list (no README). Detect `SKILL.md` files and root manifests. A token, if any, comes from the `GITHUB_TOKEN` environment variable. No licence found: record `unknown` ([decision 0020](decisions/0020-unknown-license.md)). If the network fails, write the note without metadata and warn.
3. **No note yet:** write a new note with:
   - the user's text, as the Verdict (note schema, rule 7);
   - for a URL: tool-owned fields, drafts of `kind`, `tags` (topics already in `tags.md`) and "What it does" (the GitHub description) ([decision 0018](decisions/0018-ai-drafts-humans-decide.md)), and one empty skill line per detected skill;
   - defaults: `tried: false`, and `status` per note schema rule 1 (`reviewed` once the user gave a Verdict, otherwise `inbox`).
4. **Note exists:** append skill lines for skills not listed yet, and refresh tool-owned fields. Write the Verdict only if it is empty; never overwrite one ([spec](spec.md), section 2). Never change other human-owned fields or sections (note schema, rule 2).
5. **Search index:** marked stale; the next command that needs it rebuilds it.

## Data flow: `magpie search "<query>"`

1. **Get the index:** reuse the cached index of each journal if it is newer than every note; otherwise rebuild it.
2. **Match**, across both journals:
   - keyword search over frontmatter and text (roadmap v0.1);
   - semantic search over the note text (roadmap v0.4).
3. **Results** are notes and completed skill lines (decision 0006). Empty skill lines are ignored (note schema, rule 4). Notes in `inbox` rank below `reviewed` notes ([decision 0018](decisions/0018-ai-drafts-humans-decide.md)).
4. **Output:** short and parseable, like every `magpie` command (decision 0002), with a machine-readable mode (decision 0008).

## Data flow: the local app

1. **Start.** `magpie ui` finds the journals as every command does (config resolution, below), listens on `127.0.0.1`, and prints the URL with the session token ([spec](spec.md), section 2).
2. **Requests.** Each API request passes the security checks ([UI](ui.md), "Security"), then calls the same core functions as the CLI, and returns the same JSON document as the matching `--json` output, or a shared document ([spec](spec.md), "Shared JSON documents").
3. **Edits.** A write carries the note's `version`. Core compares it with the file and edits only the changed part, through round-trip-safe functions; a mismatch is a 409 and nothing is written ([decision 0023](decisions/0023-api-is-the-json-contract.md)).
4. **Live updates.** The server watches both `notes/` folders, checks their signature every 5 seconds as well, and tells the app over Server-Sent Events. The search cache is rebuilt as for the CLI.

## Config resolution

([Decision 0016](decisions/0016-journal-locations-and-config.md), [spec](spec.md) section 3.)
- **Personal journal:** `--home <dir>` > `MAGPIE_HOME` > `personal_journal` in `~/.magpie/config.yaml` > `~/.magpie/` (Windows: `%USERPROFILE%\.magpie`).
- **Project journal:** `--project <dir>` (the project root, like `git -C`, or its `.magpie` folder), or the first `.magpie/` found walking up from the working directory, stopping at the git root or the filesystem root. The personal journal's folder is never taken as a project journal.
- **Secrets** such as a GitHub token come only from environment variables (`GITHUB_TOKEN`). Agents working on this repository must read secrets from environment variables only (CLAUDE.md, section 10).
