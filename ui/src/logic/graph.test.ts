import { test } from "node:test";
import assert from "node:assert/strict";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { around, DEFAULT_SOURCES, domainColor, drawable, edgeStyle, filtersActive, graphState, joinPosition, LABEL_GAP, labelBox, largeGraph, largest, LAYOUT, layoutSettings, mixRgb, neighbourGroups, neighbours, NO_FILTERS, nodeDetail, nodeLabel, nodeSize, notice, overlap, placeLabels, searchNodes, seedPosition, shownDomains, statusLine, type GraphJson, type LabelCandidate, type PlacedLabel, type Shown } from "./graph.ts";

// The graph page's pure parts (decision 0028): what is drawn, where it starts, how big, and the
// status line.

const counts = (tagged = 0, link = 0, alternative = 0, similar = 0) => ({ notes: 0, tags: 0, edges_by_type: { tagged, link, alternative, similar } });

const note = (file: string, extra: Partial<Extract<GraphJson["nodes"][number], { type: "note" }>> = {}) => ({
  type: "note" as const, key: `note:${file}`, id: `pkg:npm/${file}`, file: `${file}.md`, name: file, kind: "library", kind_group: "tool" as const,
  status: "reviewed" as const, tried: false, rating: null, tags: [], language: null, domain: null, domain_suggested: false, degree: 0, ...extra,
});

const DOC: GraphJson = {
  journal: "personal",
  nodes: [note("a", { tags: ["pdf"], degree: 3 }), note("b", { status: "inbox", degree: 2 }), note("c"), { type: "tag", key: "tag:pdf", tag: "pdf", count: 1 }, { type: "ghost", key: "ghost:x", target: "x", reason: "missing" }],
  edges: [
    { type: "tagged", source: "note:a", target: "tag:pdf" },
    { type: "link", source: "note:a", target: "note:b", count: 2 },
    { type: "alternative", source: "note:a", target: "note:b" },
    { type: "similar", source: "note:b", target: "note:c", score: 0.5 },
    { type: "link", source: "note:a", target: "ghost:x", count: 1 },
  ],
  counts: { notes: 3, tags: 1, edges_by_type: { tagged: 1, link: 2, alternative: 1, similar: 1 } },
};

test("seedPosition: the same key always starts at the same place; different keys start apart", () => {
  assert.deepEqual(seedPosition("note:npm--pdfkit.md"), seedPosition("note:npm--pdfkit.md"));
  const points = ["note:a", "note:b", "tag:pdf", "note:npm--zod.md"].map(seedPosition);
  assert.equal(new Set(points.map((p) => `${p.x} ${p.y}`)).size, 4);
  for (const p of points) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Math.hypot(p.x, p.y) <= 100);
});

test("nodeSize: a note without connections is clearly visible; notes grow with the log of their connections; tags slightly smaller", () => {
  assert.equal(nodeSize("note", 0), 8); // about 14 px across at the default zoom
  assert.ok(nodeSize("note", 1) > nodeSize("note", 0));
  assert.ok(nodeSize("note", 1000) < 40);
  assert.ok(nodeSize("note", 7) - nodeSize("note", 3) > nodeSize("note", 15) - nodeSize("note", 11)); // log scale
  assert.equal(nodeSize("tag", 0), nodeSize("tag", 500));
  assert.ok(nodeSize("tag", 0) < nodeSize("note", 0));
  assert.ok(nodeSize("tag", 0) >= nodeSize("note", 0) - 2);
});

test("nodeSize: in a large graph, tags grow with their note count on the notes' log scale, so popular tags win their label cells", () => {
  assert.equal(nodeSize("tag", 1, true), nodeSize("note", 1, true));
  assert.equal(nodeSize("tag", 120, true), nodeSize("note", 120, true));
  assert.ok(nodeSize("tag", 120, true) > nodeSize("tag", 12, true));
  assert.ok(nodeSize("tag", 12, true) - nodeSize("tag", 1, true) > nodeSize("tag", 120, true) - nodeSize("tag", 12, true) - 2); // log scale
  assert.ok(nodeSize("tag", 40, true) > nodeSize("note", 6, true)); // a popular tag beats a well-connected note
  assert.equal(nodeSize("note", 5, true), nodeSize("note", 5)); // notes don't change
  assert.equal(nodeSize("tag", 120, false), nodeSize("tag", 0)); // a small graph: all tags the same, as above
});

test("largeGraph: from 150 drawn nodes up, tags are sized by their note count", () => {
  assert.equal(largeGraph(149), false);
  assert.equal(largeGraph(150), true);
});

