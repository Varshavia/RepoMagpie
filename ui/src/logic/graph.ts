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

export type KindGroup = Extract<GraphNode, { type: "note" }>["kind_group"];

// Which notes are drawn. Several tags: notes with any of them.
export interface Filters {
  kindGroup: KindGroup | "";
  tags: string[];
  status: "" | "inbox" | "reviewed";
  tried: boolean;
}

export const NO_FILTERS: Filters = { kindGroup: "", tags: [], status: "", tried: false };

export function filtersActive(filters: Filters): boolean {
  return Boolean(filters.kindGroup || filters.tags.length || filters.status || filters.tried);
}

// What is drawn for these sources and filters: the notes that pass the filters, then the edges of
// the drawn types between them and tag or missing-note nodes, then the tag and missing-note nodes
// that keep at least one drawn edge.
export function drawable(doc: GraphJson, sources: Sources, filters: Filters = NO_FILTERS): Shown {
  const passes = (n: GraphNode) =>
    n.type !== "note"
      ? n.type === "tag"
        ? sources.tagged
        : sources.ghosts
      : (!filters.kindGroup || n.kind_group === filters.kindGroup) &&
        (!filters.tags.length || n.tags.some((t) => filters.tags.includes(t))) &&
        (!filters.status || n.status === filters.status) &&
        (!filters.tried || n.tried);
  const candidates = new Set(doc.nodes.filter(passes).map((n) => n.key));
  const edges = doc.edges.filter((e) => sources[e.type] && candidates.has(e.source) && candidates.has(e.target));
  const ends = new Set(edges.flatMap((e) => [e.source, e.target]));
  const nodes = doc.nodes.filter((n) => candidates.has(n.key) && (n.type === "note" || ends.has(n.key)));
  return { nodes, edges, counts: count(nodes, edges) };
}

const count = (nodes: GraphNode[], edges: GraphEdge[]): Shown["counts"] => ({
  notes: nodes.filter((n) => n.type === "note").length,
  tags: nodes.filter((n) => n.type === "tag").length,
  connections: edges.length,
});

// The node itself and every node within `depth` steps along the drawn edges.
export function neighbours(edges: GraphEdge[], key: string, depth: 1 | 2): Set<string> {
  const near = new Set([key]);
  let frontier = new Set([key]);
  for (let step = 0; step < depth; step++) {
    const next = new Set<string>();
    for (const e of edges) {
      for (const [from, to] of [[e.source, e.target], [e.target, e.source]]) {
        if (frontier.has(from) && !near.has(to)) {
          near.add(to);
          next.add(to);
        }
      }
    }
    frontier = next;
  }
  return near;
}

// Local mode: the part of what is drawn within `depth` steps of a node, with its counts.
export function around(shown: Shown, key: string, depth: 1 | 2): Shown {
  const near = neighbours(shown.edges, key, depth);
  const nodes = shown.nodes.filter((n) => near.has(n.key));
  const edges = shown.edges.filter((e) => near.has(e.source) && near.has(e.target));
  return { nodes, edges, counts: count(nodes, edges) };
}

export const NEIGHBOUR_GROUPS: [EdgeType, string][] = [
  ["alternative", "Alternatives"],
  ["link", "Links"],
  ["tagged", "Same tag"],
  ["similar", "Similar"],
];

const byLabel = (a: GraphNode, b: GraphNode) => {
  const [x, y] = [nodeLabel(a).toLowerCase(), nodeLabel(b).toLowerCase()];
  return x < y ? -1 : x > y ? 1 : 0;
};

// The neighbours list (docs/ui.md §7): the node's neighbours along the drawn edges, grouped by
// edge type in a fixed order, each group by name. Empty groups are left out.
export function neighbourGroups(shown: Shown, key: string): { type: EdgeType; label: string; nodes: GraphNode[] }[] {
  const byKey = new Map(shown.nodes.map((n) => [n.key, n]));
  return NEIGHBOUR_GROUPS.map(([type, label]) => {
    const near = new Set(shown.edges.filter((e) => e.type === type && (e.source === key || e.target === key)).map((e) => (e.source === key ? e.target : e.source)));
    return { type, label, nodes: [...near].flatMap((k) => byKey.get(k) ?? []).sort(byLabel) };
  }).filter((group) => group.nodes.length);
}

const connections = (n: GraphNode) => (n.type === "note" ? n.degree : n.type === "tag" ? n.count : 0);

// With nothing selected, the neighbours list shows the nodes with the most connections.
export function largest(shown: Shown, limit: number): GraphNode[] {
  return [...shown.nodes].sort((a, b) => connections(b) - connections(a) || byLabel(a, b)).slice(0, limit);
}

