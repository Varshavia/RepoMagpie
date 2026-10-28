# 0049 — The graph opens faster

**Status:** accepted (2026-10-28). Supersedes two points of [0028](0028-the-graph-page.md)'s "Layout": "a fixed number of iterations" (now: until the nodes settle, at most 300) and "the same journal gives the same picture every time" (now: on each new page load; within a session, the graph keeps the picture it was drawn with). The rest of 0028 stands, "no positions are stored" included: the positions below live in memory only.

## Context
At 2,000 notes the graph's first frame took 1,964 ms cold and 1,446 ms reopened (quiet-beta15, 2026-10-28, a Windows dev machine, headless Chromium with SwiftShader). Measured stage by stage on the same machine (`perf/graph-open`, median of 3, from the click on Graph):

| Stage | Cold | Reopened |
|---|---|---|
| Data: the request to the parsed JSON | 656 ms | 153 ms |
| Building the graph and sigma | 81 ms | 60 ms |
| Starting the layout's worker | 62 ms | 45 ms |
| ForceAtlas2, 300 iterations | 1,040 ms (3.5 ms each) | 1,021 ms |
| Settled to the first frame | 15 ms | 16 ms |

So the layout was more than half of the time, and the server's cold data a third. On the server, each of the three per-file caches (`note-list.json`, `links.json`, `graph.json`) read and parsed every note itself: about 410 ms each at 2,000 notes, of which readNote is 316 ms. When the graph opened, the note list and the link index had parsed every note already, in the same process.

How many iterations does the layout need? Offline, with the package's own `iterate` and the page's seeds, sizes and settings, at 2,000 notes (2,030 nodes, 4,141 edges): a node's mean move per iteration, ÷ the layout's larger side, falls from 2.0e-2 at 10 iterations to 1.15e-3 at 100 and 9.6e-4 at 120. After that it barely changes (5.2e-4 at 250 and at 300): that is Barnes-Hut's jitter. The picture at 120 is within 3% of the picture at 300 on every number below.

## Decision
1. **A quality measure** (`ui/src/logic/layout-quality.ts`). These are the numbers a faster layout must keep:
   - the median edge length ÷ the bounding box's diagonal;
   - the edge lengths' coefficient of variation;
   - crowding, the share of node pairs closer than their two sizes, on an 800-pixel canvas (every pair up to 1,000 nodes; 200,000 seeded pairs above);
   - separation, a note's mean distance to its own tags ÷ its mean distance to every tag.

   **Tolerance:** each edge number within ±10%; crowding and separation at most 10% worse.
2. **The stop rule** (`ui/src/logic/layout-stop.ts`). The worker runs ForceAtlas2 in chunks of 10 iterations. It stops once a chunk's mean move per iteration is under 1e-3 of the layout's larger side. It never stops before 50 iterations, and never runs more than 300. "Re-run layout" runs all 300, as before.

   | Journal | Iterations | Edge length | Edge CV | Crowding | Separation |
   |---|---|---|---|---|---|
   | 2,000 notes, 300 iterations | 300 | 0.1160 | 0.505 | 0.0052 | 0.566 |
   | 2,000 notes, the stop rule | 120 | 0.1185 | 0.496 | 0.0051 | 0.579 |
   | Showcase, 300 iterations | 300 | 0.0845 | 0.403 | 0 | 0.273 |
   | Showcase, the stop rule | 70 | 0.0891 | 0.405 | 0 | 0.277 |
   | The tests' journal, 300 iterations | 300 | 0.1625 | 0.144 | 0 | 0.596 |
   | The tests' journal, the stop rule | 60 | 0.1542 | 0.141 | 0 | 0.603 |
