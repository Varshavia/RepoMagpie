# 0053 — The GitHub token from the GitHub CLI's login

**Status:** accepted (2026-10-31, from the maintainer's brief). Refines [0045](0045-discover.md), rule 2 ("`GITHUB_TOKEN` when it is set") and rule 6 ("a warning names the one left out"). 0045 stays as written for everything else; its index row points here.

## Context
Without a token, GitHub allows 10 searches a minute, shared with everything else behind the same public IP address (0045, Consequences), and 60 other requests an hour. A domain search then covers 2 of its 3 topics. RepoMagpie read only `GITHUB_TOKEN`, so a person signed in to the GitHub CLI had to copy its token into the environment of every shell (`export GITHUB_TOKEN=$(gh auth token)`), and the warning about the topics left out was 40 words long.

The GitHub CLI's own order is `GH_TOKEN`, then `GITHUB_TOKEN`, then its login. Both variables are common: `GITHUB_TOKEN` in GitHub Actions, `GH_TOKEN` for `gh` users.

## Decision
1. **The token, in this order:** `GITHUB_TOKEN`, then `GH_TOKEN`, then the GitHub CLI's login (`gh auth token`). `GITHUB_TOKEN` stays first because RepoMagpie has always read it, and a person who set it meant it. A blank variable is skipped.
2. **`gh` runs only when needed:** on the first request that needs a token, only when neither variable is set, only by the absolute path a folder on `PATH` gives (never a bare name, never the current folder, as setup runs an agent's CLI), in the home folder, with a 3-second timeout. Its output counts only when `gh` exits 0 and prints one token (letters, digits, `_`, `.`, `-`); anything else is no token.
3. **The token is read once per process and kept in memory only.** Never written to disk, a cache, a log, a debug line, an error message, a JSON document or the page. It goes only in the `Authorization` header of requests to `api.github.com`. This holds for `note`, `import`, `discover`, the app's Add, Import and Discover, and any later GitHub call.
4. **One connection line, where the source shows:** "GitHub: using your GitHub CLI login", "GitHub: using GITHUB_TOKEN" (or `GH_TOKEN`), or "GitHub: not connected, limited to 10 searches a minute." with "How to connect": install the GitHub CLI and run `gh auth login`, or set `GITHUB_TOKEN`. On Discover and Import in the app, in Settings, and in `repomagpie doctor` (as information, not a to-do). The settings and doctor documents carry the source (`github_source`, `github.source`), never the token.
5. **The partial-search warning is one sentence,** shown only when a search left topics out: "Searched 2 of 3 security topics to stay within GitHub's limit. Connect GitHub to search all." Which topics were searched and left out moves to the document (`partial_search`). In the app the person can dismiss it for the browser session.

## Consequences
- A person signed in to `gh` gets 30 searches a minute and 5,000 requests an hour with no setup, and full domain searches.
- `gh auth token` prints a token with the scopes the person gave `gh`, often more than read-only access to public repositories. RepoMagpie sends only GET requests to `api.github.com`, so it uses none of them; a person who wants less sets `GITHUB_TOKEN` to a fine-grained token with no permissions, which wins (rule 1).
- The app reads the token when its server first calls GitHub, so a `gh auth login` after `repomagpie ui` starts takes effect at the next start. The help says so.
- The MCP server makes no network requests ([0034](0034-the-mcp-server.md)), so it never runs `gh`.
- The CLI's startup budgets (spec §7) are unchanged: the lookup runs at the first GitHub request, never at start.
- Tests never find the real `gh`: unit tests give the commands an environment without `PATH` or a fake lookup, and the end-to-end tests start the app with no token variables and no folder on `PATH` that holds `gh`.
