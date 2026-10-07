import { test } from "node:test";
import assert from "node:assert/strict";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { allLabels, DEFAULT_SOURCES, drawable, edgeStyle, graphState, LAYOUT, layoutSettings, mixRgb, nodeSize, seedPosition, statusLine, type GraphJson } from "./graph.ts";

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
