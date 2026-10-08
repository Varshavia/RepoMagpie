import { test } from "node:test";
import assert from "node:assert/strict";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { allLabels, around, DEFAULT_SOURCES, drawable, edgeStyle, filtersActive, graphState, joinPosition, largest, LAYOUT, layoutSettings, mixRgb, neighbourGroups, neighbours, NO_FILTERS, nodeDetail, nodeLabel, nodeSize, searchNodes, seedPosition, statusLine, type GraphJson, type Shown } from "./graph.ts";

// The graph page's pure parts (decision 0028): what is drawn, where it starts, how big, and the
// status line.

const counts = (tagged = 0, link = 0, alternative = 0, similar = 0) => ({ notes: 0, tags: 0, edges_by_type: { tagged, link, alternative, similar } });

const note = (file: string, extra: Partial<Extract<GraphJson["nodes"][number], { type: "note" }>> = {}) => ({
  type: "note" as const, key: `note:${file}`, id: `pkg:npm/${file}`, file: `${file}.md`, name: file, kind: "library", kind_group: "tool" as const,
  status: "reviewed" as const, tried: false, rating: null, tags: [], language: null, degree: 0, ...extra,
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

test("allLabels: every label below 150 drawn nodes; above, only the larger ones", () => {
  assert.equal(allLabels(9), true);
  assert.equal(allLabels(149), true);
  assert.equal(allLabels(150), false);
  assert.equal(allLabels(830), false);
});

test("drawable: the default sources are tags, links and alternatives; similarity and missing notes are off", () => {
  assert.deepEqual(DEFAULT_SOURCES, { tagged: true, link: true, alternative: true, similar: false, ghosts: false });
  const shown = drawable(DOC, DEFAULT_SOURCES);
  assert.deepEqual(shown.nodes.map((n) => n.key), ["note:a", "note:b", "note:c", "tag:pdf"]);
  assert.deepEqual(shown.edges.map((e) => e.type), ["tagged", "link", "alternative"]);
  assert.deepEqual(shown.counts, { notes: 3, tags: 1, connections: 3 });

  const all = drawable(DOC, { tagged: true, link: true, alternative: true, similar: true, ghosts: true });
  assert.deepEqual(all.nodes.map((n) => n.key), ["note:a", "note:b", "note:c", "tag:pdf", "ghost:x"]);
  assert.equal(all.counts.connections, 5);

  // Without tag edges, tag nodes go too.
  assert.deepEqual(drawable(DOC, { ...DEFAULT_SOURCES, tagged: false }).nodes.map((n) => n.key), ["note:a", "note:b", "note:c"]);
});

test("statusLine: in words, singular and plural", () => {
  assert.equal(statusLine({ notes: 214, tags: 31, connections: 486 }), "Showing 214 notes, 31 tags and 486 connections");
  assert.equal(statusLine({ notes: 1, tags: 1, connections: 1 }), "Showing 1 note, 1 tag and 1 connection");
  assert.equal(statusLine({ notes: 0, tags: 0, connections: 0 }), "Showing 0 notes, 0 tags and 0 connections");
});

test("graphState: no notes, notes without connections, or something to draw", () => {
  assert.equal(graphState({ ...DOC, nodes: [], edges: [], counts: counts() }, DEFAULT_SOURCES), "empty");
  assert.equal(graphState({ ...DOC, edges: [] }, DEFAULT_SOURCES), "unconnected");
  assert.equal(graphState(DOC, { tagged: false, link: false, alternative: false, similar: false, ghosts: false }), "unconnected");
  assert.equal(graphState(DOC, DEFAULT_SOURCES), "ready");
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
  assert.deepEqual(statusLine(around(drawable(DOC, DEFAULT_SOURCES), "tag:pdf", 1).counts), "Showing 1 note, 1 tag and 1 connection");
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
const ALL_SOURCES = { tagged: true, link: true, alternative: true, similar: true, ghosts: true };
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
