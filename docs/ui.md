# Local app (`magpie ui`)

The local app is an Obsidian-inspired view of your journals in the browser, served from your own machine by `magpie ui`. It reads and writes the same Markdown notes as the CLI, through the same core. Decisions: [0021](decisions/0021-local-ui-server.md) (local server), [0022](decisions/0022-frontend-stack.md) (frontend stack), [0023](decisions/0023-api-is-the-json-contract.md) (the API is the `--json` contract). Visual language: [`DESIGN.md`](../DESIGN.md).

Nothing here is built yet. The server is built on `feat/ui-server` (after `feat/recall`), the app on `feat/ui-app` ([roadmap](roadmap.md), v0.1, "Local app").

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
- **The app is a static bundle** built at publish time into `dist/ui/` and served by `magpie ui`. Frontend libraries are devDependencies ([0022](decisions/0022-frontend-stack.md)).
- **Markdown stays the only source of truth.** The server holds only the session token and the search cache.

Code layout: `src/server/` (the HTTP layer) and `ui/` (the app's source); see [architecture](architecture.md).

## 2. The command

`magpie ui [--port <n>] [--no-open]`

1. Starts the server on `127.0.0.1`, on a free port chosen by the operating system, or on `--port`. A port in use is an error (exit 1) that names the port.
2. Prints the URL, with the session token, on stdout.
3. Opens the default browser with a platform command (`open` on macOS, `xdg-open` on Linux, `cmd /c start` on Windows; no dependency), unless `--no-open`. If that fails, it says so and the printed URL still works.
4. Runs until Ctrl+C, then stops the watchers and closes the server.

Global flags (`--home`, `--project`) choose the journals, as for every command ([spec](spec.md), section 1).

## 3. Security

Every rule here is required and has a test on `feat/ui-server` (section 11).

| Rule | Why | Test |
|---|---|---|
| Listen on `127.0.0.1` only, never `0.0.0.0` or `::` | Nothing on the network can connect | The server's address is `127.0.0.1` |
| A random session token per run (32 bytes from `node:crypto`), only in the opening URL | Another local process or web page can't guess it | Requests without the token or cookie get 401 |
| The token is exchanged once for a cookie: `magpie_<port>=<token>; HttpOnly; SameSite=Strict; Path=/`, then a 303 redirect to `/` drops it from the address bar | Scripts can't read the cookie; the token leaves the URL and history | The exchange sets the cookie and redirects; a wrong token gets 401 |
| Every API request needs the cookie; every write (`POST`, `PATCH`) also needs a matching `X-Magpie-Token` header | A cross-site form or link can't write: it can't set the header | A write with the cookie but no header gets 403 |
| **Host check:** `Host` must be `127.0.0.1:<port>` or `localhost:<port>` | Against DNS rebinding | Any other Host gets 403 |
| **Origin check** on writes: `Origin` must be `http://127.0.0.1:<port>` or `http://localhost:<port>`; a missing Origin is refused | Pages on other local ports are "same-site" for cookies (ports don't count), so the origin is checked | Cross-origin and Origin-less writes get 403 |
| **No CORS headers**, ever | Other origins can't read responses | No response has `Access-Control-*` |
| Writes accept `Content-Type: application/json` only, with a body of at most 1 MB | Forms and simple requests can't write | Other types get 415; larger bodies 413 |
| **No path from a request reaches the file system.** Notes are addressed by journal and PURL `id`, resolved through core. A read-only note (no readable `id`) is addressed by its `file` name, which must equal a name in core's listing of that journal's `notes/` folder; it is never joined to a path. Static files come from a list of the bundle's files built at startup | Path traversal is impossible by construction | `../`, encoded and absolute paths in every parameter get 400 or 404, and nothing outside the journals is read |
| **Content-Security-Policy:** `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` | Only the app's own scripts and styles run; no remote fonts, images or scripts | Every HTML response carries the header |
| Also: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on API responses | No sniffing; the token never leaks in a Referer | Headers present |
| **`GITHUB_TOKEN` never reaches the browser.** Settings show only "set" or "not set" | Secrets stay in the environment (CLAUDE.md, section 10) | No response contains the token's value |

The page gets the token for the `X-Magpie-Token` header from a `<meta>` tag in the HTML, which the server adds only for requests that already carry the session cookie. Other origins can't read that page.

## 4. Live updates

The server watches both journals' `notes/` folders. When a note changes on disk (edited in Obsidian, another editor, or the CLI), it tells the app over Server-Sent Events (`GET /api/events`), and the app refreshes what it shows.

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
- Edits a person makes in the app are human edits, written only through round-trip-safe core functions: `setSection`, `setVerdict`, and edits of the human-owned frontmatter keys `kind`, `tags`, `tried` and `rating`. `status` follows the Verdict.
- Everything outside the edited part stays byte for byte.
- Tool-owned fields are never edited by hand.
- Saving an edited draft section removes its draft marker; "Accept draft" removes it without changing the text.
- A note whose frontmatter can't be read is read-only, with a warning and "Open in editor".
- **Conflicts:** every read returns `version` (`sha256:<hex>` of the file). Every write sends it back. If the file changed, the answer is 409 with the current version, nothing is written, and the app shows the conflict banner with "Reload".

## 6. API

All paths are under `http://127.0.0.1:<port>`. Every API response is JSON, except `/api/events`. A failure returns the endpoint's success document plus `"error"` ([spec](spec.md), section 1); for endpoints without a success document, `{"error": "..."}`.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/` | `?token=<token>` once, then the cookie | 303 to `/` with the cookie; then the app's HTML |
| GET | `/assets/<file>` | | A file of the bundle, from the startup list |
| GET | `/api/settings` | | **Settings** document |
| GET | `/api/tags` | `?journal=personal\|project` | **Tag list** document |
| GET | `/api/notes` | `?journal=`, `&status=inbox\|reviewed`, `&kind=`, `&tag=` (repeatable) | **Note list** document |
| GET | `/api/note` | `?journal=&id=<PURL>`, or `?journal=&file=<file name>` for a read-only note | **Note** document |
| PATCH | `/api/note` | `{"journal", "id", "version", "verdict"?, "sections"?: {"<name>": "<body>"}, "fields"?: {"kind", "tags", "tried", "rating"}, "accept_drafts"?: ["<section>"]}` | **Note** document after the edit |
| GET | `/api/search` | `?q=`, `&tag=` (repeatable), `&kind=`, `&journal=`, `&limit=` | Exactly `magpie search --json` |
| POST | `/api/note/preview` | `{"target", "type"?, "to"}` | **Note preview** document (fetches GitHub metadata, writes nothing) |
| POST | `/api/note` | `{"target", "text"?, "type"?, "to"}` | Exactly `magpie note --json` |
| POST | `/api/import` | `{"text", "to", "dry_run"}` | Exactly `magpie import --json` |
| POST | `/api/open` | `{"journal", "id"}`, or `{"journal", "file"}` for a read-only note | `{"opened": true, "path": "..."}`: opens the note in the default editor |
| GET | `/api/events` | | `text/event-stream`: `notes-changed` with `{"journal", "files": [...]}`; a comment every 30 s keeps the stream open |
| GET | `/api/recall` | `?package=` (repeatable), `&type=` | Exactly `magpie recall --json` (once `feat/recall` exists) |

"Open the repository", "Open in Obsidian" and "Copy PURL" happen in the browser, from the note's fields; they need no endpoint. Obsidian is opened with `obsidian://open?path=<URI-encoded absolute path>` (section 12).

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
| 500 | A bug. The response says so without internals; details go to the terminal running `magpie ui` |

## 7. Screens and flows (v0.1)

**Layout:** three panes, like Obsidian ([`DESIGN.md`](../DESIGN.md), Layout).
- **Left sidebar:** journal switcher (Personal / Project), Inbox with a count, kinds, tags, settings.
- **Centre:** the list or the results.
- **Right:** the note.
- **Command palette** on Ctrl/Cmd+K, for search and every action.

1. **Inbox review.** The flow that fights note-taking friction (hypothesis H1, [validation](validation.md)).
   - Inbox notes in a list; `j`/`k` move, `Enter` opens.
   - The Verdict editor has focus; `Ctrl+Enter` saves. Kind, tags (from `tags.md`), tried and rating are next to it.
   - Saving a Verdict moves the note to reviewed and selects the next inbox note.
   - **Goal:** review a note in under 15 seconds.
2. **Search.** The same ranking as `magpie search`: Verdict first; filters for journal, kind, tag and status; completed skill lines as their own results.
3. **Note view.**
   - The Verdict as the hero; then Use when and Avoid when.
   - "What it does", with a visible draft badge while it is a draft.
   - Skill lines.
   - Metadata chips: licence, language, PURL packages.
   - Actions: open the repository, open in an editor, open in Obsidian, copy the PURL.
4. **Add.**
   - Paste a URL, PURL or name; see the fetched preview; write the Verdict; save. The same logic as `magpie note`.
   - **Import:** paste lines, see the dry-run table, apply. The same logic as `magpie import --dry-run`, then `magpie import`.
5. **Settings** (read-only in v0.1): journal paths, whether `GITHUB_TOKEN` is set, the version, links to the docs.
6. **Recall** (once `feat/recall` exists): a "Check a package" box that shows what the hook would say.
7. **Later, not v0.1:** suggest and adopt panels (they ship with those commands), export or nest (v0.3). A graph tab: open question (section 13).

**Keyboard map**

| Key | Action |
|---|---|
| Ctrl/Cmd+K | Command palette |
| `/` | Search |
| `j` / `k` | Next / previous row |
| `Enter` | Open the selected note |
| `e` | Edit the Verdict |
| Ctrl+Enter | Save |
| `Esc` | Close the palette or editor; back to the list |
| `g i` / `g s` | Go to Inbox / Search |
| `?` | Show the keyboard map |

## 8. States

Every screen has these states, each with words that say what to do ([`DESIGN.md`](../DESIGN.md), Writing):

| State | Shown as |
|---|---|
| Loading | Skeleton rows shaped like the content; no spinners in lists |
| Empty | One sentence and one action, for example "Your inbox is empty. Add a repository with Ctrl+K." |
| Error | What happened and what to do, for example "This note changed on disk since you opened it. Reload to see the new version." |
| Offline | GitHub is unreachable: adding a URL saves the note without metadata, with a warning, as `magpie note` does. Everything else works, because it is local |
| Read-only | A note that can't be parsed: the read-only banner and "Open in editor" |
| Conflict | The conflict banner and "Reload" |

## 9. Accessibility

- Full keyboard use, and a visible focus ring everywhere (`focus` token, 3:1 or more).
- Landmarks (`nav` for the sidebar, `main` for the list, `article` for the note) and a label on every control.
- AA contrast for all text, checked for every token pair in [`DESIGN.md`](../DESIGN.md).
- Never colour alone: every status, label and selection also has a word or a shape. The same rule as the CLI ([spec](spec.md), section 8).
- `prefers-color-scheme` and `prefers-reduced-motion` are respected.

## 10. Budgets

| Budget | Limit | Checked by |
|---|---|---|
| The app's bundle | At most 200 kB gzipped | A size check before each UI pull request, and in CI |
| First render with 2,000 notes | Under 1 s on a mid-range laptop | An end-to-end measurement on a generated journal |
| Long lists | Virtualised: only visible rows are in the DOM | A unit test of the windowing; the 2,000-note measurement |
| Search from the app | The same as `magpie search`: under 500 ms with a warm cache ([spec](spec.md), section 7) | The search benchmark |

## 11. Design process and testing

**Where each explored repository is used**

| Repository | Use |
|---|---|
| `VoltAgent/awesome-design-md` | Reference for the structure of [`DESIGN.md`](../DESIGN.md) (token groups, colour roles, components with variants, prose subsections), studied in the Linear, Raycast and Vercel entries. No palette or identity copied |
| `Leonxlnx/taste-skill` | Character: avoiding the template look, one radius rule, skeletons and empty states, contrast checks. Its scope excludes dashboards, so it doesn't shape the dense lists. Adopted and skipped rules: [decision 0022](decisions/0022-frontend-stack.md) |
| `vercel-labs/agent-skills` | `web-design-guidelines`: a review pass on every screen before each UI pull request, with findings fixed or listed. `react-best-practices`: during implementation. `writing-guidelines`: all UI copy |
| `microsoft/playwright-cli` | During development: the agent drives the running app to check flows and capture screenshots for pull requests and the README |
| `Egonex-AI/Understand-Anything` | Optional, for the maintainer: map the codebase once the app lands |
| `mattpocock/skills` | `tdd` for server and app logic; `code-review` before each pull request |

**Tests**
- **Server** (`node:test`, an in-process server on a random port): every endpoint; each response compared with the CLI's `--json` output for the same input; every security rule in section 3 (bad Host, missing token or header, cross-origin and Origin-less writes, traversal attempts, 409 on conflicts, 413, 415).
- **Core:** round-trip tests for `setSection` and human-field edits, as for `setToolFields`.
- **App logic** (reducers, formatting, keyboard maps, list windowing): unit tests.
- **End-to-end** (`@playwright/test`, Chromium only, one CI job): the inbox review, search, add and import flows against a temporary journal; screenshots in light and dark for the pull request.
- **Before each UI pull request:** a `web-design-guidelines` pass, the bundle-size check, and a `writing-guidelines` pass on the copy.
- **CI:** the existing matrix, plus one job that builds the app and runs the end-to-end tests.

## 12. Verified facts

| Item | Result | Source (checked 2026-10-04) |
|---|---|---|
| `fs.watch` behaviour on Windows, macOS and Linux | Platform-dependent and lossy in documented cases; fallback by periodic signature check (section 4) | [Node.js `fs` caveats](https://nodejs.org/api/fs.html#caveats) |
| What `taste-skill` assumes | Tailwind v4, Motion, Next.js Server Components, an icon library, self-hosted fonts; scope excludes dashboards. Adopt and skip list in [0022](decisions/0022-frontend-stack.md) | [`skills/taste-skill/SKILL.md`](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md) |
| Does `playwright-cli` fit end-to-end tests in CI? | No: it drives a browser for coding agents and has no test runner, assertions or reports. Used for development checks and screenshots; `@playwright/test` proposed for CI ([0022](decisions/0022-frontend-stack.md)) | [`playwright-cli` README](https://github.com/microsoft/playwright-cli#readme) |
| The DESIGN.md format version | `alpha`; the components part is "actively evolving". `DESIGN.md` uses only the token groups and section order | [DESIGN.md spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md) |
| `obsidian://` to open a note | `obsidian://open?path=<URI-encoded absolute path>` opens the file in "the most specific vault which contains the specified file path"; values must be URI-encoded; the scheme registers itself on Windows and macOS, and needs manual setup on Linux | [Obsidian URI help](https://obsidian.md/help/Extending+Obsidian/Obsidian+URI) |
| React's size against the 200 kB budget | Production builds, gzipped: `react` 4.5 kB, `react-dom` client 107.9 kB (unminified as published), `scheduler` 2.4 kB | The published files of `react`/`react-dom` 19.3.0, measured ([0022](decisions/0022-frontend-stack.md)) |

**Still open:** what Obsidian does when a journal is not inside any vault it knows (the path open then has nothing to open). To be tried on `feat/ui-app`; until then, "Open in Obsidian" is shown only as a secondary action.

## 13. Open questions

- **Graph tab.** The UI brief lists a graph tab for v0.2. [Ideas](ideas.md) (idea 10) and [product](product.md) keep graph views "marketing only, not scheduled", based on the desk research. Which holds?
- **Dependencies.** [Decision 0022](decisions/0022-frontend-stack.md)'s packages need approval before `feat/ui-app`.
- **Read-only notes by file name.** A note whose frontmatter can't be read has no `id`, so "Open in editor" addresses it by its `file` name, matched against core's listing of `notes/` (section 3). This goes one step beyond "notes are addressed by PURL". The alternative: such notes only show their path, with no open action.
