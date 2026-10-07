# Spec (v0.1)

What `magpie` v0.1 does, command by command. It turns the [roadmap](roadmap.md)'s step 2 decisions (0015–0020) into behaviour that can be built and tested. The note format is in the [note schema](note-schema.md); terms are in the [glossary](glossary.md).

v0.1 is implemented on `feat/...` branches; the [roadmap](roadmap.md) says which commands exist ([decision 0012](decisions/0012-branch-workflow.md)).

## 1. Conventions

- **Command name:** `magpie`. The npm package is `repomagpie`; its single `bin` entry is `magpie`, so `npx repomagpie` runs it ([npx docs](https://docs.npmjs.com/cli/v11/commands/npx)) ([decision 0015](decisions/0015-typescript-on-node.md)).
- **Streams:** data goes to stdout; messages, warnings and errors go to stderr.
- **`--json`** on every command prints one JSON document to stdout and nothing else ([decision 0008](decisions/0008-machine-readable-output.md)). Its shape is part of the public interface. Under `--json`, `magpie` never prompts.
- **`--json` on failure** (exit 1 or 2): the same document as on success, plus an `"error"` field with the message. Fields that aren't known are `null`, lists are empty, and counts are 0. Example: `{"id": null, "journal": "personal", "path": null, "created": false, "status": null, "warnings": [], "error": "Not a supported input. ..."}`. A usage error that the command-line parser catches (an unknown flag, a missing argument) prints its message on stderr only.
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
   - `kind`: the first that matches: `cli` if the root `package.json` has `bin`; `skill-pack` if any `SKILL.md` exists; `plugin` if the root has `.claude-plugin/plugin.json` or `.claude-plugin/marketplace.json`; `awesome-list` if the topics include `awesome-list`; otherwise `other`.
   - `tags`: the topics that are already in the journal's `tags.md`; otherwise `[]`.
   - `packages`: from the manifests at the repository root only: `package.json` `name` (skipped when `"private": true`), `pyproject.toml` `[project]` `name`, `Cargo.toml` `[package]` `name`. Known limitation (v0.1): the name is recorded whether or not the package is published on its registry.
   - One skill line per `SKILL.md`, named after the folder that holds it.
   - The GitHub token, if any, comes from the `GITHUB_TOKEN` environment variable. It is never printed or logged.
4. If the network fails (offline, timeout after 10 seconds, rate limit, a server error), write the note without metadata and warn on stderr. Exit 0. If GitHub says the repository doesn't exist (404) or rejects the token (401), write nothing and exit 1; for 401 the message says `GITHUB_TOKEN` may be invalid or expired.
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
- A line may hold the target alone (`- pkg:npm/pdfkit`). Each `use:` or `avoid:` part becomes one bullet; unlabelled parts become one line each in "My notes". A label with no text is ignored. Two `verdict:` parts make the line `failed`. Only lines that start with `- ` at the left margin are items.
- Lenient read, for a list copied out of a chat or another editor: an item may also start with `* `, `+ ` or an escaped `\- `; a non-breaking space after the marker counts as a space; a UTF-8 BOM is ignored.
- A file without items is not an error (exit 0). The hint on stderr names what the first line with text starts with instead: `No items found in list.md. Each item is a line that starts with "- ". Line 1 starts with "1.".`
- Output: one result line per item on stdout (`line 3: created pkg:npm/pdfkit`); errors and warnings on stderr, prefixed with the line number; then a summary on stderr (`2 created, 1 updated, 0 unchanged, 1 failed.`). Later lines see the notes earlier lines wrote, also in a dry run. A dry run still fetches GitHub metadata (read-only) to report what would happen.
- Other lines are ignored. A line that can't be parsed or resolved is reported as `failed` and skipped; the other lines continue. A bare name that the manifests don't settle fails with a hint to write a PURL (`import` never prompts).
- Flags: `--to personal|project`, `--dry-run` (report what would happen, write nothing).
- An item whose note already exists is handled as in `note`, step 2. A `verdict:` for a note that already has a Verdict makes that line `failed`. `use:`, `avoid:` and unlabelled text for an existing note are ignored with a warning on that line, because those sections are human-owned (schema rule 2).
- Exit 0 if every item succeeded or was skipped as unchanged; 1 if any item failed.

`--json`: `{"items": [{"line": 3, "id": "...", "result": "created|updated|unchanged|failed", "error": null, "warnings": []}], "created": 4, "updated": 1, "failed": 0}`

### `magpie search <query>`

Keyword search across both journals.

- Flags: `--tag <tag>` (repeatable), `--kind <kind>`, `--journal personal|project`, `--limit <n>` (default 10).
- Results are notes and completed skill lines ([decision 0006](decisions/0006-skills-as-searchable-lines.md)), Verdict first. `inbox` notes rank below `reviewed` ones; draft text is labelled.
- **Ranking:** every `reviewed` result comes before any `inbox` one; relevance orders results within each group. Completed skill lines rank as `reviewed`, because their text is human-written.
- **Skill results:** `verdict` is the skill line's own text; `name` and `id` are the parent note's; `skill` is the skill's name.
- **Filters:** `--tag` given more than once means every tag must be present. `--tag` and `--kind` filter skill results by their parent note's tags and kind.
- **Both journals:** when both have a note for the same PURL, both are shown, the project journal's directly before the personal one (section 3).
- No matches: a short message on stderr, exit 0.

`--json`: `{"query": "...", "results": [{"id": "...", "journal": "project", "type": "note|skill", "skill": null, "name": "...", "verdict": "...", "status": "reviewed", "score": 3.2, "path": "..."}]}`

### `magpie suggest ["description"]`

Shows what the user already has that fits a project.

- Without a description, it reads the project's manifests (`package.json`, `pyproject.toml`, `Cargo.toml`) and README. The manifests are found as `note` finds them (section 4): the nearest folder with any, walking up to the git root. The README comes from that folder, or from the project root (the git root, or the working directory) when there is no manifest.
- With a description ("a TypeScript CLI with tests"), its words are the keywords instead. The project's dependencies still come from its manifests, when there are any.
- It narrows candidates by keyword and tags (section 5) and prints them Verdict first. The coding agent makes the semantic choice, guided by RepoMagpie's `SKILL.md`. No embeddings in v0.1.
- Flags: `--limit <n>` (default 20), `--journal personal|project` (one journal, for the candidates and the avoid group).
- **The project's own dependencies are never candidates.** A dependency that has an avoid note (decision 0024's rule, as in section 6) is listed apart, in `in_use_avoid`, whatever the keywords: "Already in use, you noted to avoid".
- **Nothing to go on** (no manifest, no README and no description, or a description of stop words and common words only): a usage error (exit 2) that asks for a description.
- Output: one row per candidate, as for `search` (section 8), with a why line after the Verdict (`Why: dependency @playwright/test; matched coding, agent`), then the avoid group under its heading, on stdout; the count and the hint on stderr (`3 of 11 candidates. Your coding agent picks the fit; use --limit to see more.`). No candidate: `No notes match: <keywords>.` on stderr, exit 0.

`--json`: `{"source": "manifests|description", "keywords": [...], "candidates": [{"id": "...", "journal": "...", "name": "...", "verdict": "...", "status": "reviewed", "tags": [...], "score": 2.1, "why": {"keywords": [...], "dependencies": [...]}, "path": "..."}], "in_use_avoid": [<a match as in recall --json>]}`

- `keywords` are the words looked for, in order (section 5).
- `why.keywords` are the keywords the note matched, in the same order. `why.dependencies` are the project's dependencies whose every word the note matched (`@playwright/test` for a note that matched `playwright` and `test`); `[]` for a description. The why line names the dependencies, then the other matched keywords.
- `verdict` is `null` for a note without one, as in `search`. `in_use_avoid` items have the shape of `recall --json` matches, with `query` the dependency's name.

### `magpie adopt <name>`

Copies a note from the personal journal into the project journal and prints the install command, unless the note's Verdict says to avoid the package (step 5). It never installs anything.

1. Resolve `<name>` (a name, a PURL, or a URL) to a PURL as section 4 says (`--type npm|pypi|cargo` settles a bare name), then to the note in the personal journal whose `id` or `packages` has it (schema rule 6). Not found: exit 1, with a hint to write the note first.
2. Find the project journal (section 3). If there is none, create `.magpie/` at the git root, or in the working directory when there is no git root, and say so.
3. If the project journal already has a note for the note's `id` or any of its `packages`, change nothing and exit 1 ("Already in this project: <path>"). A file at the copy's name that holds another note, or none that can be read, is never overwritten either (exit 1).
4. Copy the file unchanged, under the same file name, except one tool-owned field, `adopted: YYYY-MM-DD`, added at the end of the frontmatter, which records that it came from the personal journal on that date.
5. Print the install command, chosen from the type of the PURL `<name>` resolved to and the lockfile in the project root (the folder that holds `.magpie/`):

| PURL type | Lockfile | Command |
|---|---|---|
| npm | `pnpm-lock.yaml` / `yarn.lock` / `bun.lock` or `bun.lockb` / none | `pnpm add` / `yarn add` / `bun add` / `npm install` |
| pypi | `uv.lock` / none | `uv add` / `pip install` |
| cargo | — | `cargo add` |
| github | — | the note's `packages` decide: exactly one, that package's command; several, one command per package, to choose from; none, no command, and the repository URL |

   If the note's Verdict says to avoid the package (it starts with the word "avoid", in any case), the note is still copied, but no install command is named: `Your note says to avoid <name>; no install command.` Only the Verdict counts here; "Avoid when" text lists situations, not the package, so it doesn't stop the command (unlike the avoid note of section 6, which also counts "Avoid when").

6. On stderr: "The project journal is committed with the code; anyone who can read this repository can read this note."

Output: the copy's path and `Install with: <command>` on stdout; for several packages, `This repository publishes 2 packages; install the one you need:` and one command per line; for a repository without packages, `No install command for a GitHub repository: <url>`; for a Verdict that says to avoid, `Your note says to avoid <name>; no install command.` Messages on stderr.

`--json`: `{"id": "...", "from": "...", "to": "...", "install": "npm install commander", "install_choices": []}`. `id` is the note's own. `install` is the one command, or `null` when there is none, several, or the Verdict says to avoid; `install_choices` lists the commands when there are several, and is `[]` otherwise.

### `magpie recall <package>...`

Looks up notes for packages before an install. Used directly, by agents in skill mode, and by the hook (section 6).

- Arguments: package names, optionally with a version or extras (`pdfkit@1.2.0`, `requests[socks]>=2`), or PURLs.
- Flags: `--type npm|pypi|cargo`, `--full` (show every section).
- **The type of a bare name:** `--type` if given; otherwise the nearest manifest, as for `note` (section 4). When the manifests don't settle it (none, or several), the name is looked up under every type they allow (all three when there is none), and a match under any of them counts as exact. `recall` never prompts and never fails for an ambiguous name.
- Matching follows section 5. Output: one recall card per match (section 8), project journal first, then the personal one. No match: nothing on stdout, a short message on stderr (`No note for pdfkit.`), exit 0.

`--json`: `{"matches": [{"query": "pdfkit", "id": "pkg:npm/pdfkit", "journal": "personal", "confidence": "exact|name-only", "verdict": "...", "avoid_when": [...], "use_when": [...], "drafts": ["use_when"], "status": "reviewed", "path": "..."}]}`

- `verdict` is `null` when the note has none (it is `inbox`), as in `search`.
- `avoid_when` and `use_when` hold one item per bullet, without the draft marker and comments.
- `drafts` names which of `avoid_when` and `use_when` are still drafts (schema rule 3); `[]` when none.

### `magpie init` (if time allows in v0.1; otherwise v0.3)

Reads the project's manifests and creates a draft note, without a Verdict (`status: inbox`), for each direct dependency that has no note yet ([decision 0019](decisions/0019-no-star-import-in-v0-1.md)). It writes to the project journal by default (`--to personal` to change that).

- **Offline by default:** without flags, `init` makes no network calls; notes get `id`, `name` and `packages` from the manifests only.
- **`--fetch`:** also fetch each dependency's repository metadata, as `note <url>` does. If the network fails, the note is written without metadata and a warning goes to stderr.

### `magpie hook claude-code`

Internal: the command the Claude Code hook runs (section 6). Not meant to be typed by people.

- Flag: `--inform-only` (never ask; for unattended `-p` runs). `--help` prints the settings snippet.
- Always exits 0, even for a usage error such as a mistyped flag: exit 2 from a `PreToolUse` hook would block the tool call.

### `magpie ui`

Starts the local app: a server on `127.0.0.1` that serves the app and a JSON API over the same core ([decision 0021](decisions/0021-local-ui-server.md)). Full behaviour, security rules and endpoints: [UI](ui.md).

| Flag | Meaning |
|---|---|
| `--port <n>` | The port to listen on. Default: a free port chosen by the operating system |
| `--no-open` | Don't open the browser; only print the URL |

1. Listen on `127.0.0.1` only. A port in use is an error that names the port (exit 1); a port that isn't a number from 1 to 65535 is a usage error (exit 2).
2. Print the URL, with the session token, on stdout: `http://127.0.0.1:<port>/?token=<token>`; then `Press Ctrl+C to stop.` on stderr.
3. Open the default browser unless `--no-open`. If that fails, say so on stderr (`Couldn't open the browser: <reason>. Open the URL above yourself.`); the printed URL still works.
4. Run until Ctrl+C (SIGINT) or SIGTERM, then close the watchers and the server, and exit 0.

`--json`: once the server listens, `{"url": "http://127.0.0.1:<port>/?token=<token>", "port": 4321}`, then it runs as without `--json`. If the server can't start: `{"url": null, "port": 4321, "error": "port 4321 is in use. ..."}`, exit 1.

### Shared JSON documents

Documents that the local app's API returns and no v0.1 command prints yet ([decision 0023](decisions/0023-api-is-the-json-contract.md)). Like the `--json` documents above, they are a public interface, and a future command that shows the same data prints the same document. Keys are snake_case; dates are `YYYY-MM-DD` strings; a failure adds `"error"` as in section 1.

**Settings.** The home directory, the journals in use, and whether a GitHub token is set. The token's value never appears. The app uses `home` to show paths under it with `~`, as `magpie recall` prints them.

```json
{"version": "0.1.0",
 "home": "/home/ana",
 "journals": {"personal": {"path": "/home/ana/.magpie", "exists": true},
              "project": {"path": "/work/app/.magpie", "exists": false}},
 "github_token_set": true}
```

`journals.project` is `null` when there is no project journal and no project root to create one in (section 3).

**Tag list.** One journal's tags, from its `tags.md`, or the starter list for a journal not created yet (section 3). `exists` says whether the journal has its `tags.md`.

```json
{"journal": "personal", "tags": ["testing", "pdf", "agent-skills"], "exists": true}
```

**Note list.** The notes in one journal, after the filters, sorted by `name`. Each item is a summary; the full note is the Note document.

```json
{"journal": "personal", "count": 2,
 "notes": [{"id": "pkg:npm/pdfkit", "file": "npm--pdfkit.md", "name": "pdfkit", "kind": "library",
            "tags": ["pdf"], "status": "reviewed", "verdict": "avoid: async streams painful; use puppeteer",
            "tried": true, "rating": 2, "explored": "2026-10-03", "read_only": false},
           {"id": null, "file": "npm--broken.md", "name": null, "kind": null, "tags": [], "status": "inbox",
            "verdict": "", "tried": false, "rating": null, "explored": null, "read_only": true}]}
```

**Note.** One note, as read, with the version a write must send back ([decision 0023](decisions/0023-api-is-the-json-contract.md)).

```json
{"id": "pkg:npm/pdfkit", "journal": "personal", "file": "npm--pdfkit.md", "path": "/home/ana/.magpie/notes/npm--pdfkit.md",
 "version": "sha256:9f2c…", "read_only": false, "status": "reviewed",
 "verdict": "avoid: async streams painful; use puppeteer",
 "frontmatter": {"id": "pkg:npm/pdfkit", "name": "pdfkit", "kind": "library", "tags": ["pdf"], "tried": true, "...": "..."},
 "sections": [{"name": "Verdict", "heading": "Verdict", "body": "avoid: async streams painful; use puppeteer\n", "draft": false},
              {"name": null, "heading": "Benchmarks", "body": "...", "draft": false}],
 "skills": [{"name": "pdf-forms", "text": "fill PDF forms from a script"}, {"name": "pdf-merge", "text": ""}],
 "warnings": []}
```

- `frontmatter` holds the fields as written, unknown ones included. `status` and `verdict` are derived from the Verdict (schema rule 1), whatever the `status` field says.
- `sections` keeps the file's order. `name` is the canonical section name, or `null` for a section the schema doesn't know; `body` is as written, comments included; `draft` is true when the body starts with the draft marker (schema rule 3).
- `skills` lists the lines under "Notable skills"; `text` is `""` for an empty skill line (schema rule 4).
- `read_only` is true when the frontmatter can't be read or has no `id`. `id` is then `null`, and `warnings` says why. The app shows such a note read-only, addressed by its `file` name (see [UI](ui.md), "API"). The Note list's `read_only` follows the same rule.

**Editing a note.** The app's edit of one note ([decision 0023](decisions/0023-api-is-the-json-contract.md)) is `{"journal", "id", "version", "verdict"?, "sections"?, "fields"?, "accept_drafts"?}`. All edits are applied, or none:
- `version` must be the file's current version (`sha256:<hex>` of its bytes); otherwise nothing is written, and the answer is the Note document as the file is now, plus `"error"`.
- `verdict`: one line. It fills an empty Verdict as `magpie note` does (comments in the section stay); otherwise it replaces the section's body. `""` clears it. `status` follows: `reviewed` with a Verdict, `inbox` without.
- `sections`: `{"<section name>": "<body>"}` for the schema's sections except the Verdict. The body replaces the section's body, without blank lines around it, followed by one blank line before the next section. A drafted section loses its draft marker (schema rule 3), unless the body is unchanged. A missing section is inserted before the next section in schema order, or, with no later section, after the file's last line (adding a line break and a blank line only where they are missing); an empty body for a missing section writes nothing. A body can't hold a `## ` heading outside a code block.
- `fields`: `kind` (one of the schema's kinds), `tags` (lowercase kebab-case), `tried` (true or false), `rating` (1 to 5, or `null`). A block list stays a block list. Any other key, `status` and the tool-owned fields included, is refused.
- `accept_drafts`: section names whose draft marker is removed; the text stays.
- The answer is the Note document after the edit. Everything outside the edited parts stays byte for byte.

**Note preview.** What `magpie note <target>` would write, without writing anything. For a GitHub URL it fetches the metadata, read-only.

```json
{"id": "pkg:github/microsoft/playwright-cli", "journal": "personal", "path": "/home/ana/.magpie/notes/github--microsoft--playwright-cli.md",
 "exists": false, "verdict": null, "name": "microsoft/playwright-cli", "url": "https://github.com/microsoft/playwright-cli",
 "what_it_does": "...", "language": "TypeScript", "license": "Apache-2.0", "topics": ["playwright"],
 "kind": "cli", "tags": ["testing"], "packages": ["pkg:npm/%40playwright/cli"], "skills": ["playwright-cli"],
 "warnings": []}
```

- `exists` is true when the journal already has a note for that PURL (schema rule 6); `verdict` is then that note's Verdict, or `""` when it is empty, so the app can say "This note already has a Verdict" before the person writes one.
- `what_it_does`, `kind` and `tags` are the drafts `note` would write (step 3 above). Without metadata (a registry name, or offline), the metadata fields are `null` or empty, and `warnings` says why.
- For a note that exists, the fields show the note as `note <target>` would leave it (tool-owned fields refreshed). The preview runs the same steps as `note` without writing: a GitHub repository that doesn't exist, or a token GitHub rejects, is a failure, as for `note`.

## 3. The two journals

([Decision 0013](decisions/0013-two-journal-scopes.md), [decision 0016](decisions/0016-journal-locations-and-config.md).)

**Layout**

```
<journal>/
  notes/          one note per subject (note schema)
  tags.md         the journal's tag list
  .cache/         the caches (section 7); rebuildable, never committed
  config.yaml     personal journal only
  .gitignore      project journal only; contains ".cache/"
```

**Creating a journal:** `magpie` creates a journal when it writes the first note into it: the `notes/` folder, a `.gitignore` for a project journal, and a starter `tags.md` with ten tags (the same as `examples/vault/tags.md`) when there is no `tags.md` yet. Existing files are never overwritten, and a journal that already has `notes/` doesn't get a `tags.md` again. Tags for that first note are drafted from the starter list.

**A journal without `tags.md`:** `magpie` never adds one on its own to a journal that has `notes/`. In the local app, "Create tag list" writes the starter list on the user's click ([UI](ui.md), section 7). That is a human action, like editing `tags.md` by hand (schema rule 5); it never overwrites an existing `tags.md`.

**Finding the personal journal:** `--home <dir>` > `MAGPIE_HOME` > `personal_journal` in the config file > `~/.magpie/` (Windows: `%USERPROFILE%\.magpie`). The config file is always read from `~/.magpie/config.yaml`; it does not move with `MAGPIE_HOME`. In `personal_journal`, a leading `~` means the home directory, and any other relative path is resolved against the config file's folder. Relative paths in `--home` and `MAGPIE_HOME` are resolved against the working directory. If the config file can't be read, `magpie` warns and uses the default.

**Finding the project journal:** `--project <dir>` if given: the project root, like `git -C`, whose `.magpie/` folder is the journal; a path that ends in `.magpie` is taken as the journal itself. Otherwise walk up from the working directory and take the first `.magpie/` folder. Stop at the git root (a folder containing `.git`), the home directory, or the filesystem root; the home directory itself is not searched. The walk for the project root (where `--to project` creates `.magpie/`) stops at the home directory too, so a git repository at home (dotfiles) never makes home the project root.

Two folders are never a project journal:
- **The personal journal's folder**, or a `.magpie` directly inside it. When `--project`, or the folder `--to project` would create, names one of them, the command fails with exit 1 and writes nothing.
- **The home directory's own `.magpie`** (`~/.magpie`), even when `MAGPIE_HOME` or the config file puts the personal journal elsewhere: it is reserved for the default personal journal. Writing commands fail with exit 1 and write nothing; `search` doesn't read it as the project journal.

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

Any other input (articles, gists, loose Markdown files) is rejected with exit 2 in v0.1. A bare name never holds `\`, `:` or `%`, or starts with a dot (no v0.1 registry allows them), so a file path is never taken for a package name.

**Case-only name clash:** Cargo names are case-sensitive, but note file names are lowercase (npm and PyPI PURLs are lowercased, so they can't clash). If the file for a new subject already holds a note with a different id (`pkg:cargo/Inflector` vs `pkg:cargo/inflector`), `note`, `import` and `adopt` refuse with an error that names both PURLs and the file, and exit 1 ([note schema](note-schema.md)).

## 5. Matching rules

**Normalising a package** (for `recall` and the hook): drop the version and extras (`pdfkit@1.2.0` → `pdfkit`, `requests[socks]>=2` → `requests`, `@scope/name@^3` → `@scope/name`), then build the PURL from the type.

**Recall:**
1. **Exact:** a note whose `id` or `packages` contains the same type and name. Versions are ignored. Confidence: `exact`.
2. **Name-only:** otherwise, a note with the same name under another type (for example `pkg:pypi/pdfkit` for an npm install). A GitHub repository note whose repository name is the package name (`pkg:github/foliojs/pdfkit` for `pdfkit`) also matches this way. Confidence: `name-only`, shown as lower confidence.
3. Otherwise no match.

- **Both journals together:** if either journal has an exact match, only exact matches are shown, project journal first. Name-only matches are shown only when neither journal has an exact one.
- **Comparing names:** case-insensitive, and `_`, `.` and `-` count as the same character (PyPI's rule, applied to every type for name-only matches). An npm scope is part of the name: `@types/node` doesn't match `node`.

**Suggest** narrows; the agent decides:
1. Collect keywords: dependency names from the manifests (every dependency table: `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`; PEP 621 and PEP 735 lists and Poetry's tables; Cargo's dependency tables, also per target and for the workspace), `keywords` and `description` from `package.json`, `pyproject.toml` or `Cargo.toml`, and the README's first heading and paragraph. Or the words of the description. Words are lowercased, each kept once, without stop words, common words and numbers; a package name splits into its words (`@types/node` → `node`). Common words are those almost any project's manifests and README contain, so they only bring coincidences: for example `about`, `before`, `code`, `install`, `js`, `plugin`, `types`, `checkout`, `end` (the list is in `src/core/suggest.ts`). They never show in the why line.
2. Score notes by keyword search over the same index as `search`, with prefix matching but no fuzzy matching (fuzzy turns `test` into `rest` and `text`), plus one point per matching tag: a tag that is a keyword, or a hyphenated tag whose every word is one. A keyword of four letters or more loses one trailing "s" before the lookup, so `tests` finds `test` (and, by prefix, `tests` and `testing`). A completed skill line counts for its note.
3. Leave out what the project already uses: every note recall would match for one of its dependencies (exact, else name-only). Those that are avoid notes go to `in_use_avoid`.
4. **Relative cutoff:** leave out every candidate scoring under a fifth (0.2) of the best candidate's score. Picked with the quality tests (`src/core/suggest-quality.test.ts`, over the example vault): the notes they expect score 0.43 of the best or more; notes that share only a word or two with the project ("agent", "app") score 0.14 or less. Without it, suggest on RepoMagpie itself listed every note in the example vault, open-lakehouse included.
5. Return the top candidates, Verdict first: `reviewed` before `inbox`, then by score; the same note in both journals, the project's first (section 3).

**Search** indexes, per note: `name`, `id`, `tags`, Verdict, "Use when", "Avoid when", "What it does" and "My notes"; and each completed skill line as its own document. Prefix and fuzzy matching are on. Results rank `reviewed` (and completed skill lines) before `inbox`, then by relevance; a skill result's Verdict is its own text (section 2).

## 6. Hook contract (Claude Code)

Checked against the [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) on 2026-10-03, and again on 2026-10-04: the input has `tool_name`, `tool_input.command` and `cwd`; the output fields below; `permissionDecision` `"ask"`; the 10,000-character cap on `additionalContext` and `systemMessage`.

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

**Output** when at least one package has a note: one JSON document on stdout, exit 0 ([decision 0024](decisions/0024-recall-asks-on-avoid-notes.md)).

An **avoid note** (its Verdict starts with the word "avoid", in any case, or its "Avoid when" section has text, drafted or not) that matches **exactly** asks the user. A name-only match never asks: it informs, labelled `(name match only)`. The reason is shown in Claude Code's permission prompt; `additionalContext` gives the agent the same note.

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask",
    "permissionDecisionReason": "magpie: you noted to avoid pdfkit (personal journal)\nVerdict: avoid: async streams painful; use puppeteer\nAvoid when: you need streamed output for large PDFs\n~/.magpie/notes/npm--pdfkit.md",
    "additionalContext": "Note from your journal: pdfkit — avoid: async streams painful; use puppeteer. Avoid when: you need streamed output for large PDFs (personal journal, ~/.magpie/notes/npm--pdfkit.md)"
  }
}
```

**Any other match** informs only, with no permission decision:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Note from your journal: puppeteer — default for PDF rendering in new projects (project journal, ~/code/app/.magpie/notes/npm--puppeteer.md)"
  },
  "systemMessage": "magpie: puppeteer — default for PDF rendering in new projects"
}
```

- `additionalContext` reaches the agent next to the tool's result; `systemMessage` is shown to the user; `permissionDecisionReason` is shown to the user in the permission prompt.
- Each match is one line of `additionalContext` (and of `systemMessage`): the name, the Verdict (or `[inbox] no verdict yet`), "Avoid when" when the note has it, `(name match only)` for a name-only match, then the journal and path. A path in the home directory starts with `~`.
- When a command installs several packages, one document covers them all. If any of them has an avoid note, the whole call asks, and the reason lists every avoid note first.
- **Live test (2026-10-04):** in a Claude Code session with the hook installed, an install of a package with an avoid note prompted the user (`"ask"`), both in the default permission mode and in auto mode.
- **Never denies:** the hook never returns `"deny"` and never exits with code 2. Its strongest answer is `"ask"`; the user decides. In an unattended `-p` run, Claude Code itself denies any call that would prompt, and the agent reads the reason (decision 0024).
- **`--inform-only`:** `magpie hook claude-code --inform-only` never asks: avoid notes are reported like any other match. Use it for unattended `-p` runs, where an ask would stop the install.
- **Fails open:** no note, an unparsable command, a missing journal, or any error means no output and exit 0. Errors go to a log file in the personal journal's `.cache/`, never to stdout.
- **Fast:** the hook has the recall budget (section 7).
- Each text stays under 10,000 characters, Claude Code's cap for `additionalContext` and `systemMessage`; the reason is kept to the same limit.

**Other clients use skill mode.** In v0.1, hook mode exists for Claude Code only ([decision 0010](decisions/0010-v0-1-scope.md)). In every other client, RepoMagpie's `SKILL.md` tells the agent to run `magpie recall <package>` before installing. Hook support in other clients is tracked in [ideas](ideas.md#hook-support-in-major-clients).

**Installs without package names** (`npm install`, `pip install -r requirements.txt`) are ignored in v0.1. Recall for a whole manifest is listed for later in the [roadmap](roadmap.md).

## 7. Performance budgets

| Command | Budget (median) | Conditions |
|---|---|---|
| `recall`, and the hook | under 150 ms | 2,000 notes, warm cache |
| `search`, `suggest` | under 500 ms | 2,000 notes, warm cache |

**Measurement:** a benchmark script runs each command 20 times as a separate process against a fixture journal of 2,000 generated notes, after one warm-up run that builds the cache. It reports the median and the 95th percentile. The budgets apply to the median on the CI runner. The fixture is generated in `.scratch/bench/`; no network. `npm run bench` runs it for `search`, `suggest`, `recall` and the hook (`scripts/bench-search.ts`, `scripts/bench-suggest.ts`, `scripts/bench-recall.ts`; suggest on a project with 25 dependencies and a README, and with a description) and exits 1 over a budget. CI runs all three with `--report-only`, which prints the numbers but never fails on timing. The hook's benchmark gets the journal from `MAGPIE_HOME`, as a real setup does.

**Caches:** three per journal, in `<journal>/.cache/` ([decision 0001](decisions/0001-plain-markdown-storage.md)): `search-index.json` (the search index), `recall-index.json` (what recall needs from each note: its PURLs, Verdict, "Avoid when" and "Use when"), and `note-list.json` (each note's summary in the Note list document, for the local app). Each records every note file's modification time and size. The first two are rebuilt when a note is added, removed or changed; the note list reads again only the notes that were added or changed. All are safe to delete; a cache that can't be read is rebuilt silently, and one that can't be written only costs time on the next run. They store file names, not paths, so a journal can be moved.

**Hook start-up:** `magpie hook claude-code` (with no flag, or `--inform-only` only) loads only what the hook needs; every other command loads only its own module.

## 8. Output design

`magpie` follows the [Command Line Interface Guidelines](https://clig.dev/) and the writing style in CLAUDE.md: short sentences, active voice, no marketing adjectives.

**Rules**
- **Verdict first.** Every result leads with the Verdict. A note without one says so: `[inbox] no verdict yet`.
- **Recall card:** name, Verdict, "Avoid when", then "Use when". At most about 6 lines by default; `--full` shows every section.
- **Colour only carries meaning:** the "Avoid when" label and the `[inbox]` status. Every coloured item also has a text label, so nothing depends on colour alone.
- **No colour** when stdout is not a terminal, or when `NO_COLOR` is set to a non-empty value ([no-color.org](https://no-color.org/)). `--json` output is never coloured.
- **Streams:** data on stdout; hints, counts and warnings on stderr. Piping `magpie search pdf | head` shows results only.
- **Width:** the Verdict is never cut. In a terminal, a result is a metadata line (rank, name, type, journal), cut to the terminal width with `…`, then the Verdict on its own lines, indented under the name and wrapped at spaces (a word longer than the line is broken, not dropped). When piped, each result is one line and nothing is cut.
- **Labels:** draft text is labelled `(draft)`; a name-only recall match is labelled `(name match only)`.
- **PURLs for people:** human output shows a PURL decoded (`pkg:npm/@babel/core`, not `pkg:npm/%40babel/core`), and a package by its name (`@babel/core`). `--json`, the files and the API keep the encoded id.
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

Search results in a terminal:

```
$ magpie search pdf
1  pdfkit     npm  personal
   Verdict: avoid: async streams painful; use puppeteer
