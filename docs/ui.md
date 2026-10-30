# Local app (`repomagpie ui`)

The local app is an Obsidian-inspired view of your journals in the browser, served from your own machine by `repomagpie ui` (`magpie ui` works too when no other `magpie` is on `PATH`; [decision 0031](decisions/0031-the-command-is-repomagpie.md)). It reads and writes the same Markdown notes as the CLI, through the same core. Decisions: [0021](decisions/0021-local-ui-server.md) (local server), [0022](decisions/0022-frontend-stack.md) (frontend stack), [0023](decisions/0023-api-is-the-json-contract.md) (the API is the `--json` contract). Visual language: [`DESIGN.md`](../DESIGN.md). <!-- check:commands allow -->

The server (sections 2 to 6) is built on `feat/ui-server`, the app (sections 7 to 11) on `feat/ui-app`. `npm run build` builds the app from `ui/` into `dist/ui/`, which `repomagpie ui` serves and the npm package includes. Run from the source without a build, `repomagpie ui` still answers the API, and its page says to run `npm run build`.

**Developing the app:** start `repomagpie ui --no-open` on a scratch journal (CLAUDE.md, section 13), then `MAGPIE_UI_URL=<the printed URL> npm run dev:ui`. Vite's dev server forwards `/api` to that server with the session cookie, the `X-Magpie-Token` header and the Origin it expects. The dev server has no Content-Security-Policy; `repomagpie ui` always sends one (section 3).

## 1. Architecture

```
Browser (the app)  ⇄  local API (node:http, 127.0.0.1)  ⇄  src/core  ⇄  Markdown notes
                              │
            the same JSON documents as the CLI's --json (decision 0008)
                              │
                 CLI  ·  agent via SKILL.md  ·  hook
```

- **One contract.** Every API response is a document the [spec](spec.md) defines: a command's `--json` output (section 2), or a shared document ("Shared JSON documents"). The app, the CLI and agents read the same data in the same form.
- **No logic in the server.** `src/server` parses requests, calls `src/core`, and serialises results. Business rules live in `src/core` only.
- **No new runtime dependencies:** `node:http`, `node:fs`, `node:crypto`.
- **The app is a static bundle** built at publish time into `dist/ui/` and served by `repomagpie ui`. Frontend libraries are devDependencies ([0022](decisions/0022-frontend-stack.md), [0028](decisions/0028-the-graph-page.md)). Their licence notices ship beside the bundle, in `dist/ui/THIRD-PARTY-LICENSES.md`, and the icons' notice in `dist/ui/icons-LICENSE.txt`.
- **Markdown stays the only source of truth.** The server holds only the session token and the search cache.

