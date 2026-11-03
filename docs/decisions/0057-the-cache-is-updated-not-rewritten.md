# 0057 — The cache is updated, not rewritten

**Status:** accepted (2026-11-03, from the maintainer's brief). Adds to [0050](0050-the-agents-path.md): recall's cache per note file stays, and so do the note list's, the links' and the graph's. 0050's guarantee for a cache entry (it names its note file, decision 0032) holds in the new file too.

## Context
In `scripts/bench-recall.ts`, "recall, one note changed" was over its 150 ms budget on `main` on the maintainer's machine (146–160 ms; Windows, Node 24). Plain recall took about 135 ms. On 2026-11-03, on a quiet machine (CPU 14 % before the runs), two runs gave:

| Median | Run 1 | Run 2 |
|---|---|---|
| `recall`, warm | 128 ms | 128 ms |
| `recall`, one note changed | 145 ms | 145 ms |
| The hook with an install, one note changed | 136 ms | 135 ms |

The brief supposed that the extra time went into reading and parsing every note again. It doesn't: since 0050, `noteEntries` reads and parses only the changed note. A CPU profile of the built CLI (`--cpu-prof`, 100 µs samples, 15 runs each way, self time per run, one note changed minus warm) shows where the 17 ms go:

| Phase | ms per run |
|---|---|
| Parsing the one changed note: the YAML library's code runs cold in each new process | 7.4 |
| Writing the cache whole: `JSON.stringify` of 2,000 entries, the write, the rename | 5.9 |
| Loading `node:crypto`, for the temporary file's name | 2.0 |
| Listing the notes, garbage collection (noise between runs) | 2.2 |

`noteSignature` (the earlier follow-up) costs the same with or without a change, so it doesn't explain the gap.

## Decision
1. **A delta beside each per-note cache.** The entries read again since a cache was last written whole go to `<name>.delta.json` beside it, in the same format (`recall-index.delta.json`, `note-list.delta.json`, `links.delta.json`, `graph.delta.json`). `noteEntries` reads the delta first, then the cache. One change writes a delta of one entry, not 2,000.
2. **Correctness doesn't depend on the delta.** An entry, in either file, counts only while its note has the modification time and size recorded with it, and only if it has the expected shape for that file (0050; for recall, it must name its note file, decision 0032). A delta that is stale (left behind by a failed removal), corrupt, of another version or gone costs only a read again. A cache's delta is read only when the cache itself is usable.
3. **When the cache is written whole,** and its delta removed:
   - there is no usable cache (none, unreadable, another version);
   - a note it lists was removed or renamed;
   - an entry for an unchanged note is missing or of the wrong shape: a damaged cache is repaired whole, as before;
   - the delta would hold more than 100 entries.

   An edit and a new note write only the delta.
4. **Unchanged:** the temporary file and rename for every write (both files), the waits while another program holds the file, never reading or writing through a link, and the random temporary name. The search index (`search-index.json`) is one MiniSearch index, so it isn't per-note and has no delta.

## Measurements
The bench twice after, on the same machine and day (CPU 12 %):

| Median | Before 1 | Before 2 | After 1 | After 2 |
|---|---|---|---|---|
| `recall`, warm | 128 | 128 | 126 | 127 |
| `recall`, one note changed | 145 | 145 | **138** | **138** |
| The hook with an install, warm | 119 | 118 | 116 | 119 |
| The hook without an install | 68 | 67 | 67 | 68 |
| The hook with an install, one note changed | 136 | 135 | **128** | **131** |
| Codex, Gemini CLI, Antigravity CLI, Copilot CLI, Cursor, with an install | 117–124 | 121–124 | 116–122 | 119–127 |
| The Stop reminder | 129 | 129 | 127 | 128 |

`npm run measure -- --compare` (main's `noteEntries` built for "before", the same session): recall one note changed 142 → 136 ms, the hook one note changed 130 → 126 ms, recall warm 125 → 126 ms, the other hooks −4.4 % to +0.4 %, `linkIndex` 33 → 33 ms, `graphData` 102 → 102 ms, `GET /api/note` 35 → 34 ms. The MCP rows moved −2.5 % to +5.8 %; none of them writes a cache. Sizes, the agent's footprint and every quality number are the same.

What is left of the gap, profiled again: the cold YAML parse of the one note (7.3 ms), loading `node:crypto` (2–3 ms) and the delta's write and rename (1.4 ms).

## Consequences
- Right after a note is saved, the hook and recall answer about 7 ms sooner on 2,000 notes. The app's note list, links and graph write the same small delta.
- A journal's `.cache/` holds up to four more small files. Like the caches, they are safe to delete.
- The cache file still holds the entries of notes changed since it was written whole. A tool that reads `recall-index.json` alone, without its delta, sees older entries for those notes. Only RepoMagpie reads it.
- Two levers are left, each with a cost of its own:
  - **`Math.random` for the temporary name** would save the 2–3 ms of `node:crypto`. The name is unguessable so that a file a teammate committed under it can't block the cache (`writeCache`'s comment). A guessable name is a security change, so it is the maintainer's call.
  - **A YAML-free parse** of the fields recall needs would save most of the 7 ms. That would be a second parser to keep identical to the first.