// The name a node goes by: a note's name or file stem, #tag, a missing note's target.
export function nodeLabel(node: GraphNode): string {
  return node.type === "note" ? (node.name ?? node.file.replace(/\.md$/, "")) : node.type === "tag" ? `#${node.tag}` : node.target;
}

export const KIND_GROUP_LABEL: Record<KindGroup, string> = { "skill-pack": "Skill pack", tool: "Tool", resource: "Resource", other: "Other" };

// In words, what the graph shows by colour and fading (docs/ui.md §9).
export function nodeDetail(node: GraphNode): string {
  if (node.type === "tag") return `Tag, ${plural(node.count, "note")}`;
  if (node.type === "ghost") return "No note yet";
  return `${KIND_GROUP_LABEL[node.kind_group]}${node.status === "inbox" ? ", in the inbox" : ""}`;
}

const MAX_MATCHES = 8;

// The search box: up to 8 nodes whose name, file stem or tag contains the text, ignoring case;
// those that start with it first, then by name (as the [[ autocomplete ranks notes).
export function searchNodes(nodes: GraphNode[], query: string): GraphNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const texts = (n: GraphNode) => (n.type === "note" ? [nodeLabel(n), n.file.replace(/\.md$/, "")] : n.type === "tag" ? [`#${n.tag}`, n.tag] : [n.target]).map((t) => t.toLowerCase());
  return nodes
    .map((n) => ({ n, label: nodeLabel(n).toLowerCase(), texts: texts(n) }))
    .filter((c) => c.texts.some((t) => t.includes(q)))
    .map((c) => ({ ...c, first: c.texts.some((t) => t.startsWith(q)) ? 0 : 1 }))
    .sort((a, b) => a.first - b.first || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
    .slice(0, MAX_MATCHES)
    .map((c) => c.n);
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

// Sizes are sigma's, about the radius in screen pixels at the default zoom. A note with no
// connections is still clearly visible (about 14 px across); a note grows with the log of its
// connections, so hubs stand out without hiding the rest. In a small graph, tag nodes are a little
// smaller than the smallest note, all the same size; their label says what they are. In a large one
// (`large`: from ALL_LABELS_BELOW nodes up), a tag's connections are its notes, on the notes' scale:
// sigma's label grid names the largest node in each cell, so popular tags keep their names.
export function nodeSize(type: GraphNode["type"], connections: number, large = false): number {
  return type === "note" || (type === "tag" && large) ? 8 + 2.5 * Math.log2(1 + connections) : 6;
}

// A small graph shows every label; a larger one names its larger nodes, and the rest as you zoom in.
export const ALL_LABELS_BELOW = 150;

export function allLabels(drawnNodes: number): boolean {
  return drawnNodes < ALL_LABELS_BELOW;
}

// Edge sizes are in screen pixels at the default zoom. Colours are the DESIGN.md tokens.
export function edgeStyle(type: EdgeType): { size: number; color: string } {
  const size = { tagged: 1.5, link: 2.2, alternative: 3.4, similar: 1.2 }[type];
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

type Point = { x: number; y: number };

// Where a node joining a drawn graph starts (a toggle, a filter, a new note): where it was, else
// next to its first neighbour that has a place (within `spread`, from its seed), else at its seed.
export function joinPosition(key: string, edges: GraphEdge[], at: (key: string) => Point | undefined, spread: number): Point {
  const was = at(key);
  if (was) return was;
  for (const e of edges) {
    const other = e.source === key ? e.target : e.target === key ? e.source : null;
    const anchor = other === null ? undefined : at(other);
    if (!anchor) continue;
    const offset = seedPosition(key);
    return { x: anchor.x + (offset.x * spread) / 100, y: anchor.y + (offset.y * spread) / 100 };
  }
  return seedPosition(key);
}

// ForceAtlas2 for a fixed number of iterations, then it stops. Barnes-Hut above 1,000 nodes.
// Strong gravity (a pull that grows with the distance to the centre), at 0.3, keeps notes without
// connections close to the rest; at 0.05 they drifted to a ring far out, and fitting that ring left
// the connected notes small in the middle. At 1 the clusters flatten into an even disc.
export const LAYOUT = { iterations: 300, chunk: 25 };

export function layoutSettings(order: number) {
  return {
    barnesHutOptimize: order > 1000,
    barnesHutTheta: 0.5,
    strongGravityMode: true,
    gravity: 0.3,
    scalingRatio: 10,
    slowDown: 1 + Math.log(Math.max(order, 1)),
    linLogMode: false,
    outboundAttractionDistribution: false,
    adjustSizes: false,
    edgeWeightInfluence: 1,
  };
}