test("drawable: the default sources are tags, links and alternatives; tags on one note, similarity and missing notes are off", () => {
  assert.deepEqual(DEFAULT_SOURCES, { tagged: true, oneNoteTags: false, link: true, alternative: true, similar: false, ghosts: false });
  const shown = drawable(DOC, { ...DEFAULT_SOURCES, oneNoteTags: true });
  assert.deepEqual(shown.nodes.map((n) => n.key), ["note:a", "note:b", "note:c", "tag:pdf"]);
  assert.deepEqual(shown.edges.map((e) => e.type), ["tagged", "link", "alternative"]);
  assert.deepEqual(shown.counts, { notes: 3, tags: 1, connections: 3 });

  const all = drawable(DOC, { tagged: true, oneNoteTags: true, link: true, alternative: true, similar: true, ghosts: true });
  assert.deepEqual(all.nodes.map((n) => n.key), ["note:a", "note:b", "note:c", "tag:pdf", "ghost:x"]);
  assert.equal(all.counts.connections, 5);

  // Without tag edges, tag nodes go too.
  assert.deepEqual(drawable(DOC, { ...DEFAULT_SOURCES, tagged: false }).nodes.map((n) => n.key), ["note:a", "note:b", "note:c"]);
});

test("drawable: a tag on one note is neither a node nor an edge by default, and counted; one in the filters or kept by the search is drawn", () => {
  const shown = drawable(DOC, DEFAULT_SOURCES);
  assert.deepEqual(shown.nodes.map((n) => n.key), ["note:a", "note:b", "note:c"]);
  assert.deepEqual(shown.edges.map((e) => e.type), ["link", "alternative"]);
  assert.deepEqual(shown.counts, { notes: 3, tags: 0, connections: 2, hiddenTags: 1 });
  assert.deepEqual(drawable(DOC, DEFAULT_SOURCES, { ...NO_FILTERS, tags: ["pdf"] }).counts, { notes: 1, tags: 1, connections: 1 });
  assert.deepEqual(drawable(DOC, DEFAULT_SOURCES, NO_FILTERS, ["tag:pdf"]).counts, { notes: 3, tags: 1, connections: 3 });
});

test("statusLine: in words, singular and plural, with the tags on one note left out", () => {
  assert.equal(statusLine({ notes: 214, tags: 31, connections: 486 }), "Showing 214 notes, 31 tags and 486 connections");
  assert.equal(statusLine({ notes: 1, tags: 1, connections: 1 }), "Showing 1 note, 1 tag and 1 connection");
  assert.equal(statusLine({ notes: 0, tags: 0, connections: 0 }), "Showing 0 notes, 0 tags and 0 connections");
  assert.equal(statusLine({ notes: 39, tags: 22, connections: 98, hiddenTags: 45 }), "Showing 39 notes, 22 tags (45 on one note hidden) and 98 connections");
  assert.equal(statusLine({ notes: 39, tags: 22, connections: 98, hiddenTags: 0 }), "Showing 39 notes, 22 tags and 98 connections");
});

test("graphState: no notes, no connections in the journal, connections all switched off, or something to draw", () => {
  const off = { tagged: false, oneNoteTags: false, link: false, alternative: false, similar: false, ghosts: false };
  assert.equal(graphState({ ...DOC, nodes: [], edges: [], counts: counts() }, DEFAULT_SOURCES), "empty");
  assert.equal(graphState({ ...DOC, edges: [] }, DEFAULT_SOURCES), "unconnected");
  assert.equal(graphState(DOC, off), "off");
  assert.equal(graphState(DOC, { ...DEFAULT_SOURCES, tagged: false }), "ready"); // links still draw
  // Only similarity, switched off: the journal has nothing Tags or Links would draw.
  assert.equal(graphState({ ...DOC, edges: DOC.edges.filter((e) => e.type === "similar") }, DEFAULT_SOURCES), "unconnected");
  // Only a link to a missing note, with missing notes off: nothing between notes yet.
  assert.equal(graphState({ ...DOC, edges: DOC.edges.filter((e) => e.target === "ghost:x") }, DEFAULT_SOURCES), "unconnected");
  assert.equal(graphState(DOC, DEFAULT_SOURCES), "ready");
  // Only a tag on one note connects anything: hidden, and the notice says how to draw it.
  const onlyTag = { ...DOC, edges: DOC.edges.filter((e) => e.type === "tagged") };
  assert.equal(graphState(onlyTag, DEFAULT_SOURCES), "oneNote");
  assert.equal(graphState(onlyTag, { ...DEFAULT_SOURCES, oneNoteTags: true }), "ready");
  assert.equal(graphState(onlyTag, { ...DEFAULT_SOURCES, tagged: false }), "off");
});