3. **The seeding stays** as it was: each node's position is seeded from its key.
4. **Positions for the session** (`ui/src/logic/graph-session.ts`). When the graph page closes with a settled layout, where each node was is kept in memory, by journal. That includes the nodes a filter had taken out. Opened again in the same session:
   - **Every drawn node has a kept place:** the graph is drawn there at once. No worker starts, and the camera fits it. A note removed or an edge changed needs no layout either, as with a change while the page is open.
   - **Some nodes are new:** each starts next to its first neighbour that has a place. A short layout (the stop rule) then runs with every kept node pinned (ForceAtlas2's `fixed`). Nothing drawn before moves.
   - **"Re-run layout"** lays it all out, all 300 iterations.

   A reload starts again from the seeds. Nothing is written anywhere.
5. **One parse per note** (`src/core/note-cache.ts`). The three per-file caches get the note from one memo, kept per process. The memo is keyed by journal and file, and is valid for the modification time and size the caches already check. So a note is read and parsed at most once per version, whichever cache asks first. A file no longer listed is forgotten.

   The graph lists the notes once, for its own entries and for the link index. The caches' files, versions and formats don't change. What they hold is the same, byte for byte, as when each cache parsed every note itself. Unit tests check this on the bench journal and on a hostile one.

## What was tried and dropped
- **Tag seeding** (tags on a circle, each note near its first tag). At 2,000 notes it settled in 90 iterations instead of 120, within tolerance. On the showcase journal it needed 150 instead of 70, and separation got worse by 10.6% (0.302 vs 0.273): out.
- **ForceAtlas2 settings:**
  - θ 1.2 settled in 110 iterations and θ 1.5 in 120, both within tolerance; θ 1.5 costs about 20% less per iteration (offline). θ 2: crowding +19%, out.
  - Half the `slowDown` settled by about 60 iterations, but its jitter stays higher, so the threshold would need tuning again.

  Neither was needed for the bar, and both change the picture up to the tolerance. The maintainer declined θ 1.5 (2026-10-28); θ stays 1.0.
- **A short layout over the whole graph on reopen**, without pinning. A note joining the tests' journal moved another note 22% of the layout's side. Offline, a second short layout on an unchanged graph moved nodes up to 5.6% on the tests' journal (12 nodes, three without connections), and up to 7.7% on the showcase journal. Nodes without connections never settle under strong gravity.

## Positions across sessions: not now
Kept in `<journal>/.cache/graph-layout.json`, a reload would draw at once too. At 2,000 notes the first frame after a reload is 965 ms: data 344 ms (the app's other first requests share the server), then a layout of 120 iterations. With kept positions it would be about the reopen's time plus the slower data, about 450 ms.

The costs:
- a file of about 80 kB (2,030 positions);
- a new write path, from the page to the server;
- the picture after a reload would depend on history across sessions, not only within one.

The file is a cache, so it can be rebuilt and [0001](0001-plain-markdown-storage.md) allows it. But 0028 says no positions are stored, so it needs a decision that changes that.

The maintainer declined it for now (2026-10-28). It is a candidate in [ideas](../ideas.md), idea 21.

## Consequences
At 2,000 notes (median of 3, quiet machine, `ui/e2e/graph-timing.spec.ts`):

| | Before | After |
|---|---|---|
| Cold first frame | 1,892 ms | 949 ms |
| Reopened, nothing changed | 1,326 ms | 241 ms |
| Warm first frame (after a reload) | 1,499 ms | 965 ms |
| Cold data | 651 ms | 343 ms |
| Layout | 300 iterations, 1,040 ms | 120 iterations, 452 ms |

- **The server:**
  - the graph's cold data, with the note list and links built, takes 40 ms instead of 468;
  - with both caches cold, 462 ms instead of 866;
  - warm data 39 ms instead of 62 (one listing instead of two).

  The memo keeps about 1.5 kB of heap a note, 2.9 MB at 2,000. The peak RSS of the app's cold flow (note list, links, graph) is 112 MB instead of 149.
- First render, cold or warm, doesn't change.
- The layout's worker is 0.3 kB larger, gzipped (it bundles the stop rule).
- The picture after a reload is the same as before the change, within tolerance: fewer iterations, same seeds.
- A graph reopened after notes were added keeps its old picture, with the new notes placed in it. "Re-run layout" gives the full layout.
