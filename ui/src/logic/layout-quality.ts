// How good a graph layout looks, as numbers (decision 0049): what a faster layout must keep. Pure
// functions on positions and edges. Positions are graph coordinates; sizes are sigma's, in pixels,
// read against a canvas of CANVAS pixels that the layout's bounding box is fitted to.

export interface Placed {
  key: string;
  x: number;
  y: number;
  size: number; // sigma's node size, in pixels
  tag: boolean;
}

export interface Quality {
  edgeLength: number; // median edge length ÷ the bounding box's diagonal
  edgeSpread: number; // coefficient of variation of the edge lengths
  crowding: number; // share of node pairs closer than their two sizes (2× node size), on the canvas
  separation: number; // a note's distance to its tags ÷ its distance to every tag: lower is better
}

export const CANVAS = 800; // px: the larger side of the fitted bounding box
export const CROWDING_SAMPLE = 200_000; // pairs sampled above 1,000 nodes

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function box(nodes: Placed[]): { width: number; height: number } {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y } of nodes) [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
  return nodes.length ? { width: maxX - minX, height: maxY - minY } : { width: 0, height: 0 };
}

// The median edge length ÷ the diagonal, and the lengths' coefficient of variation.
export function edgeLengths(nodes: Placed[], edges: [string, string][]): { edgeLength: number; edgeSpread: number } {
  const at = new Map(nodes.map((n) => [n.key, n]));
  const lengths = edges.flatMap(([s, t]) => (at.has(s) && at.has(t) ? [distance(at.get(s) as Placed, at.get(t) as Placed)] : [])).sort((a, b) => a - b);
  const { width, height } = box(nodes);
  const diagonal = Math.hypot(width, height);
  if (!lengths.length || !diagonal) return { edgeLength: 0, edgeSpread: 0 };
  const mean = lengths.reduce((s, l) => s + l, 0) / lengths.length;
  const sd = Math.sqrt(lengths.reduce((s, l) => s + (l - mean) ** 2, 0) / lengths.length);
  return { edgeLength: lengths[lengths.length >> 1] / diagonal, edgeSpread: mean ? sd / mean : 0 };
}

// The share of node pairs closer, on a CANVAS-pixel canvas, than their two sizes added. Every pair up
// to 1,000 nodes; above, CROWDING_SAMPLE pairs from a seeded generator, so the number is the same
// every run.
export function crowding(nodes: Placed[]): number {
  const n = nodes.length;
  if (n < 2) return 0;
  const { width, height } = box(nodes);
  const scale = CANVAS / (Math.max(width, height) || 1);
  const close = (a: Placed, b: Placed) => distance(a, b) * scale < a.size + b.size;
  let hits = 0;
  let pairs = 0;
  if (n <= 1000) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++, pairs++) if (close(nodes[i], nodes[j])) hits++;
  } else {
    let seed = 1;
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    for (; pairs < CROWDING_SAMPLE; pairs++) {
      const i = Math.floor(next() * n);
      let j = Math.floor(next() * (n - 1));
      if (j >= i) j++;
      if (close(nodes[i], nodes[j])) hits++;
    }
  }
  return hits / pairs;
}

// For notes with tags: the mean distance to their own tag nodes ÷ the mean distance to every tag
// node. Near 1, tags don't gather their notes; lower, they do.
export function separation(nodes: Placed[], edges: [string, string][]): number {
  const at = new Map(nodes.map((n) => [n.key, n]));
  const tags = nodes.filter((n) => n.tag);
  if (!tags.length) return 0;
  const own = new Map<string, Placed[]>();
  for (const [s, t] of edges) {
    const [a, b] = [at.get(s), at.get(t)];
    if (!a || !b || a.tag === b.tag) continue;
    const [note, tag] = a.tag ? [b, a] : [a, b];
    own.set(note.key, [...(own.get(note.key) ?? []), tag]);
  }
  let near = 0;
  let nearCount = 0;
  let all = 0;
  let allCount = 0;
  for (const [key, mine] of own) {
    const note = at.get(key) as Placed;
    for (const tag of mine) near += distance(note, tag);
    nearCount += mine.length;
    for (const tag of tags) all += distance(note, tag);
    allCount += tags.length;
  }
  return nearCount && all ? near / nearCount / (all / allCount) : 0;
}

export function layoutQuality(nodes: Placed[], edges: [string, string][]): Quality {
  return { ...edgeLengths(nodes, edges), crowding: crowding(nodes), separation: separation(nodes, edges) };
}

// Whether `after` is within `tolerance` (0.1: 10%) of `before`, or better, on every number. Lower is
// better for crowding and separation; for the edges, closer to before is what counts (a layout can
// be tighter or looser and look the same), so either way within the tolerance.
export function withinTolerance(before: Quality, after: Quality, tolerance = 0.1): boolean {
  const near = (a: number, b: number) => Math.abs(b - a) <= tolerance * Math.abs(a);
  const notWorse = (a: number, b: number) => b <= a * (1 + tolerance) || near(a, b);
  return near(before.edgeLength, after.edgeLength) && near(before.edgeSpread, after.edgeSpread) && notWorse(before.crowding, after.crowding) && notWorse(before.separation, after.separation);
}