test("notice: the journal has no connections, they are all switched off, or only tags on one note would draw any", () => {
  assert.equal(notice("unconnected"), "Your notes aren't connected yet. Add tags, or [[links]] in My notes.");
  assert.equal(notice("off"), "No connections drawn. Turn on Tags or Links to see how your notes connect.");
  assert.equal(notice("oneNote"), "Each of your tags is on one note. Turn on Tags on one note to draw them.");
  assert.equal(notice("ready"), null);
  assert.equal(notice("empty"), null);
});

test("edgeStyle: tag edges thin, links solid, alternatives thicker in their own colour, similarity faint", () => {
  assert.ok(edgeStyle("tagged").size < edgeStyle("link").size);
  assert.ok(edgeStyle("alternative").size > edgeStyle("link").size);
  assert.ok(edgeStyle("similar").size < edgeStyle("link").size);
  assert.deepEqual(["tagged", "link", "alternative", "similar"].map((t) => edgeStyle(t as "link").color), ["--graph-edge-tagged", "--graph-edge-link", "--graph-edge-alternative", "--graph-edge-similar"]);
});

test("mixRgb: a colour moved toward another, as the browser writes computed colours", () => {
  assert.equal(mixRgb("rgb(200, 100, 0)", "rgb(0, 0, 0)", 0.5), "rgb(100, 50, 0)");
  assert.equal(mixRgb("rgb(180, 156, 245)", "rgb(14, 16, 18)", 0), "rgb(180, 156, 245)");
  assert.equal(mixRgb("rgb(180, 156, 245)", "rgb(14, 16, 18)", 1), "rgb(14, 16, 18)");
  assert.equal(mixRgb("not a colour", "rgb(0, 0, 0)", 0.5), "not a colour");
});

// A chain d - e - f - g, and h alone, for local mode.
const CHAIN: Shown = drawable(
  {
    journal: "personal",
    nodes: ["d", "e", "f", "g", "h"].map((k) => note(k)),
    edges: [
      { type: "link", source: "note:d", target: "note:e", count: 1 },
      { type: "alternative", source: "note:e", target: "note:f" },
      { type: "link", source: "note:f", target: "note:g", count: 1 },
    ],
    counts: counts(0, 2, 1),
  },
  DEFAULT_SOURCES,
);

test("neighbours: the node itself and every node within one or two steps, through drawn edges only", () => {
  assert.deepEqual([...neighbours(CHAIN.edges, "note:e", 1)].sort(), ["note:d", "note:e", "note:f"]);
  assert.deepEqual([...neighbours(CHAIN.edges, "note:e", 2)].sort(), ["note:d", "note:e", "note:f", "note:g"]);
  assert.deepEqual([...neighbours(CHAIN.edges, "note:h", 2)], ["note:h"]);
  assert.deepEqual([...neighbours(drawable(DOC, DEFAULT_SOURCES).edges, "note:b", 1)].sort(), ["note:a", "note:b"]); // similarity is off
});

test("around: local mode keeps the nodes within the depth and the edges between them, and counts them", () => {
  const one = around(CHAIN, "note:e", 1);
  assert.deepEqual(one.nodes.map((n) => n.key), ["note:d", "note:e", "note:f"]);
  assert.deepEqual(one.edges.map((e) => `${e.source} ${e.target}`), ["note:d note:e", "note:e note:f"]);
  assert.deepEqual(one.counts, { notes: 3, tags: 0, connections: 2 });
  assert.deepEqual(around(CHAIN, "note:e", 2).counts, { notes: 4, tags: 0, connections: 3 });
  assert.deepEqual(statusLine(around(drawable(DOC, { ...DEFAULT_SOURCES, oneNoteTags: true }), "tag:pdf", 1).counts), "Showing 1 note, 1 tag and 1 connection");
});

