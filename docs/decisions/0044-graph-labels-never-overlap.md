# 0044 — Graph labels never overlap, and tags on one note are hidden by default

**Status:** accepted (2026-10-26). Supersedes two parts of [0028](0028-the-graph-page.md): the "Tag nodes" row of its encoding table and the rule that a graph under 150 drawn nodes labels every node. The rest of 0028 stands.

## Context
A journal of 39 notes and 67 tags, 106 drawn nodes, gave a graph page that couldn't be read: labels sat on top of each other ("Stirling-Too#pdfirling-PDF"). Three causes, from the code:

1. Under 150 drawn nodes, every label was forced, with no collision handling at all. Sigma's label grid only worked from 150 nodes up, and even there it keeps one label per cell, so labels in neighbouring cells could still overlap.
2. Tags outnumbered notes, and most carried one note (`#java`, `#deno`, `#auth`): GitHub topics. They connect nothing, yet each was a labelled node.
3. Tag labels were as large and as bright as note names.

## Decision
1. **One rule at every size: no two drawn labels overlap.** Every labelled node on screen is a candidate on every frame. The page places them in order, and a label whose box would come within 2 px of one already placed waits until zooming in makes room. The boxes are measured on the canvas (`measureText`), in the font each label is drawn in. The placing is the app's own (`placeLabels` in `ui/src/logic/graph.ts`), since sigma's grid can't stop overlaps across its cells.
2. **The order:**
   1. the hovered node, then the selected node, each always placed, on its plate;
   2. the lit node's neighbours (a dimmed node has no label);
   3. the rest: the larger node first; at the same size, a note before a tag; tags by note count; then by key, so the same frame always gives the same labels.

   A neighbour whose label would overlap a higher one waits too: the neighbours list names them all.
3. **No more forced labels in small graphs.** On a generated graph of about 30 nodes, 28 of 30 labels fit at the default zoom, so forcing all of them can't be collision-free. The same rule as everywhere else shows every label that fits.
4. **"Tags on one note", a Draw option, off by default.** Off, a tag that one note in the journal carries is neither a node nor an edge. The note still lists the tag, and the tag filter still offers it. A tag chosen in the filter, or found with the search box, is drawn all the same. The status line counts what is drawn and says what is hidden: "Showing 39 notes, 22 tags (45 on one note hidden) and 98 connections". When only such tags would connect anything, the notice says "Each of your tags is on one note. Turn on Tags on one note to draw them."
5. **Tag labels are quieter:** 11 px at weight 400 in `ink-muted` (8.61:1 on `canvas` in dark, 7.60:1 in light), against 12 px at weight 500 in `ink` for note names. They keep the `#`.
6. **Tag node sizes** keep 0028's two scales: under 150 drawn nodes all the same, a little smaller than the smallest note; from 150 up, by note count on the notes' log scale. Size now orders the labels (rule 2) rather than winning a grid cell.

## Consequences
- Fewer labels are drawn at the default zoom, and zooming in shows more. Measured with the e2e check:
  - the example journal: 12 of its labels drawn, with tags on one note hidden;
  - the showcase journal: 41 at the default zoom, 44 zoomed in;
  - 800 notes: 74 at the default zoom, 169 zoomed in.

  On a generated journal shaped like the one above (40 notes, 66 tags, 56 of them on one note), 44 of 50 labels fit with tags on one note hidden, and 73 of 106 with them shown.
- Labels can still cross other nodes and edges; the halo in `canvas` keeps them readable. Moving nodes apart would be a layout change, out of scope here.
- The hovered and selected plates can overlap each other when the two nodes are close. Sigma draws them on its hover layer, above every other label.
- The placing runs on every frame: a sort and a spatial hash of 64 px cells, about 1.3 ms for 2,030 nodes (Node, median of 20). At 2,000 notes the warm first frame stays within its 2 s budget: 1,533, 1,555 and 1,624 ms. Cold, which is only reported: 2,102, 2,100 and 2,144 ms, against 1,931, 1,950 and 2,046 ms before. The server's cold data took longer in these runs (671 to 719 ms, against about 560 ms), so most of the gap isn't the labels ([UI](../ui.md), §10).
- A journal whose tags are all on one note now opens with no tags drawn. The status line and the notice say how to draw them.
- The search box finds every tag, drawn or not, and drawing a found one moves nothing else.
