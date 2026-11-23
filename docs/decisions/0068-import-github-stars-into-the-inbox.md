# 0068 — Import GitHub stars into the inbox

**Status:** accepted (2026-11-23, from the maintainer's brief). Builds the `import --stars` that [0019](0019-no-star-import-in-v0-1.md) left possible for later; 0019 stays as it is, for v0.1.

## Context
A new user opens an empty journal: the agent has nothing to check, the app nothing to show, the graph is blank. Most developers already keep a list of repositories they found interesting: their GitHub stars, often hundreds, sometimes 5,000 or more.

A star isn't a decision. RepoMagpie's notes lead with the user's Verdict, and the agent's answers (recall, the hook) are for decisions. Thousands of starred notes must not bury the notes a user added on purpose, nor make the agent quote a bookmark as advice.

The maintainer settled the design:
1. Preview first. Nothing is written until the user picks; the default selection is the 100 most recently starred.
2. Starred notes are ordinary inbox notes without a Verdict, marked as coming from stars. The app's Inbox gets a Starred tab. A separate status was rejected.
3. The agent sees decisions, not stars. With a Verdict, a starred note is an ordinary note.
4. A re-run imports only new stars, and skips the stars whose note is in the trash (2026-11-24). Unstarring never deletes a note.
5. It stays fast at 10,000 notes; the targets there came later (2026-11-24, see Consequences).

## Decision

### The mark: `starred: YYYY-MM-DD`
- No field said where a note came from: `explored` is a date, and tags are the user's vocabulary. So the schema gets one optional, tool-owned field: `starred`, the day the user starred the repository (the UTC date of GitHub's `starred_at`).
- Its presence is the mark, and it holds the date: one field, not two. `import --stars` sets it once, when it creates the note. Nothing changes or removes it later; unstarring on GitHub doesn't touch it.
- A **starred note** is a note with `starred` set and an empty Verdict (status `inbox`). With a Verdict, it's an ordinary reviewed note; the field stays as history.

### What the list gives, and what a starred note lacks
- One request per 100 stars: `GET /user/starred` or `GET /users/{login}/starred`, `per_page=100`, with `Accept: application/vnd.github.star+json` for `starred_at`. Newest star first. It pages until a short page, at most 100 pages (10,000 stars), with a warning past that. No request per repository and no README: 5,000 stars cost 50 requests.
- From each item the note gets: name, URL, language, licence (`unknown` when GitHub has none, or `NOASSERTION`), topics, the tags made from topics as Add makes them ([0030](0030-github-topics-become-tags.md)), the kind from topics, name and template flag (rules 1 to 7a, else `other`), the suggested domains from topics, and "What it does" from the description, as a draft.
- `archived` and the last push show in the preview only; no field holds them.
- Against a note made by Add, Import or Discover, a starred note lacks:
  - `packages`: recall finds it only by name;
  - "Notable skills";
  - the kind rules that read files and the README (8 to 12);
  - the domain signals from the README and the manifests;
  - a "What it does" taken from the README.

### Whose stars
- By default, the signed-in user's: `/user/starred`, which needs a token, found as everywhere else ([0053](0053-the-github-token-from-the-github-cli.md): `GITHUB_TOKEN`, `GH_TOKEN`, then `gh auth token`). Without one, the error names `gh auth login`, `GITHUB_TOKEN` and `--user`.
- `--user <login>` reads someone's public stars and needs no token: 60 requests an hour, so about 6,000 stars.
- The token never appears in output, logs, errors or the app.

### The CLI: `repomagpie import --stars`
- It reads the list, then prints a summary: the total, how many are new and how many are already in a journal, the top 10 languages and topics with counts, and what the selection would import.
- In a terminal, it asks `[y/N]`. Without a terminal (agents, scripts), it prints the command to run and writes nothing. `--yes` writes without asking. `--json` prints the preview as a document, and the result with `--yes`.
- Selection:
  - `--limit <n>`: the n most recently starred new ones; 100 by default;
  - `--all`: every new one (not with `--limit`);
  - `--language` and `--topic`: repeatable; a star matches any of the languages and any of the topics, and both when both are given;
  - `--since YYYY-MM-DD`: starred on or after;
  - `--to personal|project`: as `import`;
  - `--user <login>`.
- Only new stars are selected. A star is "already in your journal" when either journal has a note with its id.
- A rate limit or a failed request stops the list. The command keeps what it read, writes the selection from it (with `--yes`), and prints the same command to run later; a re-run skips what's done.
- A star whose note is in either journal's trash ([0037](0037-deleting-a-note-moves-it-to-the-trash.md)) is skipped too: a note the user deleted doesn't come back. The summary says "N skipped because they're in the trash", and the app's table shows the row as in the trash, its box disabled. Only each trash file's `id` is read; the trash is still never listed as notes, as 0037 says. To import such a star again, restore the note or remove its file from the trash.
- `repomagpie delete` finds starred notes too: recall leaves them out as decisions, but delete looks for a note to remove.

### The app
- The Import page has a "GitHub stars" section, in its own chunk: the connection line, the summary, a table (name, description, language, topics, starred date, already in a journal), filters (language, topic, since), a check box per row with the default selection checked, "Import selected", 100 rows a page.
- The Inbox has an Inbox tab and a Starred tab, each with its count, while the journal has starred notes. Starred notes are listed only in the Starred tab, and the sidebar's Inbox count leaves them out. A Verdict moves a note out of the tab.
- `GET /api/stars` reads the list and writes nothing; `POST /api/stars` imports the checked names from the list read last, without asking GitHub again.

### The agent's side
- **catalog** leaves starred notes out by default. `--include-starred` (MCP: `include_starred`) lists them too; full rows have `starred`. The MCP tool's description says so.
- **recall and the hook** never answer from a starred note: its "Use when" and "Avoid when" are empty, and the hook is for decisions. When nothing else matches, recall's document lists the starred notes for the package in `starred`, and the command prints "You starred X on GitHub; no note yet."
- **search and suggest** list reviewed notes, then other inbox notes, then starred notes, each starred one with `starred: true`. The CLI prints `[inbox] starred on GitHub, not reviewed`.
- **The skill** says a result with `starred: true` is a bookmark, not a decision.

## Consequences
- A new user can fill a journal in a minute, and see the import before anything is written.
- The agent's answers stay the user's decisions: a starred note reaches the agent only through search and suggest, last and marked, or through catalog when asked.
- `starred` is a new field: older versions of RepoMagpie read such a note and keep the field, as with any frontmatter they don't know.
- Imported topics can add many tags to `tags.md`, as Add does with topics (0030).
- The caches change shape (the search index, recall's and the note list's), so the first run after the upgrade rebuilds them.
- Measured on 10,000 notes, 8,000 of them starred: see spec §7. The 2,000-note budgets stay. At 10,000 notes spec §7 sets targets, medians on an idle machine: recall and every hook at most 300 ms; search, catalog and suggest at most 1,000 ms; `graphData` at most 1,000 ms. They are not met yet; the next performance branch is to meet them (roadmap, "Speed at 10,000 notes").