test("searchNodes: up to 8 nodes whose name, file stem or tag contains the text; starts-with first, then by name", () => {
  const nodes: GraphJson["nodes"] = [
    note("npm--pdf-lib", { name: "pdf-lib" }),
    note("npm--pdfkit", { name: "pdfkit" }),
    note("npm--react-pdf", { name: "react-pdf" }),
    note("npm--zod", { name: "zod" }),
    { type: "tag", key: "tag:pdf", tag: "pdf", count: 3 },
    ...Array.from({ length: 10 }, (_, i) => note(`npm--more-pdf-${i}`, { name: `more-pdf-${i}` })),
  ];
  assert.deepEqual(searchNodes(nodes, "PDF").map(nodeLabel), ["#pdf", "pdf-lib", "pdfkit", "more-pdf-0", "more-pdf-1", "more-pdf-2", "more-pdf-3", "more-pdf-4"]);
  assert.deepEqual(searchNodes(nodes, "#pd").map(nodeLabel), ["#pdf"]);
  assert.deepEqual(searchNodes(nodes, "npm--zo").map(nodeLabel), ["zod"]); // by file stem
  assert.deepEqual(searchNodes(nodes, "  "), []);
});

test("nodeLabel: a note's name, or its file stem; #tag; a missing note's target", () => {
  assert.equal(nodeLabel(note("npm--zod", { name: "zod" })), "zod");
  assert.equal(nodeLabel(note("npm--zod", { name: null })), "npm--zod");
  assert.equal(nodeLabel({ type: "tag", key: "tag:pdf", tag: "pdf", count: 1 }), "#pdf");
  assert.equal(nodeLabel({ type: "ghost", key: "ghost:x", target: "X", reason: "missing" }), "X");
});

// Decision 0032, rule 1, in the app: the canvas applies bidi too, so a label shows markers.
test("nodeLabel: hidden characters show as markers, in order", () => {
  const rlo = String.fromCharCode(0x202e);
  assert.equal(nodeLabel(note("npm--x", { name: `see ${rlo}txt.exe` })), "see <U+202E>txt.exe");
  assert.equal(nodeLabel({ type: "ghost", key: "ghost:y", target: `a${String.fromCharCode(0x200b)}b`, reason: "missing" }), "a<U+200B>b");
});

// Notes p…u: kinds, tags, status and tried vary; q links to a missing note.
const FILTERED: GraphJson = {
  journal: "personal",
  nodes: [
    note("p", { kind_group: "tool", tags: ["pdf"], tried: true }),
    note("q", { kind_group: "resource", tags: ["pdf", "react"], status: "inbox" }),
    note("r", { kind_group: "skill-pack", tags: ["react"], tried: true }),
    note("s", { kind_group: "tool" }),
    { type: "tag", key: "tag:pdf", tag: "pdf", count: 2 },
    { type: "tag", key: "tag:react", tag: "react", count: 2 },
    { type: "ghost", key: "ghost:x", target: "x", reason: "missing" },
  ],
  edges: [
    { type: "tagged", source: "note:p", target: "tag:pdf" },
    { type: "tagged", source: "note:q", target: "tag:pdf" },
    { type: "tagged", source: "note:q", target: "tag:react" },
    { type: "tagged", source: "note:r", target: "tag:react" },
    { type: "link", source: "note:p", target: "note:s", count: 1 },
    { type: "alternative", source: "note:p", target: "note:q" },
    { type: "similar", source: "note:r", target: "note:s", score: 0.4 },
    { type: "link", source: "note:q", target: "ghost:x", count: 1 },
  ],
  counts: { notes: 4, tags: 2, edges_by_type: { tagged: 4, link: 1, alternative: 1, similar: 1 } },
};
const ALL_SOURCES = { tagged: true, oneNoteTags: true, link: true, alternative: true, similar: true, ghosts: true };
const keys = (shown: Shown) => shown.nodes.map((n) => n.key);

