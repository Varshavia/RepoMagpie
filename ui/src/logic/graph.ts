// The graph page's pure parts (decision 0028): which nodes and edges are drawn, where each node
// starts, how big it is, the edge styles, the layout's settings and the status line. No DOM, no
// sigma: the page (components/GraphPage.tsx) draws what this decides.
import type { GraphJson } from "../../../src/core/documents.ts";

export type { GraphJson };
export type GraphNode = GraphJson["nodes"][number];
export type GraphEdge = GraphJson["edges"][number];
export type EdgeType = GraphEdge["type"];

// Which edge sources are drawn, and missing notes. The defaults of decision 0026.
export interface Sources {
  tagged: boolean;
  link: boolean;
  alternative: boolean;
  similar: boolean;
  ghosts: boolean;
}

export const DEFAULT_SOURCES: Sources = { tagged: true, link: true, alternative: true, similar: false, ghosts: false };

export interface Shown {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: { notes: number; tags: number; connections: number };
}

// What is drawn for these sources: every note; tag nodes with their edges; missing notes when asked.
export function drawable(doc: GraphJson, sources: Sources): Shown {
  const nodes = doc.nodes.filter((n) => n.type === "note" || (n.type === "tag" ? sources.tagged : sources.ghosts));
  const keys = new Set(nodes.map((n) => n.key));
  const edges = doc.edges.filter((e) => sources[e.type] && keys.has(e.source) && keys.has(e.target));
  const notes = nodes.filter((n) => n.type === "note").length;
  const tags = nodes.filter((n) => n.type === "tag").length;
  return { nodes, edges, counts: { notes, tags, connections: edges.length } };
}

export type GraphState = "empty" | "unconnected" | "ready";

export function graphState(doc: GraphJson, sources: Sources): GraphState {
  if (!doc.nodes.some((n) => n.type === "note")) return "empty";
  return drawable(doc, sources).edges.length ? "ready" : "unconnected";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function statusLine(counts: Shown["counts"]): string {
  return `Showing ${plural(counts.notes, "note")}, ${plural(counts.tags, "tag")} and ${plural(counts.connections, "connection")}`;
}

// A note's size grows with the log of its connections, so hubs stand out without hiding the rest.
// Tag nodes are small and all the same size; their label says what they are.
export function nodeSize(type: GraphNode["type"], degree: number): number {
  return type === "note" ? 4 + 2.5 * Math.log2(1 + degree) : 3;
}

// Edge sizes are in screen pixels at the default zoom. Colours are the DESIGN.md tokens.
export function edgeStyle(type: EdgeType): { size: number; color: string } {
  const size = { tagged: 0.8, link: 1.4, alternative: 2.6, similar: 1 }[type];
  return { size, color: `--graph-edge-${type}` };
}

export const KIND_COLOR: Record<string, string> = {
  "skill-pack": "--graph-skill-pack",
  tool: "--graph-tool",
  resource: "--graph-resource",
  other: "--graph-other",
};

// `a` moved toward `b` by `t` (0 to 1), for colours as getComputedStyle writes them ("rgb(r, g, b)").
// Inbox notes are faded this way, toward the canvas: opaque, so WebGL blending can't brighten them.
export function mixRgb(a: string, b: string, t: number): string {
  const parse = (c: string) => c.match(/^rgb\((\d+), (\d+), (\d+)\)$/)?.slice(1).map(Number);
  const [from, to] = [parse(a), parse(b)];
  if (!from || !to) return a;
  return `rgb(${from.map((v, i) => Math.round(v + (to[i] - v) * t)).join(", ")})`;
}

// A starting position from the node's key alone (FNV-1a, then a small PRNG), so the same journal
// gives the same picture every time. Within a disc of radius 100.
export function seedPosition(key: string): { x: number; y: number } {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const next = () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const angle = next() * 2 * Math.PI;
  const radius = 100 * Math.sqrt(next());
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

// ForceAtlas2 for a fixed number of iterations, then it stops. Barnes-Hut above 1,000 nodes.
export const LAYOUT = { iterations: 300, chunk: 25 };

export function layoutSettings(order: number) {
  return {
    barnesHutOptimize: order > 1000,
    barnesHutTheta: 0.5,
    strongGravityMode: true,
    gravity: 0.05,
    scalingRatio: 10,
    slowDown: 1 + Math.log(Math.max(order, 1)),
    linLogMode: false,
    outboundAttractionDistribution: false,
    adjustSizes: false,
    edgeWeightInfluence: 1,
  };
}
