# 0050 — The agent's path

**Status:** accepted (2026-10-29). Changes no earlier decision. The recall cache keeps [0032](0032-note-text-is-data.md)'s guarantee, in a new form (decision 2).

## Context
An agent waits for RepoMagpie in three places: the hook before an install, `repomagpie recall`, and the MCP server's first answer. On the bench journal of 2,000 notes (`o5-before-1` and `-2`, 2026-10-28, a Windows dev machine, Node 24.13):

| | Median |
|---|---|
| `recall`, warm | 129–134 ms |
| The hook with an install, warm | 119–124 ms |
| The hook without an install | 69–71 ms |
| `recall`, one note changed just before | 673–684 ms |
| The hook with an install, one note changed just before | 664–669 ms |
| `repomagpie mcp`, the spawn to the first answer | 194–200 ms |
| `--version` | 76–77 ms |

A note changes whenever the user or an agent writes one, so the run right after it is common. Each step was timed in main's code, with marks, median of 21 (ms):

| Step | `--version` | Hook, no install | Hook, install, warm | Hook, install, one changed | `recall`, warm | MCP |
|---|---|---|---|---|---|---|
| Node's start, to main.js's first line | 41 | 38 | 40 | 40 | 39 | 49 |
| Our modules loaded | 31 | 24 | 25 | 25 | 28 | 80 |
| Stdin, adapter, detection | – | 3 | 3 | 3 | – | – |
| `noteSignature` (a stat of every note) | – | – | 37 | 37 | 36 | 34 |
| Recall's cache read | – | – | 6.5 | – | 6 | 7 |
| Every note read and parsed, cache written | – | – | – | 560 | – | – |
| Match and output | 4 | – | 9 | 9 | 8 | 6 |
| Exit | 9 | 8 | 12 | 12 | 11 | 11 |

The MCP column also has 4.5 ms to build the server and 8 ms to answer `initialize`. Its 80 ms of modules is the program's chunk (33) and the MCP chunk (47): the SDK, zod, and every tool's core module.

So after one change, recall's cache was thrown away whole: one note changed, 2,000 read again. That one cost is most of the time. The rest is Node's start, which we can't change, module loading, and `noteSignature`.

## Decision
1. **Recall's cache is per note file.** `recall-index.json` keeps its name; its version goes from 3 to 4. It now uses the same per-file machinery as the note list, the links and the graph (`noteEntries`, [0049](0049-the-graph-opens-faster.md)): one entry per note file, keyed by the file's name. After a change, only the notes that were added or changed, and any entry with the wrong shape, are read again. The hook, `recall` and the MCP server's `recall` share the one function (`loadRecallEntries`). A version-3 cache is rebuilt once. A note without a readable id is cached as `null`, so it isn't read again on every run.
2. **The guard of 0032, per entry.** An entry is used only if it has recall's shape and its `file` is the very file it is kept under. Otherwise that note is read again from the listed file. The listing still comes from the notes folder, never from the cache. So a cache a repository committed can't add a note, can't point recall at a file outside the journal, and can't point one note's entry at another note. The red-team test R5 passes unchanged; a new one forges a per-file entry naming another path, inside the journal and outside it, and recall's output stays as it was.

Recall's answers are the same, byte for byte: 270 outputs (cold, warm, one note changed) on the bench journal with alternatives, `examples/vault` and a hostile journal, compared with main's build.

## What was tried and dropped
Each lever was timed on its own: a build per lever, a journal copy per build, runs interleaved (one run of each build in turn), median of 21. The hook and MCP rows run with `--disallow-code-generation-from-strings`, as setup writes them. Milliseconds:

| | main | B: recall per file | B + C, warm | B + C, cache emptied before each run | B + C, `NODE_DISABLE_COMPILE_CACHE=1` |
|---|---|---|---|---|---|
| `--version` | 76.1 | 76.0 | 72.4 | 84.6 | 77.7 |
| Hook, no install | 82.5 | 82.3 | 79.3 | 96.4 | 84.3 |
| Hook, install, warm | 136.0 | 136.3 | 133.5 | 150.0 | 137.9 |
| Hook, install, one note changed | 688.3 | 151.9 | 148.5 | 164.0 | 151.3 |
| `recall`, warm | 133.2 | 134.6 | 130.7 | 154.3 | 137.2 |
| `recall`, one note changed | 685.4 | 146.2 | 145.5 | 166.2 | 150.4 |
| MCP, to the first answer | 191.5 | 191.9 | 179.3 | 201.7 | 193.1 |