test("drawable with filters: notes by kind group, tags (any of them), status and tried; tags and missing notes follow their notes", () => {
  assert.deepEqual(drawable(FILTERED, ALL_SOURCES, NO_FILTERS), drawable(FILTERED, ALL_SOURCES));
  assert.deepEqual(keys(drawable(FILTERED, ALL_SOURCES, { ...NO_FILTERS, kindGroup: "tool" })), ["note:p", "note:s", "tag:pdf"]);
  // Several tags: notes with any of them. A note's other tags come along.
  assert.deepEqual(keys(drawable(FILTERED, ALL_SOURCES, { ...NO_FILTERS, tags: ["pdf"] })), ["note:p", "note:q", "tag:pdf", "tag:react", "ghost:x"]);
  assert.deepEqual(keys(drawable(FILTERED, ALL_SOURCES, { ...NO_FILTERS, tags: ["pdf", "react"] })), ["note:p", "note:q", "note:r", "tag:pdf", "tag:react", "ghost:x"]);
  assert.deepEqual(keys(drawable(FILTERED, ALL_SOURCES, { ...NO_FILTERS, status: "inbox" })), ["note:q", "tag:pdf", "tag:react", "ghost:x"]);
  assert.deepEqual(keys(drawable(FILTERED, ALL_SOURCES, { ...NO_FILTERS, status: "reviewed" })), ["note:p", "note:r", "note:s", "tag:pdf", "tag:react"]);
  assert.deepEqual(keys(drawable(FILTERED, ALL_SOURCES, { ...NO_FILTERS, tried: true })), ["note:p", "note:r", "tag:pdf", "tag:react"]);
  const tools = drawable(FILTERED, ALL_SOURCES, { ...NO_FILTERS, kindGroup: "tool" });
  assert.deepEqual(tools.edges.map((e) => e.type), ["tagged", "link"]);
  assert.deepEqual(tools.counts, { notes: 2, tags: 1, connections: 2 });
  assert.deepEqual(drawable(FILTERED, ALL_SOURCES, { ...NO_FILTERS, kindGroup: "other" }).counts, { notes: 0, tags: 0, connections: 0 });
  // A tag on two notes is drawn by default.
  assert.deepEqual(keys(drawable(FILTERED, DEFAULT_SOURCES)), ["note:p", "note:q", "note:r", "note:s", "tag:pdf", "tag:react"]);
  assert.equal(filtersActive(NO_FILTERS), false);
  assert.equal(filtersActive({ ...NO_FILTERS, tags: ["pdf"] }), true);
});

test("drawable: a missing note shows only while an edge to it is drawn", () => {
  assert.deepEqual(keys(drawable(FILTERED, { ...ALL_SOURCES, link: false })), ["note:p", "note:q", "note:r", "note:s", "tag:pdf", "tag:react"]);
});

test("neighbourGroups: the selected node's neighbours by edge type, in a fixed order, each group by name", () => {
  const shown = drawable(FILTERED, ALL_SOURCES);
  const named = (key: string) => neighbourGroups(shown, key).map((g) => [g.label, g.nodes.map(nodeLabel)]);
  assert.deepEqual(named("note:p"), [["Alternatives", ["q"]], ["Links", ["s"]], ["Same tag", ["#pdf"]]]);
  assert.deepEqual(named("note:q"), [["Alternatives", ["p"]], ["Links", ["x"]], ["Same tag", ["#pdf", "#react"]]]);
  assert.deepEqual(named("tag:react"), [["Same tag", ["q", "r"]]]);
  assert.deepEqual(named("note:s"), [["Links", ["p"]], ["Similar", ["r"]]]);
  assert.deepEqual(neighbourGroups(drawable(FILTERED, DEFAULT_SOURCES), "note:s").map((g) => g.label), ["Links"]); // similarity off
});

test("largest: with nothing selected, the nodes with the most connections, then by name", () => {
  const nodes = [note("a", { degree: 2 }), note("b", { degree: 5 }), note("c", { degree: 2 }), { type: "tag" as const, key: "tag:t", tag: "t", count: 3 }];
  assert.deepEqual(largest({ nodes, edges: [], counts: { notes: 3, tags: 1, connections: 0 } }, 3).map(nodeLabel), ["b", "#t", "a"]);
});

test("nodeDetail: in words, what the graph shows by colour", () => {
  assert.equal(nodeDetail(note("a", { kind_group: "skill-pack" })), "Skill pack");
  assert.equal(nodeDetail(note("a", { kind_group: "resource", status: "inbox" })), "Resource, in the inbox");
  assert.equal(nodeDetail({ type: "tag", key: "tag:t", tag: "t", count: 1 }), "Tag, 1 note");
  assert.equal(nodeDetail({ type: "tag", key: "tag:t", tag: "t", count: 12 }), "Tag, 12 notes");
  assert.equal(nodeDetail({ type: "ghost", key: "ghost:x", target: "x", reason: "missing" }), "No note yet");
  // Colour by domain: the domain instead of the kind group.
  assert.equal(nodeDetail(note("a", { domain: "database" }), true), "database");
  assert.equal(nodeDetail(note("a", { domain: "testing", domain_suggested: true, status: "inbox" }), true), "testing (suggested), in the inbox");
  assert.equal(nodeDetail(note("a"), true), "No domain");
  assert.equal(nodeDetail({ type: "tag", key: "tag:t", tag: "t", count: 1 }, true), "Tag, 1 note");
});