Code layout: `src/server/` (the HTTP layer) and `ui/` (the app's source); see [architecture](architecture.md).

## 2. The command

`repomagpie ui [--port <n>] [--no-open]`

1. Starts the server on `127.0.0.1`, on a free port chosen by the operating system, or on `--port`. A port in use is an error (exit 1) that names the port.
2. Prints the URL, with the session token, on stdout.
3. Opens the default browser with a platform command (`open` on macOS, `xdg-open` on Linux, `cmd /c start` on Windows; no dependency), unless `--no-open`. If that fails, it says so and the printed URL still works. "Open in editor" (`POST /api/open`) uses the same commands. On Windows, cmd reads its own command line, so the target goes in double quotes, and a target holding `"` or `%` is refused with a message instead of being passed on. Each command runs by absolute path, never by name, because Windows looks a bare name up in the current folder first and `repomagpie ui` often runs inside a cloned repository: `cmd.exe` from `ComSpec` when that is absolute, else from `SystemRoot\System32`; `/usr/bin/open`; `xdg-open` from an absolute `PATH` folder only (a relative entry such as `.` is never searched). The target is the app's URL or a note's absolute path; anything else is refused, since `start` and `open` would look a relative name up in the current folder too.
4. Runs until Ctrl+C, then stops the watchers and closes the server.

Global flags (`--home`, `--project`) choose the journals, as for every command ([spec](spec.md), section 1).

## 3. Security

Every rule here is required and has a test on `feat/ui-server` (section 11).

| Rule | Why | Test |
|---|---|---|
| Listen on `127.0.0.1` only, never `0.0.0.0` or `::` | Nothing on the network can connect | The server's address is `127.0.0.1` |
| A random session token per run (32 bytes from `node:crypto`), only in the opening URL | Another local process or web page can't guess it | Requests without the token or cookie get 401 |
| The token is exchanged once for a cookie: `magpie_<port>=<token>; HttpOnly; SameSite=Strict; Path=/`, then a 303 redirect to `/` drops it from the address bar | Scripts can't read the cookie; the token leaves the URL and history | The exchange sets the cookie and redirects; a wrong token gets 401 |
| Every request except the token exchange needs the cookie: the page, its files and the API; every write (`POST`, `PATCH`) also needs a matching `X-Magpie-Token` header | A cross-site form or link can't write: it can't set the header | A write with the cookie but no header gets 403 |
| **Host check:** `Host` must be `127.0.0.1:<port>` or `localhost:<port>` | Against DNS rebinding | Any other Host gets 403 |
| **Origin check** on writes: `Origin` must be `http://127.0.0.1:<port>` or `http://localhost:<port>`; a missing Origin is refused | Pages on other local ports are "same-site" for cookies (ports don't count), so the origin is checked | Cross-origin and Origin-less writes get 403 |
| **No CORS headers**, ever | Other origins can't read responses | No response has `Access-Control-*` |
| Writes accept `Content-Type: application/json` only, with a body of at most 1 MB. Nothing past 1 MB of a body is kept. A body up to 1 MB over is read to its end and dropped, then gets 413 (answering while a client still sends makes some systems, macOS among them, reset the connection, so the 413 would be lost); a body announced as larger than that gets 413 before it is read, and one without an announced size is cut off once 2 MB have arrived; a request whose body never ends is cut off after 30 s. All of this comes after the Host, cookie, Origin and token checks, so a page without the token can't make the server read a body at all | Forms and simple requests can't write; one write can't hold the server's memory or a connection | Other types get 415; larger bodies 413; a 50 MB announcement 413 at once, an endless body cut off (`src/server/red-team.test.ts`) |
| **No path from a request reaches the file system.** Notes are addressed by journal and PURL `id`, resolved through core. A read-only note (no readable `id`) is addressed by its `file` name, which must equal a name in core's listing of that journal's `notes/` folder; it is never joined to a path. Static files come from a list of the bundle's files built at startup | Path traversal is impossible by construction | `../`, encoded and absolute paths in every parameter get 400 or 404, and nothing outside the journals is read |
| **Content-Security-Policy:** `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` | Only the app's own scripts and styles run; no remote fonts, images or scripts | Every HTML response carries the header |
| Also: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on API responses | No sniffing; the token never leaks in a Referer | Headers present |
| **`GITHUB_TOKEN` never reaches the browser.** Settings show only "set" or "not set" | Secrets stay in the environment (CLAUDE.md, section 10) | No response contains the token's value |

The page gets the token for the `X-Magpie-Token` header from a `<meta>` tag in the HTML, which the server adds only for requests that already carry the session cookie. Other origins can't read that page.

**Note text in the app** ([decision 0032](decisions/0032-note-text-is-data.md), rules 1, 5, 7 and 8). A note may come from a cloned repository's project journal, and its GitHub fields from the repository's owner:

| Rule | Why | Test |
|---|---|---|
| **Hidden characters show as markers.** Every read view shows each control character, bidi control and zero-width character as an ASCII marker in its place, such as `<U+202E>`, never raw and never dropped: the note view, Add's preview, list previews, alternative chips, search results, Check a package, the palette, the link autocomplete, the sidebar's kinds and tags, skipped files and graph labels (a canvas applies bidi too). Search, Check a package and Suggest get the markers from the API, as `--json` has them; the Note document, the Note list and the graph's data keep the file's text, and the app marks it (`visible` in `ui/src/logic/text.ts`, the same characters and markers as core). A note that holds one shows a warning above its sections, "This note contains hidden or control characters", also while you edit it. The editors keep the raw text | A U+202E made "txt.exe" read "exe.txt" in the note view (a Trojan Source trick against the reader); ESC and BEL showed as boxes | The U+202E note shows its markers with "txt.exe" in order and the warning, which stays while editing; the editor holds the raw text; no raw character in the note pane, a list row, a search row, Check a package's card or Add's preview of an existing note, which shows the warning too (e2e); `visible` marks exactly what core marks, on every character up to U+FFFF (unit test) |
| **Alternative chips are flagged as Check a package flags them:** "(non-ASCII letters)" after a name with letters outside ASCII, "(not a valid package name)" after one without a note that no registry allows | A Cyrillic "р" looks like a "p": `рad-left` can't be `pad-left` | A note whose alternatives are `[[рad-left]]` and `[[pad kit]]` shows both flags on its chips (e2e) |
| **Note text is never HTML.** The app has no `dangerouslySetInnerHTML`, no `innerHTML` and no Markdown-to-HTML library: a section's body is parsed into plain data (`ui/src/logic/text.ts`) and React renders it as text; the graph draws labels on a canvas | `<script>` or `<img onerror>` in a note shows as text and never runs | A Verdict with HTML in it shows the text, and the note view has no `img`, `script` or `b` element (e2e) |
| **Comments are read as core reads them** (`stripComments`): a read view leaves out HTML comments, also nested ones, and an unclosed `<!--` with the rest of its line, as search, recall and the agent do ([note schema](note-schema.md), rule 8). A Verdict core reads as empty shows "No verdict yet." and is in the Inbox. Editors keep the comments | Text an agent never sees can't be shown as part of the note, and a section isn't "Nothing yet." in one place and full in another | `ui/src/logic/text.test.ts` runs the same cases against core's `stripComments` and the app's |
| **Links from notes are `http:` and `https:` only** (`externalHref`): the `url` field ("Open repository") and Markdown links in a section. Anything else (`javascript:`, `data:`, `vbscript:`, `file:`) stays text; a `homepage` field is never shown | A link can't run script or open a local file | `javascript:`, `data:` and `vbscript:` in `url`, `homepage` and a body link render as text; every `href` in the note view is `http(s)` or an in-app `#` link (e2e, and a unit test) |
| **Skipped files are shown.** Links inside a journal and notes over 256 KB are never read or written (spec §3); All notes names them above the list ("Skipped 1 file in this journal") | Nothing goes missing without a word, and the user can find a hostile link | A note that links to a file outside the journal shows as skipped, and its text doesn't appear (e2e) |
| **GitHub fields are cleaned at write time:** control, bidi and zero-width characters in the name, description, language, licence, topics and skill names reach a note as markers (`<U+202E>`), so the file never holds one; a repository URL that isn't `https` is replaced by `https://github.com/<owner>/<repo>`. RepoMagpie doesn't store a homepage | What the owner wrote can't hide text or control a terminal later, and the user sees that it tried | A hostile repository's fields come back with markers (`src/core/github.test.ts`) |
| **Discover's results are cleaned the same way** ([decision 0045](decisions/0045-discover.md)): core cleans each result's description, language and topics before the API answers, a name that isn't `owner/repo` is dropped, and the card's link is always `https://github.com/<owner>/<repo>`, never the result's `html_url`. The card renders the text as text | A search result is the owner's text, shown before anyone chose to add it | A result with HTML and a U+202E in its description, topic and language, and a `javascript:` `html_url`, shows the text with markers, no `img`, `script` or `b`, and one link, to GitHub (e2e) |

The Content-Security-Policy above stays as it is: it would also block an inline script, but these rules don't rely on it.

## 4. Live updates

The server watches both journals' `notes/` folders. When a note changes on disk (edited in Obsidian, another editor, or the CLI), it tells the app over Server-Sent Events (`GET /api/events`), and the app refreshes what it shows. A change to any note in a journal also re-reads the open note of that journal, so its links and "Linked from" follow; if the note's own file is unchanged, nothing else in the view changes.

Verified against the [Node.js `fs.watch` caveats](https://nodejs.org/api/fs.html#caveats) (2026-10-04):
- It uses inotify on Linux, FSEvents and kqueue on macOS, and `ReadDirectoryChangesW` on Windows, and "is not 100% consistent across platforms".
- The changed file's name "is not always guaranteed to be provided".
- On Windows, "no events will be emitted if the watched directory is moved or renamed", and deleting it reports `EPERM`.
- On Linux and macOS, a folder deleted and recreated keeps the watch on the old inode, so new events are lost.
- On network file systems and in virtual machines or containers, watching can be unreliable or impossible; `fs.watchFile()` (stat polling) still works, "but this method is slower and less reliable".

So:
- Watch each `notes/` folder (it is flat, so no `recursive` option is needed). Debounce events for 150 ms.
- Don't trust the file name: on any event, recompute the folder's signature (each note's modification time and size, as the search cache does, [spec](spec.md) section 7) and report what changed.
- Also check the signature every 5 s. This catches missed events, a recreated folder, and watchers that never fire.
- If `fs.watch` throws or reports an error, close it and rely on the 5 s check alone.

## 5. Editing

The rules are [decision 0023](decisions/0023-api-is-the-json-contract.md)'s:
- Edits a person makes in the app are human edits, written only through round-trip-safe core functions: `setSection`, `setVerdict`, and edits of the human-owned frontmatter keys `kind`, `tags`, `tried`, `rating` and `alternatives`. `status` follows the Verdict.
- Everything outside the edited part stays byte for byte. A section the file doesn't have is inserted before the next section in the schema's body order, or after the file's last line; an empty body for it writes nothing.
- Tool-owned fields are never edited by hand.
- Saving an edited draft section removes its draft marker; "Accept draft" removes it without changing the text.
- A note whose frontmatter can't be read is read-only, with a warning and "Open in editor".
- **Conflicts:** every read returns `version` (`sha256:<hex>` of the file). Every write sends it back. If the file changed, the answer is 409 with the current version, nothing is written, and the app shows the conflict banner with "Reload".

The exact rules for each kind of edit: [spec](spec.md), "Shared JSON documents", "Editing a note". Core: `setSection`, `setHumanFields` and `acceptDraft` in `src/core/write.ts`; `editNote` and `noteVersion` in `src/core/edit.ts`.

## 6. API

All paths are under `http://127.0.0.1:<port>`. Every API response is JSON, except `/api/events`. A failure returns the endpoint's success document plus `"error"` ([spec](spec.md), section 1); for endpoints without a success document, `{"error": "..."}`.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/` | `?token=<token>` once, then the cookie | 303 to `/` with the cookie; then the app's HTML |
| GET | `/assets/<file>` | | A file of the bundle, from the startup list |
| GET | `/api/settings` | | **Settings** document |
| GET | `/api/tags` | `?journal=personal\|project` | **Tag list** document |
| POST | `/api/tags` | `{"journal"}` | **Tag list** document after "Create tag list": writes the starter list to a journal without `tags.md`; an existing `tags.md` is left as it is |
| POST | `/api/tags` | `{"journal", "add": ["<tag>", …]}` | **Tag list** document after appending the tags `tags.md` doesn't list ([spec](spec.md#shared-json-documents), "Adding tags to the list"); 404 without `tags.md`, 400 for a tag that isn't lowercase kebab-case |
| POST | `/api/tags/from-topics` | `{"journal", "dry_run": true\|false}` | Exactly `repomagpie tags --from-topics --json` (with `--dry-run` for `true`); `dry_run` is required, 400 otherwise ([decision 0030](decisions/0030-github-topics-become-tags.md)) |
| GET | `/api/notes` | `?journal=`, `&status=inbox\|reviewed`, `&kind=`, `&tag=` (repeatable), `&domain=` (one of the 12, confirmed or suggested; else 400) | **Note list** document |
| GET | `/api/graph` | `?journal=personal\|project`, `&ghosts=1` (missing notes as ghost nodes; `0` or none: without) | **Graph** document ([spec](spec.md#shared-json-documents)); 400 for any other `ghosts` |
| GET | `/api/note` | `?journal=&id=<PURL>`, or `?journal=&file=<file name>` for a read-only note | **Note** document, with its `links` and `backlinks` ([spec](spec.md), section 2) |
| PATCH | `/api/note` | `{"journal", "id", "version", "verdict"?, "sections"?: {"<name>": "<body>"}, "fields"?: {"kind", "tags", "tried", "rating", "alternatives"}, "accept_drafts"?: ["<section>"], "add_items"?: {"Use when"?: ["<item>"], "Avoid when"?: ["<item>"]}, "domains"?: {"confirm"?: ["<domain>"], "remove"?: ["<domain>"], "dismiss"?: ["<domain>"], "restore"?: {"domain", "at"}}}` | **Note** document after the edit |
| GET | `/api/search` | `?q=`, `&domain=` (repeatable), `&tag=` (repeatable), `&match=boost\|filter` (else 400), `&kind=`, `&journal=`, `&limit=` | Exactly `repomagpie search --json` |
| POST | `/api/note/preview` | `{"target", "type"?, "to"}` | **Note preview** document (fetches GitHub metadata, writes nothing) |
| POST | `/api/note` | `{"target", "text"?, "type"?, "to", "tags"?, "use_when"?, "avoid_when"?, "domains"?}` | Exactly `repomagpie note --json`; `domains` is `--domain` (at most 3 of the 12, else 400); `use_when` and `avoid_when` are `--use-when` and `--avoid-when`, one item each (else 400). `tags` (lowercase kebab-case, else 400): a new note's tags as Add's preview left them, in place of the drafted ones, appended to `tags.md` where missing; for a note that exists they are ignored with a warning ([decision 0030](decisions/0030-github-topics-become-tags.md)) |
| POST | `/api/import` | `{"text", "to", "dry_run"}` | Exactly `repomagpie import --json` |
| POST | `/api/note/delete` | `{"journal", "id", "version", "dry_run"?}`, or `"file"` for a read-only note | Exactly `repomagpie delete --json` for that note ([decision 0037](decisions/0037-deleting-a-note-moves-it-to-the-trash.md)): with `dry_run: true`, what would move, the trash folder it would go to (`trash`; the stamped name is made at the move) and what links to it, nothing moved; otherwise the note moved to `.trash/`. 409 when `version` isn't the file's current one, with nothing moved |
| POST | `/api/note/restore` | `{"journal", "trash": "<file name in .trash/>"}` | **Restore** document ([spec](spec.md#shared-json-documents)): Undo, the file back in `notes/` under its name. 404 for a name the journal's `.trash/` doesn't list with a stamp; 422 when a note has that name again, and the file stays in the trash |
| POST | `/api/open` | `{"journal", "id"}`, or `{"journal", "file"}` for a read-only note, or `{"journal", "tag_list": true}` for the journal's `tags.md` | `{"opened": true, "path": "..."}`: opens the note, or `tags.md`, in the default editor |
| GET | `/api/events` | | `text/event-stream`: `notes-changed` with `{"journal", "files": [...]}`; a comment every 30 s keeps the stream open |
| GET | `/api/recall` | `?package=` (repeatable), `&type=` | Exactly `repomagpie recall --json` |
| GET | `/api/suggest` | `?description=` (none: the project's manifests and README), `&journal=`, `&limit=` (default 20) | Exactly `repomagpie suggest --json`, for the project `repomagpie ui` was started in |
| POST | `/api/adopt` | `{"target", "type"?}` | Exactly `repomagpie adopt --json`: copies a personal note into the project journal; never installs anything |
| GET | `/api/discover` | `?q=`, `&domain=`, `&kind=`, `&topic=` (repeatable), `&language=`, `&min_stars=`, `&updated_within=` (months, `0` for any time), `&include_archived=true\|false`, `&sort=stars\|forks\|updated\|best`, `&limit=`, `&page=` | Exactly `repomagpie discover --json` ([decision 0045](decisions/0045-discover.md)): the server searches GitHub, never the browser, one search at a time. 400 for a number that isn't whole, another `sort` or `include_archived`, or what the CLI refuses with exit 2; 422 with `problem` (rate limit, offline) when GitHub's search fails; 200 with a warning when a rate limit stopped it after some requests answered |

- `journal` is required where it is listed for a `GET`. In a `POST` body, `to` may be left out and means `personal`, as `--to` does on the CLI.
- `POST /api/open` that can't start the editor answers 422 with `{"opened": false, "path": "...", "error": "..."}`. With `tag_list`, a journal without `tags.md` answers 404; `tag_list` with `id` or `file`, or with any value but `true`, answers 400.
- `GET /api/events` starts with the comment `: connected`.
- A 405 names the allowed methods in an `Allow` header. `HEAD` and `OPTIONS` are not supported.

"Open the repository" and "Copy PURL" happen in the browser, from the note's fields; they need no endpoint.

**Statuses**

| Status | When |
|---|---|
| 200 | Success |
| 303 | The token exchange |
| 400 | A bad parameter or body; what the CLI reports with exit 2 |
| 401 | No session cookie, or a wrong token |
| 403 | A bad Host, a bad or missing Origin on a write, or a missing or wrong `X-Magpie-Token` |
| 404 | An unknown path, or no note with that `id` in that journal |
| 405 | A method the path doesn't support |
| 409 | The note changed since it was read (version mismatch) |
| 413 | A body over 1 MB |
| 415 | A write that isn't `application/json` |
| 422 | The command failed; what the CLI reports with exit 1 (for example, the note already has a Verdict, or GitHub doesn't know the repository) |
| 500 | A bug. The response says so without internals; details go to the terminal running `repomagpie ui` |

## 7. Screens and flows (v0.1)

**Layout:** three panes, like Obsidian ([`DESIGN.md`](../DESIGN.md), Layout).
- **Left sidebar:** journal switcher (Personal / Project), Inbox with a count, the screens (All notes, Search, Add, Discover, Import, Check a package, Suggest, Graph), kinds, domains, tags, settings.
  - **Domains** ([decision 0040](decisions/0040-domains-a-second-axis.md)), after Kinds: each domain some note has, confirmed or suggested, in the vocabulary's order, with its count; the title says both ("tooling: 1 confirmed, 1 suggested"). A click lists those notes ("Domain: tooling"). Hidden while no note has a domain.
  - **Tags at scale** ([decision 0030](decisions/0030-github-topics-become-tags.md)): the 15 tags with the most notes (ties by name), then "Show all N tags", which expands the list in place; "Show fewer tags" collapses it again. The tag open in the centre stays in the list when it is collapsed. Kinds are all shown (at most 10).
- **Centre:** the list or the results. Rows have two lines: the name (the full name on hover) and the package type, then the Verdict, or "no verdict yet". The Inbox badge appears in All notes and search, not in the Inbox, where every row is an inbox note.
  - **All notes' header** has "Add GitHub topics as tags" ([decision 0030](decisions/0030-github-topics-become-tags.md)). The first click shows what it will do, from a dry run (`POST /api/tags/from-topics` with `dry_run: true`), in a strip under the header: "Adds up to 8 tags to 17 notes, and 41 new tags to your tag list.", and how many notes can't be read. Nothing is written yet. "Add the tags" applies it and says how many tags it added, in a toast; "Cancel" closes the strip. The list, the sidebar's tags and the graph update through the live update; the tag list is read again. With nothing to add, the strip says so and offers "Close".
- **Right:** the note.
- **Command palette** on Ctrl/Cmd+K, for search and every action. Its notes and skills are the first six results of `repomagpie search` for exactly what is typed, in the same order. Until that search answers, it says "Searching…"; a failed search shows its error. Never "Nothing matches" before the answer.

1. **Inbox review.** The flow that fights note-taking friction (hypothesis H1, [validation](validation.md)).
   - Inbox notes in a list; `j`/`k` move, `Enter` opens.
   - The Verdict editor has focus; `Ctrl+Enter` saves. Kind, tags (from `tags.md`, with "Edit tag list", which opens `tags.md` in your editor), tried and rating are next to it.
   - **Use when and Avoid when**, under the Verdict, both optional: one line per item, in your words. Enter or "Add" puts the typed line in a list under the box; each item has a remove button; a line still typed when you save is saved too. A section that holds a draft says so first: "This section holds a draft. Items you add here replace it." With an Avoid when item: "RepoMagpie will ask before pdfkit is installed." `Ctrl+Enter` saves the Verdict, the fields and the items in one request (`PATCH /api/note` with `add_items`), by the rules of `repomagpie note --use-when` ([note schema](note-schema.md), rule 7): your own items are kept and the new ones go after them.
   - **Domains**, after the kind: the 12 domains as toggle chips (`aria-pressed`). Confirmed ones are on. Suggested ones are outlined with a dashed border and a hidden "(suggested)" for screen readers; they are not on until you pick them, so a note you only glance at stays unchanged. At 3 the others are disabled. The help line says "Outlined: suggested by RepoMagpie. Pick the ones that are right; they are saved with the note. At most 3." `Ctrl+Enter` saves the picks with the Verdict (`PATCH /api/note` with `domains: {confirm, remove}`): a picked suggestion moves to `domains`, and an unpicked confirmed one is removed.
   - A journal with notes but no `tags.md`: the sidebar's Tags section says "No tag list yet." with "Create tag list", and the editor offers "Create tag list" instead of "Edit tag list". Only that click writes the starter list ([spec](spec.md), section 3). A `tags.md` without tags: the Tags section says "Your tag list is empty." with "Edit tag list".
   - **From GitHub topics**, under the tags: the note's topics that aren't its tags, as chips with a dashed border (at most 8, in GitHub's order, not the repository's own name, not a topic on the stop list; only topics that are valid tags; not ranked, [decision 0030](decisions/0030-github-topics-become-tags.md)). A click adds the tag to the form, saved with it, and appends it to `tags.md` now if the list doesn't have it (`POST /api/tags` with `add`). Without `tags.md` the chips are disabled until "Create tag list". A note without `topics` (a registry package) shows none. The same chips are in the note view's tag editor (the Verdict editor's fields).
   - **Add's preview** of a new note shows the tags the save will write: up to 8 of its topics, ranked as `repomagpie note` ranks them ([decision 0030](decisions/0030-github-topics-become-tags.md)). Each has a remove button. Its "From GitHub topics" chips are the preview's `topic_tags` without the tags shown, at most 8: a removed tag comes back as a chip, and a click adds a chip's topic to the tags. Nothing is written until Save note, which sends the tags shown (`POST /api/note` with `tags`) and appends the new ones to `tags.md`, creating it if the journal has none.
   - Above the editor, short: "What it does" and "Use when", each cut to three bullets or lines with "Show all".
   - Saving a Verdict moves the note to reviewed and opens the next inbox note with its editor focused. An unsaved Verdict stays with its note while you move through the list.
   - **Goal:** review a note in under 15 seconds.
2. **Search.** The same ranking as `repomagpie search`: Verdict first; filters for journal, kind, domain ("Any domain"), tag and status; completed skill lines as their own results. A domain or tag filter sends `match=filter`, so the list holds only notes that have it ([decision 0041](decisions/0041-structured-search.md)). A result whose `why` names something gets a third line: "Matched: domain database · domain testing (suggested) · tag postgresql · words orm, sql".
3. **Note view.**
   - Under the title: "Tried" or "Not tried", and the rating ("Tried · rated 4 of 5"); nothing for a note neither tried nor rated.
   - On a project note: "Project journal, shared with this repository's contributors", so you know who reads what you write there.
   - A note that holds a control, bidi or zero-width character shows a warning above its sections, also while you edit it: "This note contains hidden or control characters". Each one shows as a marker such as `<U+202E>` (§3, "Note text in the app").
   - The Verdict as the hero, marked with the accent; then Use when and Avoid when. The "Avoid when" label is red only when the section has text.
   - **Alternatives**, under the Verdict ([decision 0027](decisions/0027-alternatives-active.md)): the note's `alternatives` as chips that open the note, or look unresolved like any link, each with a remove button ("Remove puppeteer from alternatives"). A chip whose name can't be the package it seems says so after the name, as Check a package does: "(non-ASCII letters)" or "(not a valid package name)" (§3, "Note text in the app"). "+ Add" opens a combobox with the `[[` autocomplete's list; its last option, "Add “wkhtmltopdf”, no note yet", takes the text as typed. Each add or remove saves at once (`fields.alternatives`) and keeps an unsaved Verdict edit. The other entries stay exactly as written, labels included; only the one added or removed changes ([spec](spec.md#shared-json-documents), "Editing a note"). After a remove, "Undo" puts the last one back where it was, with its label (the entry as the note had it). Below, "Alternative to: pdfkit" names the notes that list this one, from `backlinks`.
   - "What it does", with a visible draft badge while it is a draft, and "Accept".
   - "My notes" and "Related". "My notes" is the free-form place to write: a multi-line Markdown editor that keeps the text as typed (blank lines, lists, code fences).
   - Use when, Avoid when, My notes and Related are always shown. When one is empty, or the file doesn't have it, it says "Nothing yet." and offers Edit. Saving a section the file doesn't have inserts it at its place in the schema's body order.
   - Skill lines: the described ones; the others behind one row ("9 skills, none described yet") that expands to their names.
   - **Links** ([decision 0027](decisions/0027-alternatives-active.md)): `[[target]]`, `[[target|label]]` and `[[target#heading]]` in any section, the Verdict included, resolved by core within the note's journal (the Note document's `links`). A resolved link shows the label or the note's name and opens that note as a click in the list does; it is a step in the browser's history (`#note/<journal>/<id>`), so Back returns to the note before. An unresolved link is muted with a dashed underline; its title says why ("No note named “puppeteer” in this journal", "Several notes are named “playwright”"), and screen readers hear the same in words, with what a click does. A missing one opens Add with the target filled in; a target written as a file stem gets what the stem stands for: `[[npm--pdfkit]]` opens Add with `pkg:npm/pdfkit` (`pypi--` and `cargo--` likewise), `[[github--owner--repo]]` with `https://github.com/owner/repo`. A scoped npm stem (`npm--babel--core`) lost its `@`, so it stays as written. An ambiguous one opens Search with its target. Links in code are text.
   - **`[[` autocomplete** in every section editor and the Verdict editor: typing `[[` lists up to 8 notes of the same journal whose name or file stem contains what follows (those that start with it first). ↑/↓ move, Enter or Tab inserts `[[<file stem>|<name>]]`, Esc closes the list and leaves the text as typed. The textarea points to the list with `aria-activedescendant`; a status line tells screen readers how many notes there are and which keys to use.
   - **"Linked from"** at the end: the notes that link here, by name, with where ("in My notes", "as an alternative"). Empty: "No other note links here." Not shown for a read-only note.
   - Metadata chips: kind, licence ("licence unknown" for `unknown`), language, packages by name (`@playwright/cli` for `pkg:npm/%40playwright/cli`), domains, tags. A confirmed domain is a solid chip; a suggested one is outlined, with a check button ("Confirm the domain security") that saves at once (`domains: {confirm}`), says "Domain security confirmed" in a toast, and keeps an unsaved Verdict edit. It's disabled when the note has 3. Beside it, a remove button (×, "Remove suggested domain security", tooltip "Remove the suggestion security") saves at once too (`domains: {dismiss}`): only that value leaves `domains_suggested`, the other values keep their text as written, and `domains` and the rest of the file stay byte for byte. Focus moves to the next suggestion's ×, or to the note. The toast says "Suggested domain security removed" and offers Undo for 10 seconds, which puts the value back at its old position (`domains: {restore}`); "Suggested domain security restored". Both work in either journal, through the same version check as any edit (a note changed on disk gets the conflict banner). Removing the last suggestion leaves `domains_suggested: []`, as [decision 0040](decisions/0040-domains-a-second-axis.md) says for an emptied field: `repomagpie domains --suggest` fills only a note with neither field, so it never brings back a suggestion the person removed, whether or not the note has confirmed domains. Unknown values aren't shown (`doctor` names them).
   - Actions: open the repository, open in an editor, copy the PURL; on a personal note, when there is a project, "Adopt to project" (item 7); "Show in graph" (item 8), except on a read-only note and in the graph's own note pane; "Delete note", last, except in the graph's note pane.
   - **Delete note** ([decision 0037](decisions/0037-deleting-a-note-moves-it-to-the-trash.md)): a quiet button in `danger` text. It opens a dialog, "Move pdfkit to the trash?", from a dry run (`POST /api/note/delete` with `dry_run: true`): the journal, the trash folder (`~/.magpie/.trash`), and that nothing empties the trash; then the notes that link to it, each a link, with where ("in My notes", "as an alternative"), and that those links will show as unresolved while the notes stay as they are. With no such note, nothing about links. "Move to trash" (the danger button) and "Cancel", which has focus; Esc and a click outside cancel. "Move to trash" sends the version the dialog was opened with. After the move, the note leaves the list and the sidebar's counts, the next note in the list opens (in Search and Suggest, the next result), and a toast says "Moved pdfkit to the trash" with **Undo** for 10 seconds. Undo moves the file back to `notes/` under its name (`POST /api/note/restore`) and says "Restored pdfkit". If a note has that name again, the file stays in the trash and a strip across the top says so, with its path, until Close. A note that changed on disk since it was opened isn't moved: the dialog closes and the conflict banner shows. Undo lasts for the session only; the trash itself has no view in the app.
   - PURLs are shown decoded (`pkg:npm/@playwright/cli`), everywhere in the app. The copied PURL and every request keep the encoded id.
   - Paths under the home directory are shown with `~` (`~/.magpie/notes/npm--pdfkit.md`), as `repomagpie recall` prints them, everywhere in the app: the note view, Check a package, Settings and Suggest. The API keeps the absolute path.
4. **Add.**
   - Paste a URL, PURL or name; see the fetched preview; write the Verdict; save. The same logic as `repomagpie note`.
   - The same Use when and Avoid when fields as the inbox review (item 1), sent with the save as `use_when` and `avoid_when`. For a note that already has a Verdict, the Verdict box is disabled, but items can still be saved.
   - Opened from a missing `[[link]]` or alternative, the box holds its target, or what a file stem stands for (item 3, Links). The preview of a new note shows "From GitHub topics" (item 1).
   - **Import:** paste lines, see the dry-run table, apply. The same logic as `repomagpie import --dry-run`, then `repomagpie import`, including its lenient read. Changing the lines needs a new check before importing. While the lines have no item, the help line says what the first line starts with, as the CLI's hint does.
5. **Settings** (read-only in v0.1): journal paths, whether `GITHUB_TOKEN` is set, the version, links to the docs. Also the theme (the system's, dark or light), saved in the browser only. With the system's, the app follows a change of the system's setting at once, and Settings names the one in use ("Follows the system, which is dark now."). The app always sets the colour scheme it shows explicitly, never `light dark`: Safari doesn't redraw `light-dark()` colours when the system changes under `light dark` ([WebKit bug 262974](https://bugs.webkit.org/show_bug.cgi?id=262974)).
6. **Recall:** a "Check a package" box that shows what `repomagpie recall` finds and what the hook does in each agent ([decision 0036](decisions/0036-hooks-in-other-agents.md)). On an exact avoid note: "In Claude Code, Gemini CLI and Antigravity CLI, the hook asks you first. In Codex CLI, Cursor and Copilot CLI, it stops the first try, and your agent asks you." On any other match: "The install goes ahead; in Claude Code, Codex CLI and Gemini CLI, the hook shows this note to the agent." (the other three print nothing then). No note: "The hook stays silent." A line under the intro says VS Code gets no hook, and that the MCP server and the skill check installs there. Each card has an "Alternatives" row after "Avoid when", as the CLI card does ([decision 0029](decisions/0029-recall-names-alternatives.md)), with every alternative on its own line: its name and Verdict (or `[inbox] no verdict yet`), and `(you also noted to avoid it)` after an avoid note. A name with a note links to it; one without is muted with a dashed underline and says so in words, as an unresolved link does: a missing one opens Add with the name (or what its file stem stands for), in that journal; an ambiguous one opens Search with the name.
7. **Suggest for this project** ("Suggest" in the sidebar and the palette): what `repomagpie suggest` finds for the project `repomagpie ui` was started in, from its manifests and README, or from a description typed in the box. Two panes, like Search: the list, then the note. The list says which words it looked for; candidates come Verdict first, in `repomagpie suggest`'s order, each with a third line that says why ("Why: dependency @playwright/test; matched coding, agent", as `repomagpie suggest` prints it); the project's dependencies with an avoid note follow, labelled "In use, avoid" in words. An exact one with alternatives gets a third line, "Instead: puppeteer, pdf-lib", as `repomagpie suggest` prints it: at most 3, then "+N more"; each name links to its note, or, without one, is muted and opens Add or Search, as on the Recall card. These names are no tab stops (each row is one option of the list); the note pane shows the same alternatives as links. Candidates get no extra line. "Show more" asks for 20 more. With nothing to go on (no manifest, no README), it asks for a description.
   - **Adopt to project**, on a personal note when there is a project: a first click shows what happens and who can read it ("The project journal is committed with the code; anyone who can read this repository can read this note."); only "Copy to the project journal" writes, through `POST /api/adopt`. Then the install command, with a copy button and "Run it yourself" (for a repository with several packages, one command per package and a line that says to choose; for a note whose Verdict says to avoid, no command but "Your note says to avoid <name>; no install command."), and "Open the project's note". A note the project already has is refused, with its path.
8. **Graph** (v0.2 part 2, [decision 0028](decisions/0028-the-graph-page.md); "Graph" in the sidebar after Suggest, "Open graph" in the palette, `g g`): one journal's notes, the tags they carry and the connections between them, drawn with sigma (WebGL) and laid out by ForceAtlas2 in a web worker. It follows the journal switcher. Its code is its own chunk; the other screens never load it. Encoding, layout and what waits: the [product](product.md#graph-specification) graph specification.
   - **Status line** in words, above the graph: "Showing 214 notes, 31 tags and 486 connections". It counts what is drawn, so it changes with every filter, toggle and local mode. Tags on one note left out are counted after the tags: "Showing 39 notes, 22 tags (45 on one note hidden) and 98 connections".
   - **Search box:** a name, file stem or `#tag`; up to 8 matches, as the `[[` autocomplete lists them. Enter selects the node and pans to it; the zoom stays. It finds tags on one note too, while they are hidden: the one picked is drawn, next to its note, and stays drawn.
   - **Labels never overlap** ([decision 0044](decisions/0044-graph-labels-never-overlap.md)), at any size or zoom. A label that would overlap one already drawn waits until zooming in makes room. First the hovered and the selected node, on their plates; then the lit node's neighbours; then the larger node, a note before a tag of the same size, tags by note count. Tag labels are smaller and in a quieter ink than note names, and keep the `#`.
   - **Hover** lights a node and its neighbours and dims the rest. **Click** on a note selects it and opens it in a pane beside the graph, where you read and edit it as in the note view; a `[[link]]` there selects that note in the graph. A click on a tag selects it and lights its notes. A missing note, once selected, offers "Add a note", which opens Add with its target (or what its file stem stands for); one whose name several notes have offers "Search notes", which opens Search with it. A click on the empty canvas clears the selection.
   - **Local mode:** with a node selected, "Everything", "1 step" or "2 steps" around it.
   - **Filters:** kind group, status (Any, Reviewed, Inbox), "Tried only", and tags (several: notes with any of them, removable chips). Tags and missing notes follow their notes. "Clear the filters".
   - **Draw:** Tags, Links and Alternatives (on), Tags on one note, Similar and Missing notes (off). Turning one on or off, or a filter, keeps every node that stays where it was; one that joins starts where it was before, or next to its first neighbour.
   - **Tags on one note** (off): a tag that one note in the journal carries is neither a node nor an edge until this is on. The note still lists it, and the tag filter still offers it; a tag chosen in the filter is drawn ([decision 0044](decisions/0044-graph-labels-never-overlap.md)).
   - **Colour by domain**, the last Draw option (off): each note takes its first confirmed domain's colour, else its first suggested domain's, dimmer, else grey ([decision 0043](decisions/0043-the-graph-colours-by-domain.md)). The inbox fade is off then. Only the colours change: nothing moves. The neighbours list and the search box then say each note's domain ("security (suggested)", "No domain") instead of its kind.
   - **Neighbours list**, left of the graph (under it below 960 px): the selected node's neighbours, grouped as Alternatives, Links, Same tag and Similar, each with its kind and inbox status or its note count in words; with nothing selected, the 20 most connected nodes. A listbox: ↑/↓, Home and End move, Enter selects and centres. With the search box and the filters, it is how the page is used without a mouse or a screen; the canvas is `aria-hidden` and has no tab stop.
   - **Legend** under the graph: every colour in words. Coloured by domain, it lists the domains drawn, "Dimmer: a suggested domain" and "Grey: no domain".
   - **Re-run layout** lays the graph out again from where it is, all 300 iterations; **Fit to screen** fits it.
   - **Reopened** in the same session, the graph is drawn where it was, at once; notes added meanwhile join next to a neighbour, and only they move ([decision 0049](decisions/0049-the-graph-opens-faster.md)).
   - **Live:** a change on disk fetches the graph again; what is drawn keeps its place and the camera stays.
   - **Show in graph**, in the note view's actions: opens the graph on that note, selected, in local mode (1 step).
9. **Discover** ([decision 0045](decisions/0045-discover.md); "Discover" in the sidebar after Add, "Discover on GitHub" in the palette): search GitHub's repositories and add the ones you choose to the inbox. Its code and styles are their own chunk, like the graph's. The intro says what leaves the machine: your words and filters, sent to GitHub's search API when you search, nothing from your journals.
   - **Search row:** a text field and Search. It searches on Enter or the button, never on a keystroke. **Filters** under it: Domain (Any or one of the 12; the line under the filters gives the chosen one's definition), Kind (the kinds that only files can tell are marked "(approximate)"), Language (free text, with common languages suggested), Min stars (10, 100, 1k, 10k), Updated within (Any time, 6 months, 1 year, 2 years), Sort (Stars, Forks, Recently updated, Best match) and "Show archived". A filter change sends nothing until the next search.
   - **Result cards**, a list: the name, a link to GitHub that opens in a new tab with `noreferrer`; stars and forks, compact ("12.3k stars"; screen readers hear "12,345 stars"); "Pushed 3 months ago" with the day on hover; the licence, "No licence" in the warning colour; "Archived" when shown; the description, cleaned, cut to two lines; the topics as chips; the estimated kind and suggested domains, quiet, with an "estimated" badge. A repository a journal has: "In your personal journal" and a link to the note that says what it holds, on one line of about 100 characters cut at a word with "…", as the CLI writes it: "Verdict: …", or "What it does: …" when there is no Verdict, or "Open the note (no Verdict yet)". In the journal shown, such a card has no Add and no checkbox.
   - **Add to inbox** (named "Add owner/repo to your inbox") adds it as Add does (`POST /api/note` with the URL), then shows "Added", a link to the new note, which takes focus. **Add with a Verdict…** opens a Verdict box and Use when under the card; Save note sends them with the add. A failed add says why under the card.
   - **Several at once:** each card has a checkbox ("Select owner/repo"). "Add N to inbox" adds them one at a time, in the list's order, with "Adding 2 of 5…", then a summary that takes focus: "Added 2, 1 already in this journal, 1 failed.", with each failure's reason. Without `GITHUB_TOKEN`, more than 5 adds ask first, in a strip: each add uses about 3 to 5 of GitHub's 60 requests an hour; "Add N anyway" or Cancel.
   - **States:** the first visit explains the page and offers an example search; loading shows skeleton rows; no results names the filters to loosen ("Try loosening: at least 10k stars."); a rate limit (GitHub's search limit, or its secondary limit for requests sent too fast) shows the message, the reset in your time, or "Try again in a minute." when that time has passed, and, without a token, a link to how to set one; a limit met after some of a search's requests answered shows their results, with a warning that says so; the search's warnings (also "only 2 of the domain's 3 topics were searched" without a token) show above the results; offline and other errors offer Try again. A limit that ends within 60 seconds is waited out once by the server, so the page stays loading until GitHub answers (decision 0045, rule 9). "More results" adds the next page under the shown one. The page keeps its search, results and adds while another screen is open.
10. **Later:** export or nest (v0.4).

**Keyboard map**

| Key | Action |
|---|---|
| Ctrl/Cmd+K | Command palette |
| `/` | Search |
| `j` / `k` (or ↓ / ↑) | Next / previous row |
| `Enter` | Open the selected note |
| `e` | Edit the Verdict |
| Ctrl+Enter | Save |
| `[[` | In an editor: link a note (↑ / ↓ choose, Enter or Tab inserts, Esc closes the list) |
| `Esc` | Close the palette or editor; back to the list. In the graph: clear the selection, then the search |
| `g i` / `g s` / `g g` | Go to Inbox / Search / Graph |
| `?` | Show the keyboard map |

## 8. States

Every screen has these states, each with words that say what to do ([`DESIGN.md`](../DESIGN.md), Writing):

| State | Shown as |
|---|---|
| Loading | Skeleton rows shaped like the content; no spinners in lists |
| Empty | One sentence and one action, for example "Your inbox is empty. Add a repository here, or from the palette (Ctrl+K)." |
| No project journal | The Project switch in a repository without `.magpie/`: the Inbox and All notes say what a project journal is (a `.magpie/` folder committed with the code, read by everyone who can read the repository, and by the hook and recall for every contributor) and how to start one (`repomagpie note <name> --to project`, or Adopt to project), with "Add a note". Outside a project the switch is disabled |
| Error | What happened and what to do, for example "This note changed on disk since you opened it. Reload to see the new version." |
| Offline | GitHub is unreachable: adding a URL saves the note without metadata, with a warning, as `repomagpie note` does. Everything else works, because it is local |
| Connection lost | `repomagpie ui` stopped: a strip across the top says the notes are safe on disk and to start `repomagpie ui` again. It goes away when the events stream reconnects |
| Read-only | A note that can't be parsed: the read-only banner and "Open in editor" |
| Conflict | The conflict banner and "Reload". It also appears while you edit, as soon as a live update shows the file changed. Reload shows the file as it is now and keeps your unsaved changes in the form |
| Unsaved changes | The browser asks before the page closes or reloads |

The graph page's own states, each in words:

| State | Shown as |
|---|---|
| No notes | "Nothing to draw yet. Add a repository here, or from the palette (Ctrl+K)." with "Add a note" |
| No connections in the journal | A strip over the top of the graph: "Your notes aren't connected yet. Add tags, or [[links]] in My notes." |
| Connections, all switched off | The same strip: "No connections drawn. Turn on Tags or Links to see how your notes connect." |
| Only tags on one note would connect anything | The same strip: "Each of your tags is on one note. Turn on Tags on one note to draw them." |
| Filters match nothing | The strip: "No notes match these filters." with "Clear the filters" |
| WebGL unavailable | The strip: "This browser can't draw the graph: WebGL is off or not available. The counts above and the neighbours list still hold." The status line, the search box, the filters and the neighbours list work |
| Arranging (reduced motion) | "Arranging the graph…"; the graph appears once its layout has settled |

A notice lies over the graph, so it never resizes the canvas or moves the view.

## 9. Accessibility

- Full keyboard use, and a visible focus ring everywhere (`focus` token, 3:1 or more).
- Landmarks (`nav` for the sidebar, `main` for the list, `article` for the note) and a label on every control. One `h1` per screen; the note's name is an `h2`, its sections `h3`.
- A "Skip to the main pane" link is the first Tab stop. The palette, the keyboard map and the delete dialog are modal: what is behind them is `inert`. The delete dialog is an `alertdialog`, labelled by its question and described by its body; focus starts on Cancel and returns to "Delete note" when it closes.
- Lists are listboxes: focus stays on the list, and the selected row is its active descendant.
- AA contrast for all text, checked for every token pair in [`DESIGN.md`](../DESIGN.md).
- Never colour alone: every status, label and selection also has a word or a shape. The same rule as the CLI ([spec](spec.md), section 8).
- `prefers-color-scheme` and `prefers-reduced-motion` are respected.

## 10. Budgets

| Budget | Limit | Checked by |
|---|---|---|
| The app's bundle | At most 200 kB gzipped | `npm run check:bundle` (scripts and styles in `dist/ui/`, gzip level 9), before each UI pull request and in CI |
| First render with 2,000 notes | Under 1 s on a mid-range laptop, with a warm cache, as for search and recall ([spec](spec.md), section 7) | The end-to-end test "2,000 notes": from the URL `repomagpie ui` printed to the first rows on screen. It also reports the cold first run, which builds the note-list cache |
| Long lists | Virtualised: only visible rows are in the DOM | A unit test of the windowing; the 2,000-note measurement |
| Search from the app | The same as `repomagpie search`: under 500 ms with a warm cache ([spec](spec.md), section 7) | The search benchmark |
| Opening a note | Under 50 ms at 2,000 notes with a warm cache ([spec](spec.md), section 7) | `scripts/bench-note.ts` |
| The graph's chunk | Other screens never load it ([decision 0028](decisions/0028-the-graph-page.md)) | The end-to-end test "other screens don't load its chunk" |
| The first files | The script, stylesheet and page every screen loads first: at most 104.0 kB gzipped ([decision 0048](decisions/0048-the-first-load-line-measured.md)), enforced with no allowance | `npm run check:bundle`, from the files `dist/ui/index.html` names (its script, stylesheets and module preloads), lazy chunks not counted. `npm run build:analyze` shows what each script is made of, by source |
| Pages the first screen doesn't show | Lazy: Add, Import, Check a package, Settings, Suggest, the command palette, the keyboard map and the delete dialog load in one shared chunk with their styles (`ui/src/components/later.ts`), prefetched while the browser is idle once the first rows are on screen. The graph and Discover have their own chunks and are not prefetched. Once the chunk is in, a page opens with no loading state; before, it shows a quiet "Loading…" line in its frame (Suggest its skeleton rows), and the palette a shell that keeps what you type. When the chunk arrives while you type, every key lands in the palette, none in a single-key shortcut, and it searches for exactly what was typed; Enter pressed in the shell runs the first action for all of it. A chunk that can't load shows a Reload button where the part would be | `ui/e2e/lazy.spec.ts` |
| The graph's data | Under 300 ms at 2,000 notes, warm ([spec](spec.md), section 7) | `scripts/bench-graph.ts` |
| The graph page at 2,000 notes | Data fetched, layout settled and first frame drawn in under 2 s on a mid-range laptop, with a warm cache (the page reloaded) | `ui/e2e/graph-timing.spec.ts`, from the click on Graph with the page's performance marks (`graph:fetch`, `graph:data`, `graph:settled`, `graph:drawn`); it runs last, alone. It also reports the layout's iterations and the gaps between frames while hovering and zooming. CI reports only. The data is fetched when the graph is asked for, while its chunk loads ([decision 0043](decisions/0043-the-graph-colours-by-domain.md)), so `graph:fetch` comes before the page's own marks |
| The graph's cold first open | First frame under 1,500 ms at 2,000 notes, the graph cache built on the way ([decision 0049](decisions/0049-the-graph-opens-faster.md)) | The same test, opened first; CI reports only |
| The graph reopened | First frame under 500 ms at 2,000 notes when nothing changed: no layout runs ([decision 0049](decisions/0049-the-graph-opens-faster.md)) | The same test: Inbox, then Graph again; CI reports only |
| Hover and zoom | No visible stutter at 2,000 notes | The same test's frame gaps. In headless Chromium WebGL runs in software (SwiftShader), so there they measure the renderer, not the page |

With `REPOMAGPIE_MEASURE=1`, the first-render and graph timing tests also write their numbers and the commit to `.scratch/measure/e2e-timings.json`, which `npm run measure` reports for that commit. Each number keeps its last three runs, and its median: run a timing test three times on a quiet machine.

Measured on `perf/graph-open` (2026-10-28, a Windows dev machine, headless with SwiftShader, median of 3 on a quiet machine): the graph page at 2,000 notes:
- cold first frame 1,892 → 949 ms (data 651 → 343 ms);
- reopened with nothing changed 1,326 → 241 ms;
- warm, after a reload, 1,499 → 965 ms;
- the layout 300 → 120 iterations, 1,040 → 452 ms in the worker.

First render didn't change: cold 937 → 943 ms, warm 159 → 103 ms (the warm one varies between runs). The worker is 2.1 kB gzipped (+0.3 kB). Where the time went, and what was tried and dropped: [decision 0049](decisions/0049-the-graph-opens-faster.md).

Measured on `perf/app-first-load` (2026-10-28, a Windows dev machine): the first files 109.4 → 103.0 kB (script 97.3, styles 5.3, page 0.4), the app 163.9 → 167.2 kB gzipped. The shared chunk is 8.8 kB with 1.0 kB of styles (29.5 kB and 3.3 kB raw). Eight separate chunks would have cost 6.3 kB more in all, one shared chunk 2.3 kB. Of the 30 kB the parts weigh raw, only about 6 kB came off the first files: inside the first script they compressed far better than alone. React is about 214 of the first script's 316 kB raw. Step by step, and why the line moved: [decision 0048](decisions/0048-the-first-load-line-measured.md).

Measured on `feat/next-batch` (2026-10-25, a Windows dev machine, headless with SwiftShader, three runs each): the graph page at 2,000 notes, cold 2,255, 2,223 and 2,211 ms before the early fetch, 1,931, 1,950 and 2,046 ms after; warm 1,480, 1,537 and 1,467 ms before, 1,424, 1,524 and 1,614 ms after. The rest of the cold time is the layout (about 1.3 s) and the server's cold build of the graph data (about 560 ms). With the labels of [decision 0044](decisions/0044-graph-labels-never-overlap.md) (2026-10-26, same machine): cold 2,102, 2,100 and 2,144 ms, warm 1,533, 1,555 and 1,624 ms. The server's cold data took 671 to 719 ms in these runs; placing the labels takes about 1.3 ms a frame for 2,030 nodes.

Measured on `feat/discover` (2026-10-26, a Windows dev machine): the Discover page is its own chunk, 5.5 kB with 0.6 kB of styles (5.7 kB on 2026-10-27, after the rate-limit fixes and the one-line badge). Its sidebar item, palette command and loader add 0.2 kB to the other screens' first files (108.8 → 109.0 kB: script 102.8, styles 5.8, page 0.4), which were already over the graph's line above. The app 163.3 kB gzipped (163.5 kB on 2026-10-27).

Measured on `feat/graph` (2026-10-08, a Windows dev machine): the app 148.1 kB gzipped; the other screens' first files 101.3 kB (+1.9 kB); the graph's chunk 43.8 kB with 1.2 kB of styles and its 1.8 kB worker. Opening a note 32 ms. The graph page at 2,000 notes, headless with SwiftShader: 1.25–1.55 s warm, 1.9–2.2 s cold. On the machine's GPU (an RTX 4060 Ti, through ANGLE and Direct3D 11): 1.03 s warm, 1.84 s cold, and every frame at 17 ms while hovering and zooming; under SwiftShader the longest gaps are 117 ms (hover) and 267 ms (zoom), while sigma's own drawing takes under 6 ms a frame.

Measured on `feat/agent-output` (2026-10-08): the alternatives on Check a package and Suggest add 0.3 kB to the other screens' first files (101.3 → 101.6 kB, 2.2 kB over 99.4); the app 148.4 kB gzipped.

Measured on `feat/ui-app` (2026-10-06, a Windows dev machine): 91.8 kB gzipped (JavaScript 86.9 kB, CSS 4.6 kB, HTML 0.4 kB); first render with 2,000 notes 417 ms with a warm cache, 944 ms cold. `GET /api/notes` on 2,000 notes takes about 37 ms with the note-list cache and about 500 ms without it. With Suggest and Adopt (`feat/suggest-adopt`, 2026-10-06): 94.5 kB gzipped.

## 11. Design process and testing

**Where each explored repository is used**

| Repository | Use |
|---|---|
| `VoltAgent/awesome-design-md` | Reference for the structure of [`DESIGN.md`](../DESIGN.md) (token groups, colour roles, components with variants, prose subsections), studied in the Linear, Raycast and Vercel entries. No palette or identity copied |
| `Leonxlnx/taste-skill` | Character: avoiding the template look, one radius rule, skeletons and empty states, contrast checks. Its scope excludes dashboards, so it doesn't shape the dense lists. Adopted and skipped rules: [decision 0022](decisions/0022-frontend-stack.md) |
| `vercel-labs/agent-skills` | `web-design-guidelines`: a review pass on every screen before each UI pull request, with findings fixed or listed. `react-best-practices`: during implementation. `writing-guidelines`: all UI copy |
| `microsoft/playwright-cli` | During development: the agent drives the running app to check flows and capture screenshots for pull requests and the README. On `feat/ui-app` it wasn't installed on the agent's machine; the screenshots came from the end-to-end suite (`SCREENS=1`) instead. Nor on `feat/graph`: the graph's screenshots (dark and light, 9 and 800 notes) came from a script with the repository's `@playwright/test` |
| `Egonex-AI/Understand-Anything` | Optional, for the maintainer: map the codebase once the app lands |
| `mattpocock/skills` | `tdd` for server and app logic; `code-review` before each pull request |

**Tests**
- **Server** (`node:test`, an in-process server on a random port): every endpoint; each response compared with the CLI's `--json` output for the same input; every security rule in section 3 (bad Host, missing token or header, cross-origin and Origin-less writes, traversal attempts, 409 on conflicts, 413, 415).
- **Core:** round-trip tests for `setSection` and human-field edits, as for `setToolFields`.
- **App logic** (`ui/src/logic/`: list windowing, the keyboard map, note text, the edit request, import labels, palette matching, and the values the app mirrors from core): unit tests with `node:test`, run by `npm test`.
- **End-to-end** (`@playwright/test`, Chromium only, one CI job; `ui/e2e/`): `repomagpie ui` from the source on a temporary journal in `.scratch/e2e/`, built from the example vault, under a fake home directory (`HOME` and `USERPROFILE`), so paths show as `~/.magpie/…`, screenshots show nothing of the machine, and the real `~/.magpie` is never read. The flows: inbox review, search, the note view's tried and rating line, paths with `~`, the favicon, add, import, a 409 conflict, live updates, read-only notes, the palette (the same results as `repomagpie search`, "Searching…" and errors) and keyboard map, decoded PURLs, a journal without `tags.md` or with an empty one, suggest (the same candidates as `repomagpie suggest`, the in-use avoid row, a description, nothing to go on), alternatives before an install (the Alternatives row in Check a package and the Instead line in Suggest; a resolved one opens its note, a missing one opens Add, a file stem with its PURL, an ambiguous one opens Search), unresolved links (a missing one opens Add, a file stem with its PURL, an ambiguous one Search), adopt (nothing written before the confirm, the install command, a repository's one or several packages, no command for a Verdict that says to avoid, nothing installed, a note the project already has), the skip link, no CSP violations, the 2,000-note first render, and the graph page (`ui/e2e/graph.spec.ts`: how you get there, the status line, drawing and the layout worker under the CSP, the empty and no-WebGL states, its chunk loaded only there; hover, a click to the note pane and an edit there that shows in the graph, a tag click, Esc; the search box centring a node, also right after a toggle; local mode; the filters and their counts; the toggles, missing notes and Add, an ambiguous one and Search; the neighbours list by keyboard; an alternative added in the pane drawn as an edge; "Show in graph"; the notices over the canvas and the two texts; a resize across 960 px with a selection, checked on the canvas's pixels; live updates that keep positions; no two labels overlapping, on the example, showcase and 800-note journals, with tags on one note hidden and shown, zoomed in and out; a selection keeping its neighbours' labels; tags on one note counted, shown, and drawn when found), and Discover (`ui/e2e/discover.spec.ts`, against a fake GitHub loaded into the server with `--import`, `ui/e2e/fake-github.ts`, whose answer the search's words pick: the first visit and a search; filters sent only on Search; add one, add with a Verdict, add several with one failing, the token warning; a repository already in the journal, with What it does on one line; rate limited, a secondary limit, a reset already past, a limit on a domain search's second request, offline, no results; More results; the page kept while another screen is open). The 2,000-note timing is `ui/e2e/graph-timing.spec.ts`, its own Playwright project after the rest. `npm run build` first, then `npm run test:e2e`.
- **WebGL in headless Chromium:** runners have no GPU, so `ui/playwright.config.ts` launches Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader`: WebGL through SwiftShader, Chromium's software renderer. Checked on 2026-10-08 on Windows (Playwright's Chromium 1243): headless Chromium reports "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))" with or without the flags; the flags make the choice explicit for Linux CI.
- **A slower machine:** `REPOMAGPIE_CPU_THROTTLE=4 npm run test:e2e` runs every page's CPU 4 times slower (Chromium's own throttle), and `REPOMAGPIE_LATER_DELAY=1500` holds the later chunk 1.5 s (`ui/e2e/fixtures.ts`). With `-- --repeat-each=40 -g "<test>"` they find races a fast machine hides: a frame that comes before React's commit, or a chunk that arrives while you type. A test that needs one sets it itself (`throttle(page, rate)`).
- **Screenshots:** `SCREENS=1 npm run test:e2e` writes every screen and state in dark and light to `.scratch/screens/` (`ui/e2e/screens.spec.ts`); CI skips them.
- **The README's screenshots:** `README_SHOTS=1 npm run test:e2e -- readme-shots` retakes `docs/assets/screen-*.png`, dark, 1440×900 (`ui/e2e/readme-shots.spec.ts`), from a showcase journal of about 45 notes (`ui/e2e/showcase.ts`): the example vault, the screens notes and the retrieval baseline's public repositories, written offline. The inbox note shows suggested domains, and the graph is coloured by domain. The 800- and 2,000-note journals stay for the timing tests. CI skips them.
- **Before each UI pull request:** a `web-design-guidelines` pass, the bundle-size check, and a `writing-guidelines` pass on the copy.
- **CI:** the existing matrix, plus one job ("App build and end-to-end tests") that builds the app, checks the bundle size and runs the end-to-end tests.

## 12. Verified facts

| Item | Result | Source (checked 2026-10-04) |
|---|---|---|
| `fs.watch` behaviour on Windows, macOS and Linux | Platform-dependent and lossy in documented cases; fallback by periodic signature check (section 4) | [Node.js `fs` caveats](https://nodejs.org/api/fs.html#caveats) |
| What `taste-skill` assumes | Tailwind v4, Motion, Next.js Server Components, an icon library, self-hosted fonts; scope excludes dashboards. Adopt and skip list in [0022](decisions/0022-frontend-stack.md) | [`skills/taste-skill/SKILL.md`](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md) |
| Does `playwright-cli` fit end-to-end tests in CI? | No: it drives a browser for coding agents and has no test runner, assertions or reports. Used for development checks and screenshots; `@playwright/test` proposed for CI ([0022](decisions/0022-frontend-stack.md)) | [`playwright-cli` README](https://github.com/microsoft/playwright-cli#readme) |
| The DESIGN.md format version | `alpha`; the components part is "actively evolving". `DESIGN.md` uses only the token groups and section order | [DESIGN.md spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md) |
| React's size against the 200 kB budget | Production builds, gzipped: `react` 4.5 kB, `react-dom` client 107.9 kB (unminified as published), `scheduler` 2.4 kB | The published files of `react`/`react-dom` 19.3.0, measured ([0022](decisions/0022-frontend-stack.md)) |

The `obsidian://` row and its "Still open" question were removed with the "Open in Obsidian" button ([decision 0026](decisions/0026-the-app-is-the-workspace.md)).

## 13. Open questions

- **Graph tab.** Answered on 2026-10-07 by [decision 0026](decisions/0026-the-app-is-the-workspace.md): the graph is a page in the app, v0.2 part 2. The "marketing only" status in [ideas](ideas.md) (idea 10) and [product](product.md#graph-specification) is superseded.
- **Read-only notes by file name.** A note whose frontmatter can't be read has no `id`, so "Open in editor" addresses it by its `file` name, matched against core's listing of `notes/` (section 3). This goes one step beyond "notes are addressed by PURL". The alternative: such notes only show their path, with no open action. Built as in section 3 on `feat/ui-server`, with a traversal test for every parameter; waiting for the maintainer's confirmation.
