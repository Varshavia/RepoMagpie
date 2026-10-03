# Spec (v0.1)

What `magpie` v0.1 does, command by command. It turns the [roadmap](roadmap.md)'s step 2 decisions (0015–0020) into behaviour that can be built and tested. The note format is in the [note schema](note-schema.md); terms are in the [glossary](glossary.md).

Nothing here is built yet. v0.1 is implemented on `feat/...` branches ([decision 0012](decisions/0012-branch-workflow.md)).

## 1. Conventions

- **Command name:** `magpie`. The npm package is `repomagpie`; its single `bin` entry is `magpie`, so `npx repomagpie` runs it ([npx docs](https://docs.npmjs.com/cli/v11/commands/npx)) ([decision 0015](decisions/0015-typescript-on-node.md)).
- **Streams:** data goes to stdout; messages, warnings and errors go to stderr.
- **`--json`** on every command prints one JSON document to stdout and nothing else ([decision 0008](decisions/0008-machine-readable-output.md)). Its shape is part of the public interface. Under `--json`, `magpie` never prompts.
- **Interactive prompts** happen only when stdin and stdout are terminals and `--json` is not set.
- **Global flags:** `--json`, `--home <dir>` (personal journal), `--project <dir>` (project root, like `git -C`; a path to its `.magpie` folder also works), `--help`, `--version`.
- **Exit codes:**

| Code | Meaning |
|---|---|
| 0 | Success, including "no matches" |
| 1 | The command failed (for example, a file could not be written) |
| 2 | Usage error: unknown flag, missing argument, or an ambiguous name that needs `--type` |

## 2. Commands

### `magpie note <name-or-url> ["text"]`

Captures a verdict in one line, or creates a note from a URL.

| Argument / flag | Meaning |
|---|---|
| `<name-or-url>` | A bare package name (`pdfkit`), a PURL (`pkg:npm/pdfkit`), or a URL (section 4) |
| `"text"` | The Verdict, human-written ([note schema](note-schema.md), rule 7) |
| `--type npm\|pypi\|cargo` | The package type for a bare name, when the nearest manifest doesn't settle it |
| `--to personal\|project` | Which journal to write to. Default: `personal` |

Behaviour:
1. Resolve the target to a PURL (section 4).
2. If a note in the target journal already has that PURL as its `id` or in `packages` (schema rule 6):
   - with text and an empty Verdict: write the Verdict and set `status: reviewed`;
   - with text and an existing Verdict: change nothing, print the note's path, exit 1 ("This note already has a Verdict; edit the file to change it");
   - without text and without a URL: change nothing, print the note's path, exit 0 (`"created": false`);
   - for a URL: refresh the tool-owned fields (schema rule 2) and append skill lines for newly detected skills only.
3. Otherwise create the note. For a GitHub URL, fetch the repository's metadata and file list (no README) and draft from them ([decision 0018](decisions/0018-ai-drafts-humans-decide.md)):
   - "What it does": the repository's GitHub description, marked as a draft. "Use when" stays empty; an agent may draft more later through the skill.
   - `kind`: the first that matches: `plugin` if the root has `.claude-plugin/plugin.json` or `.claude-plugin/marketplace.json`; `skill-pack` if any `SKILL.md` exists; `cli` if the root `package.json` has `bin`; `awesome-list` if the topics include `awesome-list`; otherwise `other`.
   - `tags`: the topics that are already in the journal's `tags.md`; otherwise `[]`.
   - `packages`: from the manifests at the repository root only: `package.json` `name` (skipped when `"private": true`), `pyproject.toml` `[project]` `name`, `Cargo.toml` `[package]` `name`.
   - One skill line per `SKILL.md`, named after the folder that holds it.
   - The GitHub token, if any, comes from the `GITHUB_TOKEN` environment variable. It is never printed or logged.
4. If the network fails (offline, timeout after 10 seconds, rate limit), write the note without metadata and warn on stderr. Exit 0.
5. `--to project` without a project journal creates `.magpie/` (with a `.gitignore` for `.cache/`) at the git root, or in the working directory outside git, and says so.

```
$ magpie note pdfkit "avoid: async streams painful; use puppeteer"
✔ Saved to your personal journal: pdfkit
  ~/.magpie/notes/npm--pdfkit.md
```

`--json`: `{"id": "pkg:npm/pdfkit", "journal": "personal", "path": "...", "created": true, "status": "reviewed", "warnings": []}`

### `magpie import <file>`

The bulk form of `note`. Each line that starts with `- ` is one item:

```
- <url-or-name> — verdict: ... | use: ... | avoid: ...
```

- The separator after the target is ` — ` (em dash) or ` -- `. Labels are case-insensitive; parts are separated by ` | `.
- `verdict:` counts as human-written; `use:` and `avoid:` become drafts; text without a label goes to "My notes" (schema rule 7).
- Other lines are ignored. A line that can't be parsed or resolved is reported as `failed` and skipped; the other lines continue. A bare name that the manifests don't settle fails with a hint to write a PURL (`import` never prompts).
- Flags: `--to personal|project`, `--dry-run` (report what would happen, write nothing).
- An item whose note already exists is handled as in `note`, step 2. A `verdict:` for a note that already has a Verdict makes that line `failed`. `use:`, `avoid:` and unlabelled text for an existing note are ignored with a warning on that line, because those sections are human-owned (schema rule 2).
- Exit 0 if every item succeeded or was skipped as unchanged; 1 if any item failed.

`--json`: `{"items": [{"line": 3, "id": "...", "result": "created|updated|unchanged|failed", "error": null}], "created": 4, "updated": 1, "failed": 0}`

### `magpie search <query>`

Keyword search across both journals.

- Flags: `--tag <tag>` (repeatable), `--kind <kind>`, `--journal personal|project`, `--limit <n>` (default 10).
- Results are notes and completed skill lines ([decision 0006](decisions/0006-skills-as-searchable-lines.md)), Verdict first. `inbox` notes rank below `reviewed` ones; draft text is labelled.
- No matches: a short message on stderr, exit 0.

`--json`: `{"query": "...", "results": [{"id": "...", "journal": "project", "type": "note|skill", "skill": null, "name": "...", "verdict": "...", "status": "reviewed", "score": 3.2, "path": "..."}]}`

### `magpie suggest ["description"]`

Shows what the user already has that fits a project.

- Without a description, it reads the project's manifests (`package.json`, `pyproject.toml`, `Cargo.toml`) and README, from the project root (the git root, or the working directory).
- With a description ("a TypeScript CLI with tests"), it uses that text instead.
- It narrows candidates by keyword and tags (section 5) and prints them Verdict first. The coding agent makes the semantic choice, guided by RepoMagpie's `SKILL.md`. No embeddings in v0.1.
- Flags: `--limit <n>` (default 20), `--journal personal|project`.
- Candidates that are already dependencies of the project are marked "already used".

`--json`: `{"source": "manifests|description", "keywords": [...], "candidates": [{"id": "...", "journal": "...", "verdict": "...", "tags": [...], "already_used": false, "score": 2.1}]}`

### `magpie adopt <name>`

Copies a note from the personal journal into the project journal and prints the install command. It never installs anything.

1. Resolve `<name>` (a name or PURL) to a note in the personal journal. Not found: exit 1.
2. Find the project journal (section 3). If there is none, create `.magpie/` at the git root, or in the working directory when there is no git root, and say so.
3. If the project journal already has a note for that PURL, change nothing and exit 1 ("Already in this project: <path>").
4. Copy the file unchanged, except one tool-owned field, `adopted: YYYY-MM-DD`, which records that it came from the personal journal on that date.
5. Print the install command, chosen from the PURL type and the project's lockfile:

| PURL type | Lockfile | Command |
|---|---|---|
| npm | `pnpm-lock.yaml` / `yarn.lock` / `bun.lock` or `bun.lockb` / none | `pnpm add` / `yarn add` / `bun add` / `npm install` |
| pypi | `uv.lock` / none | `uv add` / `pip install` |
| cargo | — | `cargo add` |
| github | — | no command; prints the repository URL |

6. On stderr: "The project journal is committed with the code; anyone who can read this repository can read this note."

`--json`: `{"id": "...", "from": "...", "to": "...", "install": "npm install commander"}`

### `magpie recall <package>...`

Looks up notes for packages before an install. Used directly, by agents in skill mode, and by the hook (section 6).

- Arguments: package names, optionally with a version or extras (`pdfkit@1.2.0`, `requests[socks]>=2`), or PURLs.
- Flags: `--type npm|pypi|cargo`, `--full` (show every section).
- Matching follows section 5. No match: nothing on stdout, exit 0.

`--json`: `{"matches": [{"query": "pdfkit", "id": "pkg:npm/pdfkit", "journal": "personal", "confidence": "exact|name-only", "verdict": "...", "avoid_when": [...], "use_when": [...], "status": "reviewed", "path": "..."}]}`

### `magpie init` (if time allows in v0.1; otherwise v0.2)

Reads the project's manifests and creates a draft note, without a Verdict (`status: inbox`), for each direct dependency that has no note yet ([decision 0019](decisions/0019-no-star-import-in-v0-1.md)). It writes to the project journal by default (`--to personal` to change that).

- **Offline by default:** without flags, `init` makes no network calls; notes get `id`, `name` and `packages` from the manifests only.
- **`--fetch`:** also fetch each dependency's repository metadata, as `note <url>` does. If the network fails, the note is written without metadata and a warning goes to stderr.

### `magpie hook claude-code`

Internal: the command the Claude Code hook runs (section 6). Not meant to be typed by people.

## 3. The two journals

([Decision 0013](decisions/0013-two-journal-scopes.md), [decision 0016](decisions/0016-journal-locations-and-config.md).)

**Layout**

```
<journal>/
  notes/          one note per subject (note schema)
  tags.md         the journal's tag list
  .cache/         the search index; rebuildable, never committed
  config.yaml     personal journal only
  .gitignore      project journal only; contains ".cache/"
```

**Finding the personal journal:** `--home <dir>` > `MAGPIE_HOME` > `personal_journal` in the config file > `~/.magpie/` (Windows: `%USERPROFILE%\.magpie`). The config file is always read from `~/.magpie/config.yaml`; it does not move with `MAGPIE_HOME`. In `personal_journal`, a leading `~` means the home directory, and any other relative path is resolved against the config file's folder. Relative paths in `--home` and `MAGPIE_HOME` are resolved against the working directory. If the config file can't be read, `magpie` warns and uses the default.

**Finding the project journal:** `--project <dir>` if given: the project root, like `git -C`, whose `.magpie/` folder is the journal; a path that ends in `.magpie` is taken as the journal itself. Otherwise walk up from the working directory and take the first `.magpie/` folder. Stop at the git root (a folder containing `.git`) or the filesystem root. The personal journal's folder is never taken as a project journal.

**Reading both:** search, suggest and recall read both journals. Each result says which journal it came from. When both journals have a note for the same PURL, the project journal's note comes first: it is the team's decision for this project.

## 4. Identity and file names

Every note's `id` is a Package URL ([decision 0017](decisions/0017-package-identity-purl.md)); the file name rule is in the [note schema](note-schema.md). v0.1 resolves these inputs:

| Input | PURL |
|---|---|
| `https://github.com/<owner>/<repo>` | `pkg:github/<owner>/<repo>` (lowercase) |
| A skill URL inside a repository (`.../tree/<ref>/<path>/SKILL.md` or its folder) | the parent repository, plus a skill line ([decision 0006](decisions/0006-skills-as-searchable-lines.md)) |
| `https://www.npmjs.com/package/<name>` | `pkg:npm/<name>` (scope `@x` encoded as `%40x`) |
| `https://pypi.org/project/<name>` | `pkg:pypi/<name>`, lowercased with `_` replaced by `-` ([purl-spec PyPI type](https://github.com/package-url/purl-spec/blob/main/types/pypi-definition.json)) |
| `https://crates.io/crates/<name>` | `pkg:cargo/<name>` |
| A PURL | itself, without its version |
| A bare name | typed by the nearest manifest: `package.json` → npm, `pyproject.toml` → pypi, `Cargo.toml` → cargo. More than one, or none: ask in a terminal; otherwise fail with exit 2 and suggest `--type` |

Any other input (articles, gists, loose Markdown files) is rejected with exit 2 in v0.1.

**Case-only name clash:** npm and Cargo names are case-sensitive, but note file names are lowercase. If the file for a new subject already holds a note with a different id (`pkg:npm/JSONStream` vs `pkg:npm/jsonstream`), `note`, `import` and `adopt` refuse with an error that names both PURLs and the file, and exit 1 ([note schema](note-schema.md)).

## 5. Matching rules

**Normalising a package** (for `recall` and the hook): drop the version and extras (`pdfkit@1.2.0` → `pdfkit`, `requests[socks]>=2` → `requests`, `@scope/name@^3` → `@scope/name`), then build the PURL from the type.

**Recall:**
1. **Exact:** a note whose `id` or `packages` contains the same type and name. Versions are ignored. Confidence: `exact`.
2. **Name-only:** otherwise, a note with the same name under another type (for example `pkg:pypi/pdfkit` for an npm install). Confidence: `name-only`, shown as lower confidence.
3. Otherwise no match.

**Suggest** narrows; the agent decides:
1. Collect keywords: dependency names from the manifests, `keywords` and `description` from `package.json` or `pyproject.toml`, and the README's first heading and paragraph. Or the words of the description.
2. Score notes by keyword search (as in `search`) plus one point per matching tag.
3. Return the top candidates, Verdict first, `reviewed` before `inbox`, with "already used" marked.

**Search** indexes, per note: `name`, `id`, `tags`, Verdict, "Use when", "Avoid when", "What it does" and "My notes"; and each completed skill line as its own document. Prefix and fuzzy matching are on.

## 6. Hook contract (Claude Code)

Checked against the [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) on 2026-10-03.

**Setup** (user settings or the project's `.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash|PowerShell",
        "hooks": [ { "type": "command", "command": "magpie hook claude-code" } ] }
    ]
  }
}
```

**Input** (stdin): Claude Code's JSON; `magpie` reads `tool_name` and `tool_input.command`.

**Detecting installs.** The command line is split the way git-guard does it ([`.claude/hooks/git-guard.mjs`](../.claude/hooks/git-guard.mjs)): chained commands (`&&`, `||`, `;`, pipes), quotes, line continuations, prefixes such as `sudo` or `env`, and nested shells. Recognised installs:

| Command | Packages | Type |
|---|---|---|
| `npm install` / `npm i` / `npm add` with names | the names | npm |
| `pnpm add` | the names | npm |
| `yarn add` | the names | npm |
| `bun add` | the names | npm |
| `pip install` / `pip3 install` / `python -m pip install` with names | the names | pypi |
| `uv add`, `uv pip install` | the names | pypi |
| `cargo add` | the names | cargo |

Flags and their values are skipped. An install without names (`npm install`, `pip install -r requirements.txt`) triggers no recall in v0.1 (see below).

**Output** when at least one package has a note: one JSON document on stdout, exit 0.

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Note from your journal: pdfkit — avoid: async streams painful; use puppeteer (personal journal, ~/.magpie/notes/npm--pdfkit.md)"
  },
  "systemMessage": "magpie: pdfkit — avoid: async streams painful; use puppeteer"
}
```

- `additionalContext` reaches the agent; `systemMessage` is shown to the user.
- **Never blocks:** the hook never sets `permissionDecision` and never exits with code 2. Without a `permissionDecision`, Claude Code's normal permission flow continues.
- **Fails open:** no note, an unparsable command, a missing journal, or any error means no output and exit 0. Errors go to a log file in the personal journal's `.cache/`, never to stdout.
- **Fast:** the hook has the recall budget (section 7).

**Other clients use skill mode.** In v0.1, hook mode exists for Claude Code only ([decision 0010](decisions/0010-v0-1-scope.md)). In every other client, RepoMagpie's `SKILL.md` tells the agent to run `magpie recall <package>` before installing. Hook support in other clients is tracked in [ideas](ideas.md#hook-support-in-major-clients).

**Installs without package names** (`npm install`, `pip install -r requirements.txt`) are ignored in v0.1. Recall for a whole manifest is listed for later in the [roadmap](roadmap.md).

## 7. Performance budgets

| Command | Budget (median) | Conditions |
|---|---|---|
| `recall`, and the hook | under 150 ms | 2,000 notes, warm cache |
| `search`, `suggest` | under 500 ms | 2,000 notes, warm cache |

**Measurement:** a benchmark script runs each command 20 times as a separate process against a fixture journal of 2,000 generated notes, after one warm-up run that builds the cache. It reports the median and the 95th percentile. The budgets apply to the median on the CI runner. The fixture is generated; no network.

**Cache:** the index lives in `<journal>/.cache/` and is rebuilt when a note file is newer than the index ([decision 0001](decisions/0001-plain-markdown-storage.md)).

## 8. Output design

`magpie` follows the [Command Line Interface Guidelines](https://clig.dev/) and the writing style in CLAUDE.md: short sentences, active voice, no marketing adjectives.

**Rules**
- **Verdict first.** Every result leads with the Verdict. A note without one says so: `[inbox] no verdict yet`.
- **Recall card:** name, Verdict, "Avoid when", then "Use when". At most about 6 lines by default; `--full` shows every section.
- **Colour only carries meaning:** the "Avoid when" label and the `[inbox]` status. Every coloured item also has a text label, so nothing depends on colour alone.
- **No colour** when stdout is not a terminal, or when `NO_COLOR` is set to a non-empty value ([no-color.org](https://no-color.org/)). `--json` output is never coloured.
- **Streams:** data on stdout; hints, counts and warnings on stderr. Piping `magpie search pdf | head` shows results only.
- **Width:** in a terminal, long lines are cut to the terminal width with `…`; when piped, nothing is cut.
- **Labels:** draft text is labelled `(draft)`; a name-only recall match is labelled `(name match only)`.
- **`--json`** shapes are in section 2. They are a public interface: changing one is a breaking change ([release process](release.md)).

**Example renderings** (illustrative)

Recall card, exact match:

```
$ magpie recall pdfkit
pdfkit · npm · personal journal
  Verdict      avoid: async streams painful; use puppeteer
  Avoid when   you need streamed output for large PDFs
  Use when     (draft) quick one-page PDFs from a script
  ~/.magpie/notes/npm--pdfkit.md
```

Search results:

```
$ magpie search pdf
1  pdfkit                  npm     personal  Verdict: avoid: async streams painful; use puppeteer
2  puppeteer               npm     project   Verdict: default for PDF rendering in new projects
3  pdf-lib                 npm     personal  [inbox] no verdict yet
```

Suggest list (the hint goes to stderr):

```
$ magpie suggest "a TypeScript CLI with tests"
1  vitest     npm  project   Verdict: default test runner for new projects   already used
2  commander  npm  personal  Verdict: fine for small CLIs
3  tsx        npm  personal  [inbox] no verdict yet
3 of 11 candidates. Your coding agent picks the fit; use --limit to see more.
```

## 9. Stack

### Runtime and packaging ([decision 0015](decisions/0015-typescript-on-node.md))

- **TypeScript on Node.js.** `engines.node` is `>=22.12.0`, the floor commander 15 requires; CI runs the tests on Node 22, 24 and 26, on Linux and Windows.
- **ESM only:** `"type": "module"`. The published package contains compiled JavaScript and one `bin` entry, `magpie`.
- **Source under type stripping:** contributors run the `.ts` source directly on Node 22.18.0 or later. `tsconfig.json` follows the [Node.js recommendation](https://nodejs.org/api/typescript.html): `module: nodenext`, `target: esnext`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `rewriteRelativeImportExtensions`. In practice: no enums or namespaces, types imported with `import type`, and file extensions in every import.
- **Build:** `tsc` compiles to `dist/` for publishing only; tests run on the source.
- **Tests:** `node:test`, with fixture journals and no network, as for git-guard.

### Libraries (dependency policy check)

Every library needs the maintainer's approval before it is added (CLAUDE.md, section 9). The maintainer approved all six below on 2026-10-03 (`@types/node` during the scaffold, when the typecheck needed it). Figures from the npm registry and GitHub, checked 2026-10-03.

| Need | Library | Licence | Runtime deps | Unpacked size | Maintenance | Weekly downloads | Status |
|---|---|---|---|---|---|---|---|
| CLI parsing | [commander](https://github.com/tj/commander.js) 15.0.0 | MIT | 0 | 203 kB | released 2026-05-29; repo active (2026-10-01); requires Node ≥ 22.12.0 | ~625M | approved |
| Keyword search | [MiniSearch](https://github.com/lucaong/minisearch) 7.2.0 | MIT | 0 | 807 kB (several builds) | released and last pushed 2025-09-16; small, stable | ~3.9M | approved |
| YAML frontmatter | [yaml](https://github.com/eemeli/yaml) 2.9.1 | ISC | 0 | 670 kB | released 2026-09-11; repo active (2026-09-23) | ~258M | approved |
| PURL | [packageurl-js](https://github.com/package-url/packageurl-js) 2.0.1 | MIT | 0 | 56 kB | released 2024-09-04; repo active (2026-08-24) | ~2.6M | approved |
| Build (dev only) | [typescript](https://github.com/microsoft/TypeScript) 7.0.2 | Apache-2.0 | 20 (optional per-platform compiler binaries; one installs) | 2 MB | released 2026-07-08 | ~355M | approved |
| Node type definitions (dev only) | [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) `^22.20.5` | MIT | 1 (`undici-types` 6.21.0, MIT, no dependencies) | ~2.3 MB | released 2026-10-01; stays on major 22 to match the Node floor | ~535M | approved |

Alternatives considered:
- **CLI:** [citty](https://github.com/unjs/citty) 0.2.2 (MIT, 0 deps, 34 kB, ~40M weekly) is the modern, TypeScript-first alternative, still before 1.0. yargs and clipanion were not checked in detail.
- **Search:** [Orama](https://github.com/oramasearch/orama) 3.1.18 (Apache-2.0, 0 deps) is the upgrade path if semantic or hybrid search arrives (roadmap v0.3). FlexSearch (Apache-2.0) is fastest at very large scale but more complex than needed for a few thousand notes.
- **YAML:** gray-matter 4.0.3 (MIT, 4 deps, last release 2021-04-24) and js-yaml 5.4.2 (MIT, 1 dep) were not chosen: keeping comments and formatting when a file is rewritten is a hard requirement, and `yaml` documents a Document API that does it.
- **PURL:** a small own parser for the four types in use (github, npm, pypi, cargo) was the fallback; not needed now that packageurl-js is approved.

### Round-trip safety

`magpie` edits files people wrote, so:
- Frontmatter is edited through the `yaml` Document API, changing only tool-owned keys. The `yaml` docs warn that comment handling "is not completely stable, in particular for trailing comments" ([yaml docs](https://eemeli.org/yaml/)); round-trip tests on fixture notes with comments must pass before release.
- The body is never re-serialised: appending a skill line is a text insertion.
- If a file can't be parsed, `magpie` leaves it untouched and warns.

## 10. Out of scope for v0.1

Embeddings and semantic search, the MCP server, star import ([decision 0019](decisions/0019-no-star-import-in-v0-1.md)), vet and drift, the graph, nests, and subjects other than GitHub repositories and registry packages.

## 11. Open questions

None at the close of step 2. Answered on 2026-10-03:
- **ISO:** PURL is in process to become an ISO standard ([purl-spec README](https://github.com/package-url/purl-spec#readme); [decision 0017](decisions/0017-package-identity-purl.md)).
- **`import`:** text without a label goes to "My notes" (section 2).
- **`init`:** offline by default; `--fetch` enables metadata fetching (section 2).
- **Other clients:** hook mode is Claude Code only in v0.1; other clients use skill mode (section 6).
- **Installs without package names:** ignored in v0.1; whole-manifest recall is listed for later (section 6).
- **Libraries and Node floor:** the libraries in section 9 are approved (`@types/node` added during the scaffold); `engines.node` is `>=22.12.0` ([decision 0015](decisions/0015-typescript-on-node.md)).
- **Graph:** stays "if built" (roadmap, "Not scheduled").