test("shownDomains: the domains the drawn notes are coloured by, in the vocabulary's order; domainColor names each token", () => {
  const shown: Shown = { nodes: [note("a", { domain: "testing" }), note("b", { domain: "security", domain_suggested: true }), note("c"), note("d", { domain: "testing" })], edges: [], counts: { notes: 4, tags: 0, connections: 0 } };
  assert.deepEqual(shownDomains(shown), ["security", "testing"]);
  assert.equal(domainColor("ai"), "--domain-ai");
});

test("joinPosition: a node joining the drawing goes where it was, else next to its first drawn neighbour, else to its seed", () => {
  const edges = drawable(FILTERED, ALL_SOURCES).edges;
  const at = new Map([["note:q", { x: 500, y: -300 }], ["note:p", { x: 0, y: 0 }]]);
  assert.deepEqual(joinPosition("note:p", edges, (k) => at.get(k), 20), { x: 0, y: 0 });
  const ghost = joinPosition("ghost:x", edges, (k) => at.get(k), 20);
  assert.ok(Math.hypot(ghost.x - 500, ghost.y + 300) <= 20 && Math.hypot(ghost.x - 500, ghost.y + 300) > 0);
  assert.deepEqual(joinPosition("ghost:x", edges, (k) => at.get(k), 20), ghost); // the same every time
  assert.deepEqual(joinPosition("note:r", [], () => undefined, 20), seedPosition("note:r"));
});

test("layout: a fixed number of iterations; Barnes-Hut only for large graphs", () => {
  assert.ok(Number.isInteger(LAYOUT.iterations) && LAYOUT.iterations > 0);
  assert.equal(layoutSettings(100).barnesHutOptimize, false);
  assert.equal(layoutSettings(2000).barnesHutOptimize, true);
  // θ 1.0: at 2,030 nodes as settled as θ 0.5 after 300 iterations, in half the time (1.07 s, not 2.28 s).
  assert.equal(layoutSettings(2000).barnesHutTheta, 1);
  assert.deepEqual(layoutSettings(300), layoutSettings(300));
});

test("layout: notes without connections stay near the rest instead of drifting to a ring far out", () => {
  // The real layout on two journals like the maintainer's: few connections, many notes without.
  // The farthest unconnected note may be at most 1.2 times as far from the centre as the farthest
  // connected node (with the old gravity of 0.05 it was 1.34 and 1.36).
  for (const [connected, isolated, tags] of [[2, 7, 3], [60, 40, 10]]) {
    const graph = new Graph({ type: "undirected", multi: true });
    const add = (key: string, size: number) => graph.addNode(key, { ...seedPosition(key), size });
    for (let t = 0; t < tags; t++) add(`tag:t${t}`, nodeSize("tag", 0));
    for (let i = 0; i < connected + isolated; i++) add(`note:n${i}.md`, nodeSize("note", i < connected ? 2 : 0));
    for (let i = 0; i < connected; i++) {
      graph.addEdge(`note:n${i}.md`, `tag:t${i % tags}`);
      graph.addEdge(`note:n${i}.md`, `tag:t${(i * 7 + 3) % tags}`);
    }
    forceAtlas2.assign(graph, { iterations: LAYOUT.iterations, settings: layoutSettings(graph.order) });
    const keys = graph.nodes();
    const [cx, cy] = ["x", "y"].map((axis) => keys.reduce((sum, key) => sum + (graph.getNodeAttribute(key, axis) as number), 0) / keys.length);
    const distance = (key: string) => Math.hypot(graph.getNodeAttribute(key, "x") - cx, graph.getNodeAttribute(key, "y") - cy);
    const alone = (key: string) => key.startsWith("note:") && Number(key.slice("note:n".length, -".md".length)) >= connected;
    const ratio = Math.max(...keys.filter(alone).map(distance)) / Math.max(...keys.filter((key) => !alone(key)).map(distance));
    assert.ok(ratio <= 1.2, `${connected} connected, ${isolated} alone: ${ratio.toFixed(2)}`);
  }
  assert.equal(layoutSettings(9).strongGravityMode, true);
});

// Labels (decision 0044). Widths here are a fixed number of pixels per character.
const width = (label: string, tag: boolean) => label.length * (tag ? 6 : 7);
const candidate = (key: string, x: number, y: number, extra: Partial<LabelCandidate> = {}): LabelCandidate => ({ key, label: key, x, y, size: 8, tag: false, count: 0, rank: 3, ...extra });
const placedKeys = (placed: PlacedLabel[]) => placed.map((p) => p.candidate.key);

