# 0021 — Local UI server

**Status:** accepted (2026-10-04)

## Context
The maintainer wants a visual app for the journal: Obsidian-inspired, able to read and edit notes, and built on the same core as the CLI. Every existing principle still holds: plain Markdown is the only source of truth ([0001](0001-plain-markdown-storage.md)), notes are never damaged (the round-trip guarantees in the [note schema](../note-schema.md)), the personal journal is private ([0013](0013-two-journal-scopes.md)), and nothing runs on a remote server.

The [vision](../vision.md)'s non-goals said "no server". That was written against hosted services and accounts, not against a process the user starts on their own machine.

Options considered:

| Option | Verdict |
|---|---|
| A. Static HTML export (data embedded, read-only) | Can't edit or review notes. Kept for later as an export mode (nests, v0.3). |
| **B. Local server: `magpie ui` serves the app and a JSON API on 127.0.0.1** | **Chosen.** Full read and write through the same core the CLI uses. No hosting, no accounts. |
| C. Desktop app (Electron, Tauri) | A heavy install and update story for a single-maintainer project. Rejected. |
| D. Obsidian plugin | Ties the product to Obsidian, a non-goal. Possible later as an extra. |

## Decision
- **`magpie ui`** starts a server that listens on `127.0.0.1` only. It runs when the user starts it, and only until they stop it (Ctrl+C). It serves the app (a static bundle, [0022](0022-frontend-stack.md)) and a JSON API ([0023](0023-api-is-the-json-contract.md)).
- **The server has no logic of its own.** It parses requests, calls `src/core`, and serialises the results. Business rules stay in `src/core`, shared with the CLI, the agent skill and the hook.
- **No new runtime dependencies for the server:** `node:http`, `node:fs` and `node:crypto` only.
- **"No server" means no remote server.** No hosted service, no accounts, no telemetry. A local process the user starts is allowed. The vision's non-goal line now says exactly this.
- **Security is part of the decision, not an option:** loopback only, a random session token per run exchanged for an `HttpOnly`, `SameSite=Strict` cookie, a token header on every write, Host and Origin checks, JSON-only writes, no CORS, notes addressed by PURL and never by path, a strict Content-Security-Policy, and `GITHUB_TOKEN` never sent to the browser. Details and tests: [UI](../ui.md), "Security".
- **Scope:** this extends v0.1 ([0010](0010-v0-1-scope.md)) with the local app: inbox review, search, the note view, add and import, read-only settings, and recall once it exists. The roadmap's v0.1 gets a "Local app" section.

## Consequences
- The CLI stays the primary interface ([0002](0002-cli-first.md)); the app is another surface over the same core and the same JSON documents.
- Anything that listens on a port is attack surface. Every rule in [UI](../ui.md), "Security", ships with a test, on the `feat/ui-server` branch.
- Plain Markdown stays the only source of truth: the server keeps no state beyond the session token and the search cache ([spec](../spec.md), section 7).
- v0.1 grows. The roadmap orders the work: recall → UI server → UI app → suggest and adopt → skill and launch.
- A static, read-only export (option A) remains possible later, for nests.