| MCP, to the first answer | main | B | B + D, compile cache off | B + C + D |
|---|---|---|---|---|
| Median of 21 | 195.0 | 194.7 | 186.6 | 174.3 |

- **C: V8's compile cache** (`module.enableCompileCache()`, [Node's docs](https://nodejs.org/api/module.html#module-compile-cache), read 2026-10-28). A small entry file turned it on, then imported the CLI. It used Node's default folder, or a per-user folder in the temp folder on POSIX (the temp folder is shared, and the cache holds compiled code). It skipped `doctor`, which writes nothing ([0035](0035-setup-and-doctor.md)). It worked: entries were accepted on the next run, and `--disallow-code-generation-from-strings` kept its guarantee and got its own subfolder. An unwritable folder and 12 starts at once were fine too.

  The bar was 20% faster for `--version` and the hook; it gave 3–6%, as [0025](0025-bundle-the-cli.md) had found for the one-file bundle. The first run after an update was 8–17 ms slower. The reason: V8 compiles a function when it first runs, so the cache holds only what runs while the modules load. The rest of loading is reading files, linking and running module bodies, and Node's own ~40 ms is out of reach. The entry file alone cost ~1.5 ms (the last column). For a few milliseconds, C added an entry file, a folder check, a `doctor` line, and compiled code in the temp folder to reason about. Dropped.
- **D: the MCP server's tools loaded on their first call.** `catalog`, `note`, `search`, `suggest` and `vocabulary` were imported in their handlers. The first answer then didn't load the note writer (71 kB) or search's index with MiniSearch (65 kB). It saved 8 ms (−4%) against a bar of 20%, and it added five chunks to the package. Dropped.

  The rest of the MCP start is out of this brief's reach: Node's start (~49 ms), the program's chunk (~33), the SDK's and zod's module bodies (~40, fixed without changing the SDK), and `noteSignature` (~34).
- **Dropping more of the SDK.** The build's tree-shaking already leaves out the HTTP and SSE transports, the event bus and ajv (none of their names is in the chunk). What stays is the protocol with its 2025 and 2026 schemas, zod, the OAuth error classes the protocol's errors use, stdio and the cfworker validator. Removing any of it means patching the SDK's own modules; out of scope.
- **Marking the SDK and zod free of side effects** (`moduleSideEffects: false`): the chunk didn't get smaller.

## Consequences
On the bench journal, `npm run measure` on the same machine (ms): two runs before, two with B and D, and one with B alone, the code that ships:

| | Before | B and D | B |
|---|---|---|---|
| `recall`, one note changed | 673 / 684 | 144 / 147 | 147 |
| The hook with an install, one note changed | 664 / 669 | 135 / 137 | 137 |
| `recall`, warm | 129 / 134 | 133 / 135 | 136 |
| The hook with an install, warm | 119 / 124 | 125 / 126 | 129 |
| The hook without an install | 69 / 71 | 70 / 70 | 72 |
| MCP, to the first answer | 194 / 200 | 189 / 186 | 215; again alone, 194 |
| `--version`, warm | 76 / 77 | 76 / 80 | 96; again alone, 74 |

In B's run, two more rows were over 10% of the B and D runs (`suggest "a TypeScript CLI with tests"` 314 ms, `linkIndex` 39 ms). B changes none of their code; run again alone, they took 291 and 35 ms.

- The spec's budgets get a row: `recall` and the hook with an install, after one note changed, under 150 ms. It holds, with little room: 144–147 ms in the bench, and 146–152 ms with `--disallow-code-generation-from-strings`, as setup writes the hook (the flag costs about 12 ms a start). `noteSignature` is now the largest warm cost (about 36 ms).
- `recall-index.json` is rebuilt once after the update.