test("labelBox: the text right of the node, about the font's height; a plate with 4 px of padding; a tag's in the smaller font", () => {
  assert.deepEqual(labelBox(candidate("zod", 100, 50), 21, false), { x: 109.5, y: 43.5, width: 24, height: 15 });
  const tag = labelBox(candidate("#pdf", 100, 50, { tag: true, size: 6 }), 24, false);
  assert.deepEqual({ ...tag, y: Math.round(tag.y * 100) / 100 }, { x: 107.5, y: 43.92, width: 27, height: 14 });
  assert.deepEqual(labelBox(candidate("zod", 100, 50), 21, true), { x: 112, y: 40, width: 29, height: 20 });
});

test("overlap: boxes that touch or come within the gap", () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(overlap(a, { x: 5, y: 5, width: 10, height: 10 }), true);
  assert.equal(overlap(a, { x: 10, y: 0, width: 10, height: 10 }), false);
  assert.equal(overlap(a, { x: 11, y: 0, width: 10, height: 10 }, LABEL_GAP), true);
  assert.equal(overlap(a, { x: 13, y: 0, width: 10, height: 10 }, LABEL_GAP), false);
});

test("placeLabels: the larger node first, a note before a tag of the same size, tags by note count; a label that would overlap waits", () => {
  assert.deepEqual(placedKeys(placeLabels([candidate("small", 0, 0), candidate("large", 0, 4, { size: 12 }), candidate("far", 400, 0)], width)), ["large", "far"]);
  assert.deepEqual(placedKeys(placeLabels([candidate("#t", 0, 0, { tag: true }), candidate("n", 0, 2)], width)), ["n"]);
  assert.deepEqual(placedKeys(placeLabels([candidate("#few", 0, 0, { tag: true, count: 2 }), candidate("#many", 0, 2, { tag: true, count: 9 })], width)), ["#many"]);
  // Side by side, a gap apart: both.
  assert.deepEqual(placedKeys(placeLabels([candidate("a", 0, 0), candidate("b", 0, 30)], width)), ["a", "b"]);
});

test("placeLabels: the hovered and selected labels are always placed, on plates; the lit node's neighbours come next; nothing overlaps a plate", () => {
  const placed = placeLabels(
    [
      candidate("big", 0, 0, { size: 30 }),
      candidate("hovered", 0, 3, { rank: 0 }),
      candidate("selected", 0, 6, { rank: 1 }),
      candidate("near", 100, 0, { rank: 2, size: 4 }),
      candidate("rest", 100, 3, { size: 20 }),
    ],
    width,
  );
  assert.deepEqual(placed.map((p) => [p.candidate.key, p.plate]), [["hovered", true], ["selected", true], ["near", false]]);
});

// A journal for the label checks: `hubs` tags with that many notes each, `shared` tags on two or
// three notes, `single` tags on one note, and `links` links between notes. A small PRNG keeps it
// the same every run.
function labelJournal(notes: number, hubs: number[], shared: number, single: number, links: number): GraphJson {
  let seed = 7;
  const next = (n: number) => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) % n);
  const name = (i: number) => `note-${i}-${["pdf", "auth", "testing-library", "x", "orm-kit", "browser-automation"][i % 6]}`;
  const tags = [...hubs, ...Array.from({ length: shared }, (_, i) => 2 + (i % 2)), ...Array.from({ length: single }, () => 1)].map((count, i) => ({ tag: `tag-${i}${i % 3 ? "-topic" : ""}`, count }));
  const edges: GraphJson["edges"] = [];
  const degree = new Map<number, number>();
  const bump = (i: number) => degree.set(i, (degree.get(i) ?? 0) + 1);
  for (const { tag, count } of tags) {
    const on = new Set<number>();
    while (on.size < count) on.add(next(notes));
    for (const i of on) edges.push({ type: "tagged", source: `note:${name(i)}`, target: `tag:${tag}` }), bump(i);
  }
  for (let l = 0; l < links; l++) {
    const [a, b] = [next(notes), next(notes)];
    if (a !== b) edges.push({ type: "link", source: `note:${name(a)}`, target: `note:${name(b)}`, count: 1 }), bump(a), bump(b);
  }
  const nodes: GraphJson["nodes"] = [
    ...Array.from({ length: notes }, (_, i) => note(name(i), { degree: degree.get(i) ?? 0 })),
    ...tags.map(({ tag, count }) => ({ type: "tag" as const, key: `tag:${tag}`, tag, count })),
  ];
  return { journal: "personal", nodes, edges, counts: { notes, tags: tags.length, edges_by_type: { tagged: edges.length - links, link: links, alternative: 0, similar: 0 } } };
}

