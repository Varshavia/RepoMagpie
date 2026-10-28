# 0048 — The first files' line, measured

**Status:** accepted (2026-10-28). Supersedes the size line in [0028](0028-the-graph-page.md)'s "Loading" section (the first files at most 3 kB over 99.4 kB). The rest of 0028 stands: the graph is its own chunk, and other screens never load it.

## Context
0028 let the other screens' first files (the script, stylesheet and page `index.html` names, gzipped) grow at most 3 kB over their size before the graph: 102.4 kB. Features since then took them to 109.4 kB on 0.2.0-beta.14, and `npm run check:bundle` passed only through an allowance of 109.5 kB.

`perf/app-first-load` made every part the first screen doesn't show load later: Add, Import, Check a package, Settings, Suggest, the command palette, the keyboard map and the delete dialog. Measured one step at a time with `npm run check:bundle` (kB of 1,024 bytes, gzipped level 9; first files / every script and style):

| Step | First files | Total |
|---|---|---|
| Before (0.2.0-beta.14's app) | 109.4 | 163.9 |
| Each part its own chunk, Add to the delete dialog (seven steps) | 103.5 | 170.2 |
| The same parts in one shared chunk | 103.0 | 166.2 |
| The palette's icon only it uses, out of the first script (measured, not kept: 148 bytes) | 102.9 | 166.3 |
| The styles only those parts use, in the shared chunk's stylesheet | 102.6 | 166.8 |
| The palette's shell, which takes what you type while the chunk loads, and the prefetch | 103.0 | 167.2 |

The parts are 30 kB of minified script, but inside the first script they compressed to about 6 kB; alone, each in its own chunk, they took 12.3 kB. So moving them gained about half of what their raw size suggested, and the rest of the first script is what every first screen needs: React (about 214 kB of the 316 kB raw), the note view, the list, the sidebar, the review form, and the Alternatives row, which the first note shows.

The next candidates are NotePane's edit-only parts: the section editors and `LinkTextarea` (2.2 kB raw) ([ideas](../ideas.md)).

## Decision
1. **The line is 104.0 kB:** the first files measured on this branch (103.0 kB) and 1 kB of room. It replaces 0028's 102.4 kB.
2. **No allowance.** `npm run check:bundle` fails over the line. `FIRST_LOAD_ALLOWANCE_KB` is gone.
3. **A page or dialog the first screen doesn't show is lazy,** in the one shared chunk (`ui/src/components/later.ts`) with its styles, and prefetched while the browser is idle once the first rows are on screen. The graph and Discover keep their own chunks and are not prefetched ([docs/ui.md](../ui.md) §10).
4. **Measured, not guessed:** `npm run build:analyze` shows what each script is made of, by source; `npm run measure` reports the first script's top five.

## Consequences
- The total grows by 3.3 kB (163.9 → 167.2 kB): the shared chunk's own cost (2.3 kB), the shell, the prefetch and the error message. It stays well under 200 kB.
- A feature that adds to the first screen must fit the 1 kB of room, or move something out first. Moving the line again needs a new record.
- Pages open with no loading state once the chunk is in, which is a moment after the first rows. Before that, a page shows a quiet "Loading…" line in its frame, the palette its shell, and a chunk that can't load (offline, or a tab older than an upgrade) a Reload button.