2  puppeteer  npm  project
   Verdict: default for PDF rendering in new projects
3  pdf-lib    npm  personal
   [inbox] no verdict yet
```

Piped, one line per result:

```
$ magpie search pdf | cat
1  pdfkit     npm  personal  Verdict: avoid: async streams painful; use puppeteer
2  puppeteer  npm  project   Verdict: default for PDF rendering in new projects
3  pdf-lib    npm  personal  [inbox] no verdict yet
```

Suggest list, piped (the hint goes to stderr; in a terminal, the why line follows the Verdict on its own line):

```
$ magpie suggest "a TypeScript CLI with tests" | cat
1  commander  npm  project   Verdict: our CLI parser  Why: matched cli
2  commander  npm  personal  Verdict: fine for small CLIs  Why: matched cli
3  tsx        npm  personal  [inbox] no verdict yet  Why: matched typescript

Already in use, you noted to avoid:
  pdfkit  npm  personal  Verdict: avoid: async streams painful; use puppeteer
3 of 11 candidates. Your coding agent picks the fit; use --limit to see more.
```

## 9. Stack

### Runtime and packaging ([decision 0015](decisions/0015-typescript-on-node.md))

- **TypeScript on Node.js.** `engines.node` is `>=22.12.0`, the floor commander 15 requires; CI runs the tests on Node 22, 24 and 26, on Linux and Windows.
- **ESM only:** `"type": "module"`. The published package contains compiled JavaScript and one `bin` entry, `magpie`.
- **Source under type stripping:** contributors run the `.ts` source directly on Node 22.18.0 or later. `tsconfig.json` follows the [Node.js recommendation](https://nodejs.org/api/typescript.html): `module: nodenext`, `target: esnext`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `rewriteRelativeImportExtensions`. In practice: no enums or namespaces, types imported with `import type`, and file extensions in every import.
- **Build:** for publishing only, Vite bundles the CLI and its libraries into `dist/cli/`: `main.js` and the chunks it loads on demand, with the libraries' licences in `THIRD-PARTY-LICENSES.md` ([decision 0025](decisions/0025-bundle-the-cli.md)). `tsc` only typechecks; tests run on the source. `npm run check:build` checks that the bundle answers as the source does.
- **Tests:** `node:test`, with fixture journals and no network, as for git-guard.

### Libraries (dependency policy check)

Every library needs the maintainer's approval before it is added (CLAUDE.md, section 9). The maintainer approved all six below on 2026-10-03 (`@types/node` during the scaffold, when the typecheck needed it). Figures from the npm registry and GitHub, checked 2026-10-03.

| Need | Library | Licence | Runtime deps | Unpacked size | Maintenance | Weekly downloads | Status |
|---|---|---|---|---|---|---|---|
| CLI parsing | [commander](https://github.com/tj/commander.js) 15.0.0 | MIT | 0 | 203 kB | released 2026-05-29; repo active (2026-10-01); requires Node ≥ 22.12.0 | ~625M | approved |
| Keyword search | [MiniSearch](https://github.com/lucaong/minisearch) 7.2.0 | MIT | 0 | 807 kB (several builds) | released and last pushed 2025-09-16; small, stable | ~3.9M | approved |
| YAML frontmatter | [yaml](https://github.com/eemeli/yaml) 2.9.1 | ISC | 0 | 670 kB | released 2026-09-11; repo active (2026-09-23) | ~258M | approved |
| PURL | [packageurl-js](https://github.com/package-url/packageurl-js) 2.0.1 | MIT | 0 | 56 kB | released 2024-09-04; repo active (2026-08-24) | ~2.6M | approved |
| Typecheck (dev only) | [typescript](https://github.com/microsoft/TypeScript) 7.0.2 | Apache-2.0 | 20 (optional per-platform compiler binaries; one installs) | 2 MB | released 2026-07-08 | ~355M | approved |
| Node type definitions (dev only) | [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) `^22.20.5` | MIT | 1 (`undici-types` 6.21.0, MIT, no dependencies) | ~2.3 MB | released 2026-10-01; stays on major 22 to match the Node floor | ~535M | approved |

The maintainer approved the local app's frontend libraries on 2026-10-04 ([decision 0022](decisions/0022-frontend-stack.md), with licences, dependencies and sizes): `react` and `react-dom` 19.3.0, `vite` 8.3.2, `@vitejs/plugin-react` 6.1.1, `@types/react` and `@types/react-dom` 19.3.0 (all MIT), and `@playwright/test` 1.63.0 (Apache-2.0). All are devDependencies, added on `feat/ui-app`: the app ships as a built bundle. Since [decision 0025](decisions/0025-bundle-the-cli.md), Vite also bundles the CLI, the four libraries above included, so they are devDependencies too (since `feat/launch-prep`): the published package has no runtime dependencies.

Alternatives considered:
- **CLI:** [citty](https://github.com/unjs/citty) 0.2.2 (MIT, 0 deps, 34 kB, ~40M weekly) is the modern, TypeScript-first alternative, still before 1.0. yargs and clipanion were not checked in detail.
- **Search:** [Orama](https://github.com/oramasearch/orama) 3.1.18 (Apache-2.0, 0 deps) is the upgrade path if semantic or hybrid search arrives (roadmap v0.4). FlexSearch (Apache-2.0) is fastest at very large scale but more complex than needed for a few thousand notes.
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