// The real layout, then the screen as sigma fits it: the graph's bounds in a 1280 × 800 canvas,
// zoomed in on the centre; only nodes on screen are candidates, and node sizes grow with the
// square root of the zoom.
function screenCandidates(shown: Shown, zoom: number, rank = (_key: string): LabelCandidate["rank"] => 3): LabelCandidate[] {
  const graph = new Graph({ type: "undirected", multi: true });
  const large = largeGraph(shown.nodes.length);
  const sizeOf = (n: GraphJson["nodes"][number]) => (n.type === "tag" ? nodeSize("tag", n.count, large) : nodeSize("note", n.type === "note" ? n.degree : 0));
  for (const n of shown.nodes) graph.addNode(n.key, { ...seedPosition(n.key), size: sizeOf(n) });
  for (const e of shown.edges) graph.addEdge(e.source, e.target);
  forceAtlas2.assign(graph, { iterations: LAYOUT.iterations, settings: layoutSettings(graph.order) });
  const xs = graph.nodes().map((k) => graph.getNodeAttribute(k, "x") as number);
  const ys = graph.nodes().map((k) => graph.getNodeAttribute(k, "y") as number);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(1280 / (maxX - minX || 1), 800 / (maxY - minY || 1)) * zoom;
  const out: LabelCandidate[] = [];
  for (const n of shown.nodes) {
    const x = 640 + (graph.getNodeAttribute(n.key, "x") - (minX + maxX) / 2) * scale;
    const y = 400 + (graph.getNodeAttribute(n.key, "y") - (minY + maxY) / 2) * scale;
    if (x < 0 || x > 1280 || y < 0 || y > 800) continue;
    out.push({ key: n.key, label: nodeLabel(n), x, y, size: sizeOf(n) * Math.sqrt(zoom), tag: n.type === "tag", count: n.type === "tag" ? n.count : 0, rank: rank(n.key) });
  }
  return out;
}

const overlapping = (placed: PlacedLabel[]) => {
  const pairs: string[] = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (placed[i].plate && placed[j].plate) continue; // the hovered and selected plates, drawn by sigma
      if (overlap(placed[i].box, placed[j].box)) pairs.push(`${placed[i].candidate.key} / ${placed[j].candidate.key}`);
    }
  }
  return pairs;
};

const LABEL_JOURNALS: [string, GraphJson][] = [
  ["shaped like the maintainer's (40 notes, 66 tags, most on one note)", labelJournal(40, [14, 10, 8, 6], 6, 56, 10)],
  ["about 30 nodes", labelJournal(20, [6, 4], 3, 5, 6)],
  ["800 notes", labelJournal(800, [120, 90, 60, 45, 30, 25, 20, 15], 60, 120, 400)],
];

for (const [name, doc] of LABEL_JOURNALS) {
  test(`placeLabels: no two drawn labels overlap, at three zooms, tags on one note shown and hidden: ${name}`, (t) => {
    for (const oneNoteTags of [false, true]) {
      const shown = drawable(doc, { ...DEFAULT_SOURCES, oneNoteTags });
      for (const zoom of [1, 2, 4]) {
        const candidates = screenCandidates(shown, zoom);
        const placed = placeLabels(candidates, width);
        assert.deepEqual(overlapping(placed), [], `tags on one note ${oneNoteTags ? "shown" : "hidden"}, zoom ${zoom}`);
        t.diagnostic(`${shown.nodes.length} nodes, tags on one note ${oneNoteTags ? "shown" : "hidden"}, zoom ${zoom}: ${placed.length} of ${candidates.length} labels drawn`);
      }
    }
  });
}

test("placeLabels: with a node selected, it and its neighbours are labelled first, and still nothing overlaps", () => {
  const doc = LABEL_JOURNALS[0][1];
  const shown = drawable(doc, DEFAULT_SOURCES);
  const hub = largest(shown, 1)[0].key;
  const near = neighbours(shown.edges, hub, 1);
  // Dimmed nodes have no label (the page's reducer), so only the selection is a candidate.
  const candidates = screenCandidates(shown, 1, (key) => (key === hub ? 1 : 2)).filter((c) => near.has(c.key));
  const placed = placeLabels(candidates, width);
  assert.equal(placed[0].candidate.key, hub);
  assert.equal(placed[0].plate, true);
  assert.deepEqual(overlapping(placed), []);
});
